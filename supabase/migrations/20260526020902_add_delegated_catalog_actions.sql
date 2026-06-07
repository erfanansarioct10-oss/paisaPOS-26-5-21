-- =========================================================================
-- PaisaPOS Delegated Catalog Action RPCs
--
-- These functions are intentionally service_role-only. Browser/authenticated
-- sessions must continue to use the owner-gated catalog RPCs/RLS policies.
-- Server Actions call these only after requirePrivilege("catalog.manage")
-- resolves an active delegation, and the database revalidates that delegation
-- before performing any write.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.validate_delegated_catalog_action(
  p_store_id uuid,
  p_actor_user_id uuid,
  p_delegation_id uuid
) RETURNS uuid AS $$
DECLARE
  v_grantor_user_id uuid;
BEGIN
  IF p_store_id IS NULL OR p_actor_user_id IS NULL OR p_delegation_id IS NULL THEN
    RAISE EXCEPTION 'Invalid delegated catalog action context.';
  END IF;

  SELECT d.granted_by_user_id
  INTO v_grantor_user_id
  FROM public.privilege_delegations d
  JOIN public.users grantee ON grantee.id = d.granted_to_user_id
  JOIN public.users grantor ON grantor.id = d.granted_by_user_id
  WHERE d.id = p_delegation_id
    AND d.store_id = p_store_id
    AND d.granted_to_user_id = p_actor_user_id
    AND d.scope = 'catalog.manage'::public.privilege_scope
    AND d.revoked_at IS NULL
    AND d.starts_at <= now()
    AND d.expires_at > now()
    AND grantee.store_id = p_store_id
    AND grantee.role = 'cashier'::public.user_role
    AND grantee.status = 'active'::public.user_status
    AND grantor.store_id = p_store_id
    AND grantor.role = 'owner'::public.user_role
    AND grantor.status = 'active'::public.user_status
  LIMIT 1;

  IF v_grantor_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized. Active catalog delegation was not found.';
  END IF;

  RETURN v_grantor_user_id;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER SET search_path = public;

CREATE OR REPLACE FUNCTION public.upsert_product_and_variants_for_delegation(
  p_store_id uuid,
  p_actor_user_id uuid,
  p_delegation_id uuid,
  p_product_id uuid,
  p_name text,
  p_category text,
  p_low_stock_threshold integer,
  p_deleted_variant_ids uuid[],
  p_variants jsonb
) RETURNS uuid AS $$
DECLARE
  v_product_id uuid := p_product_id;
  v_var jsonb;
  v_variant_id uuid;
BEGIN
  PERFORM public.validate_delegated_catalog_action(p_store_id, p_actor_user_id, p_delegation_id);

  IF v_product_id IS NULL THEN
    INSERT INTO public.products (store_id, name, category, low_stock_threshold)
    VALUES (p_store_id, p_name, p_category, p_low_stock_threshold)
    RETURNING id INTO v_product_id;

    INSERT INTO public.audit_logs (store_id, user_id, operation, affected_entity, result, created_at)
    VALUES (
      p_store_id,
      p_actor_user_id,
      'PRODUCT_CREATE',
      'Delegated product create: ' || p_name || ' (ID: ' || v_product_id || ')',
      'SUCCESS',
      now()
    );
  ELSE
    IF NOT EXISTS (
      SELECT 1
      FROM public.products
      WHERE id = v_product_id
        AND store_id = p_store_id
    ) THEN
      RAISE EXCEPTION 'Unauthorized. Product does not belong to your store.';
    END IF;

    UPDATE public.products
    SET name = p_name,
        category = p_category,
        low_stock_threshold = p_low_stock_threshold
    WHERE id = v_product_id
      AND store_id = p_store_id;

    INSERT INTO public.audit_logs (store_id, user_id, operation, affected_entity, result, created_at)
    VALUES (
      p_store_id,
      p_actor_user_id,
      'PRODUCT_UPDATE',
      'Delegated product update: ' || p_name || ' (ID: ' || v_product_id || ')',
      'SUCCESS',
      now()
    );
  END IF;

  IF p_deleted_variant_ids IS NOT NULL AND array_length(p_deleted_variant_ids, 1) > 0 THEN
    IF EXISTS (
      SELECT 1
      FROM public.product_variants pv
      WHERE pv.id = ANY(p_deleted_variant_ids)
        AND (pv.store_id IS DISTINCT FROM p_store_id OR pv.product_id IS DISTINCT FROM v_product_id)
    ) THEN
      RAISE EXCEPTION 'Unauthorized. Some variants to delete do not belong to this product.';
    END IF;

    DELETE FROM public.product_variants
    WHERE id = ANY(p_deleted_variant_ids)
      AND store_id = p_store_id
      AND product_id = v_product_id;
  END IF;

  FOR v_var IN SELECT * FROM jsonb_array_elements(p_variants) LOOP
    v_variant_id := (v_var->>'id')::uuid;

    IF v_variant_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1
        FROM public.product_variants pv
        WHERE pv.id = v_variant_id
          AND pv.store_id = p_store_id
          AND pv.product_id = v_product_id
      ) THEN
        RAISE EXCEPTION 'Unauthorized. Variant with ID % does not belong to this product.', v_variant_id;
      END IF;

      UPDATE public.product_variants
      SET size = v_var->>'size',
          color = v_var->>'color',
          sku = v_var->>'sku',
          price = (v_var->>'price')::numeric
      WHERE id = v_variant_id
        AND store_id = p_store_id
        AND product_id = v_product_id;

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
        v_var->>'sku',
        (v_var->>'price')::numeric
      )
      RETURNING id INTO v_variant_id;

      INSERT INTO public.inventory (variant_id, store_id, quantity, updated_at)
      VALUES (v_variant_id, p_store_id, (v_var->>'stock')::integer, now());
    END IF;
  END LOOP;

  RETURN v_product_id;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER SET search_path = public;

