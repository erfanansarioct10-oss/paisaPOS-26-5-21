-- =========================================================================
-- DATABASE MIGRATION: AUTOMATED AUDIT LOG ARCHIVING (SCALABILITY PATCH)
-- =========================================================================

-- 1. Create the Archive Table (matches audit_logs structure)
CREATE TABLE IF NOT EXISTS audit_logs_archive (
  id uuid,
  store_id uuid,
  user_id uuid,
  operation text,
  affected_entity text,
  result text,
  error_message text,
  created_at timestamp with time zone
);

-- Index the archive table by created_at for fast date-range queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_archive_created 
  ON audit_logs_archive(created_at);

-- 2. Create the archiving stored procedure
CREATE OR REPLACE PROCEDURE archive_and_purge_old_audit_logs()
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cutoff_date timestamp with time zone;
BEGIN
  -- Set cutoff date to 90 days ago
  v_cutoff_date := now() - interval '90 days';

  -- Copy old records to the archive table
  INSERT INTO audit_logs_archive
  SELECT id, store_id, user_id, operation, affected_entity, result, error_message, created_at
  FROM audit_logs
  WHERE created_at < v_cutoff_date;

  -- Delete old records from the active audit_logs table
  DELETE FROM audit_logs
  WHERE created_at < v_cutoff_date;

  COMMIT;
END;
$$;

-- 3. Enable Row Level Security (RLS) on the archive table
ALTER TABLE audit_logs_archive ENABLE ROW LEVEL SECURITY;

-- 4. Create Select Policy for Tenant Isolation
CREATE POLICY "Users can read archived audit logs of their store" ON audit_logs_archive 
  FOR SELECT USING (store_id = get_user_store_id());

-- 5. Enable the pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 6. Schedule the cron job to run daily at 2:00 AM UTC
SELECT cron.schedule(
  'daily-audit-log-archiving',
  '0 2 * * *',
  'CALL archive_and_purge_old_audit_logs()'
);

