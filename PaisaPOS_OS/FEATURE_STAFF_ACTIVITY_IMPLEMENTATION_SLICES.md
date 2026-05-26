# BETA V1.1 IMPLEMENTATION SLICES: STAFF, ACTIVITY, AND ACCOUNTABILITY

Last updated: 2026-05-26 08:27 NPT

## 1. WHY WE SHOULD BUILD THIS IN SLICES

Yes: this feature should be divided into small implementation slices.

The owner/cashier/accountability feature touches authentication, authorization, RLS, database schema, Server Actions, activity logging, UI, and tests. If we build it as one large task, the risk is not just hallucination; the bigger risk is partial security logic where the UI says one thing, Server Actions enforce another thing, and the database allows a third thing.

For V1.1, each slice must produce one complete, testable behavior:

- A small database change.
- A server-only authorization or logging helper.
- One visible product behavior, where applicable.
- Tests or SQL proof that the behavior works.
- A commit before moving to the next slice.

This keeps production Beta V1 stable while V1.1 becomes progressively safer.

## 2. OPERATING RULES

1. Work only on `beta/v1.1`.
2. Use local/dev Supabase for schema work and tests.
3. Do not push unfinished migrations to production.
4. Do not introduce a privilege without an audit trail.
5. Do not introduce an audit trail without RLS and owner visibility planning.
6. Do not change a user's permanent `role` to implement temporary access.
7. Do not rely on browser state, JWT custom claims, or user-editable metadata for privileged authorization.
8. Commit after each successful slice with proof notes.

## 3. SLICE STRUCTURE

Each slice should follow this template:

- Goal: what user or security problem this solves.
- Scope: exactly what will be changed.
- Out of scope: what we intentionally defer.
- Database: migrations, RLS, indexes, constraints.
- Server: Server Actions, DAL helpers, permission helpers.
- UI: pages, forms, labels, state.
- Tests: unit, live DB/RLS, Playwright, manual smoke.
- Confirmation: exact proof that lets us move forward.
- Rollback note: how to disable or revert safely during beta development.

## 4. RECOMMENDED V1.1 BUILD ORDER

Current implementation status as of 2026-05-26 08:27 NPT:

- Slice 0 guardrail verification is complete for the first implementation pass.
- Slice 1 durable activity event foundation is implemented locally and verified with database reset, activity/migration/RLS tests, full Vitest, lint, build, and Supabase DB lint.
- Slice 2 invoice attribution is implemented locally and verified with database reset, migration/live checkout/RLS tests, full Vitest, lint, build, and Supabase DB lint.
- Slice 3 owner Activity Log page is implemented locally and verified with activity helper tests, activity RLS cursor coverage, owner Activity Playwright smoke, full Vitest, lint, build, Supabase DB lint, and local dev server health.
- Slice 4 Staff Directory and Invitations is implemented locally and verified with database reset, focused migration/store/RLS tests, Staff + Activity Playwright smoke, full Vitest, lint, build, Supabase DB lint, and whitespace check.
- Slice 5 Permission Helper Unification is verified locally: central server permission helper, shared UI capability flags, selected Server Action rewiring, activity delegation-id plumbing, permission matrix tests, direct Server Action abuse tests, full Vitest, lint, build, Playwright, and prior Supabase DB lint are passing.
- Slice 6 Temporary Delegation Foundation is implemented locally and verified with a clean Supabase reset, delegation migration/RLS/action tests, database-backed permission lookup tests, full Vitest, lint, build, Supabase DB lint, migration list, and Chromium Playwright.
- Slice 7 Delegated Action Coverage now has inventory adjustment and catalog management passes implemented locally and verified: delegated cashiers can see stock controls with `inventory.adjust`, see catalog/import/edit/delete/favorite controls with `catalog.manage`, and catalog writes use service-role-only internal RPCs after server authorization plus SQL-side delegation revalidation.
- Slice 7 is committed locally in `93e21ae feat(staff): add delegated catalog actions`; before Slice 8 doc updates, `beta/v1.1` was clean and ahead of `origin/beta/v1.1` by 2 commits.
- Slice 8 Release Proof passed locally. V1.1 staff scope is frozen at `catalog.manage` and `inventory.adjust`; reports, invoice correction, and settings delegation remain deferred.
- Next recommended step is to review/push the local `beta/v1.1` commits or run a production-like preview only against a separate dev/staging backend. Do not run linked production Supabase commands without release approval.

