-- =========================================================================
-- PaisaPOS Staff Invite / Owner Registration Boundary
--
-- Keeps the current one-account/one-store model enforceable at the database
-- layer: an invited staff auth user cannot bypass the UI and create an owner
-- store profile through register_store_and_user().
-- =========================================================================

CREATE OR REPLACE FUNCTION public.register_store_and_user(
  p_full_name text,
  p_store_name text
) RETURNS uuid AS $$
DECLARE
  v_store_id uuid;
  v_user_id uuid;
  v_email text;
  v_profile public.users%ROWTYPE;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated. Only logged-in users can register a store.';
  END IF;

  SELECT *
  INTO v_profile
  FROM public.users
  WHERE id = v_user_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_profile.role = 'cashier'::public.user_role THEN
      RAISE EXCEPTION 'staff_account_cannot_register_store';
    END IF;

    IF v_profile.store_id IS NOT NULL THEN
      RETURN v_profile.store_id;
    END IF;

    RAISE EXCEPTION 'store_registration_profile_conflict';
  END IF;

  v_email := lower(btrim(coalesce(auth.jwt() ->> 'email', '')));
  IF v_email <> ''
    AND EXISTS (
      SELECT 1
      FROM public.staff_invitations si
      WHERE lower(btrim(si.email)) = v_email
        AND si.status = 'pending'::public.staff_invitation_status
        AND si.expires_at > now()
    )
  THEN
    RAISE EXCEPTION 'staff_invitation_pending_register_blocked';
  END IF;

  INSERT INTO public.stores (name, phone, address, pan_vat)
  VALUES (p_store_name, '', '', '')
  RETURNING id INTO v_store_id;

  INSERT INTO public.users (id, name, store_id, role)
  VALUES (v_user_id, p_full_name, v_store_id, 'owner'::public.user_role);

  RETURN v_store_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION public.register_store_and_user(text, text)
  IS 'Registers a new owner/store profile unless the auth user is already staff or has a pending staff invitation.';

REVOKE EXECUTE ON FUNCTION public.register_store_and_user(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_store_and_user(text, text) TO authenticated;
