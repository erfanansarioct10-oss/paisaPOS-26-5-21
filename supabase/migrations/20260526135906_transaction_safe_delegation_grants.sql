-- =========================================================================
-- PaisaPOS Transaction-Safe Delegation Grants
--
-- Moves temporary privilege grant creation, one-time step-up proof
-- consumption, active-overlap protection, and owner-visible activity logging
-- into a single service-role-only database transaction boundary.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.grant_privilege_delegation(
  p_store_id uuid,
  p_actor_user_id uuid,
  p_target_user_id uuid,
  p_scope public.privilege_scope,
  p_duration_hours integer,
  p_reason text,
  p_step_up_proof_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_actor public.users%ROWTYPE;
  v_staff public.users%ROWTYPE;
  v_proof public.staff_step_up_proofs%ROWTYPE;
  v_existing public.privilege_delegations%ROWTYPE;
  v_delegation public.privilege_delegations%ROWTYPE;
  v_now timestamptz := now();
  v_starts_at timestamptz := v_now;
  v_expires_at timestamptz;
  v_reason text := left(btrim(coalesce(p_reason, '')), 300);
  v_lock_key bigint;
BEGIN
  IF p_store_id IS NULL
    OR p_actor_user_id IS NULL
    OR p_target_user_id IS NULL
    OR p_scope IS NULL
  THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'delegation_grant_invalid_context',
      'message', 'Temporary access grant context is invalid.'
    );
  END IF;

  SELECT *
  INTO v_actor
  FROM public.users
  WHERE id = p_actor_user_id
  FOR KEY SHARE;

  IF NOT FOUND
    OR v_actor.store_id IS DISTINCT FROM p_store_id
    OR v_actor.role IS DISTINCT FROM 'owner'::public.user_role
    OR v_actor.status IS DISTINCT FROM 'active'::public.user_status
  THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'staff_lifecycle_unauthorized',
      'message', 'Only active store owners can grant temporary access.'
    );
  END IF;

  IF p_target_user_id = p_actor_user_id THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'delegation_self_grant_denied',
      'message', 'Owners cannot delegate temporary access to themselves.'
    );
  END IF;

  IF p_scope NOT IN (
    'catalog.manage'::public.privilege_scope,
    'inventory.adjust'::public.privilege_scope
  ) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'delegation_scope_not_allowed',
      'message', 'Choose an allowed temporary access scope.'
    );
  END IF;

  IF p_duration_hours NOT IN (1, 2, 4, 8, 24) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'delegation_duration_invalid',
      'message', 'Choose a valid duration.'
    );
  END IF;

  IF char_length(v_reason) < 5 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'delegation_reason_invalid',
      'message', 'Reason must be at least 5 characters.'
    );
  END IF;

  IF p_step_up_proof_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'step_up_required',
      'message', 'Verify your identity with MFA before granting temporary access.'
    );
  END IF;

  SELECT *
  INTO v_proof
  FROM public.staff_step_up_proofs
  WHERE id = p_step_up_proof_id
    AND store_id = p_store_id
    AND user_id = p_actor_user_id
    AND purpose = 'delegation.grant'
    AND assurance_level = 'aal2'
    AND used_at IS NULL
    AND expires_at > v_now
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'step_up_invalid_or_expired',
      'message', 'Your identity verification expired. Enter a fresh MFA code and try again.'
    );
  END IF;

  SELECT *
  INTO v_staff
  FROM public.users
  WHERE id = p_target_user_id
  FOR KEY SHARE;

  IF NOT FOUND
    OR v_staff.store_id IS DISTINCT FROM p_store_id
    OR v_staff.role IS DISTINCT FROM 'cashier'::public.user_role
  THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'staff_profile_not_found',
      'message', 'Active cashier profile not found.'
    );
  END IF;

  IF v_staff.status IS DISTINCT FROM 'active'::public.user_status THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'staff_not_active',
      'message', 'Temporary access can only be granted to active cashiers.'
    );
  END IF;

  v_expires_at := v_starts_at + make_interval(hours => p_duration_hours);
  v_lock_key := hashtextextended(
    'privilege_delegation:' ||
    p_store_id::text || ':' ||
    p_target_user_id::text || ':' ||
    p_scope::text,
    0
  );

  PERFORM pg_advisory_xact_lock(v_lock_key);

  SELECT *
  INTO v_existing
  FROM public.privilege_delegations
  WHERE store_id = p_store_id
    AND granted_to_user_id = p_target_user_id
    AND scope = p_scope
    AND revoked_at IS NULL
    AND tstzrange(starts_at, expires_at, '[)') && tstzrange(v_starts_at, v_expires_at, '[)')
  ORDER BY expires_at ASC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'delegation_already_active',
      'message', p_scope::text || ' is already active for ' || v_staff.name || '.',
      'delegationId', v_existing.id,
      'targetId', v_staff.id,
      'targetLabel', v_staff.name,
      'scope', v_existing.scope,
      'expiresAt', v_existing.expires_at
    );
  END IF;

  UPDATE public.staff_step_up_proofs
  SET used_at = v_now
  WHERE id = v_proof.id
    AND used_at IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'step_up_invalid_or_expired',
      'message', 'Your identity verification expired. Enter a fresh MFA code and try again.'
    );
  END IF;

  INSERT INTO public.privilege_delegations (
    store_id,
    granted_to_user_id,
    granted_by_user_id,
    scope,
    reason,
    starts_at,
    expires_at
  ) VALUES (
    p_store_id,
    v_staff.id,
    v_actor.id,
    p_scope,
    v_reason,
    v_starts_at,
    v_expires_at
  )
  RETURNING * INTO v_delegation;

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
    p_store_id,
    v_actor.id,
    v_actor.name,
    NULL,
    'owner'::public.user_role,
    'owner_role'::public.privilege_source,
    'delegation.granted',
    'staff.manage'::public.privilege_scope,
    'privilege_delegation',
    v_delegation.id,
    v_staff.name,
    v_actor.name || ' granted temporary ' || p_scope::text || ' to ' || v_staff.name || '.',
    NULL,
    jsonb_build_object(
      'scope', v_delegation.scope,
      'startsAt', v_delegation.starts_at,
      'expiresAt', v_delegation.expires_at
    ),
    jsonb_build_object(
      'grantedToUserId', v_staff.id,
      'grantedByUserId', v_actor.id,
      'grantedScope', v_delegation.scope,
      'startsAt', v_delegation.starts_at,
      'expiresAt', v_delegation.expires_at,
      'durationHours', p_duration_hours,
      'reason', v_reason,
      'stepUpProofId', v_proof.id
    ),
    'success'::public.activity_result,
    NULL,
    v_now
  );

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'delegation_granted',
    'storeId', p_store_id,
    'delegationId', v_delegation.id,
    'targetId', v_staff.id,
    'targetLabel', v_staff.name,
    'scope', v_delegation.scope,
    'actorName', v_actor.name,
    'expiresAt', v_delegation.expires_at,
    'updatedAt', v_now
  );
END;
$$;

COMMENT ON FUNCTION public.grant_privilege_delegation(
  uuid,
  uuid,
  uuid,
  public.privilege_scope,
  integer,
  text,
  uuid
) IS 'Service-role-only transaction-safe delegation grant RPC with step-up proof consumption, overlap locking, grant insert, and activity logging.';

REVOKE EXECUTE ON FUNCTION public.grant_privilege_delegation(
  uuid,
  uuid,
  uuid,
  public.privilege_scope,
  integer,
  text,
  uuid
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.grant_privilege_delegation(
  uuid,
  uuid,
  uuid,
  public.privilege_scope,
  integer,
  text,
  uuid
) TO service_role;