### Slice 0: Development Guardrails

Goal: make sure V1.1 cannot accidentally affect Beta V1 production data.

Scope:
- Confirm branch is `beta/v1.1`.
- Confirm local Supabase is the active development database.
- Confirm Vercel Preview branch envs are not production Supabase credentials.
- Add or confirm feature flag guidance for unfinished staff/delegation UI.

Out of scope:
- No user-facing feature changes.

Database:
- No schema changes.

Server:
- No business logic changes.

UI:
- No product UI changes.

Tests:
- `git status -sb`
- `supabase status`
- `npm run lint`

Confirmation:
- Branch is `beta/v1.1`.
- Local/dev Supabase is used for tests.
- Production `main` remains untouched.

Rollback note:
- No rollback needed; this is a verification slice.

### Slice 1: Durable Activity Event Foundation

Goal: create the accountability backbone before adding more staff power.

Scope:
- Add `activity_events` table.
- Add immutable event rules.
- Add store-scoped RLS.
- Add indexes for timeline reads.
- Add server-only `recordActivityEvent()` helper.
- Start logging a small number of core events from server-side code.

Out of scope:
- No staff invitations yet.
- No temporary delegation yet.
- No full activity UI yet.

Database:
- Create `activity_events`.
- Include `store_id`, `actor_user_id`, `actor_role`, `action`, `action_scope`, `target_type`, `target_id`, `result`, `metadata`, `occurred_at`, `created_at`, and optional request/delegation references.
- Store small actor snapshots like display name/email where needed for historical clarity.
- Enable RLS.
- Owner can read store events.
- Cashier should not read the full store audit timeline by default.
- Authenticated users should not insert/update/delete activity events through direct REST.
- Add timeline index on `(store_id, created_at desc, id desc)`.
- Add actor index on `(store_id, actor_user_id, created_at desc)`.

Server:
- Add `src/lib/server/activity.ts` with `import "server-only"`.
- Centralize metadata redaction.
- Make logging best-effort for non-critical events but strict for privileged/security events where appropriate.

UI:
- No new navigation item yet unless we decide to show a hidden/internal preview.

Tests:
- Migration applies locally.
- RLS denies direct browser inserts.
- RLS allows owner read of own store events.
- RLS denies cross-store reads.
- Unit test verifies metadata redaction.

Confirmation:
- An owner can perform one existing action and a durable event appears.
- A cashier cannot create fake audit events through Supabase REST.

Implementation status:
- Implemented locally in migration `20260525112112_add_activity_events_foundation.sql`.
- Server helper added at `src/lib/server/activity.ts`.
- Existing checkout/catalog/inventory/settings/profile actions now emit durable events.
- Activity redaction, migration hardening, and RLS behavior are covered by tests.

Rollback note:
- Keep the table unused if needed; do not drop it once events may exist in shared dev data.

### Slice 2: Invoice Attribution

Goal: make every sale answer: who sold this?

Scope:
- Record seller identity on checkout.
- Show seller identity in invoice/receipt/history where useful.
- Emit checkout activity events.

Out of scope:
- No staff invite UI.
- No delegation yet.

Database:
- Add invoice attribution fields if not already present:
  - `sold_by_user_id`
  - `sold_by_name`
  - `sold_by_role`
  - optional future `sold_with_delegation_id`
- Add foreign key to users where safe.
- Add index on `(store_id, sold_by_user_id, created_at desc)` for filtering.

Server:
- Checkout RPC or Server Action must set attribution from authenticated context, not from client input.
- Add activity event for successful checkout and failed checkout attempts where useful.

