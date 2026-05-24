-- =========================================================================
-- PaisaPOS Unauthenticated Security Event Logging
-- Deployed: 2026-05-24
--
-- Establishes a SECURITY DEFINER helper function to record failed auth
-- events or suspicious traffic into the audit_logs table. Because failed
-- logins occur when auth.uid() is null, standard RLS blocks INSERT operations.
-- This function securely bypasses RLS strictly for logging failures.
-- =========================================================================

CREATE OR REPLACE FUNCTION log_unauthenticated_security_event(
  p_operation text,
  p_affected_entity text,
  p_error_message text
) RETURNS void AS $$
BEGIN
  -- Insert failed event (store_id and user_id are null as the user is not authenticated yet)
  INSERT INTO public.audit_logs (store_id, user_id, operation, affected_entity, result, error_message, created_at)
  VALUES (null, null, p_operation, p_affected_entity, 'FAILED', p_error_message, now());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Revoke execute from public/anonymous roles to prevent spam,
-- leaving it only for authenticated users and our secure Next.js server actions.
REVOKE EXECUTE ON FUNCTION log_unauthenticated_security_event(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION log_unauthenticated_security_event(text, text, text) TO service_role, authenticated;
