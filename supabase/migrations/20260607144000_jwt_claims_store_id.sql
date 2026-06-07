-- =========================================================================
-- Task 5: Implement JWT-based tenant checks with hook definition
-- Deployed: 2026-06-07
-- =========================================================================

-- 1. Create custom access token hook function
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store_id uuid;
  v_claims jsonb;
BEGIN
  -- Fetch the user's store_id from public.users ONLY if they are active
  SELECT store_id INTO v_store_id
  FROM public.users
  WHERE id = (event->>'user_id')::uuid
    AND status = 'active'::public.user_status;

  -- Retrieve the existing claims
  v_claims := event->'claims';

  -- Add the custom claim
  IF v_store_id IS NOT NULL THEN
    v_claims := jsonb_set(v_claims, '{store_id}', to_jsonb(v_store_id));
  ELSE
    v_claims := jsonb_set(v_claims, '{store_id}', 'null'::jsonb);
  END IF;

  -- Update the event with the modified claims
  event := jsonb_set(event, '{claims}', v_claims);

  -- Return the modified event
  RETURN event;
END;
$$;

-- Grant execution to supabase_auth_admin and revoke from PUBLIC
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) FROM PUBLIC, anon, authenticated;

-- 2. Update get_user_store_id to check JWT claims first
CREATE OR REPLACE FUNCTION public.get_user_store_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store_id text;
  v_user_id uuid;
BEGIN
  -- Try to read from JWT claim first
  BEGIN
    v_store_id := auth.jwt() ->> 'store_id';
  EXCEPTION WHEN OTHERS THEN
    v_store_id := NULL;
  END;

  IF v_store_id IS NOT NULL AND v_store_id <> 'null' THEN
    RETURN v_store_id::uuid;
  END IF;

  -- Fallback to querying public.users
  v_user_id := auth.uid();
  IF v_user_id IS NOT NULL THEN
    SELECT store_id INTO v_store_id
    FROM public.users
    WHERE id = v_user_id
      AND status = 'active'::public.user_status;
      
    IF v_store_id IS NOT NULL THEN
      RETURN v_store_id::uuid;
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_user_store_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_store_id() TO authenticated;
