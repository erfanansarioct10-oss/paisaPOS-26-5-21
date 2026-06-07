-- =========================================================================
-- PaisaPOS Staff Suspension Delegation Revocation
--
-- Ensures suspending a cashier also revokes any unexpired temporary
-- delegations before the cashier status changes, keeping revocation, activity
-- proof, and suspension in one service-role-only transaction boundary.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.suspend_staff_user(
  p_target_user_id uuid,
  p_actor_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_actor public.users%ROWTYPE;
  v_staff public.users%ROWTYPE;
  v_suspended_at timestamptz := now();
  v_revoked_delegation_count integer := 0;
  v_revoked_delegation_ids uuid[] := ARRAY[]::uuid[];
  v_revoked_delegation_scopes text[] := ARRAY[]::text[];
BEGIN
  SELECT *
  INTO v_actor
  FROM public.users
  WHERE id = p_actor_user_id
  FOR KEY SHARE;

  IF NOT FOUND
    OR v_actor.store_id IS NULL
    OR v_actor.role IS DISTINCT FROM 'owner'::public.user_role
    OR v_actor.status IS DISTINCT FROM 'active'::public.user_status
  THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'staff_lifecycle_unauthorized',
      'message', 'Only active store owners can update staff access.'
    );
  END IF;

  IF p_target_user_id = v_actor.id THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'staff_self_suspension_denied',
      'message', 'Owners cannot suspend their own account.'
    );
  END IF;

  SELECT *
  INTO v_staff
  FROM public.users
  WHERE id = p_target_user_id
  FOR UPDATE;

  IF NOT FOUND
    OR v_staff.store_id IS DISTINCT FROM v_actor.store_id
    OR v_staff.role IS DISTINCT FROM 'cashier'::public.user_role
  THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'staff_profile_not_found',
      'message', 'Cashier profile not found.'
    );
  END IF;

  IF v_staff.status IS DISTINCT FROM 'active'::public.user_status THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'staff_already_suspended',
      'message', 'This cashier is already suspended.'
    );
  END IF;

  WITH revoked_delegations AS (
    UPDATE public.privilege_delegations
    SET
      revoked_at = v_suspended_at,
      revoked_by_user_id = v_actor.id
    WHERE store_id = v_actor.store_id
      AND granted_to_user_id = v_staff.id
      AND revoked_at IS NULL
      AND expires_at > v_suspended_at
    RETURNING *
  ),
  inserted_revocation_events AS (
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
    )
    SELECT
      v_actor.store_id,
      v_actor.id,
      v_actor.name,
      NULL,
      'owner'::public.user_role,
      'owner_role'::public.privilege_source,
      rd.id,
      'delegation.revoked',
      'staff.manage'::public.privilege_scope,
      'privilege_delegation',
      rd.id,
      v_staff.name,
      v_actor.name || ' revoked temporary ' || rd.scope::text || ' from ' || v_staff.name || ' during suspension.',
      jsonb_build_object(
        'scope', rd.scope,
        'revokedAt', NULL
      ),
      jsonb_build_object(
        'scope', rd.scope,
        'revokedAt', v_suspended_at
      ),
      jsonb_build_object(
        'grantedToUserId', v_staff.id,
        'grantedByUserId', rd.granted_by_user_id,
        'grantedScope', rd.scope,
        'startsAt', rd.starts_at,
        'expiresAt', rd.expires_at,
        'revokedAt', v_suspended_at,
        'revocationReason', 'staff_suspension',
        'suspendedByUserId', v_actor.id,
        'suspendedAt', v_suspended_at
      ),
      'success'::public.activity_result,
      NULL,
      v_suspended_at
    FROM revoked_delegations rd
    RETURNING target_id
  )
  SELECT
    count(rd.id)::integer,
    COALESCE(array_agg(rd.id ORDER BY rd.id), ARRAY[]::uuid[]),
    COALESCE(array_agg(rd.scope::text ORDER BY rd.scope::text), ARRAY[]::text[])
  INTO
    v_revoked_delegation_count,
    v_revoked_delegation_ids,
    v_revoked_delegation_scopes
  FROM revoked_delegations rd;

  UPDATE public.users
  SET
    status = 'suspended'::public.user_status,
    suspended_at = v_suspended_at,
    suspended_by_user_id = v_actor.id
  WHERE id = v_staff.id
    AND store_id = v_actor.store_id
    AND role = 'cashier'::public.user_role
    AND status = 'active'::public.user_status;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'staff_already_suspended',
      'message', 'This cashier is already suspended.'
    );
  END IF;

  INSERT INTO public.activity_events (
    store_id,
    actor_user_id,
    actor_name,
    actor_email,
    actor_role,
    privilege_source,
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
    v_actor.store_id,
    v_actor.id,
    v_actor.name,
    NULL,
    'owner'::public.user_role,
    'owner_role'::public.privilege_source,
    'staff.suspended',
    'staff.manage'::public.privilege_scope,
    'user',
    v_staff.id,
    v_staff.name,
    v_actor.name || ' suspended cashier ' || v_staff.name || '.',
    jsonb_build_object(
      'status', v_staff.status
    ),
    jsonb_build_object(
      'status', 'suspended',
      'suspendedAt', v_suspended_at
    ),
    jsonb_build_object(
      'suspendedAt', v_suspended_at,
      'revokedDelegationCount', v_revoked_delegation_count,
      'revokedDelegationIds', v_revoked_delegation_ids,
      'revokedDelegationScopes', v_revoked_delegation_scopes
    ),
    'success'::public.activity_result,
    NULL,
    v_suspended_at
  );

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'staff_suspended',
    'storeId', v_actor.store_id,
    'targetId', v_staff.id,
    'targetLabel', v_staff.name,
    'actorName', v_actor.name,
    'updatedAt', v_suspended_at,
    'revokedDelegationCount', v_revoked_delegation_count,
    'revokedDelegationIds', v_revoked_delegation_ids,
    'revokedDelegationScopes', v_revoked_delegation_scopes
  );
END;
$$;

COMMENT ON FUNCTION public.suspend_staff_user(uuid, uuid)
  IS 'Atomically suspends an active cashier, revokes unexpired temporary delegations first, and records owner-visible activity proof.';

REVOKE EXECUTE ON FUNCTION public.suspend_staff_user(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.suspend_staff_user(uuid, uuid) TO service_role;
