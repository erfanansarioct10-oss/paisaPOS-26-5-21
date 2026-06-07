-- =========================================================================
-- PaisaPOS Checkout Concurrency Hardening
--
-- Task 1: Replace store_invoice_counters row-level lock with native
--         PostgreSQL sequences for lock-free invoice numbering.
-- Task 2: Replace SELECT FOR UPDATE + separate UPDATE with a single
--         atomic UPDATE ... WHERE quantity >= X for inventory deduction.
--
-- Sequence gaps are acceptable. store_invoice_counters is preserved
-- for historical reads but is no longer written in the checkout path.
-- =========================================================================

-- ---------------------------------------------------------------------------
-- Task 1: Helper to lazily create and fetch a per-store, per-fiscal-year
--         PostgreSQL sequence.  Sequences are non-transactional so nextval()
--         never blocks on row locks; gaps are expected and acceptable.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._checkout_next_invoice_seq(
  p_store_id uuid,
  p_fiscal_year integer
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_seq_name text;
  v_current_max bigint;
BEGIN
  -- Deterministic, collision-free sequence name per (store, fiscal_year).
  v_seq_name := 'public.invoice_seq_'
    || replace(p_store_id::text, '-', '_')
    || '_' || p_fiscal_year::text;

  -- If the sequence already exists, just call nextval and return.
  IF EXISTS (
    SELECT 1 FROM pg_class
    WHERE relname = 'invoice_seq_'
      || replace(p_store_id::text, '-', '_')
      || '_' || p_fiscal_year::text
      AND relnamespace = 'public'::regnamespace
  ) THEN
    RETURN nextval(v_seq_name);
  END IF;

  -- First checkout for this (store, fiscal_year): create the sequence.
  -- Seed it from existing invoices so we never collide with historical data.
  SELECT COALESCE(max(i.invoice_seq), 0)
  INTO v_current_max
  FROM public.invoices i
  WHERE i.store_id = p_store_id
    AND i.fiscal_year = p_fiscal_year;

  -- Also check store_invoice_counters for the legacy high-water mark.
  SELECT greatest(
    v_current_max,
    COALESCE((
      SELECT sic.next_invoice_seq - 1
      FROM public.store_invoice_counters sic
      WHERE sic.store_id = p_store_id
        AND sic.fiscal_year = p_fiscal_year
    ), 0)
  ) INTO v_current_max;

  EXECUTE format(
    'CREATE SEQUENCE IF NOT EXISTS %s START WITH %s INCREMENT BY 1 NO CYCLE',
    v_seq_name,
    v_current_max + 1
  );

  RETURN nextval(v_seq_name);
END;
$$;

-- Only callable by service_role (SECURITY DEFINER runs as the creating role).
REVOKE EXECUTE ON FUNCTION public._checkout_next_invoice_seq(uuid, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._checkout_next_invoice_seq(uuid, integer)
  TO service_role;

-- ---------------------------------------------------------------------------
-- Task 1 + Task 2: Rewrite create_invoice_and_deduct_stock_unbounded
--
-- Changes from the previous version:
--   1. Invoice sequencing uses _checkout_next_invoice_seq() (a PG SEQUENCE)
--      instead of UPDATE store_invoice_counters.
--   2. Inventory deduction uses a single atomic
--      UPDATE ... WHERE quantity >= X  instead of  SELECT FOR UPDATE + UPDATE.
--   3. Removed v_current_stock variable and explicit stock comparison.
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.create_invoice_and_deduct_stock_unbounded(
  uuid, text, text, text, numeric, numeric, numeric, text, jsonb, uuid
);

CREATE OR REPLACE FUNCTION public.create_invoice_and_deduct_stock_unbounded(
  p_store_id uuid,
  p_invoice_number text,
  p_customer_name text,
  p_customer_phone text,
  p_total_amount numeric,
  p_discount_amount numeric,
  p_paid_amount numeric,
  p_payment_method text,
  p_items jsonb,
  p_idempotency_key uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_invoice_id uuid;
  v_item jsonb;
  v_sku text;
  v_db_price numeric(10,2);
  v_item_subtotal numeric(10,2);
  v_calculated_subtotal numeric(10,2) := 0.00;
  v_expected_total numeric(10,2);
  v_invoice_number text;
  v_invoice_seq bigint;
  v_fiscal_year integer;
  v_user_id uuid;
  v_seller_name text;
  v_seller_role public.user_role;
  v_request_hash text;
  v_existing_request_hash text;
  v_request_status text;
  v_existing_invoice_id uuid;
  v_invoice_items jsonb := '[]'::jsonb;
  v_rows_affected integer;
BEGIN
  -- Backward-compatible payload field; the database generates the authoritative invoice number.
  PERFORM p_invoice_number;

  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated. Only logged-in users can perform checkout.';
  END IF;

  IF p_items IS NULL
    OR jsonb_typeof(p_items) <> 'array'
    OR jsonb_array_length(p_items) = 0
  THEN
    RAISE EXCEPTION 'Checkout requires at least one item.';
  END IF;

  IF p_discount_amount > p_total_amount THEN
    RAISE EXCEPTION 'check_discount_amount';
  END IF;

  IF p_paid_amount < 0 OR p_paid_amount > p_total_amount THEN
    RAISE EXCEPTION 'check_paid_amount';
  END IF;

  v_request_hash := md5(concat_ws(
    '|',
    p_store_id::text,
    coalesce(p_customer_name, ''),
    coalesce(p_customer_phone, ''),
    p_total_amount::text,
    p_discount_amount::text,
    p_paid_amount::text,
    coalesce(p_payment_method, ''),
    p_items::text
  ));

  IF p_idempotency_key IS NOT NULL THEN
    INSERT INTO public.checkout_requests (
      store_id,
      user_id,
      idempotency_key,
      request_hash,
      status
    ) VALUES (
      p_store_id,
      v_user_id,
      p_idempotency_key,
      v_request_hash,
      'processing'
    )
    ON CONFLICT (store_id, user_id, idempotency_key) DO NOTHING;

    SELECT cr.status, cr.invoice_id, cr.request_hash
    INTO v_request_status, v_existing_invoice_id, v_existing_request_hash
    FROM public.checkout_requests cr
    WHERE cr.store_id = p_store_id
      AND cr.user_id = v_user_id
      AND cr.idempotency_key = p_idempotency_key
    FOR NO KEY UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Unable to reserve checkout idempotency key.';
    END IF;

    IF v_existing_request_hash <> v_request_hash THEN
      RAISE EXCEPTION 'Idempotency key reuse with different checkout payload.';
    END IF;

    IF v_request_status = 'completed' THEN
      IF v_existing_invoice_id IS NULL THEN
        RAISE EXCEPTION 'Completed checkout request is missing invoice reference.';
      END IF;

      UPDATE public.checkout_requests
      SET
        replay_count = replay_count + 1,
        last_replayed_at = now(),
        updated_at = now()
      WHERE store_id = p_store_id
        AND user_id = v_user_id
        AND idempotency_key = p_idempotency_key
      RETURNING invoice_id INTO v_existing_invoice_id;

      RETURN jsonb_build_object(
        'invoice_id', v_existing_invoice_id,
        'was_replayed', true
      );
    END IF;

    IF v_request_status <> 'processing' THEN
      RAISE EXCEPTION 'Checkout request is not retryable in its current state: %', v_request_status;
    END IF;
  END IF;

  PERFORM set_config('app.checkout_active', 'true', true);

  SELECT u.name, u.role
  INTO v_seller_name, v_seller_role
  FROM public.users u
  WHERE u.id = v_user_id
    AND u.store_id = p_store_id
    AND u.status = 'active'::public.user_status;

  IF v_seller_name IS NULL OR v_seller_role IS NULL THEN
    PERFORM set_config('app.checkout_active', 'false', true);
    RAISE EXCEPTION 'Unauthorized. You do not have permission to checkout for this store.';
  END IF;

  -- ---------------------------------------------------------------------------
  -- Item loop: validate and deduct stock
  -- ---------------------------------------------------------------------------
  FOR v_item IN
    SELECT x.val
    FROM jsonb_array_elements(p_items) AS x(val)
    ORDER BY (x.val->>'variant_id') ASC NULLS LAST
  LOOP
    IF (v_item->>'variant_id') IS NULL THEN
      -- Custom / ad-hoc item — no inventory to deduct
      v_sku := coalesce(v_item->>'custom_name', 'Custom Item');
      v_db_price := (v_item->>'unit_price')::numeric;

      IF (v_item->>'quantity')::int <= 0 THEN
        RAISE EXCEPTION 'Invalid quantity % for custom item %', (v_item->>'quantity')::int, v_sku;
      END IF;

      v_item_subtotal := v_db_price * (v_item->>'quantity')::int;
      v_calculated_subtotal := v_calculated_subtotal + v_item_subtotal;

      v_invoice_items := v_invoice_items || jsonb_build_array(jsonb_build_object(
        'variant_id', NULL,
        'custom_name', v_sku,
        'quantity', (v_item->>'quantity')::int,
        'unit_price', v_db_price,
        'subtotal', v_item_subtotal
      ));
    ELSE
      -- Catalog item — validate store ownership, then atomic stock deduction
      IF NOT EXISTS (
        SELECT 1
        FROM public.product_variants pv
        JOIN public.products p ON pv.product_id = p.id
        WHERE pv.id = (v_item->>'variant_id')::uuid
          AND p.store_id = p_store_id
      ) THEN
        RAISE EXCEPTION 'Variant with ID % does not belong to your store', (v_item->>'variant_id');
      END IF;

      -- Fetch authoritative price and SKU for server-side total validation
      SELECT price, sku INTO v_db_price, v_sku
      FROM public.product_variants
      WHERE id = (v_item->>'variant_id')::uuid;

      IF (v_item->>'quantity')::int <= 0 THEN
        RAISE EXCEPTION 'Invalid quantity % for SKU %', (v_item->>'quantity')::int, v_sku;
      END IF;

      -- Task 2: Single atomic UPDATE that checks stock in the WHERE clause.
      -- This replaces the old SELECT ... FOR UPDATE + separate UPDATE pattern,
      -- drastically reducing row lock hold time under concurrent checkouts.
      UPDATE public.inventory
      SET quantity = quantity - (v_item->>'quantity')::int,
          updated_at = now()
      WHERE variant_id = (v_item->>'variant_id')::uuid
        AND quantity >= (v_item->>'quantity')::int;

      GET DIAGNOSTICS v_rows_affected = ROW_COUNT;

      IF v_rows_affected = 0 THEN
        -- Either the variant does not exist in inventory, or stock is insufficient.
        -- Check which case to give a clear error message.
        IF NOT EXISTS (
          SELECT 1 FROM public.inventory
          WHERE variant_id = (v_item->>'variant_id')::uuid
        ) THEN
          RAISE EXCEPTION 'Variant with SKU % does not exist in inventory', v_sku;
        ELSE
          RAISE EXCEPTION 'Insufficient stock for SKU %. Requested: %', v_sku, (v_item->>'quantity')::int;
        END IF;
      END IF;

      v_item_subtotal := v_db_price * (v_item->>'quantity')::int;
      v_calculated_subtotal := v_calculated_subtotal + v_item_subtotal;

      v_invoice_items := v_invoice_items || jsonb_build_array(jsonb_build_object(
        'variant_id', (v_item->>'variant_id')::uuid,
        'custom_name', NULL,
        'quantity', (v_item->>'quantity')::int,
        'unit_price', v_db_price,
        'subtotal', v_item_subtotal
      ));
    END IF;
  END LOOP;

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

  -- ---------------------------------------------------------------------------
  -- Task 1: Invoice sequencing via native PG SEQUENCE (lock-free)
  -- ---------------------------------------------------------------------------
  v_fiscal_year := extract(year from now())::integer;
  v_invoice_seq := public._checkout_next_invoice_seq(p_store_id, v_fiscal_year);

  v_invoice_number := 'INV-' || v_fiscal_year::text || '-' || lpad(v_invoice_seq::text, 4, '0');

  INSERT INTO public.invoices (
    store_id,
    invoice_number,
    fiscal_year,
    invoice_seq,
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
    v_fiscal_year,
    v_invoice_seq,
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

  FOR v_item IN
    SELECT x.val
    FROM jsonb_array_elements(v_invoice_items) AS x(val)
  LOOP
    INSERT INTO public.invoice_items (
      invoice_id, variant_id, custom_name, quantity, unit_price, subtotal
    ) VALUES (
      v_invoice_id,
      NULLIF(v_item->>'variant_id', '')::uuid,
      v_item->>'custom_name',
      (v_item->>'quantity')::int,
      (v_item->>'unit_price')::numeric,
      (v_item->>'subtotal')::numeric
    );
  END LOOP;

  INSERT INTO public.audit_logs (store_id, user_id, operation, affected_entity, result, created_at)
  VALUES (
    p_store_id,
    v_user_id,
    'CHECKOUT',
    'Invoice: ' || v_invoice_number,
    'SUCCESS',
    now()
  );

  IF p_idempotency_key IS NOT NULL THEN
    UPDATE public.checkout_requests
    SET
      status = 'completed',
      invoice_id = v_invoice_id,
      updated_at = now()
    WHERE store_id = p_store_id
      AND user_id = v_user_id
      AND idempotency_key = p_idempotency_key;
  END IF;

  RETURN jsonb_build_object(
    'invoice_id', v_invoice_id,
    'was_replayed', false
  );
END;
$$;

-- Preserve the same grant structure as the security hardening migration.
REVOKE EXECUTE ON FUNCTION public.create_invoice_and_deduct_stock_unbounded(
  uuid, text, text, text, numeric, numeric, numeric, text, jsonb, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_invoice_and_deduct_stock_unbounded(
  uuid, text, text, text, numeric, numeric, numeric, text, jsonb, uuid
) TO service_role;
