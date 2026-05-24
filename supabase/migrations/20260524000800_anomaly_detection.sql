-- =========================================================================
-- DATABASE MIGRATION: AUTOMATED THREAT ANOMALY DETECTION (CRON SCHEDULER)
-- Deployed: 2026-05-24
-- =========================================================================

-- 1. Create the Security Alerts Table
CREATE TABLE IF NOT EXISTS security_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type text NOT NULL,             -- 'BRUTE_FORCE_ATTEMPT', 'SUSPICIOUS_VELOCITY', etc.
  severity text NOT NULL DEFAULT 'MEDIUM', -- 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'
  description text NOT NULL,
  metadata jsonb,
  acknowledged boolean DEFAULT false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Index by created_at for dashboard timeline queries
CREATE INDEX IF NOT EXISTS idx_security_alerts_created 
  ON security_alerts(created_at desc);

-- Enable RLS (Service role/admins read-only by default; no public select/insert policies)
ALTER TABLE security_alerts ENABLE ROW LEVEL SECURITY;

-- 2. Create the Anomaly Scanner Function
CREATE OR REPLACE FUNCTION detect_threat_anomalies()
RETURNS void AS $$
DECLARE
  v_brute_force_ips RECORD;
  v_abuse_stores RECORD;
BEGIN
  -- A. Detect Brute Force Login: >10 unauthenticated failed operations from a single email/affected_entity in 15 minutes
  FOR v_brute_force_ips IN
    SELECT affected_entity, count(*) as failed_count
    FROM public.audit_logs
    WHERE operation = 'AUTH_LOGIN_FAILURE' 
      AND created_at > now() - interval '15 minutes'
    GROUP BY affected_entity
    HAVING count(*) >= 10
  LOOP
    -- Only log alert if we haven't already logged a similar alert in the last 1 hour
    IF NOT EXISTS (
      SELECT 1 FROM public.security_alerts 
      WHERE alert_type = 'BRUTE_FORCE_ATTEMPT' 
        AND description LIKE '%' || v_brute_force_ips.affected_entity || '%'
        AND created_at > now() - interval '1 hour'
    ) THEN
      INSERT INTO public.security_alerts (alert_type, severity, description, metadata)
      VALUES (
        'BRUTE_FORCE_ATTEMPT',
        'HIGH',
        'Suspicious brute-force login sequence detected for entity: ' || v_brute_force_ips.affected_entity || '. Failed attempts: ' || v_brute_force_ips.failed_count,
        jsonb_build_object('affected_entity', v_brute_force_ips.affected_entity, 'failed_count', v_brute_force_ips.failed_count)
      );
    END IF;
  END LOOP;

  -- B. Detect High Failure Velocity: >5 failed product operations or checkouts from the same store in 15 minutes
  FOR v_abuse_stores IN
    SELECT store_id, operation, count(*) as failed_count
    FROM public.audit_logs
    WHERE result = 'FAILED' 
      AND created_at > now() - interval '15 minutes'
      AND store_id IS NOT NULL
    GROUP BY store_id, operation
    HAVING count(*) >= 5
  LOOP
    -- Only log alert if we haven't already logged a similar alert in the last 1 hour
    IF NOT EXISTS (
      SELECT 1 FROM public.security_alerts 
      WHERE alert_type = 'SUSPICIOUS_VELOCITY' 
        AND description LIKE '%' || v_abuse_stores.store_id::text || '%'
        AND created_at > now() - interval '1 hour'
    ) THEN
      INSERT INTO public.security_alerts (alert_type, severity, description, metadata)
      VALUES (
        'SUSPICIOUS_VELOCITY',
        'MEDIUM',
        'High failure velocity (' || v_abuse_stores.operation || ') detected in store: ' || v_abuse_stores.store_id || '. Count: ' || v_abuse_stores.failed_count,
        jsonb_build_object('store_id', v_abuse_stores.store_id, 'operation', v_abuse_stores.operation, 'failed_count', v_abuse_stores.failed_count)
      );
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 3. Register the Scanner on pg_cron schedule
-- Enable the pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule the anomaly threat scan to run every 15 minutes
SELECT cron.schedule(
  'threat-anomaly-detection',
  '*/15 * * * *',
  'SELECT detect_threat_anomalies()'
);