CREATE OR REPLACE FUNCTION public.bulk_upsert_products_and_variants_for_delegation(
  p_store_id uuid,
  p_actor_user_id uuid,
  p_delegation_id uuid,
  p_products jsonb
) RETURNS integer AS $$
DECLARE
  v_prod jsonb;
  v_var jsonb;
  v_product_id uuid;
  v_variant_id uuid;
  v_count integer := 0;
BEGIN
  PERFORM public.validate_delegated_catalog_action(p_store_id, p_actor_user_id, p_delegation_id);

  FOR v_prod IN SELECT * FROM jsonb_array_elements(p_products) LOOP
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

      INSERT INTO public.audit_logs (store_id, user_id, operation, affected_entity, result, created_at)
      VALUES (
        p_store_id,
        p_actor_user_id,
        'PRODUCT_CREATE',
        'Delegated bulk import product: ' || (v_prod->>'name') || ' (ID: ' || v_product_id || ')',
        'SUCCESS',
        now()
      );
    ELSE
      UPDATE public.products
      SET low_stock_threshold = COALESCE((v_prod->>'lowStockThreshold')::integer, low_stock_threshold)
      WHERE id = v_product_id
        AND store_id = p_store_id;

      INSERT INTO public.audit_logs (store_id, user_id, operation, affected_entity, result, created_at)
      VALUES (
        p_store_id,
        p_actor_user_id,
        'PRODUCT_UPDATE',
        'Delegated bulk import product (existing): ' || (v_prod->>'name') || ' (ID: ' || v_product_id || ')',
        'SUCCESS',
        now()
      );
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

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER SET search_path = public;

CREATE OR REPLACE FUNCTION public.delete_product_for_delegation(
  p_store_id uuid,
  p_actor_user_id uuid,
  p_delegation_id uuid,
  p_product_id uuid
) RETURNS boolean AS $$
BEGIN
  PERFORM public.validate_delegated_catalog_action(p_store_id, p_actor_user_id, p_delegation_id);

  IF NOT EXISTS (
    SELECT 1
    FROM public.products
    WHERE id = p_product_id
      AND store_id = p_store_id
  ) THEN
    RAISE EXCEPTION 'Product not found.';
  END IF;

  DELETE FROM public.products
  WHERE id = p_product_id
    AND store_id = p_store_id;

  INSERT INTO public.audit_logs (store_id, user_id, operation, affected_entity, result, created_at)
  VALUES (
    p_store_id,
    p_actor_user_id,
    'PRODUCT_DELETE',
    'Delegated product delete: ' || p_product_id,
    'SUCCESS',
    now()
  );

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER SET search_path = public;

CREATE OR REPLACE FUNCTION public.set_product_favorite_for_delegation(
  p_store_id uuid,
  p_actor_user_id uuid,
  p_delegation_id uuid,
  p_product_id uuid,
  p_is_favorite boolean
) RETURNS boolean AS $$
BEGIN
  PERFORM public.validate_delegated_catalog_action(p_store_id, p_actor_user_id, p_delegation_id);

  IF NOT EXISTS (
    SELECT 1
    FROM public.products
    WHERE id = p_product_id
      AND store_id = p_store_id
  ) THEN
    RAISE EXCEPTION 'Product not found.';
  END IF;

  UPDATE public.products
  SET is_favorite = p_is_favorite
  WHERE id = p_product_id
    AND store_id = p_store_id;

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.validate_delegated_catalog_action(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.upsert_product_and_variants_for_delegation(uuid, uuid, uuid, uuid, text, text, integer, uuid[], jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bulk_upsert_products_and_variants_for_delegation(uuid, uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_product_for_delegation(uuid, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_product_favorite_for_delegation(uuid, uuid, uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.validate_delegated_catalog_action(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.upsert_product_and_variants_for_delegation(uuid, uuid, uuid, uuid, text, text, integer, uuid[], jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.bulk_upsert_products_and_variants_for_delegation(uuid, uuid, uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_product_for_delegation(uuid, uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_product_favorite_for_delegation(uuid, uuid, uuid, uuid, boolean) TO service_role;