UI:
- Invoice history should show "Sold by ..." in a compact way.
- Receipt view can show seller when appropriate.

Tests:
- Owner sale records owner.
- Cashier sale records cashier.
- Client cannot spoof `sold_by_user_id`.
- Invoice history displays attribution.

Confirmation:
- A checkout made by cashier visibly differs from a checkout made by owner.

Implementation status:
- Implemented locally in migration `20260525114332_add_invoice_seller_attribution.sql`.
- Checkout RPC now captures `sold_by_user_id`, `sold_by_name`, and `sold_by_role` from `auth.uid()` plus `public.users`.
- Invoice DTOs and client store selects include sold-by fields.
- Invoice History, Recent Invoices, and Receipt display seller attribution with nullable legacy fallbacks.
- Live DB/RLS tests cover owner attribution, cashier attribution, and denied direct invoice spoofing.

Rollback note:
- Keep attribution columns nullable during V1.1 migration so old invoices remain valid.

### Slice 3: Owner Activity Log Page

Goal: give owners a clear, searchable view of important shop activity.

Scope:
- Add Activity page for owners.
- Read activity through server-only DAL.
- Add filters for actor, event type, result, and date range.

Out of scope:
- No staff invitation.
- No delegation management.

Database:
- Use Slice 1 indexes.
- Add extra index only if query plans show the need.

Server:
- Add `getActivityEventsDTO()` in the DAL.
- Return minimal DTOs, not raw database rows.
- Use cursor pagination instead of offset pagination.

UI:
- Add sidebar item only for owner.
- Activity list should be dense and practical, not a marketing-style feed.
- Include actor, action, entity, result, and time.

Tests:
- Owner can view own store activity.
- Cashier cannot view owner activity page.
- Cross-store event leakage is denied.
- Cursor pagination works.

Confirmation:
- Owner can answer who changed/sold/failed something without opening database logs.

Implementation status:
- Implemented locally with the owner-only `/activity` route and owner-only sidebar navigation item.
- Added `getActivityEventsDTO()` in `src/lib/server/dal.ts` with server-side owner authorization, minimal DTO mapping, actor/event/result/date/search filters, and cursor pagination.
- Added `src/components/activity-log-page.tsx` with dense desktop table and mobile card views for actor, event, entity, result, time, and summary.
- Added activity filter/cursor unit tests, extended live RLS verification to prove cursor pagination works over owner-visible activity, and added a Playwright owner Activity smoke test.

Rollback note:
- Hide navigation behind feature flag if UI needs more polish.

### Slice 4: Staff Directory And Invitations

Goal: let owners intentionally add staff instead of relying on manual database edits.

Scope:
- Add Settings > Staff or `/staff` owner page.
- Owner can invite cashier by email.
- Invited user accepts and joins the store as cashier.
- Owner can suspend/remove staff access.

Out of scope:
- No temporary owner delegation yet.
- No bulk staff import.

Database:
- Add `staff_invitations`.
- Extend `users` with staff status if needed.
- Add uniqueness constraints to prevent duplicate active invites.
- Add RLS so only owners manage invitations for their store.

Server:
- Add server-only Supabase admin client.
- Use Auth Admin invite flow server-side only.
- Do not expose service role key to client.
- Add invitation rate limits.
- Log invite, accept, suspend, revoke events.

UI:
- Staff page with active staff and pending invites.
- Clear copy: "Cashiers can sell, but cannot edit catalog/settings unless delegated."

Tests:
- Owner can invite cashier.
- Cashier cannot invite staff.
- Cross-store invitation is denied.
- Existing user cannot create a second store accidentally from invite acceptance.

Confirmation:
- A new cashier can be invited, accept, log in, and sell.

