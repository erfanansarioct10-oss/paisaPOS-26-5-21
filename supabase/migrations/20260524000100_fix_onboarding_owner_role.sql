-- =========================================================================
-- PaisaPOS Onboarding Owner Role Fix
-- Deployed: 2026-05-24
--
-- Ensures that the user creating the store is designated as 'owner'
-- rather than the default 'cashier' role. This fixes RLS policy violations
-- where only owners are allowed to insert and modify products.
-- =========================================================================

-- 1. Update register_store_and_user RPC to assign 'owner' role
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

  -- Prevent duplicate registration: check if profile already exists
  IF EXISTS (SELECT 1 FROM users WHERE id = v_user_id) THEN
    RAISE EXCEPTION 'User is already registered and associated with a store.';
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

-- 2. Update handle_email_verified_onboarding trigger function to also assign 'owner' role
CREATE OR REPLACE FUNCTION handle_email_verified_onboarding()
RETURNS TRIGGER AS $$
DECLARE
  v_full_name text;
  v_store_name text;
BEGIN
  -- Only fire when email_confirmed_at transitions from NULL to a value
  IF OLD.email_confirmed_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.email_confirmed_at IS NULL THEN
    RETURN NEW;
  END IF;

  -- Check if user profile already exists
  IF EXISTS (SELECT 1 FROM public.users WHERE id = NEW.id) THEN
    RETURN NEW;
  END IF;

  -- Extract onboarding data from user_metadata
  v_full_name := NEW.raw_user_meta_data ->> 'full_name';
  v_store_name := NEW.raw_user_meta_data ->> 'store_name';

  -- Guard
  IF v_full_name IS NULL OR v_store_name IS NULL THEN
    RETURN NEW;
  END IF;

  -- Create the store and user profile with 'owner' role
  DECLARE
    v_new_store_id uuid;
  BEGIN
    INSERT INTO public.stores (name, phone, address, pan_vat)
    VALUES (v_store_name, '', '', '')
    RETURNING id INTO v_new_store_id;

    INSERT INTO public.users (id, name, store_id, role)
    VALUES (NEW.id, v_full_name, v_new_store_id, 'owner'::user_role);

    -- Audit log for the registration
    INSERT INTO public.audit_logs (store_id, user_id, operation, affected_entity, result, created_at)
    VALUES (
      v_new_store_id,
      NEW.id,
      'STORE_REGISTRATION',
      'Store: ' || v_store_name || ' (User: ' || v_full_name || ') [via email verification]',
      'SUCCESS',
      now()
    );
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
