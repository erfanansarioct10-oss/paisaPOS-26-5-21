-- =========================================================================
-- PaisaPOS Security Scan Hardening
--
-- Follow-up controls from the deep security scan:
-- - keep direct Data API writes out of browser-authenticated sessions
-- - remove self-profile deletion
-- - require active owners for public catalog RPC wrappers
-- - cap JSON/RPC payload cardinality at the database boundary
-- - disable the legacy non-idempotent checkout RPC signature
-- =========================================================================

-- Browser-authenticated clients can still read through RLS and call the
-- explicit RPC surface, but writes now go through server actions or guarded
-- SECURITY DEFINER routines so rate limits and activity events cannot be
-- bypassed with direct PostgREST table mutations.
REVOKE UPDATE, DELETE ON TABLE public.stores FROM authenticated;
REVOKE UPDATE, DELETE ON TABLE public.users FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.products FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.product_variants FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.inventory FROM authenticated;

DROP POLICY IF EXISTS "Users can delete their own user profile" ON public.users;

DROP FUNCTION IF EXISTS public.upsert_product_and_variants_unchecked(
  uuid,
  text,
  text,
  integer,
  uuid[],
  jsonb
);

ALTER FUNCTION public.upsert_product_and_variants(
  uuid,
  text,
  text,
  integer,
  uuid[],
  jsonb
) RENAME TO upsert_product_and_variants_unchecked;

