-- =========================================================================
-- Fix handle_email_verified_onboarding to run on INSERT and UPDATE
-- =========================================================================

CREATE OR REPLACE FUNCTION handle_email_verified_onboarding()
RETURNS TRIGGER AS $$
DECLARE
  v_full_name text;
  v_store_name text;
BEGIN
  -- Only check OLD on UPDATE operations
  IF TG_OP = 'UPDATE' THEN
    IF OLD.email_confirmed_at IS NOT NULL THEN
      RETURN NEW;
    END IF;
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

-- Reinstall trigger to fire AFTER INSERT OR UPDATE
DROP TRIGGER IF EXISTS trg_email_verified_onboarding ON auth.users;
CREATE TRIGGER trg_email_verified_onboarding
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_email_verified_onboarding();
