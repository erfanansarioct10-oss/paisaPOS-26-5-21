-- =========================================================================
-- PaisaPOS Store Staff Summary RPC
--
-- This function computes the summary statistics for active/suspended cashiers,
-- pending invitations, and active delegations for a store in a single query.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.get_store_staff_summary(
  p_store_id UUID,
  p_now TIMESTAMPTZ
)
RETURNS TABLE (
  active_cashiers BIGINT,
  suspended_cashiers BIGINT,
  pending_invites BIGINT,
  active_delegations BIGINT
) SECURITY INVOKER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(id)::BIGINT FROM public.users WHERE store_id = p_store_id AND role = 'cashier' AND status = 'active') as active_cashiers,
    (SELECT COUNT(id)::BIGINT FROM public.users WHERE store_id = p_store_id AND role = 'cashier' AND status = 'suspended') as suspended_cashiers,
    (SELECT COUNT(id)::BIGINT FROM public.staff_invitations WHERE store_id = p_store_id AND status = 'pending' AND expires_at > p_now) as pending_invites,
    (SELECT COUNT(id)::BIGINT FROM public.privilege_delegations WHERE store_id = p_store_id AND scope IN ('catalog.manage', 'inventory.adjust') AND revoked_at IS NULL AND starts_at <= p_now AND expires_at > p_now) as active_delegations;
END;
$$ LANGUAGE plpgsql;

REVOKE EXECUTE ON FUNCTION public.get_store_staff_summary(UUID, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_store_staff_summary(UUID, TIMESTAMPTZ) TO authenticated, service_role;
