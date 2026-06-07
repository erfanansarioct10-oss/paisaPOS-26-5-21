-- =========================================================================
-- PaisaPOS Beta V1.1 Staff Management Scale Indexes
--
-- Supports bounded staff-management reads and replaces broad activity
-- timeline ILIKE search with indexed full-text search.
-- =========================================================================

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS btree_gin WITH SCHEMA extensions;

ALTER TABLE public.activity_events
  ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple'::regconfig, coalesce(actor_name, '')), 'A') ||
    setweight(to_tsvector('simple'::regconfig, coalesce(action, '')), 'B') ||
    setweight(to_tsvector('simple'::regconfig, coalesce(target_label, '')), 'B') ||
    setweight(to_tsvector('simple'::regconfig, coalesce(target_type, '')), 'C') ||
    setweight(to_tsvector('simple'::regconfig, coalesce(summary, '')), 'D') ||
    setweight(to_tsvector('simple'::regconfig, coalesce(error_code, '')), 'D')
  ) STORED;

COMMENT ON COLUMN public.activity_events.search_vector IS
  'Generated full-text vector for owner activity timeline search. Keep query code on textSearch(search_vector) rather than broad multi-column ILIKE.';

CREATE INDEX IF NOT EXISTS idx_activity_events_store_search_vector
  ON public.activity_events
  USING gin(store_id, search_vector);

CREATE INDEX IF NOT EXISTS idx_activity_events_actor_user_id_fk
  ON public.activity_events(actor_user_id)
  WHERE actor_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_activity_events_delegation_id_fk
  ON public.activity_events(delegation_id)
  WHERE delegation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_staff_users_store_created_page
  ON public.users(store_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_staff_users_invited_by_user_id_fk
  ON public.users(invited_by_user_id)
  WHERE invited_by_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_staff_users_suspended_by_user_id_fk
  ON public.users(suspended_by_user_id)
  WHERE suspended_by_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_staff_invitations_store_created_page
  ON public.staff_invitations(store_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_staff_invitations_pending_expiry
  ON public.staff_invitations(store_id, expires_at, created_at DESC)
  WHERE status = 'pending'::public.staff_invitation_status;

CREATE INDEX IF NOT EXISTS idx_staff_invitations_invited_by_user_id_fk
  ON public.staff_invitations(invited_by_user_id);

CREATE INDEX IF NOT EXISTS idx_staff_invitations_accepted_by_user_id_fk
  ON public.staff_invitations(accepted_by_user_id)
  WHERE accepted_by_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_staff_invitations_revoked_by_user_id_fk
  ON public.staff_invitations(revoked_by_user_id)
  WHERE revoked_by_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_privilege_delegations_staff_active_page
  ON public.privilege_delegations(store_id, expires_at ASC, id ASC)
  WHERE revoked_at IS NULL
    AND scope IN (
      'catalog.manage'::public.privilege_scope,
      'inventory.adjust'::public.privilege_scope
    );

CREATE INDEX IF NOT EXISTS idx_privilege_delegations_granted_to_user_id_fk
  ON public.privilege_delegations(granted_to_user_id);

CREATE INDEX IF NOT EXISTS idx_privilege_delegations_granted_by_user_id_fk
  ON public.privilege_delegations(granted_by_user_id);

CREATE INDEX IF NOT EXISTS idx_privilege_delegations_revoked_by_user_id_fk
  ON public.privilege_delegations(revoked_by_user_id)
  WHERE revoked_by_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_staff_step_up_proofs_user_id_fk
  ON public.staff_step_up_proofs(user_id);