Implementation status:
- Implemented locally in migration `20260525121333_add_staff_invitations.sql`.
- Added `user_status`, `staff_invitation_status`, `staff_invitations`, user lifecycle fields, owner-visible invitation RLS, explicit Data API grants, no authenticated browser DML on invitations, status-aware `get_user_store_id()`, protected staff lifecycle fields, and active-status checkout enforcement.
- Added server-only staff DTO loading, owner invite/revoke/suspend/reactivate actions, accept-invite action, and staff activity events.
- Added owner-only `/staff` route, `/staff/accept` route, owner-only Staff sidebar item, Staff page directory/invitation UI, and accept-invite UI.
- Added migration hardening coverage, live RLS coverage for staff invitation isolation and suspended cashier checkout denial, and Staff Playwright smoke.

Rollback note:
- Keep invited users as cashier only; no automatic owner grants.

### Slice 5: Permission Helper Unification

Goal: avoid duplicated owner/cashier checks as the app grows.

Scope:
- Add central `requirePrivilege()` or equivalent helper.
- Refactor selected Server Actions to use named privileges.
- Keep UI role checks consistent with server permission names.

Out of scope:
- No new delegated privileges yet.

Database:
- No new schema unless needed for consistent role checks.

Server:
- Create `src/lib/server/permissions.ts`.
- Define stable privilege names like:
  - `catalog:manage`
  - `inventory:adjust`
  - `staff:manage`
  - `settings:update`
  - `checkout:create`
  - `activity:read`
- Owner gets all current store privileges.
- Cashier gets checkout and read-only operational privileges.

UI:
- Replace scattered role checks where practical with clearer capability booleans from server DTOs.

Tests:
- Permission matrix unit tests.
- Server Actions deny unauthorized cashier mutations.
- Owner actions still work.

Confirmation:
- One permission helper explains the same behavior enforced by UI, Server Actions, and tests.

Implementation status:
- Implemented locally at `src/lib/server/permissions.ts`.
- Added explicit privilege names matching the existing activity scopes: `checkout.create`, `catalog.manage`, `inventory.adjust`, `staff.manage`, `store.settings`, `activity.read`, plus release/future scopes.
- Current production behavior remains conservative: active owners receive management privileges; active cashiers receive checkout/profile privileges; suspended or missing profiles receive no privileges.
- Delegation evaluation is modeled for future Slice 6, but trusted database-backed delegation lookup is not enabled yet.
- Selected Server Actions now call `requirePrivilege()` for checkout, catalog/product/import/favorite mutations, inventory adjustment, store/profile updates, and staff invite/lifecycle actions.
- Business actions now check `requirePrivilege()` before opening the Supabase server client, so denied direct calls stop before database client, rate-limit, mutation, or activity side effects.
- Added permission matrix tests, activity delegation-id payload coverage, and direct Server Action abuse tests for unauthorized cashier calls, missing auth, suspended cashier checkout, store-id tampering, forged actor/role payloads, and allowed cashier checkout/profile updates.
- Added `src/lib/staff-capabilities.ts` so client UI and server permission checks share the same base role-to-privilege vocabulary without importing server-only modules into client components.
- Replaced practical owner-role UI gates with capability booleans: Inventory add/import/edit/delete/favorite uses `canManageCatalog`, stock adjustment uses `canAdjustInventory`, Sidebar Staff/Activity links use `canManageStaff`/`canReadActivity`, and Settings store/profile forms use `canManageStoreSettings`/`canUpdateProfile`.
- Existing Staff/Activity route gates now use named privilege checks before rendering owner-only pages.

Rollback note:
- Refactor one module at a time to avoid risky broad churn.

### Slice 6: Temporary Delegation Foundation

Goal: allow an owner to grant limited, time-boxed administrative access without permanently promoting a cashier.

Scope:
- Add `privilege_delegations`.
- Owner can grant/revoke specific scopes for a cashier.
- Delegation is checked from the database at action time.

Out of scope:
- No complex approval workflow.
- No multi-owner quorum.

Database:
- Add scope enum/table.
- Add `starts_at`, `expires_at`, `revoked_at`, `granted_by_user_id`, `granted_to_user_id`, `reason`.
- Add constraints:
  - same store only
  - owner grants only
  - no self-delegation
  - expiration required
