-- =========================================================================
-- PaisaPOS Auth Security Hardening Migration
-- Deployed: 2026-05-23
--
-- Prepares the onboarding system for email verification (Option A):
-- When `enable_confirmations = true` in config.toml, users must verify
-- their email before the store + profile are created. A trigger on
-- auth.users watches for email_confirmed_at transitions and calls
-- register_store_and_user using data stored in raw_user_meta_data
-- during signup.
--
-- While email verification is disabled (dev mode), the existing
-- immediate RPC call path continues to work as before. This trigger
-- acts as a safety net that becomes the primary path once confirmations
-- are enabled.
-- =========================================================================

-- 1. Create the trigger function that auto-onboards after email verification
CREATE OR REPLACE FUNCTION handle_email_verified_onboarding()
RETURNS TRIGGER AS $$
DECLARE
  v_full_name text;
  v_store_name text;
BEGIN
  -- Only fire when email_confirmed_at transitions from NULL to a value
  -- (i.e., the user just verified their email for the first time)
  IF OLD.email_confirmed_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.email_confirmed_at IS NULL THEN
    RETURN NEW;
  END IF;

  -- Check if the user already has a profile (created by the immediate RPC path
  -- when email verification is disabled). If so, skip to avoid duplicates.
  IF EXISTS (SELECT 1 FROM public.users WHERE id = NEW.id) THEN
    RETURN NEW;
  END IF;

  -- Extract onboarding data from user_metadata set during signUp()
  v_full_name := NEW.raw_user_meta_data ->> 'full_name';
  v_store_name := NEW.raw_user_meta_data ->> 'store_name';

  -- Guard: only proceed if both values are present
  IF v_full_name IS NULL OR v_store_name IS NULL THEN
    RETURN NEW;
  END IF;

  -- Create the store and user profile
  -- We cannot call register_store_and_user() directly because auth.uid()
  -- is not set in this trigger context. Instead, we inline the logic.
  DECLARE
    v_new_store_id uuid;
  BEGIN
    INSERT INTO public.stores (name, phone, address, pan_vat)
    VALUES (v_store_name, '', '', '')
    RETURNING id INTO v_new_store_id;

    INSERT INTO public.users (id, name, store_id)
    VALUES (NEW.id, v_full_name, v_new_store_id);

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

-- 2. Install the trigger on auth.users
-- This fires AFTER UPDATE so the email_confirmed_at change is committed.
DROP TRIGGER IF EXISTS trg_email_verified_onboarding ON auth.users;
CREATE TRIGGER trg_email_verified_onboarding
  AFTER UPDATE OF email_confirmed_at ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_email_verified_onboarding();
