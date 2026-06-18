-- =========================================================================
-- Custom SMTP Auth Verification and Reset Tables
-- Created: 2026-06-18
-- =========================================================================

-- 1. Create pending signups table
CREATE TABLE IF NOT EXISTS public.pending_signups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password text NOT NULL,
  full_name text NOT NULL,
  store_name text NOT NULL,
  token text NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS (no policies added, so only service_role/admin bypasses)
ALTER TABLE public.pending_signups ENABLE ROW LEVEL SECURITY;

-- 2. Create password reset codes table
CREATE TABLE IF NOT EXISTS public.password_reset_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  code text NOT NULL,
  token text,
  expires_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS (no policies added, so only service_role/admin bypasses)
ALTER TABLE public.password_reset_codes ENABLE ROW LEVEL SECURITY;

-- 3. Add performance indexes
CREATE INDEX IF NOT EXISTS idx_pending_signups_token ON public.pending_signups(token);
CREATE INDEX IF NOT EXISTS idx_password_reset_codes_email_code ON public.password_reset_codes(email, code);
CREATE INDEX IF NOT EXISTS idx_password_reset_codes_token ON public.password_reset_codes(token);

-- Grant permissions to standard Supabase roles
GRANT ALL ON public.pending_signups TO postgres, service_role, anon, authenticated;
GRANT ALL ON public.password_reset_codes TO postgres, service_role, anon, authenticated;