CREATE OR REPLACE FUNCTION public.upsert_product_and_variants(
  p_product_id uuid,
  p_name text,
  p_category text,
  p_low_stock_threshold integer,
  p_deleted_variant_ids uuid[],
  p_variants jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
  v_store_id uuid;
  v_role public.user_role;
  v_status public.user_status;
  v_variant_count integer;
  v_deleted_variant_count integer;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated. Only logged-in users can modify inventory.';
  END IF;

  IF p_variants IS NULL OR jsonb_typeof(p_variants) <> 'array' THEN
    RAISE EXCEPTION 'Product variants must be an array.';
  END IF;

  v_variant_count := jsonb_array_length(p_variants);
  IF v_variant_count = 0 OR v_variant_count > 100 THEN
    RAISE EXCEPTION 'A product can include between 1 and 100 variants.';
  END IF;

  v_deleted_variant_count := COALESCE(array_length(p_deleted_variant_ids, 1), 0);
  IF v_deleted_variant_count > 200 THEN
    RAISE EXCEPTION 'A product update can delete at most 200 variants.';
  END IF;

  SELECT u.store_id, u.role, u.status
  INTO v_store_id, v_role, v_status
  FROM public.users u
  WHERE u.id = v_user_id;

  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'User profile / store association not found.';
  END IF;

  IF v_role IS DISTINCT FROM 'owner'::public.user_role
    OR v_status IS DISTINCT FROM 'active'::public.user_status
  THEN
    RAISE EXCEPTION 'Unauthorized. Only active store owners can add or modify products.';
  END IF;

  RETURN public.upsert_product_and_variants_unchecked(
    p_product_id,
    p_name,
    p_category,
    p_low_stock_threshold,
    p_deleted_variant_ids,
    p_variants
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.upsert_product_and_variants_unchecked(
  uuid,
  text,
  text,
  integer,
  uuid[],
  jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_product_and_variants_unchecked(
  uuid,
  text,
  text,
  integer,
  uuid[],
  jsonb
) TO service_role;

REVOKE EXECUTE ON FUNCTION public.upsert_product_and_variants(
  uuid,
  text,
  text,
  integer,
  uuid[],
  jsonb
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_product_and_variants(
  uuid,
  text,
  text,
  integer,
  uuid[],
  jsonb
) TO authenticated;

DROP FUNCTION IF EXISTS public.bulk_upsert_products_and_variants_unchecked(jsonb);

ALTER FUNCTION public.bulk_upsert_products_and_variants(jsonb)
  RENAME TO bulk_upsert_products_and_variants_unchecked;

CREATE OR REPLACE FUNCTION public.bulk_upsert_products_and_variants(
  p_products jsonb
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
  v_store_id uuid;
  v_role public.user_role;
  v_status public.user_status;
  v_product_count integer;
  v_product jsonb;
  v_variant_count integer;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated. Only logged-in users can import catalogs.';
  END IF;

  IF p_products IS NULL OR jsonb_typeof(p_products) <> 'array' THEN
    RAISE EXCEPTION 'Bulk import payload must be an array.';
  END IF;

  v_product_count := jsonb_array_length(p_products);
  IF v_product_count = 0 OR v_product_count > 1000 THEN
    RAISE EXCEPTION 'Bulk import can include between 1 and 1000 products.';
  END IF;

  FOR v_product IN SELECT value FROM jsonb_array_elements(p_products) LOOP
    IF v_product->'variants' IS NULL OR jsonb_typeof(v_product->'variants') <> 'array' THEN
      RAISE EXCEPTION 'Each imported product must include a variants array.';
    END IF;

    v_variant_count := jsonb_array_length(v_product->'variants');
    IF v_variant_count = 0 OR v_variant_count > 100 THEN
      RAISE EXCEPTION 'Each imported product can include between 1 and 100 variants.';
    END IF;
  END LOOP;

  SELECT u.store_id, u.role, u.status
  INTO v_store_id, v_role, v_status
  FROM public.users u
  WHERE u.id = v_user_id;

  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'User profile / store association not found.';
  END IF;

  IF v_role IS DISTINCT FROM 'owner'::public.user_role
    OR v_status IS DISTINCT FROM 'active'::public.user_status
  THEN
    RAISE EXCEPTION 'Unauthorized. Only active store owners can import product catalogs.';
  END IF;

  RETURN public.bulk_upsert_products_and_variants_unchecked(p_products);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.bulk_upsert_products_and_variants_unchecked(jsonb)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_upsert_products_and_variants_unchecked(jsonb)
TO service_role;

REVOKE EXECUTE ON FUNCTION public.bulk_upsert_products_and_variants(jsonb)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bulk_upsert_products_and_variants(jsonb)
TO authenticated;

DROP FUNCTION IF EXISTS public.create_invoice_and_deduct_stock_unbounded(
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

ALTER FUNCTION public.create_invoice_and_deduct_stock(
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
) RENAME TO create_invoice_and_deduct_stock_unbounded;

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
BEGIN
  IF p_items IS NULL
    OR jsonb_typeof(p_items) <> 'array'
    OR jsonb_array_length(p_items) = 0
  THEN
    RAISE EXCEPTION 'Checkout requires at least one item.';
  END IF;

  IF jsonb_array_length(p_items) > 100 THEN
    RAISE EXCEPTION 'Checkout can include at most 100 items.';
  END IF;

  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'Checkout requires an idempotency key.';
  END IF;

  RETURN public.create_invoice_and_deduct_stock_unbounded(
    p_store_id,
    p_invoice_number,
    p_customer_name,
    p_customer_phone,
    p_total_amount,
    p_discount_amount,
    p_paid_amount,
    p_payment_method,
    p_items,
    p_idempotency_key
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_invoice_and_deduct_stock_unbounded(
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
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_invoice_and_deduct_stock_unbounded(
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
) TO service_role;

REVOKE EXECUTE ON FUNCTION public.create_invoice_and_deduct_stock(
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
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_invoice_and_deduct_stock(
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
) TO authenticated;

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
BEGIN
  RAISE EXCEPTION 'Deprecated checkout RPC signature requires an idempotency key.';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_invoice_and_deduct_stock(
  uuid,
  text,
  text,
  text,
  numeric,
  numeric,
  numeric,
  text,
  jsonb
) FROM PUBLIC, anon, authenticated;
