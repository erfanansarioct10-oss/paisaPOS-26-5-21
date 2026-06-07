-- =========================================================================
-- Task 0: Atomic Stock Adjustments in adjust_inventory_for_delegation
-- Deployed: 2026-06-07
-- =========================================================================

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
  -- 1. Context and Input Validation
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

  -- 2. Validate Active Delegation Scope
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

  -- 3. Read previous stock using a non-locking SELECT to check existence
  SELECT i.quantity
  INTO v_previous_stock
  FROM public.inventory i
  JOIN public.product_variants pv ON pv.id = i.variant_id
  JOIN public.products p ON p.id = pv.product_id
  WHERE i.variant_id = p_variant_id
    AND i.store_id = p_store_id
    AND pv.store_id = p_store_id
    AND p.store_id = p_store_id;

  IF v_previous_stock IS NULL THEN
    RAISE EXCEPTION 'Stock record was not found or is no longer editable.';
  END IF;

  -- 4. Apply absolute UPDATE directly without in-memory delta calculations
  UPDATE public.inventory
  SET quantity = p_new_stock,
      updated_at = now()
  WHERE variant_id = p_variant_id
    AND store_id = p_store_id
  RETURNING id INTO v_inventory_id;

  -- 5. Log activity event
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

REVOKE EXECUTE ON FUNCTION public.adjust_inventory_for_delegation(uuid, uuid, uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_inventory_for_delegation(uuid, uuid, uuid, uuid, integer) TO service_role;
