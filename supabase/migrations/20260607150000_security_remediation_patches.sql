-- =========================================================================
-- PaisaPOS Security Remediation Patches
-- Deployed: 2026-06-07
-- =========================================================================

-- 1. Explicit Service-Role-Only Policies on store_invoice_counters and checkout_requests
DROP POLICY IF EXISTS "Service role only access to store_invoice_counters" ON public.store_invoice_counters;
CREATE POLICY "Service role only access to store_invoice_counters"
  ON public.store_invoice_counters
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Service role only access to checkout_requests" ON public.checkout_requests;
CREATE POLICY "Service role only access to checkout_requests"
  ON public.checkout_requests
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);


-- 2. Staff Invitations database function
CREATE OR REPLACE FUNCTION public.create_staff_invitation(
  p_store_id uuid,
  p_email text,
  p_actor_user_id uuid,
  p_expires_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_actor public.users%ROWTYPE;
  v_invitation_id uuid;
  v_now timestamptz := now();
  v_email text;
BEGIN
  v_email := lower(btrim(p_email));

  -- Validate the actor is an active store owner of the specified store
  SELECT *
  INTO v_actor
  FROM public.users
  WHERE id = p_actor_user_id
  FOR KEY SHARE;

  IF NOT FOUND
    OR v_actor.store_id IS NULL
    OR v_actor.store_id IS DISTINCT FROM p_store_id
    OR v_actor.role IS DISTINCT FROM 'owner'::public.user_role
    OR v_actor.status IS DISTINCT FROM 'active'::public.user_status
  THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'staff_lifecycle_unauthorized',
      'message', 'Only active store owners can update staff access.'
    );
  END IF;

  -- Expire old pending invitations for this email in this store
  UPDATE public.staff_invitations
  SET status = 'expired'::public.staff_invitation_status
  WHERE store_id = p_store_id
    AND email = v_email
    AND status = 'pending'::public.staff_invitation_status
    AND expires_at <= v_now;

  -- Insert the new staff invitation record
  BEGIN
    INSERT INTO public.staff_invitations (
      store_id,
      email,
      role,
      status,
      invited_by_user_id,
      expires_at,
      created_at
    ) VALUES (
      p_store_id,
      v_email,
      'cashier'::public.user_role,
      'pending'::public.staff_invitation_status,
      v_actor.id,
      p_expires_at,
      v_now
    ) RETURNING id INTO v_invitation_id;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'staff_invitation_duplicate',
      'message', 'That email already has a pending invite. Use Resend from the Invitations list.'
    );
  END;

  -- Record the owner-visible activity event
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
    'staff.invited',
    'staff.manage'::public.privilege_scope,
    'staff_invitation',
    v_invitation_id,
    v_email,
    v_actor.name || ' invited a cashier.',
    NULL,
    jsonb_build_object(
      'status', 'pending',
      'expiresAt', p_expires_at
    ),
    jsonb_build_object(
      'expiresAt', p_expires_at
    ),
    'success'::public.activity_result,
    NULL,
    v_now
  );

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'staff_invited',
    'storeId', p_store_id,
    'invitationId', v_invitation_id,
    'targetLabel', v_email,
    'actorName', v_actor.name,
    'expiresAt', p_expires_at,
    'updatedAt', v_now
  );
END;
$$;


-- 3. Staff Invitation resend database function
CREATE OR REPLACE FUNCTION public.resend_staff_invitation(
  p_invitation_id uuid,
  p_actor_user_id uuid,
  p_expires_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_actor public.users%ROWTYPE;
  v_invitation public.staff_invitations%ROWTYPE;
  v_now timestamptz := now();
  v_previous_expires_at timestamptz;
BEGIN
  -- Validate the actor is an active store owner
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

  -- Fetch the invitation
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

  IF v_invitation.status IS DISTINCT FROM 'pending'::public.staff_invitation_status THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'staff_invitation_not_pending',
      'message', 'This invitation is no longer pending.'
    );
  END IF;

  v_previous_expires_at := v_invitation.expires_at;

  -- Update expires_at
  UPDATE public.staff_invitations
  SET expires_at = p_expires_at
  WHERE id = v_invitation.id
    AND store_id = v_actor.store_id
    AND status = 'pending'::public.staff_invitation_status;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'staff_invitation_not_pending',
      'message', 'This invitation is no longer pending.'
    );
  END IF;

  -- Record activity log
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
    'staff.invite_resent',
    'staff.manage'::public.privilege_scope,
    'staff_invitation',
    v_invitation.id,
    v_invitation.email,
    v_actor.name || ' resent a cashier invitation.',
    jsonb_build_object(
      'expiresAt', v_previous_expires_at
    ),
    jsonb_build_object(
      'expiresAt', p_expires_at
    ),
    jsonb_build_object(
      'previousExpiresAt', v_previous_expires_at,
      'expiresAt', p_expires_at
    ),
    'success'::public.activity_result,
    NULL,
    v_now
  );

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'staff_invite_resent',
    'storeId', v_actor.store_id,
    'invitationId', v_invitation.id,
    'targetLabel', v_invitation.email,
    'actorName', v_actor.name,
    'expiresAt', p_expires_at,
    'updatedAt', v_now
  );
END;
$$;


-- 4. Set appropriate execution grants for the functions
REVOKE EXECUTE ON FUNCTION public.create_staff_invitation(uuid, text, uuid, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.resend_staff_invitation(uuid, uuid, timestamptz) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_staff_invitation(uuid, text, uuid, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.resend_staff_invitation(uuid, uuid, timestamptz) TO service_role;
