-- Server-minted step-up proofs for high-risk staff delegation grants.
--
-- The browser must complete Supabase MFA and then ask a Server Action to mint
-- one short-lived proof. Granting temporary access consumes that proof exactly
-- once before writing to privilege_delegations.

CREATE TABLE IF NOT EXISTS public.staff_step_up_proofs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  purpose text NOT NULL,
  assurance_level text NOT NULL,
  authentication_method text,
  authenticated_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_step_up_proofs_purpose_check CHECK (purpose = 'delegation.grant'),
  CONSTRAINT staff_step_up_proofs_assurance_check CHECK (assurance_level = 'aal2'),
  CONSTRAINT staff_step_up_proofs_expiry_check CHECK (
    expires_at > created_at
    AND expires_at <= created_at + interval '10 minutes'
    AND expires_at <= authenticated_at + interval '10 minutes'
  ),
  CONSTRAINT staff_step_up_proofs_auth_time_check CHECK (
    authenticated_at >= created_at - interval '10 minutes'
    AND authenticated_at <= created_at + interval '1 minute'
  ),
  CONSTRAINT staff_step_up_proofs_used_time_check CHECK (
    used_at IS NULL OR used_at >= created_at
  )
);

COMMENT ON TABLE public.staff_step_up_proofs IS
  'Private, service-role-only one-time proofs that an owner completed recent MFA before granting temporary staff privileges.';
COMMENT ON COLUMN public.staff_step_up_proofs.purpose IS
  'Current V1.1 purpose is delegation.grant only.';
COMMENT ON COLUMN public.staff_step_up_proofs.authentication_method IS
  'Best-effort Supabase AMR method name used for the freshest AAL2 authentication event.';

CREATE INDEX IF NOT EXISTS idx_staff_step_up_proofs_consume
  ON public.staff_step_up_proofs(id, store_id, user_id, expires_at)
  WHERE used_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_staff_step_up_proofs_purge
  ON public.staff_step_up_proofs(expires_at);

ALTER TABLE public.staff_step_up_proofs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.staff_step_up_proofs FROM PUBLIC, anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE public.staff_step_up_proofs TO service_role;
