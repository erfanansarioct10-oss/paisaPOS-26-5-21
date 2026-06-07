-- =========================================================================
-- PaisaPOS Checkout Replay Result + Observability
--
-- Additive follow-up to checkout counter sequencing:
-- - keeps the legacy 9-argument checkout RPC returning uuid
-- - changes the 10-argument idempotent RPC contract to return jsonb:
--   { "invoice_id": uuid, "was_replayed": boolean }
-- - records replay counts/timestamps for operational debugging
-- =========================================================================

ALTER TABLE public.checkout_requests
  ADD COLUMN IF NOT EXISTS replay_count integer NOT NULL DEFAULT 0 CHECK (replay_count >= 0),
  ADD COLUMN IF NOT EXISTS last_replayed_at timestamp with time zone;

DROP FUNCTION IF EXISTS public.create_invoice_and_deduct_stock(
  uuid,
  text,
  text,
  text,
  numeric,
  numeric,
  numeric,
  text,
  jsonb,
  uuid
);

CREATE OR REPLACE FUNCTION public.create_invoice_and_deduct_stock(
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
  v_current_stock int;
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
    FOR UPDATE;

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

  FOR v_item IN
    SELECT x.val
    FROM jsonb_array_elements(p_items) AS x(val)
    ORDER BY (x.val->>'variant_id') ASC NULLS LAST
  LOOP
    IF (v_item->>'variant_id') IS NULL THEN
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
      IF NOT EXISTS (
        SELECT 1
        FROM public.product_variants pv
        JOIN public.products p ON pv.product_id = p.id
        WHERE pv.id = (v_item->>'variant_id')::uuid
          AND p.store_id = p_store_id
      ) THEN
        RAISE EXCEPTION 'Variant with ID % does not belong to your store', (v_item->>'variant_id');
      END IF;

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

      IF (v_item->>'quantity')::int <= 0 THEN
        RAISE EXCEPTION 'Invalid quantity % for SKU %', (v_item->>'quantity')::int, v_sku;
      END IF;

      IF v_current_stock < (v_item->>'quantity')::int THEN
        RAISE EXCEPTION 'Insufficient stock for SKU %. Available: %, Requested: %',
          v_sku, v_current_stock, (v_item->>'quantity')::int;
      END IF;

      UPDATE public.inventory
      SET quantity = quantity - (v_item->>'quantity')::int,
          updated_at = now()
      WHERE variant_id = (v_item->>'variant_id')::uuid;

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

  v_fiscal_year := extract(year from now())::integer;

  INSERT INTO public.store_invoice_counters (store_id, fiscal_year, next_invoice_seq)
  VALUES (p_store_id, v_fiscal_year, 1)
  ON CONFLICT (store_id, fiscal_year) DO NOTHING;

  UPDATE public.store_invoice_counters
  SET
    next_invoice_seq = next_invoice_seq + 1,
    updated_at = now()
  WHERE store_id = p_store_id
    AND fiscal_year = v_fiscal_year
  RETURNING next_invoice_seq - 1 INTO v_invoice_seq;

  IF v_invoice_seq IS NULL THEN
    RAISE EXCEPTION 'Unable to allocate invoice sequence for store %.%', p_store_id, v_fiscal_year;
  END IF;

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
SET search_path = ''
AS $$
DECLARE
  v_result jsonb;
BEGIN
  v_result := public.create_invoice_and_deduct_stock(
    p_store_id,
    p_invoice_number,
    p_customer_name,
    p_customer_phone,
    p_total_amount,
    p_discount_amount,
    p_paid_amount,
    p_payment_method,
    p_items,
    NULL::uuid
  );

  RETURN (v_result->>'invoice_id')::uuid;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_invoice_and_deduct_stock(uuid, text, text, text, numeric, numeric, numeric, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_invoice_and_deduct_stock(uuid, text, text, text, numeric, numeric, numeric, text, jsonb) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.create_invoice_and_deduct_stock(uuid, text, text, text, numeric, numeric, numeric, text, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_invoice_and_deduct_stock(uuid, text, text, text, numeric, numeric, numeric, text, jsonb, uuid) TO authenticated;
