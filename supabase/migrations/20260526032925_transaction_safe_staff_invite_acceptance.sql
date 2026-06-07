-- =========================================================================
-- PaisaPOS Beta V1.1 Transaction-Safe Staff Invite Acceptance
--
-- Moves invite acceptance into a single database transaction so the cashier
-- profile and invitation consumption cannot drift apart under retry/race
-- conditions.
-- =========================================================================

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

  -- Serialize invitation acceptance for one auth user across multiple invites.
  PERFORM pg_advisory_xact_lock(hashtext(p_auth_user_id::text));

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

      v_actor_name := v_profile.name;
    ELSE
      IF v_profile.status = 'suspended'::public.user_status THEN
        RAISE EXCEPTION 'staff_invitation_suspended_profile';
      END IF;

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
    p_auth_user_id,
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
    NULL,
    jsonb_build_object(
      'storeId', v_invitation.store_id,
      'role', 'cashier',
      'status', 'active'
    ),
    jsonb_build_object(
      'invitationId', v_invitation.id,
      'acceptedAt', v_accepted_at
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
    'actorEmail', v_email
  );
END;
$$;

COMMENT ON FUNCTION public.accept_staff_invitation(uuid, uuid, text, text)
  IS 'Atomically validates, consumes, and records acceptance for one staff invitation.';

REVOKE EXECUTE ON FUNCTION public.accept_staff_invitation(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_staff_invitation(uuid, uuid, text, text) TO service_role;
