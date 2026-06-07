-- =========================================================================
-- PaisaPOS Delegated Mutation Activity Coupling
--
-- Ensures privileged delegated catalog and inventory writes cannot commit
-- without the owner-visible activity event that explains the delegated actor,
-- grantor, scope, and delegation used for the write.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.record_delegated_mutation_activity(
  p_store_id uuid,
  p_actor_user_id uuid,
  p_delegation_id uuid,
  p_action text,
  p_action_scope public.privilege_scope,
  p_target_type text,
  p_target_id uuid,
  p_target_label text,
  p_summary text,
  p_before_state jsonb,
  p_after_state jsonb,
  p_metadata jsonb
) RETURNS uuid AS $$
DECLARE
  v_actor public.users%ROWTYPE;
  v_delegation public.privilege_delegations%ROWTYPE;
  v_event_id uuid;
  v_summary text;
BEGIN
  IF p_store_id IS NULL
    OR p_actor_user_id IS NULL
    OR p_delegation_id IS NULL
    OR p_action IS NULL
    OR p_action_scope IS NULL
    OR p_target_type IS NULL
  THEN
    RAISE EXCEPTION 'Invalid delegated activity context.';
  END IF;

  SELECT u.*
  INTO v_actor
  FROM public.users u
  WHERE u.id = p_actor_user_id
    AND u.store_id = p_store_id
    AND u.role = 'cashier'::public.user_role
    AND u.status = 'active'::public.user_status
  LIMIT 1;

  IF v_actor.id IS NULL THEN
    RAISE EXCEPTION 'Delegated activity actor was not found.';
  END IF;

  SELECT d.*
  INTO v_delegation
  FROM public.privilege_delegations d
  JOIN public.users grantor ON grantor.id = d.granted_by_user_id
  WHERE d.id = p_delegation_id
    AND d.store_id = p_store_id
    AND d.granted_to_user_id = p_actor_user_id
    AND d.scope = p_action_scope
    AND d.revoked_at IS NULL
    AND d.starts_at <= now()
    AND d.expires_at > now()
    AND grantor.store_id = p_store_id
    AND grantor.role = 'owner'::public.user_role
    AND grantor.status = 'active'::public.user_status
  LIMIT 1;

  IF v_delegation.id IS NULL THEN
    RAISE EXCEPTION 'Delegated activity delegation was not found.';
  END IF;

  v_summary := COALESCE(
    NULLIF(left(btrim(p_summary), 500), ''),
    left(v_actor.name || ' completed ' || p_action || ' with temporary access.', 500)
  );

  INSERT INTO public.activity_events (
    store_id,
    actor_user_id,
    actor_name,
    actor_email,
    actor_role,
    privilege_source,
    delegation_id,
    action,
    action_scope,
    target_type,
    target_id,
    target_label,
    summary,
    before_state,
    after_state,
    metadata,
    result,
    error_code,
    occurred_at
  ) VALUES (
    p_store_id,
    p_actor_user_id,
    COALESCE(NULLIF(left(btrim(v_actor.name), 150), ''), 'Unknown user'),
    NULL,
    v_actor.role,
    'delegation'::public.privilege_source,
    p_delegation_id,
    left(btrim(p_action), 80),
    p_action_scope,
    left(btrim(p_target_type), 80),
    p_target_id,
    CASE
      WHEN p_target_label IS NULL THEN NULL
      ELSE NULLIF(left(btrim(p_target_label), 150), '')
    END,
    v_summary,
    p_before_state,
    p_after_state,
    COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'actorUserId', p_actor_user_id,
      'delegationId', p_delegation_id,
      'delegationGrantorUserId', v_delegation.granted_by_user_id,
      'delegationScope', v_delegation.scope::text,
      'privilegeSource', 'delegation'
    ),
    'success'::public.activity_result,
    NULL,
    now()
  )
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER SET search_path = public;

COMMENT ON FUNCTION public.record_delegated_mutation_activity(
  uuid,
  uuid,
  uuid,
  text,
  public.privilege_scope,
  text,
  uuid,
  text,
  text,
  jsonb,
  jsonb,
  jsonb
) IS 'Service-role-only helper that inserts delegated mutation activity in the same transaction as the privileged write.';

