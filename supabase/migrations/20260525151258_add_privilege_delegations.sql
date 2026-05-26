-- =========================================================================
-- PaisaPOS Beta V1.1 Temporary Privilege Delegations
--
-- Grants short-lived, scope-limited access without changing a cashier's
-- permanent role. Browser clients can read only allowed rows; all grant/revoke
-- writes go through server-side actions using the service role.
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.privilege_delegations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  granted_to_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  granted_by_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  scope public.privilege_scope NOT NULL,
  reason text NOT NULL,
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revoked_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT privilege_delegations_duration_valid CHECK (expires_at > starts_at),
  CONSTRAINT privilege_delegations_max_duration CHECK (expires_at <= starts_at + interval '24 hours'),
  CONSTRAINT privilege_delegations_reason_length CHECK (char_length(reason) BETWEEN 5 AND 300),
  CONSTRAINT privilege_delegations_not_self CHECK (granted_to_user_id <> granted_by_user_id),
  CONSTRAINT privilege_delegations_revocation_pair CHECK (
    (revoked_at IS NULL AND revoked_by_user_id IS NULL)
    OR (revoked_at IS NOT NULL AND revoked_by_user_id IS NOT NULL)
  ),
  CONSTRAINT privilege_delegations_scope_allowed CHECK (
    scope IN (
      'catalog.manage'::public.privilege_scope,
      'inventory.adjust'::public.privilege_scope,
      'reports.export'::public.privilege_scope,
      'invoice.correct'::public.privilege_scope
    )
  )
);

COMMENT ON TABLE public.privilege_delegations IS 'Short-lived owner-granted privilege records for active cashiers.';
COMMENT ON COLUMN public.privilege_delegations.scope IS 'Delegated privilege scope; never staff.manage or store.settings in V1.1.';
COMMENT ON COLUMN public.privilege_delegations.reason IS 'Owner-entered business reason shown in accountability views.';

CREATE INDEX IF NOT EXISTS idx_privilege_delegations_active_lookup
  ON public.privilege_delegations(store_id, granted_to_user_id, scope, expires_at, starts_at)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_privilege_delegations_store_created
  ON public.privilege_delegations(store_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_privilege_delegations_store_grantor_created
  ON public.privilege_delegations(store_id, granted_by_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_privilege_delegations_store_revocation
  ON public.privilege_delegations(store_id, revoked_at, expires_at);

CREATE OR REPLACE FUNCTION public.validate_privilege_delegation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_grantor public.users%ROWTYPE;
  v_grantee public.users%ROWTYPE;
  v_revoker public.users%ROWTYPE;
BEGIN
  SELECT *
  INTO v_grantor
  FROM public.users
  WHERE id = NEW.granted_by_user_id;

  IF v_grantor.id IS NULL
    OR v_grantor.store_id IS DISTINCT FROM NEW.store_id
    OR v_grantor.role IS DISTINCT FROM 'owner'::public.user_role
    OR v_grantor.status IS DISTINCT FROM 'active'::public.user_status
  THEN
    RAISE EXCEPTION 'Invalid delegation grantor. Only an active owner in the same store can grant temporary access.';
  END IF;

  SELECT *
  INTO v_grantee
  FROM public.users
  WHERE id = NEW.granted_to_user_id;

  IF v_grantee.id IS NULL
    OR v_grantee.store_id IS DISTINCT FROM NEW.store_id
    OR v_grantee.role IS DISTINCT FROM 'cashier'::public.user_role
    OR v_grantee.status IS DISTINCT FROM 'active'::public.user_status
  THEN
    RAISE EXCEPTION 'Invalid delegation grantee. Only an active cashier in the same store can receive temporary access.';
  END IF;

  IF NEW.revoked_by_user_id IS NOT NULL THEN
    SELECT *
    INTO v_revoker
    FROM public.users
    WHERE id = NEW.revoked_by_user_id;

    IF v_revoker.id IS NULL
      OR v_revoker.store_id IS DISTINCT FROM NEW.store_id
      OR v_revoker.role IS DISTINCT FROM 'owner'::public.user_role
      OR v_revoker.status IS DISTINCT FROM 'active'::public.user_status
    THEN
      RAISE EXCEPTION 'Invalid delegation revoker. Only an active owner in the same store can revoke temporary access.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.validate_privilege_delegation() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_privilege_delegation() TO service_role;

DROP TRIGGER IF EXISTS trg_validate_privilege_delegation ON public.privilege_delegations;
CREATE TRIGGER trg_validate_privilege_delegation
  BEFORE INSERT OR UPDATE ON public.privilege_delegations
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_privilege_delegation();

ALTER TABLE public.privilege_delegations ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON TABLE public.privilege_delegations TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.privilege_delegations TO service_role;
REVOKE ALL ON TABLE public.privilege_delegations FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.privilege_delegations FROM authenticated;

DROP POLICY IF EXISTS "Owners can read store privilege delegations" ON public.privilege_delegations;
CREATE POLICY "Owners can read store privilege delegations"
  ON public.privilege_delegations
  FOR SELECT
  TO authenticated
  USING (
    store_id = (SELECT public.get_user_store_id())
    AND (
      SELECT u.role
      FROM public.users u
      WHERE u.id = (SELECT auth.uid())
        AND u.status = 'active'::public.user_status
    ) = 'owner'::public.user_role
  );

DROP POLICY IF EXISTS "Cashiers can read own active privilege delegations" ON public.privilege_delegations;
CREATE POLICY "Cashiers can read own active privilege delegations"
  ON public.privilege_delegations
  FOR SELECT
  TO authenticated
  USING (
    store_id = (SELECT public.get_user_store_id())
    AND granted_to_user_id = (SELECT auth.uid())
    AND revoked_at IS NULL
    AND starts_at <= now()
    AND expires_at > now()
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'activity_events_delegation_id_fkey'
      AND conrelid = 'public.activity_events'::regclass
  ) THEN
    ALTER TABLE public.activity_events
      ADD CONSTRAINT activity_events_delegation_id_fkey
      FOREIGN KEY (delegation_id)
      REFERENCES public.privilege_delegations(id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'invoices_sold_with_delegation_id_fkey'
      AND conrelid = 'public.invoices'::regclass
  ) THEN
    ALTER TABLE public.invoices
      ADD CONSTRAINT invoices_sold_with_delegation_id_fkey
      FOREIGN KEY (sold_with_delegation_id)
      REFERENCES public.privilege_delegations(id)
      ON DELETE SET NULL;
  END IF;
END $$;