- Add indexes for active delegation lookup.
- RLS owner read/manage, cashier read own active delegations.

Server:
- Extend `requirePrivilege()` to check permanent role first, active delegation second.
- Add reauth or step-up check before owner grants sensitive delegation.
- Log grant, revoke, expire-sensitive use events.

UI:
- Staff profile can show "Grant temporary access".
- Cashier sees a banner when acting under delegated privileges.
- Owner sees active delegations on Staff page.

Tests:
- Owner can grant allowed scope.
- Cashier receives temporary access.
- Expired delegation fails.
- Revoked delegation fails immediately.
- Client cannot grant itself delegation.

Confirmation:
- Cashier can perform one delegated admin action only during the valid time window.

Implementation status:
- Implemented locally in migration `20260525151258_add_privilege_delegations.sql`.
- Added `privilege_delegations` with one row per cashier/scope, max 24-hour duration, owner/cashier same-store trigger validation, no self-delegation, allowed-scope constraint, active lookup indexes, explicit `SELECT` grants, RLS owner reads, cashier own-active reads, and no authenticated browser DML.
- Linked future accountability references with `activity_events.delegation_id` and `invoices.sold_with_delegation_id` foreign keys.
- Extended `requirePrivilege()` so permanent role privileges short-circuit first, then active cashiers get a database-backed lookup only for delegatable scopes.
- Added owner Server Actions to grant/revoke temporary access with reason, duration, explicit `GRANT` confirmation, rate limits, and `delegation.granted` / `delegation.revoked` activity events.
- Added Staff page grant/revoke controls, active temporary access list, staff counts, and a cashier-side temporary access banner.
- Added tests covering migration hardening, delegatable scope helpers, database-backed active/expired/revoked permission checks, direct Server Action abuse, delegated inventory action attribution in the action path, and live RLS isolation.

Rollback note:
- Disabling delegation checks should revert cashiers to baseline cashier permissions.

### Slice 7: Delegated Action Coverage

Goal: apply temporary delegation to real boutique workflows.

Scope:
- Enable selected delegated actions:
  - inventory adjustment
  - catalog edit
  - product import
  - limited settings update, if approved
- Include activity event with delegation id and grantor.

Out of scope:
- Full enterprise RBAC.
- Payroll, shifts, biometric clock-in, or unrelated HR features.

Database:
- Add missing entity-specific indexes only if query plans require them.

Server:
- Every delegated mutation must write:
  - actor user
  - actor role
  - delegation id
  - grantor user
  - changed entity
  - result

UI:
- On delegated forms, show "Acting with temporary owner access" without making the app feel scary.

Tests:
- Delegated catalog update succeeds.
- Non-delegated catalog update fails.
- Event log clearly shows delegated authority.

Confirmation:
- Owner can distinguish "cashier sold item" from "cashier edited catalog using temporary permission from owner".

Implementation status:
- Implemented locally for `inventory.adjust` and `catalog.manage`.
- Active cashier delegations are refreshed into client state during session initialization and store sync. The Inventory page shows stock adjustment controls only when an active `inventory.adjust` delegation exists, and catalog add/import/edit/delete/favorite controls only when an active `catalog.manage` delegation exists.
- `requirePrivilege()` carries the delegation grantor user id into the action context when a database-backed delegation authorizes the request.
- `adjustStockAction()` uses the normal user-scoped Supabase path for role-based owner access, but uses the server/admin client for delegated inventory writes after `requirePrivilege("inventory.adjust")`, variant ownership validation, and rate limiting.
- Catalog create/update/import/delete/favorite actions keep owner behavior on the existing owner-gated RPC/RLS paths, but delegated cashier behavior uses new service-role-only internal RPCs after `requirePrivilege("catalog.manage")`. Those RPCs revalidate the active `catalog.manage` delegation, actor, grantor, store, and target ownership in SQL before writing.
- Inventory and catalog activity events now include `privilegeSource: "delegation"`, the delegation id, grantor user id metadata, delegated summary copy, and the Activity Log displays delegated events with a delegated badge.
- The current Staff grant form/action and database-backed action lookup expose only proven delegated action scopes: `catalog.manage` and `inventory.adjust`. Report export and invoice correction remain modeled but unreleased.
- Verified with focused capability/permission/action/migration tests (4 files, 51 tests), full Vitest (17 files, 153 tests), live RLS verification, Supabase DB reset/lint/migration list, direct SQL function-grant proof, lint, build, Chromium Playwright, `git diff --check`, and npm audit.
- Reports, invoice correction, and settings delegation remain pending and should not be exposed until their write paths are explicitly proven.

