-- =========================================================================
-- PaisaPOS Complete Database DDL Setup
-- Copy and paste this script directly into the Supabase SQL Editor.
-- =========================================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Drop existing resources if resetting
-- drop function if exists create_invoice_and_deduct_stock;
-- drop table if exists invoice_items cascade;
-- drop table if exists invoices cascade;
-- drop table if exists inventory cascade;
-- drop table if exists product_variants cascade;
-- drop table if exists products cascade;
-- drop table if exists users cascade;
-- drop table if exists stores cascade;

-- 1. STORES TABLE
create table stores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  address text,
  pan_vat text, -- PAN/VAT standard for billing in Nepal
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. USERS / PROFILES TABLE (Linked with Supabase Auth users)
create table users (
  id uuid primary key references auth.users on delete cascade,
  name text not null,
  store_id uuid references stores(id) on delete set null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. PRODUCTS TABLE
create table products (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references stores(id) on delete cascade not null,
  name text not null,
  category text not null,
  image_url text,
  low_stock_threshold integer default 5 not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 4. PRODUCT VARIANTS TABLE
create table product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id) on delete cascade not null,
  size text not null,  -- e.g., 'S', '32', 'Free Size'
  color text not null, -- e.g., 'Black', 'Blue', 'Pink'
  sku text unique not null,
  price numeric(10,2) not null check (price >= 0),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 5. INVENTORY TABLE (Tracks real-time stock levels for variants)
create table inventory (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid references product_variants(id) on delete cascade unique not null,
  quantity integer not null default 0 check (quantity >= 0),
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 6. INVOICES TABLE
create table invoices (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references stores(id) on delete cascade not null,
  invoice_number text not null, -- e.g. INV-2026-0001
  customer_name text default 'General Customer',
  customer_phone text,
  total_amount numeric(10,2) not null check (total_amount >= 0),
  discount_amount numeric(10,2) default 0.00 check (discount_amount >= 0),
  paid_amount numeric(10,2) not null check (paid_amount >= 0),
  payment_method text not null, -- 'Cash' | 'eSewa' | 'Khalti' | 'Fonepay'
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique (store_id, invoice_number)
);

-- 7. INVOICE LINE ITEMS TABLE
create table invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid references invoices(id) on delete cascade not null,
  variant_id uuid references product_variants(id) on delete cascade not null,
  quantity integer not null check (quantity > 0),
  unit_price numeric(10,2) not null check (unit_price >= 0),
  subtotal numeric(10,2) not null check (subtotal >= 0)
);

-- 8. AUDIT LOGS TABLE
create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references stores(id) on delete cascade,
  user_id uuid, -- Matches auth.uid()
  operation text not null, -- e.g. 'CHECKOUT', 'STOCK_ADJUSTMENT'
  affected_entity text not null, -- e.g. 'Invoice: INV-2026-0001', 'SKU: HOOD-BLK-M'
  result text not null, -- e.g. 'SUCCESS', 'FAILED'
  error_message text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- =========================================================================
-- ATOMIC PL/PGSQL TRANSACTION FOR HIGH-SPEED CHECKOUT & STOCK SYNC
-- =========================================================================
create or replace function create_invoice_and_deduct_stock(
  p_store_id uuid,
  p_invoice_number text,
  p_customer_name text,
  p_customer_phone text,
  p_total_amount numeric,
  p_discount_amount numeric,
  p_paid_amount numeric,
  p_payment_method text,
  p_items jsonb -- Array of {variant_id: uuid, quantity: int, unit_price: numeric, subtotal: numeric}
) returns uuid as $$
declare
  v_invoice_id uuid;
  v_item jsonb;
  v_current_stock int;
  v_sku text;
  v_db_price numeric(10,2);
  v_item_subtotal numeric(10,2);
  v_calculated_subtotal numeric(10,2) := 0.00;
  v_expected_total numeric(10,2);
  v_store_invoice_count int;
  v_invoice_number text;
  v_user_id uuid;
begin
  -- Resolve and validate authenticated user
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Unauthenticated. Only logged-in users can perform checkout.';
  end if;

  -- Verify store ownership to prevent cross-tenant billing/checkout
  if not exists (
    select 1 from users 
    where id = v_user_id and store_id = p_store_id
  ) then
    raise exception 'Unauthorized. You do not have permission to checkout for this store.';
  end if;

  -- Acquire an exclusive lock on the store row to serialize checkouts *only* for this store
  -- to prevent concurrent count race conditions.
  perform id from stores where id = p_store_id for update;

  -- Calculate the next sequential number for this specific store
  select count(*) + 1 into v_store_invoice_count
  from invoices
  where store_id = p_store_id;

  -- Construct sequential, tenant-scoped invoice number: e.g. INV-2026-0001
  v_invoice_number := 'INV-' || to_char(now(), 'YYYY') || '-' || lpad(v_store_invoice_count::text, 4, '0');

  -- 1. Insert Core Invoice (using server-generated sequential, race-condition-free invoice number)
  insert into invoices (
    store_id, invoice_number, customer_name, customer_phone, 
    total_amount, discount_amount, paid_amount, payment_method
  ) values (
    p_store_id, v_invoice_number, p_customer_name, p_customer_phone, 
    p_total_amount, p_discount_amount, p_paid_amount, p_payment_method
  ) returning id into v_invoice_id;

  -- 2. Iterate invoice line items, perform atomic stock checks & reductions
  for v_item in select * from jsonb_array_elements(p_items) loop
    -- Verify variant ownership (the variant must belong to the user's store)
    if not exists (
      select 1 from product_variants pv
      join products p on pv.product_id = p.id
      where pv.id = (v_item->>'variant_id')::uuid and p.store_id = p_store_id
    ) then
      raise exception 'Variant with ID % does not belong to your store', (v_item->>'variant_id');
    end if;

    -- Resolve variant details and lock matching inventory row to prevent concurrent race conditions
    select quantity into v_current_stock
    from inventory
    where variant_id = (v_item->>'variant_id')::uuid
    for update; 

    select price, sku into v_db_price, v_sku
    from product_variants
    where id = (v_item->>'variant_id')::uuid;

    if v_current_stock is null then
      raise exception 'Variant with SKU % does not exist in inventory', v_sku;
    end if;

    -- Atomic safety check
    if v_current_stock < (v_item->>'quantity')::int then
      raise exception 'Insufficient stock for SKU %. Available: %, Requested: %', 
        v_sku, v_current_stock, (v_item->>'quantity')::int;
    end if;

    -- Decrement matching stock level
    update inventory
    set quantity = quantity - (v_item->>'quantity')::int,
        updated_at = now()
    where variant_id = (v_item->>'variant_id')::uuid;

    -- Recalculate subtotal using authentic database price
    v_item_subtotal := v_db_price * (v_item->>'quantity')::int;
    v_calculated_subtotal := v_calculated_subtotal + v_item_subtotal;

    -- Record Invoice Item using server-verified values
    insert into invoice_items (
      invoice_id, variant_id, quantity, unit_price, subtotal
    ) values (
      v_invoice_id,
      (v_item->>'variant_id')::uuid,
      (v_item->>'quantity')::int,
      v_db_price,
      v_item_subtotal
    );
  end loop;

  -- 3. Price Tampering Integrity Verification
  -- Cap/validate discount to the subtotal of items to prevent negative totals or excessive discount exploits
  if p_discount_amount > v_calculated_subtotal then
    raise exception 'Discount amount % exceeds the subtotal %', p_discount_amount, v_calculated_subtotal;
  end if;

  v_expected_total := v_calculated_subtotal - p_discount_amount;
  if v_expected_total < 0.00 then
    v_expected_total := 0.00;
  end if;

  if abs(v_expected_total - p_total_amount) > 0.01 then
    raise exception 'Price tampering detected! Client reported total of %, but recalculated total is %', 
      p_total_amount, v_expected_total;
  end if;

  -- 4. Record successful operation to audit log
  insert into audit_logs (store_id, user_id, operation, affected_entity, result, created_at)
  values (
    p_store_id, 
    v_user_id, 
    'CHECKOUT', 
    'Invoice: ' || v_invoice_number, 
    'SUCCESS', 
    now()
  );

  return v_invoice_id;
end;
$$ language plpgsql security definer;

-- =========================================================================
-- ROW LEVEL SECURITY (RLS) FOR MULTI-TENANCY SAAS PREPARATION
-- =========================================================================
alter table stores enable row level security;
alter table users enable row level security;
alter table products enable row level security;
alter table product_variants enable row level security;
alter table inventory enable row level security;
alter table invoices enable row level security;
alter table invoice_items enable row level security;
alter table audit_logs enable row level security;

-- 1. Optimized Stable Security Definer Store Helper (Prevents redundant joining RLS policies)
create or replace function get_user_store_id() returns uuid as $$
  select store_id from users where id = auth.uid();
$$ language sql stable security definer;

-- 2. Core Tenant Isolation Policies
create policy "Users can manage their own store record" on stores 
  for all using (id = get_user_store_id());

create policy "Users can manage their own user record" on users 
  for all using (id = auth.uid());

create policy "Users can manage products in their store" on products 
  for all using (store_id = get_user_store_id());

create policy "Users can manage product variants" on product_variants 
  for all using (product_id in (select id from products where store_id = get_user_store_id()));

create policy "Users can manage inventory" on inventory 
  for all using (variant_id in (select id from product_variants where product_id in (select id from products where store_id = get_user_store_id())));

create policy "Users can manage invoices" on invoices 
  for all using (store_id = get_user_store_id());

create policy "Users can manage invoice items" on invoice_items 
  for all using (invoice_id in (select id from invoices where store_id = get_user_store_id()));

-- Audit logs are IMMUTABLE: users can read and insert, but never update or delete.
-- This ensures a tamper-proof audit trail as required by SECURITY_SYSTEM.md.
create policy "Users can read audit logs of their store" on audit_logs 
  for select using (store_id = get_user_store_id());

create policy "Users can insert audit logs for their store" on audit_logs 
  for insert with check (store_id = get_user_store_id());

-- =========================================================================
-- ONBOARDING TRANSACTIONAL REGISTRATION RPC (P0 DEADLOCK REMEDIATION)
-- =========================================================================
-- DROP the old signature with 3 parameters to avoid signature mismatch errors in PostgreSQL
drop function if exists register_store_and_user(uuid, text, text);

create or replace function register_store_and_user(
  p_full_name text,
  p_store_name text
) returns uuid as $$
declare
  v_store_id uuid;
  v_user_id uuid;
begin
  -- Resolve authenticated user ID
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Unauthenticated. Only logged-in users can register a store.';
  end if;

  -- Prevent duplicate registration: check if profile already exists
  if exists (select 1 from users where id = v_user_id) then
    raise exception 'User is already registered and associated with a store.';
  end if;

  -- 1. Insert store bypasses initial RLS since this is a security definer function
  insert into stores (name, phone, address, pan_vat)
  values (p_store_name, '', '', '')
  returning id into v_store_id;

  -- 2. Insert user profile linking to store
  insert into users (id, name, store_id)
  values (v_user_id, p_full_name, v_store_id);

  return v_store_id;
end;
$$ language plpgsql security definer;

-- =========================================================================
-- HIGH-PERFORMANCE SYSTEM INDEXES FOR MASSIVE SAAS SCALE
-- =========================================================================
create index if not exists idx_products_store_id on products(store_id);
create index if not exists idx_product_variants_product_id on product_variants(product_id);
create index if not exists idx_product_variants_sku on product_variants(sku);
create index if not exists idx_inventory_variant_id on inventory(variant_id);
create index if not exists idx_invoices_store_created on invoices(store_id, created_at desc);
create index if not exists idx_invoice_items_invoice_id on invoice_items(invoice_id);
