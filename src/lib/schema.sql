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
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
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
begin
  -- 1. Insert Core Invoice
  insert into invoices (
    store_id, invoice_number, customer_name, customer_phone, 
    total_amount, discount_amount, paid_amount, payment_method
  ) values (
    p_store_id, p_invoice_number, p_customer_name, p_customer_phone, 
    p_total_amount, p_discount_amount, p_paid_amount, p_payment_method
  ) returning id into v_invoice_id;

  -- 2. Iterate invoice line items, perform atomic stock checks & reductions
  for v_item in select * from jsonb_array_elements(p_items) loop
    -- Resolve variant details and lock matching inventory row to prevent concurrent race conditions
    select quantity into v_current_stock
    from inventory
    where variant_id = (v_item->>'variant_id')::uuid
    for update; 

    select sku into v_sku
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

    -- Record Invoice Item
    insert into invoice_items (
      invoice_id, variant_id, quantity, unit_price, subtotal
    ) values (
      v_invoice_id,
      (v_item->>'variant_id')::uuid,
      (v_item->>'quantity')::int,
      (v_item->>'unit_price')::numeric,
      (v_item->>'subtotal')::numeric
    );
  end loop;

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

-- Basic tenant read/write policies based on store_id mapping (can be adjusted for custom auth setups)
create policy "Users can manage their own store record" on stores 
  for all using (id in (select store_id from users where id = auth.uid()));

create policy "Users can manage their own user record" on users 
  for all using (id = auth.uid());

create policy "Users can manage products in their store" on products 
  for all using (store_id in (select store_id from users where id = auth.uid()));

create policy "Users can manage product variants" on product_variants 
  for all using (product_id in (select id from products where store_id in (select store_id from users where id = auth.uid())));

create policy "Users can manage inventory" on inventory 
  for all using (variant_id in (select id from product_variants where product_id in (select id from products where store_id in (select store_id from users where id = auth.uid()))));

create policy "Users can manage invoices" on invoices 
  for all using (store_id in (select store_id from users where id = auth.uid()));

create policy "Users can manage invoice items" on invoice_items 
  for all using (invoice_id in (select id from invoices where store_id in (select store_id from users where id = auth.uid())));
