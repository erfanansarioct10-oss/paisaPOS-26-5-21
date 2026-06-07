-- =========================================================================
-- PaisaPOS Staff Invite Auth-Mutation Ordering Hardening
--
-- Keeps database invite acceptance ahead of Supabase Auth mutation in the
-- Server Action flow, and provides a service-role-only compensation RPC if
-- the follow-up Auth password/metadata update fails.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.protect_user_store_id()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.store_id IS DISTINCT FROM NEW.store_id AND OLD.store_id IS NOT NULL THEN
    IF current_setting('app.staff_invite_rollback', true) = 'true'
      AND NEW.store_id IS NULL
    THEN
      RETURN NEW;
    END IF;

    IF EXISTS (SELECT 1 FROM public.stores WHERE id = OLD.store_id) THEN
      RAISE EXCEPTION 'Changing store_id is not allowed.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_staff_invitation(
  p_invitation_id uuid,
  p_auth_user_id uuid,
  p_auth_email text,
  p_actor_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_invitation public.staff_invitations%ROWTYPE;
  v_profile public.users%ROWTYPE;
  v_email text;
  v_actor_name text;
  v_accepted_at timestamptz := now();
  v_profile_disposition text := 'existing';
  v_previous_profile jsonb := NULL;
BEGIN
  IF p_invitation_id IS NULL OR p_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'staff_invitation_auth_required';
  END IF;

  v_email := lower(btrim(coalesce(p_auth_email, '')));
  IF char_length(v_email) < 3
    OR char_length(v_email) > 254
    OR position('@' in v_email) <= 1
  THEN
    RAISE EXCEPTION 'staff_invitation_auth_required';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('staff_invite_accept:' || p_auth_user_id::text, 0));

  SELECT *
  INTO v_invitation
  FROM public.staff_invitations
  WHERE id = p_invitation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'staff_invitation_not_found';
  END IF;

  IF v_invitation.status <> 'pending'::public.staff_invitation_status THEN
    RAISE EXCEPTION 'staff_invitation_not_pending';
  END IF;

  IF v_invitation.expires_at <= v_accepted_at THEN
    RAISE EXCEPTION 'staff_invitation_expired';
  END IF;

  IF lower(btrim(v_invitation.email)) <> v_email THEN
    RAISE EXCEPTION 'staff_invitation_email_mismatch';
  END IF;

  PERFORM 1
  FROM public.stores
  WHERE id = v_invitation.store_id
  FOR KEY SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'staff_invitation_store_missing';
  END IF;

  v_actor_name := nullif(
    left(btrim(regexp_replace(coalesce(p_actor_name, ''), '[[:cntrl:]]+', ' ', 'g')), 100),
    ''
  );
  IF v_actor_name IS NULL THEN
    v_actor_name := nullif(left(btrim(regexp_replace(split_part(v_email, '@', 1), '[._-]+', ' ', 'g')), 100), '');
  END IF;
  IF v_actor_name IS NULL THEN
    v_actor_name := 'Cashier';
  END IF;

  SELECT *
  INTO v_profile
  FROM public.users
  WHERE id = p_auth_user_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_profile.store_id IS NOT NULL
      AND v_profile.store_id IS DISTINCT FROM v_invitation.store_id
    THEN
      RAISE EXCEPTION 'staff_invitation_store_conflict';
    END IF;

    IF v_profile.store_id IS NOT NULL THEN
      IF v_profile.status <> 'active'::public.user_status THEN
        RAISE EXCEPTION 'staff_invitation_suspended_profile';
      END IF;

      IF v_profile.role <> 'cashier'::public.user_role THEN
        RAISE EXCEPTION 'staff_invitation_role_conflict';
      END IF;

      v_profile_disposition := 'existing';
      v_actor_name := v_profile.name;
    ELSE
      IF v_profile.status = 'suspended'::public.user_status THEN
        RAISE EXCEPTION 'staff_invitation_suspended_profile';
      END IF;

      v_profile_disposition := 'attached';
      v_previous_profile := jsonb_build_object(
        'id', v_profile.id,
        'name', v_profile.name,
        'storeId', v_profile.store_id,
        'role', v_profile.role,
        'status', v_profile.status,
        'invitedByUserId', v_profile.invited_by_user_id,
        'suspendedAt', v_profile.suspended_at,
        'suspendedByUserId', v_profile.suspended_by_user_id
      );

      UPDATE public.users
      SET
        name = v_actor_name,
        store_id = v_invitation.store_id,
        role = 'cashier'::public.user_role,
        status = 'active'::public.user_status,
        invited_by_user_id = v_invitation.invited_by_user_id,
        suspended_at = NULL,
        suspended_by_user_id = NULL
      WHERE id = p_auth_user_id;
    END IF;
  ELSE
    v_profile_disposition := 'created';

    INSERT INTO public.users (
      id,
      name,
      store_id,
      role,
      status,
      invited_by_user_id
    ) VALUES (
      p_auth_user_id,
      v_actor_name,
      v_invitation.store_id,
      'cashier'::public.user_role,
      'active'::public.user_status,
      v_invitation.invited_by_user_id
    );
  END IF;

  UPDATE public.staff_invitations
  SET
    status = 'accepted'::public.staff_invitation_status,
    accepted_by_user_id = p_auth_user_id,
    accepted_at = v_accepted_at
  WHERE id = v_invitation.id
    AND status = 'pending'::public.staff_invitation_status;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'staff_invitation_not_pending';
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
    v_invitation.store_id,
    CASE WHEN v_profile_disposition = 'created' THEN NULL ELSE p_auth_user_id END,
    v_actor_name,
    v_email,
    'cashier'::public.user_role,
    'cashier_role'::public.privilege_source,
    'staff.invite_accepted',
    'staff.manage'::public.privilege_scope,
    'user',
    p_auth_user_id,
    v_actor_name,
    v_actor_name || ' accepted a cashier invitation.',
    v_previous_profile,
    jsonb_build_object(
      'storeId', v_invitation.store_id,
      'role', 'cashier',
      'status', 'active'
    ),
    jsonb_build_object(
      'invitationId', v_invitation.id,
      'acceptedAt', v_accepted_at,
      'profileDisposition', v_profile_disposition
    ),
    'success'::public.activity_result,
    NULL,
    v_accepted_at
  );

  RETURN jsonb_build_object(
    'invitationId', v_invitation.id,
    'storeId', v_invitation.store_id,
    'acceptedAt', v_accepted_at,
    'actorName', v_actor_name,
    'actorEmail', v_email,
    'profileDisposition', v_profile_disposition,
    'previousProfile', v_previous_profile
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.rollback_staff_invitation_acceptance(
  p_invitation_id uuid,
  p_auth_user_id uuid,
  p_accepted_at timestamptz,
  p_profile_disposition text,
  p_previous_profile jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_invitation public.staff_invitations%ROWTYPE;
  v_profile public.users%ROWTYPE;
  v_disposition text := lower(btrim(coalesce(p_profile_disposition, '')));
  v_rolled_back_at timestamptz := now();
  v_actor_name text := 'Cashier';
BEGIN
  IF p_invitation_id IS NULL
    OR p_auth_user_id IS NULL
    OR p_accepted_at IS NULL
    OR v_disposition NOT IN ('created', 'attached', 'existing')
  THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'staff_invitation_rollback_invalid',
      'message', 'Invitation rollback context is invalid.'
    );
  END IF;

  IF v_disposition = 'attached'
    AND (
      p_previous_profile IS NULL
      OR p_previous_profile->>'id' IS DISTINCT FROM p_auth_user_id::text
    )
  THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'staff_invitation_rollback_invalid',
      'message', 'Previous staff profile state is invalid.'
    );
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('staff_invite_accept:' || p_auth_user_id::text, 0));

  SELECT *
  INTO v_invitation
  FROM public.staff_invitations
  WHERE id = p_invitation_id
  FOR UPDATE;

  IF NOT FOUND
    OR v_invitation.status IS DISTINCT FROM 'accepted'::public.staff_invitation_status
    OR v_invitation.accepted_by_user_id IS DISTINCT FROM p_auth_user_id
    OR v_invitation.accepted_at IS DISTINCT FROM p_accepted_at
  THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'staff_invitation_rollback_stale',
      'message', 'Invitation acceptance no longer matches rollback context.'
    );
  END IF;

  SELECT *
  INTO v_profile
  FROM public.users
  WHERE id = p_auth_user_id
  FOR UPDATE;

  IF FOUND THEN
    v_actor_name := v_profile.name;
  END IF;

  UPDATE public.staff_invitations
  SET
    status = 'pending'::public.staff_invitation_status,
    accepted_by_user_id = NULL,
    accepted_at = NULL
  WHERE id = v_invitation.id
    AND status = 'accepted'::public.staff_invitation_status
    AND accepted_by_user_id = p_auth_user_id
    AND accepted_at = p_accepted_at;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'staff_invitation_rollback_stale',
      'message', 'Invitation acceptance no longer matches rollback context.'
    );
  END IF;

  IF v_disposition = 'created' THEN
    DELETE FROM public.users
    WHERE id = p_auth_user_id
      AND store_id = v_invitation.store_id
      AND role = 'cashier'::public.user_role
      AND invited_by_user_id = v_invitation.invited_by_user_id;
  ELSIF v_disposition = 'attached' THEN
    PERFORM set_config('app.staff_invite_rollback', 'true', true);

    UPDATE public.users
    SET
      name = COALESCE(NULLIF(p_previous_profile->>'name', ''), name),
      store_id = NULLIF(p_previous_profile->>'storeId', '')::uuid,
      role = COALESCE((p_previous_profile->>'role')::public.user_role, role),
      status = COALESCE((p_previous_profile->>'status')::public.user_status, status),
      invited_by_user_id = NULLIF(p_previous_profile->>'invitedByUserId', '')::uuid,
      suspended_at = NULLIF(p_previous_profile->>'suspendedAt', '')::timestamptz,
      suspended_by_user_id = NULLIF(p_previous_profile->>'suspendedByUserId', '')::uuid
    WHERE id = p_auth_user_id;

    PERFORM set_config('app.staff_invite_rollback', 'false', true);
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
    v_invitation.store_id,
    CASE WHEN v_disposition = 'created' THEN NULL ELSE p_auth_user_id END,
    v_actor_name,
    v_invitation.email,
    'cashier'::public.user_role,
    'system'::public.privilege_source,
    'staff.invite_accept_rolled_back',
    'staff.manage'::public.privilege_scope,
    'staff_invitation',
    v_invitation.id,
    v_invitation.email,
    'Staff invite acceptance was rolled back after account setup failed.',
    jsonb_build_object(
      'status', 'accepted',
      'acceptedAt', p_accepted_at,
      'acceptedByUserId', p_auth_user_id
    ),
    jsonb_build_object(
      'status', 'pending',
      'rolledBackAt', v_rolled_back_at
    ),
    jsonb_build_object(
      'reason', 'auth_update_failed',
      'profileDisposition', v_disposition,
      'previousProfile', p_previous_profile
    ),
    'success'::public.activity_result,
    NULL,
    v_rolled_back_at
  );

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'staff_invitation_acceptance_rolled_back',
    'storeId', v_invitation.store_id,
    'invitationId', v_invitation.id,
    'targetId', p_auth_user_id,
    'targetLabel', v_invitation.email,
    'updatedAt', v_rolled_back_at
  );
END;
$$;

COMMENT ON FUNCTION public.accept_staff_invitation(uuid, uuid, text, text)
  IS 'Atomically validates, consumes, and records acceptance for one staff invitation before Auth user mutation.';

COMMENT ON FUNCTION public.rollback_staff_invitation_acceptance(uuid, uuid, timestamptz, text, jsonb)
  IS 'Service-role-only compensation RPC that restores an invitation/profile when post-acceptance Auth setup fails.';

REVOKE EXECUTE ON FUNCTION public.protect_user_store_id() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.accept_staff_invitation(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rollback_staff_invitation_acceptance(uuid, uuid, timestamptz, text, jsonb) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.accept_staff_invitation(uuid, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.rollback_staff_invitation_acceptance(uuid, uuid, timestamptz, text, jsonb) TO service_role;