Rollback note:
- Disable delegated action buttons if any permission ambiguity appears.

### Slice 8: Beta V1.1 Release Proof

Goal: prove the whole feature is safe enough for beta users.

Scope:
- Run full gates locally.
- Run production-like preview against dev/staging backend if available.
- Update README and Memory with final V1.1 status.

Out of scope:
- New feature development.

Database:
- Supabase migration list clean.
- Supabase lint/advisor findings reviewed.

Server:
- Confirm no service-role usage leaks to client.
- Confirm all sensitive Server Actions verify authz.

UI:
- Owner-first flow still simple.
- Staff features are discoverable but optional.

Tests:
- `npm run lint`
- `npm run build`
- `npm test`
- `npm run test:e2e`
- `npm audit --audit-level=high`
- Supabase migration and lint commands against the intended dev/staging target.

Confirmation:
- We can explain exactly what changed from Beta V1 to V1.1 and prove it through tests.

Implementation status:
- Passed locally on `beta/v1.1` at 2026-05-26 08:27 NPT with no public API, schema, permission-scope, or UI capability changes.
- Gate passed: `git status -sb`, `supabase status`, `supabase db reset --local`, `supabase migration list --local`, `supabase db lint --local --fail-on error`, `supabase db advisors --local --type all --level warn --fail-on error`, focused staff/action/migration tests, live RLS verification, full `npm test`, `npm run lint`, `npm run build`, Chromium Playwright, `npm run audit`, and `git diff --check`.
- Delegated catalog RPC grant proof passed: all delegated catalog helper functions are `SECURITY INVOKER`, not executable by `anon` or `authenticated`, and executable by `service_role`.
- Supabase advisors returned warning-level findings only: older RLS initplan performance warnings, split owner/cashier permissive `SELECT` policy warnings for staff activity/delegation tables, and mutable search-path warnings on older audit helper functions. No advisor error blocked release proof.
- No `supabase db push --linked`, linked Supabase migration/lint/advisor command, or production backend command was run.

Rollback note:
- V1 production remains `main` and tag `beta-v1.0-live`.

## 5. FIRST PHASE PLANNING DECISION

The first implementation phase should contain only Slices 0 through 3:

1. Development guardrails.
2. Durable activity event foundation.
3. Invoice attribution.
4. Owner activity log page.

This gives the app accountability before it adds staff invitation and temporary privilege power. It also creates immediate value for owners: they can see who sold or changed what, even before the full delegation system exists.

## 6. WHEN TO STOP A SLICE

Stop the current slice and do not continue if:

- RLS behavior is unclear.
- A Server Action can be called without authz.
- A browser client can write to protected tables directly.
- The feature works locally only because of service-role bypass.
- The UI shows a permission the database does not enforce.
- Tests require production data to pass.

These are not polish issues. They are release blockers.

## 7. NEXT IMMEDIATE ACTION

Review the local Slice 8 release-proof commit and decide whether to push `beta/v1.1` for preview/QA.

Keep V1.1 staff scope frozen at `catalog.manage` and `inventory.adjust` until release approval. Reports export, invoice correction, and settings delegation should remain unreleased until a separate slice proves their write paths, UI affordances, activity proof, and tests.
