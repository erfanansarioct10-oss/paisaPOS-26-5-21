-- =========================================================================
-- PaisaPOS Beta V1.1 Activity Events Foundation
--
-- Creates a durable, owner-visible operational activity ledger. This is
-- separate from security/audit_logs so product accountability can evolve
-- without mixing customer-facing timelines with platform security logs.
-- =========================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'activity_result') THEN
    CREATE TYPE public.activity_result AS ENUM ('success', 'failure');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'privilege_source') THEN
    CREATE TYPE public.privilege_source AS ENUM ('owner_role', 'cashier_role', 'delegation', 'system');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'privilege_scope') THEN
    CREATE TYPE public.privilege_scope AS ENUM (
      'checkout.create',
      'catalog.manage',
      'inventory.adjust',
      'store.settings',
      'reports.export',
      'invoice.correct',
      'staff.manage'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.activity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  actor_name text NOT NULL CHECK (char_length(actor_name) BETWEEN 1 AND 150),
  actor_email text,
  actor_role public.user_role NOT NULL,
  privilege_source public.privilege_source NOT NULL,
  delegation_id uuid,
  action text NOT NULL CHECK (char_length(action) BETWEEN 3 AND 80),
  action_scope public.privilege_scope,
  target_type text NOT NULL CHECK (char_length(target_type) BETWEEN 2 AND 80),
  target_id uuid,
  target_label text,
  summary text NOT NULL CHECK (char_length(summary) BETWEEN 1 AND 500),
  before_state jsonb,
  after_state jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  result public.activity_result NOT NULL,
  error_code text,
  request_id uuid NOT NULL DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT activity_events_metadata_size_check CHECK (pg_column_size(metadata) <= 8192),
  CONSTRAINT activity_events_before_state_size_check CHECK (before_state IS NULL OR pg_column_size(before_state) <= 8192),
  CONSTRAINT activity_events_after_state_size_check CHECK (after_state IS NULL OR pg_column_size(after_state) <= 8192)
);

COMMENT ON TABLE public.activity_events IS 'Durable store-scoped operational activity timeline for owner-visible accountability.';
COMMENT ON COLUMN public.activity_events.delegation_id IS 'Future link to privilege_delegations once temporary delegation is implemented.';

ALTER TABLE public.activity_events ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON TABLE public.activity_events TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.activity_events TO service_role;
REVOKE ALL ON TABLE public.activity_events FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.activity_events FROM authenticated;

DROP POLICY IF EXISTS "Owners can read store activity" ON public.activity_events;
CREATE POLICY "Owners can read store activity"
  ON public.activity_events
  FOR SELECT
  TO authenticated
  USING (
    store_id = (SELECT public.get_user_store_id())
    AND (SELECT role FROM public.users WHERE id = (SELECT auth.uid())) = 'owner'
  );

DROP POLICY IF EXISTS "Cashiers can read own activity" ON public.activity_events;
CREATE POLICY "Cashiers can read own activity"
  ON public.activity_events
  FOR SELECT
  TO authenticated
  USING (
    store_id = (SELECT public.get_user_store_id())
    AND actor_user_id = (SELECT auth.uid())
  );

CREATE INDEX IF NOT EXISTS idx_activity_events_store_time
  ON public.activity_events(store_id, occurred_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_activity_events_store_actor_time
  ON public.activity_events(store_id, actor_user_id, occurred_at DESC)
  WHERE actor_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_activity_events_store_action_time
  ON public.activity_events(store_id, action, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_events_store_result_time
  ON public.activity_events(store_id, result, occurred_at DESC);

CREATE OR REPLACE FUNCTION public.prevent_activity_event_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Activity events are immutable.';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.prevent_activity_event_update() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prevent_activity_event_update() TO service_role;

DROP TRIGGER IF EXISTS trg_prevent_activity_event_update ON public.activity_events;
CREATE TRIGGER trg_prevent_activity_event_update
  BEFORE UPDATE ON public.activity_events
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_activity_event_update();
