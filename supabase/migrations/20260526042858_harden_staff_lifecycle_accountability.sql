-- =========================================================================
-- PaisaPOS Beta V1.1 Staff Lifecycle Accountability Hardening
--
-- Moves high-risk staff lifecycle mutations into service-role-only database
-- transactions so row state changes and owner-visible activity events cannot
-- drift apart under races, RLS surprises, or logging failures.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.revoke_staff_invitation(
  p_invitation_id uuid,
  p_actor_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_actor public.users%ROWTYPE;
  v_invitation public.staff_invitations%ROWTYPE;
  v_revoked_at timestamptz := now();
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

  SELECT *
  INTO v_invitation
  FROM public.staff_invitations
  WHERE id = p_invitation_id
  FOR UPDATE;

  IF NOT FOUND OR v_invitation.store_id IS DISTINCT FROM v_actor.store_id THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'staff_invitation_not_found',
      'message', 'Invitation not found.'
    );
  END IF;

  IF v_invitation.status IS DISTINCT FROM 'pending'::public.staff_invitation_status
    OR v_invitation.accepted_at IS NOT NULL
  THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'staff_invitation_not_pending',
      'message', 'This invitation is no longer pending.'
    );
  END IF;

  UPDATE public.staff_invitations
  SET
    status = 'revoked'::public.staff_invitation_status,
    revoked_by_user_id = v_actor.id,
    revoked_at = v_revoked_at
  WHERE id = v_invitation.id
    AND store_id = v_actor.store_id
    AND status = 'pending'::public.staff_invitation_status
    AND accepted_at IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'staff_invitation_not_pending',
      'message', 'This invitation is no longer pending.'
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
    'staff.invite_revoked',
    'staff.manage'::public.privilege_scope,
    'staff_invitation',
    v_invitation.id,
    v_invitation.email,
    v_actor.name || ' revoked a cashier invitation.',
    jsonb_build_object(
      'status', v_invitation.status,
      'acceptedAt', v_invitation.accepted_at
    ),
    jsonb_build_object(
      'status', 'revoked',
      'revokedAt', v_revoked_at
    ),
    jsonb_build_object(
      'invitationId', v_invitation.id
    ),
    'success'::public.activity_result,
    NULL,
    v_revoked_at
  );

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'staff_invitation_revoked',
    'storeId', v_actor.store_id,
    'invitationId', v_invitation.id,
    'targetLabel', v_invitation.email,
    'actorName', v_actor.name,
    'updatedAt', v_revoked_at
  );
END;
$$;

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
      'suspendedAt', v_suspended_at
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
    'updatedAt', v_suspended_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reactivate_staff_user(
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
  v_reactivated_at timestamptz := now();
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

  IF v_staff.status IS DISTINCT FROM 'suspended'::public.user_status THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'staff_already_active',
      'message', 'This cashier is already active.'
    );
  END IF;

  UPDATE public.users
  SET
    status = 'active'::public.user_status,
    suspended_at = NULL,
    suspended_by_user_id = NULL
  WHERE id = v_staff.id
    AND store_id = v_actor.store_id
    AND role = 'cashier'::public.user_role
    AND status = 'suspended'::public.user_status;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'staff_already_active',
      'message', 'This cashier is already active.'
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
    'staff.reactivated',
    'staff.manage'::public.privilege_scope,
    'user',
    v_staff.id,
    v_staff.name,
    v_actor.name || ' reactivated cashier ' || v_staff.name || '.',
    jsonb_build_object(
      'status', v_staff.status,
      'suspendedAt', v_staff.suspended_at
    ),
    jsonb_build_object(
      'status', 'active',
      'reactivatedAt', v_reactivated_at
    ),
    jsonb_build_object(
      'reactivatedAt', v_reactivated_at
    ),
    'success'::public.activity_result,
    NULL,
    v_reactivated_at
  );

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'staff_reactivated',
    'storeId', v_actor.store_id,
    'targetId', v_staff.id,
    'targetLabel', v_staff.name,
    'actorName', v_actor.name,
    'updatedAt', v_reactivated_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_privilege_delegation(
  p_delegation_id uuid,
  p_actor_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_actor public.users%ROWTYPE;
  v_delegation public.privilege_delegations%ROWTYPE;
  v_staff public.users%ROWTYPE;
  v_revoked_at timestamptz := now();
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

  SELECT *
  INTO v_delegation
  FROM public.privilege_delegations
  WHERE id = p_delegation_id
  FOR UPDATE;

  IF NOT FOUND OR v_delegation.store_id IS DISTINCT FROM v_actor.store_id THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'delegation_not_found',
      'message', 'Temporary access record not found.'
    );
  END IF;

  IF v_delegation.revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'delegation_already_revoked',
      'message', 'Temporary access is already revoked.'
    );
  END IF;

  SELECT *
  INTO v_staff
  FROM public.users
  WHERE id = v_delegation.granted_to_user_id
  FOR KEY SHARE;

  IF NOT FOUND OR v_staff.store_id IS DISTINCT FROM v_actor.store_id THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'staff_profile_not_found',
      'message', 'Cashier profile not found.'
    );
  END IF;

  UPDATE public.privilege_delegations
  SET
    revoked_at = v_revoked_at,
    revoked_by_user_id = v_actor.id
  WHERE id = v_delegation.id
    AND store_id = v_actor.store_id
    AND revoked_at IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'delegation_already_revoked',
      'message', 'Temporary access is already revoked.'
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
    'delegation.revoked',
    'staff.manage'::public.privilege_scope,
    'privilege_delegation',
    v_delegation.id,
    v_staff.name,
    v_actor.name || ' revoked temporary ' || v_delegation.scope::text || ' from ' || v_staff.name || '.',
    jsonb_build_object(
      'scope', v_delegation.scope,
      'revokedAt', v_delegation.revoked_at
    ),
    jsonb_build_object(
      'scope', v_delegation.scope,
      'revokedAt', v_revoked_at
    ),
    jsonb_build_object(
      'grantedToUserId', v_staff.id,
      'grantedScope', v_delegation.scope,
      'startsAt', v_delegation.starts_at,
      'expiresAt', v_delegation.expires_at,
      'revokedAt', v_revoked_at
    ),
    'success'::public.activity_result,
    NULL,
    v_revoked_at
  );

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'delegation_revoked',
    'storeId', v_actor.store_id,
    'delegationId', v_delegation.id,
    'targetId', v_staff.id,
    'targetLabel', v_staff.name,
    'scope', v_delegation.scope,
    'actorName', v_actor.name,
    'updatedAt', v_revoked_at
  );
END;
$$;

COMMENT ON FUNCTION public.revoke_staff_invitation(uuid, uuid)
  IS 'Atomically revokes a pending staff invitation and records the owner-visible activity event.';
COMMENT ON FUNCTION public.suspend_staff_user(uuid, uuid)
  IS 'Atomically suspends a cashier and records the owner-visible activity event.';
COMMENT ON FUNCTION public.reactivate_staff_user(uuid, uuid)
  IS 'Atomically reactivates a suspended cashier and records the owner-visible activity event.';
COMMENT ON FUNCTION public.revoke_privilege_delegation(uuid, uuid)
  IS 'Atomically revokes temporary delegated access and records the owner-visible activity event.';

REVOKE EXECUTE ON FUNCTION public.revoke_staff_invitation(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.suspend_staff_user(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reactivate_staff_user(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.revoke_privilege_delegation(uuid, uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.revoke_staff_invitation(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.suspend_staff_user(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.reactivate_staff_user(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.revoke_privilege_delegation(uuid, uuid) TO service_role;
