-- =========================================================================
-- PaisaPOS Delegated Inventory Adjustment RPC
--
-- This function is service_role-only. Server Actions may call it after
-- requirePrivilege("inventory.adjust") resolves a temporary delegation, but
-- the database must revalidate the delegation and inventory ownership before
-- any stock row is changed.
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

  SELECT i.id
  INTO v_inventory_id
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

  RETURN v_inventory_id;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER SET search_path = public;

COMMENT ON FUNCTION public.adjust_inventory_for_delegation(uuid, uuid, uuid, uuid, integer)
  IS 'Service-role-only delegated inventory stock adjustment with database-side delegation and tenant ownership revalidation.';

REVOKE EXECUTE ON FUNCTION public.adjust_inventory_for_delegation(uuid, uuid, uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_inventory_for_delegation(uuid, uuid, uuid, uuid, integer) TO service_role;
