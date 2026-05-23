-- Migration: Support Ad-hoc Custom Items in Checkouts
-- Created at: 2026-05-23

-- 1. Drop the NOT NULL constraint on variant_id in invoice_items
ALTER TABLE invoice_items ALTER COLUMN variant_id DROP NOT NULL;

-- 2. Add custom_name column to invoice_items to preserve names of ad-hoc items
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute 
    WHERE attrelid = 'public.invoice_items'::regclass 
    AND attname = 'custom_name'
  ) THEN
    ALTER TABLE invoice_items ADD COLUMN custom_name text;
  END IF;
END $$;

-- 3. Replace/Update create_invoice_and_deduct_stock to support variant_id = NULL with custom_name
CREATE OR REPLACE FUNCTION create_invoice_and_deduct_stock(
  p_store_id uuid,
  p_invoice_number text,
  p_customer_name text,
  p_customer_phone text,
  p_total_amount numeric,
  p_discount_amount numeric,
  p_paid_amount numeric,
  p_payment_method text,
  p_items jsonb -- Array of {variant_id: uuid, custom_name: text, quantity: int, unit_price: numeric, subtotal: numeric}
) RETURNS uuid AS $$
DECLARE
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
BEGIN
  -- Resolve and validate authenticated user
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Unauthenticated. Only logged-in users can perform checkout.';
  end if;

  -- Set checkout context local parameter to prevent stock trigger audit duplication
  perform set_config('app.checkout_active', 'true', true);

  -- Verify store ownership to prevent cross-tenant billing/checkout
  if not exists (
    select 1 from users 
    where id = v_user_id and store_id = p_store_id
  ) then
    perform set_config('app.checkout_active', 'false', true);
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

  -- 1. Insert Core Invoice
  insert into invoices (
    store_id, invoice_number, customer_name, customer_phone, 
    total_amount, discount_amount, paid_amount, payment_method
  ) values (
    p_store_id, v_invoice_number, p_customer_name, p_customer_phone, 
    p_total_amount, p_discount_amount, p_paid_amount, p_payment_method
  ) returning id into v_invoice_id;

  -- 2. Iterate invoice line items, perform atomic stock checks & reductions
  -- Items are ordered alphabetically by variant_id UUID (nulls last) to eliminate deadlock vulnerability under concurrent checkout
  for v_item in 
    select x.val 
    from jsonb_array_elements(p_items) as x(val) 
    order by (x.val->>'variant_id') asc nulls last
  loop
    -- Determine if this is an ad-hoc custom item (variant_id is null)
    if (v_item->>'variant_id') is null then
      -- Set custom name as description
      v_sku := coalesce(v_item->>'custom_name', 'Custom Item');
      v_db_price := (v_item->>'unit_price')::numeric;

      -- Explicit validation to prevent negative/zero/non-positive quantities
      if (v_item->>'quantity')::int <= 0 then
        raise exception 'Invalid quantity % for custom item %', (v_item->>'quantity')::int, v_sku;
      END IF;

      -- Recalculate subtotal using reported price
      v_item_subtotal := v_db_price * (v_item->>'quantity')::int;
      v_calculated_subtotal := v_calculated_subtotal + v_item_subtotal;

      -- Record Invoice Item with null variant_id and custom_name set
      insert into invoice_items (
        invoice_id, variant_id, custom_name, quantity, unit_price, subtotal
      ) values (
        v_invoice_id,
        null,
        v_sku,
        (v_item->>'quantity')::int,
        v_db_price,
        v_item_subtotal
      );
    else
      -- Regular variant item
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

      -- Explicit validation to prevent negative/zero/non-positive quantities
      if (v_item->>'quantity')::int <= 0 then
        raise exception 'Invalid quantity % for SKU %', (v_item->>'quantity')::int, v_sku;
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
        invoice_id, variant_id, custom_name, quantity, unit_price, subtotal
      ) values (
        v_invoice_id,
        (v_item->>'variant_id')::uuid,
        null,
        (v_item->>'quantity')::int,
        v_db_price,
        v_item_subtotal
      );
    end if;
  end loop;

  -- 3. Price Tampering Integrity Verification
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
END;
$$ language plpgsql security definer;