REVOKE EXECUTE ON FUNCTION public.record_delegated_mutation_activity(
  uuid,
  uuid,
  uuid,
  text,
  public.privilege_scope,
  text,
  uuid,
  text,
  text,
  jsonb,
  jsonb,
  jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_delegated_mutation_activity(
  uuid,
  uuid,
  uuid,
  text,
  public.privilege_scope,
  text,
  uuid,
  text,
  text,
  jsonb,
  jsonb,
  jsonb
) TO service_role;

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
  v_was_create boolean := p_product_id IS NULL;
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

  PERFORM public.record_delegated_mutation_activity(
    p_store_id,
    p_actor_user_id,
    p_delegation_id,
    CASE WHEN v_was_create THEN 'product.created' ELSE 'product.updated' END,
    'catalog.manage'::public.privilege_scope,
    'product',
    v_product_id,
    p_name,
    CASE
      WHEN v_was_create THEN 'Delegated product created: ' || p_name || '.'
      ELSE 'Delegated product updated: ' || p_name || '.'
    END,
    NULL,
    jsonb_build_object(
      'category', p_category,
      'lowStockThreshold', p_low_stock_threshold
    ),
    jsonb_build_object(
      'category', p_category,
      'variantCount', COALESCE(jsonb_array_length(p_variants), 0),
      'deletedVariantCount', COALESCE(array_length(p_deleted_variant_ids, 1), 0)
    )
  );

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
  v_requested_count integer := COALESCE(jsonb_array_length(p_products), 0);
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

  PERFORM public.record_delegated_mutation_activity(
    p_store_id,
    p_actor_user_id,
    p_delegation_id,
    'product.imported',
    'catalog.manage'::public.privilege_scope,
    'catalog_import',
    NULL,
    NULL,
    'Delegated catalog import completed for ' || v_count || ' products.',
    NULL,
    jsonb_build_object('succeededCount', v_count),
    jsonb_build_object(
      'requestedCount', v_requested_count,
      'succeededCount', v_count,
      'failedCount', 0,
      'skippedCount', 0
    )
  );

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER SET search_path = public;

CREATE OR REPLACE FUNCTION public.delete_product_for_delegation(
  p_store_id uuid,
  p_actor_user_id uuid,
  p_delegation_id uuid,
  p_product_id uuid
) RETURNS boolean AS $$
DECLARE
  v_product_name text;
BEGIN
  PERFORM public.validate_delegated_catalog_action(p_store_id, p_actor_user_id, p_delegation_id);

  SELECT name
  INTO v_product_name
  FROM public.products
  WHERE id = p_product_id
    AND store_id = p_store_id
  LIMIT 1;

  IF v_product_name IS NULL THEN
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

  PERFORM public.record_delegated_mutation_activity(
    p_store_id,
    p_actor_user_id,
    p_delegation_id,
    'product.deleted',
    'catalog.manage'::public.privilege_scope,
    'product',
    p_product_id,
    v_product_name,
    'Delegated product deleted: ' || v_product_name || '.',
    jsonb_build_object('name', v_product_name),
    NULL,
    '{}'::jsonb
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
DECLARE
  v_product_name text;
  v_previous_favorite boolean;
BEGIN
  PERFORM public.validate_delegated_catalog_action(p_store_id, p_actor_user_id, p_delegation_id);

  SELECT name, is_favorite
  INTO v_product_name, v_previous_favorite
  FROM public.products
  WHERE id = p_product_id
    AND store_id = p_store_id
  LIMIT 1;

  IF v_product_name IS NULL THEN
    RAISE EXCEPTION 'Product not found.';
  END IF;

  UPDATE public.products
  SET is_favorite = p_is_favorite
  WHERE id = p_product_id
    AND store_id = p_store_id;

  PERFORM public.record_delegated_mutation_activity(
    p_store_id,
    p_actor_user_id,
    p_delegation_id,
    'favorite.toggled',
    'catalog.manage'::public.privilege_scope,
    'product',
    p_product_id,
    v_product_name,
    CASE
      WHEN p_is_favorite THEN 'Delegated product marked as favorite: ' || v_product_name || '.'
      ELSE 'Delegated product unmarked as favorite: ' || v_product_name || '.'
    END,
    jsonb_build_object('isFavorite', v_previous_favorite),
    jsonb_build_object('isFavorite', p_is_favorite),
    '{}'::jsonb
  );

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER SET search_path = public;

CREATE OR REPLACE FUNCTION public.adjust_inventory_for_delegation(
  p_store_id uuid,
  p_actor_user_id uuid,
  p_delegation_id uuid,
  p_variant_id uuid,
  p_new_stock integer
) RETURNS uuid AS $$
DECLARE
  v_inventory_id uuid;
  v_previous_stock integer;
BEGIN
  IF p_store_id IS NULL
    OR p_actor_user_id IS NULL
    OR p_delegation_id IS NULL
    OR p_variant_id IS NULL
  THEN
    RAISE EXCEPTION 'Invalid delegated inventory adjustment context.';
  END IF;

  IF p_new_stock IS NULL OR p_new_stock < 0 THEN
    RAISE EXCEPTION 'Invalid inventory quantity.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.privilege_delegations d
    JOIN public.users grantee ON grantee.id = d.granted_to_user_id
    JOIN public.users grantor ON grantor.id = d.granted_by_user_id
    WHERE d.id = p_delegation_id
      AND d.store_id = p_store_id
      AND d.granted_to_user_id = p_actor_user_id
      AND d.scope = 'inventory.adjust'::public.privilege_scope
      AND d.revoked_at IS NULL
      AND d.starts_at <= now()
      AND d.expires_at > now()
      AND grantee.store_id = p_store_id
      AND grantee.role = 'cashier'::public.user_role
      AND grantee.status = 'active'::public.user_status
      AND grantor.store_id = p_store_id
      AND grantor.role = 'owner'::public.user_role
      AND grantor.status = 'active'::public.user_status
  ) THEN
    RAISE EXCEPTION 'Unauthorized. Active inventory delegation was not found.';
  END IF;

  SELECT i.id, i.quantity
  INTO v_inventory_id, v_previous_stock
  FROM public.inventory i
  JOIN public.product_variants pv ON pv.id = i.variant_id
  JOIN public.products p ON p.id = pv.product_id
  WHERE i.variant_id = p_variant_id
    AND i.store_id = p_store_id
    AND pv.store_id = p_store_id
    AND p.store_id = p_store_id
  FOR UPDATE OF i;

  IF v_inventory_id IS NULL THEN
    RAISE EXCEPTION 'Stock record was not found or is no longer editable.';
  END IF;

  UPDATE public.inventory
  SET quantity = p_new_stock,
      updated_at = now()
  WHERE id = v_inventory_id
    AND store_id = p_store_id
  RETURNING id INTO v_inventory_id;

  PERFORM public.record_delegated_mutation_activity(
    p_store_id,
    p_actor_user_id,
    p_delegation_id,
    'inventory.adjusted',
    'inventory.adjust'::public.privilege_scope,
    'variant',
    p_variant_id,
    NULL,
    'Delegated stock adjustment completed.',
    jsonb_build_object('quantity', v_previous_stock),
    jsonb_build_object('quantity', p_new_stock),
    '{}'::jsonb
  );

  RETURN v_inventory_id;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER SET search_path = public;

COMMENT ON FUNCTION public.adjust_inventory_for_delegation(uuid, uuid, uuid, uuid, integer)
  IS 'Service-role-only delegated inventory stock adjustment with database-side delegation, tenant ownership revalidation, and transactional activity logging.';

REVOKE EXECUTE ON FUNCTION public.upsert_product_and_variants_for_delegation(uuid, uuid, uuid, uuid, text, text, integer, uuid[], jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bulk_upsert_products_and_variants_for_delegation(uuid, uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_product_for_delegation(uuid, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_product_favorite_for_delegation(uuid, uuid, uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.adjust_inventory_for_delegation(uuid, uuid, uuid, uuid, integer) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.upsert_product_and_variants_for_delegation(uuid, uuid, uuid, uuid, text, text, integer, uuid[], jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.bulk_upsert_products_and_variants_for_delegation(uuid, uuid, uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_product_for_delegation(uuid, uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_product_favorite_for_delegation(uuid, uuid, uuid, uuid, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.adjust_inventory_for_delegation(uuid, uuid, uuid, uuid, integer) TO service_role;
