-- Enable the pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create a stored procedure to expire pending invitations that have passed their expiration date
CREATE OR REPLACE PROCEDURE public.cleanup_expired_invitations()
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.staff_invitations
  SET status = 'expired'
  WHERE status = 'pending' AND expires_at <= now();
  COMMIT;
END;
$$;

-- Schedule the cron job to run every hour
SELECT cron.schedule(
  'cleanup-expired-invitations',
  '0 * * * *',
  'CALL public.cleanup_expired_invitations()'
);
