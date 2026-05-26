-- =========================================================================
-- PaisaPOS Beta V1.1 Invoice Seller Attribution
--
-- Adds durable sold-by snapshots to invoices and updates checkout so seller
-- identity is resolved from auth.uid() + public.users, never from client input.
-- =========================================================================

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS sold_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sold_by_name text,
  ADD COLUMN IF NOT EXISTS sold_by_role public.user_role,
  ADD COLUMN IF NOT EXISTS sold_with_delegation_id uuid;

COMMENT ON COLUMN public.invoices.sold_by_user_id IS 'Authenticated user who completed checkout; nullable if user is later deleted.';
COMMENT ON COLUMN public.invoices.sold_by_name IS 'Historical seller display name snapshot captured at checkout.';
COMMENT ON COLUMN public.invoices.sold_by_role IS 'Historical seller role snapshot captured at checkout.';
COMMENT ON COLUMN public.invoices.sold_with_delegation_id IS 'Future link to privilege_delegations when checkout is performed under delegated authority.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoices_sold_by_name_length'
  ) THEN
    ALTER TABLE public.invoices
      ADD CONSTRAINT invoices_sold_by_name_length
      CHECK (sold_by_name IS NULL OR char_length(sold_by_name) BETWEEN 1 AND 150);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_invoices_store_sold_by_created
  ON public.invoices(store_id, sold_by_user_id, created_at DESC)
  WHERE sold_by_user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.create_invoice_and_deduct_stock(
  p_store_id uuid,
  p_invoice_number text,
  p_customer_name text,
  p_customer_phone text,
  p_total_amount numeric,
  p_discount_amount numeric,
  p_paid_amount numeric,
  p_payment_method text,
  p_items jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  v_seller_name text;
  v_seller_role public.user_role;
BEGIN
  -- Backward-compatible payload field; the database generates the authoritative invoice number.
  PERFORM p_invoice_number;

  -- Resolve and validate authenticated user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated. Only logged-in users can perform checkout.';
  END IF;

  -- Set checkout context local parameter to prevent stock trigger audit duplication
  PERFORM set_config('app.checkout_active', 'true', true);

  -- Verify store membership and capture immutable seller snapshot from trusted database state.
  SELECT u.name, u.role
  INTO v_seller_name, v_seller_role
  FROM public.users u
  WHERE u.id = v_user_id
    AND u.store_id = p_store_id;

  IF v_seller_name IS NULL OR v_seller_role IS NULL THEN
    PERFORM set_config('app.checkout_active', 'false', true);
    RAISE EXCEPTION 'Unauthorized. You do not have permission to checkout for this store.';
  END IF;

  -- Acquire an exclusive lock on the store row to serialize checkouts only for this store
  -- and prevent concurrent count race conditions.
  PERFORM id FROM public.stores WHERE id = p_store_id FOR UPDATE;

  -- Calculate the next sequential number for this specific store
  SELECT count(*) + 1 INTO v_store_invoice_count
  FROM public.invoices
  WHERE store_id = p_store_id;

  -- Construct sequential, tenant-scoped invoice number: e.g. INV-2026-0001
  v_invoice_number := 'INV-' || to_char(now(), 'YYYY') || '-' || lpad(v_store_invoice_count::text, 4, '0');

  -- 1. Insert Core Invoice with seller attribution
  INSERT INTO public.invoices (
    store_id,
    invoice_number,
    customer_name,
    customer_phone,
    total_amount,
    discount_amount,
    paid_amount,
    payment_method,
    sold_by_user_id,
    sold_by_name,
    sold_by_role
  ) VALUES (
    p_store_id,
    v_invoice_number,
    p_customer_name,
    p_customer_phone,
    p_total_amount,
    p_discount_amount,
    p_paid_amount,
    p_payment_method,
    v_user_id,
    v_seller_name,
    v_seller_role
  ) RETURNING id INTO v_invoice_id;

  -- 2. Iterate invoice line items, perform atomic stock checks & reductions.
  -- Items are ordered alphabetically by variant_id UUID (nulls last) to eliminate deadlock vulnerability.
  FOR v_item IN
    SELECT x.val
    FROM jsonb_array_elements(p_items) AS x(val)
    ORDER BY (x.val->>'variant_id') ASC NULLS LAST
  LOOP
    -- Determine if this is an ad-hoc custom item (variant_id is null)
    IF (v_item->>'variant_id') IS NULL THEN
      -- Set custom name as description
      v_sku := coalesce(v_item->>'custom_name', 'Custom Item');
      v_db_price := (v_item->>'unit_price')::numeric;

      -- Explicit validation to prevent negative/zero/non-positive quantities
      IF (v_item->>'quantity')::int <= 0 THEN
        RAISE EXCEPTION 'Invalid quantity % for custom item %', (v_item->>'quantity')::int, v_sku;
      END IF;

      -- Recalculate subtotal using reported price
      v_item_subtotal := v_db_price * (v_item->>'quantity')::int;
      v_calculated_subtotal := v_calculated_subtotal + v_item_subtotal;

      -- Record Invoice Item with null variant_id and custom_name set
      INSERT INTO public.invoice_items (
        invoice_id, variant_id, custom_name, quantity, unit_price, subtotal
      ) VALUES (
        v_invoice_id,
        null,
        v_sku,
        (v_item->>'quantity')::int,
        v_db_price,
        v_item_subtotal
      );
    ELSE
      -- Regular variant item. Verify variant ownership (the variant must belong to the user's store)
      IF NOT EXISTS (
        SELECT 1 FROM public.product_variants pv
        JOIN public.products p ON pv.product_id = p.id
        WHERE pv.id = (v_item->>'variant_id')::uuid
          AND p.store_id = p_store_id
      ) THEN
        RAISE EXCEPTION 'Variant with ID % does not belong to your store', (v_item->>'variant_id');
      END IF;

      -- Resolve variant details and lock matching inventory row to prevent concurrent race conditions
      SELECT quantity INTO v_current_stock
      FROM public.inventory
      WHERE variant_id = (v_item->>'variant_id')::uuid
      FOR UPDATE;

      SELECT price, sku INTO v_db_price, v_sku
      FROM public.product_variants
      WHERE id = (v_item->>'variant_id')::uuid;

      IF v_current_stock IS NULL THEN
        RAISE EXCEPTION 'Variant with SKU % does not exist in inventory', v_sku;
      END IF;

      -- Explicit validation to prevent negative/zero/non-positive quantities
      IF (v_item->>'quantity')::int <= 0 THEN
        RAISE EXCEPTION 'Invalid quantity % for SKU %', (v_item->>'quantity')::int, v_sku;
      END IF;

      -- Atomic safety check
      IF v_current_stock < (v_item->>'quantity')::int THEN
        RAISE EXCEPTION 'Insufficient stock for SKU %. Available: %, Requested: %',
          v_sku, v_current_stock, (v_item->>'quantity')::int;
      END IF;

      -- Decrement matching stock level
      UPDATE public.inventory
      SET quantity = quantity - (v_item->>'quantity')::int,
          updated_at = now()
      WHERE variant_id = (v_item->>'variant_id')::uuid;

      -- Recalculate subtotal using authentic database price
      v_item_subtotal := v_db_price * (v_item->>'quantity')::int;
      v_calculated_subtotal := v_calculated_subtotal + v_item_subtotal;

      -- Record Invoice Item using server-verified values
      INSERT INTO public.invoice_items (
        invoice_id, variant_id, custom_name, quantity, unit_price, subtotal
      ) VALUES (
        v_invoice_id,
        (v_item->>'variant_id')::uuid,
        null,
        (v_item->>'quantity')::int,
        v_db_price,
        v_item_subtotal
      );
    END IF;
  END LOOP;

  -- 3. Price Tampering Integrity Verification
  IF p_discount_amount > v_calculated_subtotal THEN
    RAISE EXCEPTION 'Discount amount % exceeds the subtotal %', p_discount_amount, v_calculated_subtotal;
  END IF;

  v_expected_total := v_calculated_subtotal - p_discount_amount;
  IF v_expected_total < 0.00 THEN
    v_expected_total := 0.00;
  END IF;

  IF abs(v_expected_total - p_total_amount) > 0.01 THEN
    RAISE EXCEPTION 'Price tampering detected! Client reported total of %, but recalculated total is %',
      p_total_amount, v_expected_total;
  END IF;

  -- 4. Record successful operation to audit log
  INSERT INTO public.audit_logs (store_id, user_id, operation, affected_entity, result, created_at)
  VALUES (
    p_store_id,
    v_user_id,
    'CHECKOUT',
    'Invoice: ' || v_invoice_number,
    'SUCCESS',
    now()
  );

  RETURN v_invoice_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_invoice_and_deduct_stock(uuid, text, text, text, numeric, numeric, numeric, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_invoice_and_deduct_stock(uuid, text, text, text, numeric, numeric, numeric, text, jsonb) TO authenticated;
