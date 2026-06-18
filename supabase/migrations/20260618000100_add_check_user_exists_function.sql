-- =========================================================================
-- Function: get_user_id_by_email
-- Description: Securely retrieves user ID from auth.users by email.
-- Access: Only callable by service_role (Admin API) to prevent email enumeration.
-- =========================================================================

-- Drop the old function if it exists
DROP FUNCTION IF EXISTS public.check_user_exists_by_email(text);

CREATE OR REPLACE FUNCTION public.get_user_id_by_email(p_email text)
RETURNS uuid
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  RETURN (
    SELECT id FROM auth.users WHERE lower(email) = lower(btrim(p_email)) LIMIT 1
  );
END;
$$ LANGUAGE plpgsql;

-- Revoke all public execution rights
REVOKE EXECUTE ON FUNCTION public.get_user_id_by_email(text) FROM public;
REVOKE EXECUTE ON FUNCTION public.get_user_id_by_email(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_id_by_email(text) FROM authenticated;

-- Allow service_role to execute the function
GRANT EXECUTE ON FUNCTION public.get_user_id_by_email(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_user_id_by_email(text) TO postgres;
