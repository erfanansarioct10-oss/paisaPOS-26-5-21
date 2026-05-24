-- =========================================================================
-- PaisaPOS Onboarding Race Condition Fix
-- Deployed: 2026-05-24
--
-- Fixes: When email confirmations are disabled (dev mode), Supabase
-- auto-confirms the user during signUp(), which fires the
-- handle_email_verified_onboarding trigger. This trigger creates the
-- store + user profile BEFORE signUp() returns. Then the explicit
-- register_store_and_user() RPC call finds the user already exists
-- and throws an error, blocking the frontend redirect.
--
-- Fix: Make register_store_and_user() idempotent — if the user profile
-- already exists (created by the trigger), return the existing store_id
-- instead of raising an exception.
-- =========================================================================

CREATE OR REPLACE FUNCTION register_store_and_user(
  p_full_name text,
  p_store_name text
) RETURNS uuid AS $$
DECLARE
  v_store_id uuid;
  v_user_id uuid;
BEGIN
  -- Resolve authenticated user ID
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated. Only logged-in users can register a store.';
  END IF;

  -- If the user profile already exists (e.g. created by the email verification
  -- trigger in auto-confirm mode), return the existing store_id gracefully
  -- instead of blocking the signup flow with an error.
  SELECT store_id INTO v_store_id FROM users WHERE id = v_user_id;
  IF v_store_id IS NOT NULL THEN
    RETURN v_store_id;
  END IF;

  -- 1. Insert store
  INSERT INTO stores (name, phone, address, pan_vat)
  VALUES (p_store_name, '', '', '')
  RETURNING id INTO v_store_id;

  -- 2. Insert user profile with 'owner' role
  INSERT INTO users (id, name, store_id, role)
  VALUES (v_user_id, p_full_name, v_store_id, 'owner'::user_role);

  RETURN v_store_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
