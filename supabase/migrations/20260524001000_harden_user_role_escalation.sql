-- =========================================================================
-- PaisaPOS User Role & Store Metadata Hardening
-- Deployed: 2026-05-24
-- =========================================================================

-- 1. Create the BEFORE UPDATE role protection trigger function on users
CREATE OR REPLACE FUNCTION protect_user_role()
RETURNS TRIGGER AS $$
DECLARE
  v_caller_role user_role;
BEGIN
  -- Only enforce role check if role is changing
  IF OLD.role IS DISTINCT FROM NEW.role THEN
    -- Check if there is an active authenticated user session
    IF auth.uid() IS NOT NULL THEN
      -- Retrieve the role of the caller
      SELECT role INTO v_caller_role FROM public.users WHERE id = auth.uid();
      
      -- If the caller is not a registered owner, reject the change
      IF v_caller_role IS DISTINCT FROM 'owner'::user_role THEN
        RAISE EXCEPTION 'Unauthorized. Only store owners can change user roles.';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Bind the trigger BEFORE UPDATE on users
DROP TRIGGER IF EXISTS trg_protect_user_role ON users;
CREATE TRIGGER trg_protect_user_role
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION protect_user_role();


-- 2. Harden the UPDATE policy on the stores table to strictly check owner role
DROP POLICY IF EXISTS "Users can update their own store record" ON public.stores;

CREATE POLICY "Owners can update their own store record" ON public.stores
  FOR UPDATE USING (
    id = (SELECT get_user_store_id()) AND
    (SELECT role FROM public.users WHERE id = auth.uid()) = 'owner'
  )
  WITH CHECK (
    id = (SELECT get_user_store_id()) AND
    (SELECT role FROM public.users WHERE id = auth.uid()) = 'owner'
  );
