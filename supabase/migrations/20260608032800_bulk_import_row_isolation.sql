-- =========================================================================
-- PaisaPOS: Bulk Import Row-Level Error Isolation (High #5 Audit Fix)
--
-- Previously, the bulk import RPC processed all products in a single
-- transaction — if ANY product failed (e.g. duplicate SKU), PostgreSQL
-- rolled back ALL products in that chunk.
--
-- This migration rewrites both RPC functions to use per-product exception
-- handling via nested BEGIN...EXCEPTION blocks (PL/pgSQL auto-creates
-- savepoints), so a failure on one product doesn't abort the transaction.
--
-- Return type changes from integer → jsonb:
--   { "succeeded": <count>, "failed": [{ "name": "...", "error": "..." }] }
-- =========================================================================

-- Drop existing functions to allow return type change (from integer to jsonb)
DROP FUNCTION IF EXISTS public.bulk_upsert_products_and_variants(jsonb);
DROP FUNCTION IF EXISTS public.bulk_upsert_products_and_variants_unchecked(jsonb);
DROP FUNCTION IF EXISTS public.bulk_upsert_products_and_variants_for_delegation(uuid, uuid, uuid, jsonb);

-- 1. Rewrite the unchecked (inner) function with per-product isolation
CREATE OR REPLACE FUNCTION public.bulk_upsert_products_and_variants_unchecked(
  p_products jsonb
) RETURNS jsonb AS $$
DECLARE
  v_user_id uuid;
  v_store_id uuid;
  v_role public.user_role;
  v_prod jsonb;
  v_var jsonb;
  v_product_id uuid;
  v_variant_id uuid;
  v_succeeded integer := 0;
  v_failed jsonb := '[]'::jsonb;
  v_prod_name text;
BEGIN
  -- Set transaction-local bulk import active flag
  PERFORM set_config('app.bulk_import_active', 'true', true);

  -- Authentication Check
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated. Only logged-in users can import catalogs.';
  END IF;

  -- Resolve store ID & user role
  SELECT store_id, role INTO v_store_id, v_role FROM public.users WHERE id = v_user_id;
  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'User profile / store association not found.';
  END IF;

  -- Enforce Role Privileges Gating
  IF v_role IS DISTINCT FROM 'owner'::public.user_role THEN
    RAISE EXCEPTION 'Unauthorized. Only store owners can import product catalogs.';
  END IF;

  -- Process each product in the JSONB array with per-product isolation
  FOR v_prod IN SELECT * FROM jsonb_array_elements(p_products) LOOP
    v_prod_name := v_prod->>'name';

    -- Nested BEGIN...EXCEPTION creates an implicit savepoint per product
    BEGIN
      SELECT id INTO v_product_id
      FROM public.products
      WHERE store_id = v_store_id
        AND LOWER(name) = LOWER(v_prod->>'name')
        AND LOWER(category) = LOWER(v_prod->>'category')
      LIMIT 1;

      IF v_product_id IS NULL THEN
        -- Insert Product
        INSERT INTO public.products (store_id, name, category, low_stock_threshold)
        VALUES (
          v_store_id,
          v_prod->>'name',
          v_prod->>'category',
          COALESCE((v_prod->>'lowStockThreshold')::integer, 5)
        )
        RETURNING id INTO v_product_id;
      ELSE
        -- Update existing Product low_stock_threshold
        UPDATE public.products
        SET low_stock_threshold = COALESCE((v_prod->>'lowStockThreshold')::integer, low_stock_threshold)
        WHERE id = v_product_id
          AND store_id = v_store_id;
      END IF;

      -- Process variants of the product
      FOR v_var IN SELECT * FROM jsonb_array_elements(v_prod->'variants') LOOP
        SELECT id INTO v_variant_id
        FROM public.product_variants
        WHERE store_id = v_store_id
          AND UPPER(sku) = UPPER(v_var->>'sku')
        LIMIT 1;

        IF v_variant_id IS NOT NULL THEN
          -- Update variant details
          UPDATE public.product_variants
          SET size = v_var->>'size',
              color = v_var->>'color',
              price = (v_var->>'price')::numeric
          WHERE id = v_variant_id
            AND store_id = v_store_id;

          -- Upsert inventory
          INSERT INTO public.inventory (variant_id, store_id, quantity, updated_at)
          VALUES (v_variant_id, v_store_id, (v_var->>'stock')::integer, now())
          ON CONFLICT (variant_id) DO UPDATE
          SET store_id = EXCLUDED.store_id,
              quantity = EXCLUDED.quantity,
              updated_at = now();
        ELSE
          -- Insert new variant
          INSERT INTO public.product_variants (product_id, store_id, size, color, sku, price)
          VALUES (
            v_product_id,
            v_store_id,
            v_var->>'size',
            v_var->>'color',
            UPPER(v_var->>'sku'),
            (v_var->>'price')::numeric
          )
          RETURNING id INTO v_variant_id;

          -- Insert initial inventory
          INSERT INTO public.inventory (variant_id, store_id, quantity, updated_at)
          VALUES (v_variant_id, v_store_id, (v_var->>'stock')::integer, now());
        END IF;
      END LOOP;

      v_succeeded := v_succeeded + 1;

    EXCEPTION WHEN OTHERS THEN
      -- Per-product failure: record the error and continue to next product
      v_failed := v_failed || jsonb_build_object(
        'name', COALESCE(v_prod_name, 'Unknown'),
        'error', SQLERRM
      );
    END;
  END LOOP;

  -- Write exactly one consolidated audit log
  INSERT INTO public.audit_logs (store_id, user_id, operation, affected_entity, result, created_at)
  VALUES (
    v_store_id,
    v_user_id,
    'BULK_IMPORT',
    'Bulk import: ' || v_succeeded || ' succeeded, ' || jsonb_array_length(v_failed) || ' failed.',
    CASE WHEN jsonb_array_length(v_failed) = 0 THEN 'SUCCESS' ELSE 'PARTIAL' END,
    now()
  );

  RETURN jsonb_build_object('succeeded', v_succeeded, 'failed', v_failed);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- 2. Rewrite the delegation function with per-product isolation
CREATE OR REPLACE FUNCTION public.bulk_upsert_products_and_variants_for_delegation(
  p_store_id uuid,
  p_actor_user_id uuid,
  p_delegation_id uuid,
  p_products jsonb
) RETURNS jsonb AS $$
DECLARE
  v_prod jsonb;
  v_var jsonb;
  v_product_id uuid;
  v_variant_id uuid;
  v_succeeded integer := 0;
  v_failed jsonb := '[]'::jsonb;
  v_prod_name text;
  v_requested_count integer := COALESCE(jsonb_array_length(p_products), 0);
BEGIN
  -- Set transaction-local bulk import active flag
  PERFORM set_config('app.bulk_import_active', 'true', true);

  PERFORM public.validate_delegated_catalog_action(p_store_id, p_actor_user_id, p_delegation_id);

  FOR v_prod IN SELECT * FROM jsonb_array_elements(p_products) LOOP
    v_prod_name := v_prod->>'name';

    -- Nested BEGIN...EXCEPTION creates an implicit savepoint per product
    BEGIN
      SELECT id
      INTO v_product_id
      FROM public.products
      WHERE store_id = p_store_id
        AND lower(name) = lower(v_prod->>'name')
        AND lower(category) = lower(v_prod->>'category')
      LIMIT 1;

      IF v_product_id IS NULL THEN
        INSERT INTO public.products (store_id, name, category, low_stock_threshold)
        VALUES (
          p_store_id,
          v_prod->>'name',
          v_prod->>'category',
          COALESCE((v_prod->>'lowStockThreshold')::integer, 5)
        )
        RETURNING id INTO v_product_id;
      ELSE
        UPDATE public.products
        SET low_stock_threshold = COALESCE((v_prod->>'lowStockThreshold')::integer, low_stock_threshold)
        WHERE id = v_product_id
          AND store_id = p_store_id;
      END IF;

      FOR v_var IN SELECT * FROM jsonb_array_elements(v_prod->'variants') LOOP
        SELECT id
        INTO v_variant_id
        FROM public.product_variants
        WHERE store_id = p_store_id
          AND upper(sku) = upper(v_var->>'sku')
        LIMIT 1;

        IF v_variant_id IS NOT NULL THEN
          UPDATE public.product_variants
          SET size = v_var->>'size',
              color = v_var->>'color',
              price = (v_var->>'price')::numeric
          WHERE id = v_variant_id
            AND store_id = p_store_id;

          INSERT INTO public.inventory (variant_id, store_id, quantity, updated_at)
          VALUES (v_variant_id, p_store_id, (v_var->>'stock')::integer, now())
          ON CONFLICT (variant_id) DO UPDATE
          SET store_id = EXCLUDED.store_id,
              quantity = EXCLUDED.quantity,
              updated_at = now();
        ELSE
          INSERT INTO public.product_variants (product_id, store_id, size, color, sku, price)
          VALUES (
            v_product_id,
            p_store_id,
            v_var->>'size',
            v_var->>'color',
            upper(v_var->>'sku'),
            (v_var->>'price')::numeric
          )
          RETURNING id INTO v_variant_id;

          INSERT INTO public.inventory (variant_id, store_id, quantity, updated_at)
          VALUES (v_variant_id, p_store_id, (v_var->>'stock')::integer, now());
        END IF;
      END LOOP;

      v_succeeded := v_succeeded + 1;

    EXCEPTION WHEN OTHERS THEN
      -- Per-product failure: record the error and continue to next product
      v_failed := v_failed || jsonb_build_object(
        'name', COALESCE(v_prod_name, 'Unknown'),
        'error', SQLERRM
      );
    END;
  END LOOP;

  -- Write exactly one consolidated audit log
  INSERT INTO public.audit_logs (store_id, user_id, operation, affected_entity, result, created_at)
  VALUES (
    p_store_id,
    p_actor_user_id,
    'BULK_IMPORT',
    'Delegated bulk import: ' || v_succeeded || ' succeeded, ' || jsonb_array_length(v_failed) || ' failed.',
    CASE WHEN jsonb_array_length(v_failed) = 0 THEN 'SUCCESS' ELSE 'PARTIAL' END,
    now()
  );

  PERFORM public.record_delegated_mutation_activity(
    p_store_id,
    p_actor_user_id,
    p_delegation_id,
    'product.imported',
    'catalog.manage'::public.privilege_scope,
    'catalog_import',
    NULL,
    NULL,
    'Delegated catalog import: ' || v_succeeded || ' succeeded, ' || jsonb_array_length(v_failed) || ' failed.',
    NULL,
    jsonb_build_object('succeededCount', v_succeeded),
    jsonb_build_object(
      'requestedCount', v_requested_count,
      'succeededCount', v_succeeded,
      'failedCount', jsonb_array_length(v_failed),
      'skippedCount', 0
    )
  );

  RETURN jsonb_build_object('succeeded', v_succeeded, 'failed', v_failed);
END;
$$ LANGUAGE plpgsql SECURITY INVOKER SET search_path = public;


-- 3. Update the checked wrapper to handle the new jsonb return type
CREATE OR REPLACE FUNCTION public.bulk_upsert_products_and_variants(
  p_products jsonb
) RETURNS jsonb
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


-- 4. Re-apply permission grants (unchanged from previous migrations)
REVOKE EXECUTE ON FUNCTION public.bulk_upsert_products_and_variants_unchecked(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_upsert_products_and_variants_unchecked(jsonb) TO service_role;

REVOKE EXECUTE ON FUNCTION public.bulk_upsert_products_and_variants(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bulk_upsert_products_and_variants(jsonb) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.bulk_upsert_products_and_variants_for_delegation(uuid, uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_upsert_products_and_variants_for_delegation(uuid, uuid, uuid, jsonb) TO service_role;
