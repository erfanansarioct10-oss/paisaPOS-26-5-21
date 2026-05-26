# TEST AND CONFIRMATION PLAN: STAFF, ACTIVITY, AND ACCOUNTABILITY

Version: 1.1
Status: IN PROGRESS - SLICES 1-6 VERIFIED, SLICE 7 INVENTORY AND CATALOG PASSES VERIFIED LOCALLY
Last Updated: 2026-05-26 08:03 NPT

---

# 1. TESTING GOAL

This plan proves that Beta V1.1 staff/accountability features are:

- correct for boutique workflows
- secure against privilege escalation
- tenant isolated
- privacy-aware
- production-safe
- explainable to store owners

Testing must happen on local/dev Supabase first.

Current progress snapshot:

| Area | Status | Proof |
|---|---|---|
| Slice 1 activity foundation | Verified locally | Migration, helper tests, live RLS tests, business action logging wiring |
| Slice 2 sold-by attribution | Verified locally | Live checkout/RLS tests for owner, cashier, and spoof denial |
| Slice 3 owner Activity page | Verified locally | DAL helper tests, activity RLS pagination, Playwright Activity smoke |
| Slice 4 staff directory/invites | Verified locally | Staff migration hardening, invitation RLS, suspended cashier denial, Playwright Staff smoke |
| Slice 5 permission helper | Verified locally | Central helper, shared UI capability flags, selected Server Action rewiring, permission matrix tests, and direct Server Action abuse tests |
| Slice 6 delegation foundation | Verified locally | Delegation schema/RLS, owner grant/revoke actions, database-backed `requirePrivilege()`, Staff UI controls, cashier banner, migration/action/RLS tests |
| Slice 7 delegated action coverage | Mostly verified locally | Inventory adjustment plus catalog create/update/import/delete/favorite now work through delegated UI/state, Server Action authz, service-role-only internal RPCs, and activity delegation proof; reports/invoice/settings delegation remain pending |
| Slice 8 release proof | Not started | Runs after feature/test coverage is complete |

Latest local gate status:

```bash
npm run lint                                      # passed
npm run build                                     # passed
npx vitest run src/lib/__tests__/staff-capabilities.test.ts src/lib/server/__tests__/permissions.test.ts src/app/__tests__/server-action-permissions.test.ts src/lib/__tests__/migration-hardening.test.ts
                                                  # passed: 4 files, 51 tests
npx vitest run src/lib/store/__tests__/rls-verification.test.ts --sequence.concurrent=false
                                                  # passed: 1 file, 4 live RLS tests
npm test                                          # passed: 17 files, 153 tests
npm run test:e2e -- --project=chromium            # passed: 17 tests
supabase db reset --local                         # passed through 20260526020902_add_delegated_catalog_actions.sql
supabase db lint --local --fail-on error          # passed: no schema errors
supabase migration list --local                   # local migration list includes 20260526020902
supabase db query --local <function grant check>  # passed: delegated catalog RPCs are service_role-only and SECURITY INVOKER
git diff --check                                  # passed: CRLF warnings only
npm audit --audit-level=high                      # passed: 0 vulnerabilities
```

Production rule:

```text
Do not run supabase db push --linked for V1.1 until the local test gate and release approval are complete.
```

---

# 2. ENVIRONMENT SETUP

## Required lanes

| Lane | Purpose | Supabase |
|---|---|---|
| `main` | live Beta V1 | production linked project |
| `beta/v1.1` | V1.1 development | local/dev Supabase |
| Vercel preview for `beta/v1.1` | future preview QA | currently protected by placeholder backend envs |

## Local setup commands

```bash
git switch beta/v1.1
supabase status
supabase db reset
npm install
npm run lint
npm run build
```

If local Supabase is not running:

```bash
supabase start
```

---

# 3. MIGRATION CONFIRMATION

After creating the V1.1 migration locally:

```bash
supabase db reset
supabase migration list --local
supabase db lint --local --fail-on error
```

Expected:

- migration applies from scratch
- no lint error-level findings
- RLS enabled on new public tables
- direct DML grants are not accidentally broad
- no unsafe public function execution on privileged functions

## SQL checks

```sql
select relname, relrowsecurity
from pg_class
where relname in (
  'staff_invitations',
  'privilege_delegations',
  'activity_events'
);
```

Expected:

```text
relrowsecurity = true for all three
```

Check direct grants:

```sql
select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('staff_invitations', 'privilege_delegations', 'activity_events')
order by table_name, grantee, privilege_type;
```

Expected:

- `authenticated` can select according to policies
- no broad authenticated insert/update/delete on activity/delegation
- service role/admin paths remain available server-side

---

# 4. UNIT TESTS

## Permission helper tests

Add tests for `requirePrivilege`:

- [x] owner passes `catalog.manage`
- [x] owner passes `staff.manage`
- [x] active cashier passes `checkout.create`
- [x] cashier fails `catalog.manage` without delegation
- [x] cashier passes `catalog.manage` with active delegation in the pure decision model
- [x] cashier fails when delegation is expired in the pure decision model
- [x] cashier fails when delegation is revoked in the pure decision model
- [x] cashier passes a delegatable scope through database-backed `requirePrivilege()` lookup
- [x] database-backed `requirePrivilege()` checks currently released delegated action scopes (`catalog.manage`, `inventory.adjust`) while report/invoice scopes remain modeled but unreleased
- [x] expired delegation fails in database-backed `requirePrivilege()` lookup
- [x] revoked delegation fails in database-backed `requirePrivilege()` lookup
- [x] suspended cashier fails every scope
- [x] deleted/missing profile fails every scope

## UI capability helper tests

- [x] active owner maps to catalog, inventory, staff, activity, store settings, checkout, and profile capabilities
- [x] active cashier maps only to checkout and profile baseline capabilities
- [x] suspended or missing profile maps to no UI capabilities
- [x] delegatable scope list excludes staff and activity management
- [x] current temporary access grant surface exposes only proven delegated action scopes: `catalog.manage` and `inventory.adjust`
- [x] Inventory add/import/edit/delete/favorite controls render from `canManageCatalog`
- [x] Inventory stock adjustment controls render from `canAdjustInventory`
- [x] Sidebar Staff and Activity links render from `canManageStaff` and `canReadActivity`
- [x] Store settings form renders from `canManageStoreSettings`; profile update remains available through `canUpdateProfile`
- [x] Staff page renders grant temporary access controls for active cashiers
- [x] Staff page renders active temporary access records with revoke controls
- [x] Cashier shell renders a temporary access banner from own active delegation reads
- [x] Cashier Inventory page shows catalog controls only when an active `catalog.manage` delegation exists
- [x] Cashier Inventory page shows stock adjustment controls only when an active `inventory.adjust` delegation exists

## Activity serializer tests

Test `recordActivityEvent`:

- [x] redacts sensitive keys
- [x] bounds oversized metadata
- [x] stores actor snapshot
- [x] stores delegation id when present
- [ ] rejects missing store id
- [ ] rejects missing target type
- [ ] rejects invalid action names if using enum/allowlist

## Staff invite validation tests

- [ ] invalid email rejected by direct action test
- [x] role other than cashier rejected by schema/database design
- [x] duplicate pending invite rejected by unique pending invite index
- [x] inviting self rejected by Server Action
- [x] cross-store invite visibility denied by live RLS test
- [ ] expired invite rejected on accept by direct action/live test

---

# 5. DATABASE/RLS TESTS

Use live local Supabase tests similar to existing `rls-verification.test.ts`.

## Staff invitation isolation

Create:

- owner A/store A
- owner B/store B
- cashier email C

Assertions:

- [x] owner A can create invite for C into store A through server/admin path
- [x] owner B cannot read store A invite
- [ ] cashier C cannot accept invite if signed in as a different email
- [x] cashier C cannot change invite store id through direct browser DML
- [ ] owner B cannot revoke owner A invite through Server Action

## Activity isolation

Assertions:

- [x] owner A can read store A activity
- [x] owner A cannot read store B activity
- [x] cashier A can read own activity only
- [x] cashier A cannot insert activity directly
- [x] cashier A cannot update/delete activity directly
- [x] service/server path can record activity

## Delegation isolation

Assertions:

- [x] owner A can grant cashier A `inventory.adjust` or `catalog.manage`
- [x] owner grant action rejects unreleased scopes such as `reports.export` before admin writes
- [x] cashier A can adjust stock through Server Action during active delegation using the delegated-safe server write path
- [x] cashier A can create/update/import/delete/favorite catalog products through Server Actions during active `catalog.manage` delegation using service-role-only internal RPCs
- [x] cashier A cannot mutate product table directly through Data API
- [x] cashier A cannot grant delegation
- [x] cashier A cannot add `staff.manage`
- [x] owner B cannot read delegation from store A through RLS
- [x] revoked delegation denies the next action in the action permission path
- [x] expired delegation denies the next action in the action permission path

---

# 6. SERVER ACTION INTEGRATION TESTS

## Staff actions

Target actions:

- `inviteStaffAction`
- `acceptStaffInviteAction`
- `revokeStaffInviteAction`
- `suspendStaffAction`
- `reactivateStaffAction`

Expected:

- all require active owner except accept
- all validate input via Zod
- all rate-limit
- all write activity events
- expected errors return form state
- no action returns raw Supabase Auth Admin objects

## Activity actions

Target:

- `getActivityTimelineDTO`
- future export action

Expected:

- owner receives paginated store activity
- cashier receives own activity only
- cursor pagination stable under identical timestamps
- filters do not bypass tenant scope

## Business action rewiring

Existing actions must be updated to log durable activity:

- `checkoutAction`
- `upsertProductAction`
- `bulkUpsertProductsAction`
- `deleteProductAction`
- `adjustStockAction`
- `toggleProductFavoriteAction`
- `updateStoreAction`
- `updateProfileAction`

Expected:

- action succeeds
- activity event exists
- event actor is correct
- event privilege source is correct
- failure event exists where relevant

---

# 7. PLAYWRIGHT E2E TESTS

## Owner staff workflow

1. owner logs in
2. owner opens Staff page
3. owner invites cashier
4. pending invite appears
5. owner sees `staff.invited` activity

## Cashier acceptance

1. cashier opens invite accept link/session
2. cashier accepts invite
3. cashier lands in dashboard
4. sidebar shows role as Cashier
5. inventory owner buttons are hidden
6. billing checkout works

## Sold-by proof

1. cashier creates invoice
2. owner logs in
3. owner opens invoice history
4. invoice shows "Sold by <cashier name>"
5. owner opens Activity
6. checkout activity shows same actor

## Delegation workflow

1. owner grants `inventory.adjust` for 2 hours
2. cashier sees delegation banner
3. cashier adjusts stock
4. activity shows cashier actor, owner grantor, and delegation id
5. owner revokes delegation
6. cashier tries another adjustment
7. action is denied
8. denial is visible and/or logged

## Mobile checks

Test 320px and tablet widths:

- Staff page forms fit
- Activity cards do not overlap
- role/delegation banners do not hide checkout controls
- buttons remain 44px touch targets

---

# 8. SECURITY TESTS

## Direct REST abuse

Using anon/authenticated Supabase client:

- [x] cashier attempts `insert` into `activity_events` -> denied
- [x] cashier attempts `insert` into `privilege_delegations` -> denied
- [x] cashier attempts `update users set role='owner'` -> denied
- [x] cashier attempts `update products` without delegation through Data API -> denied or not relied on
- [x] owner from another store attempts to read invite/activity/delegation -> denied

## Server Action abuse

Call actions programmatically:

- [x] missing auth -> denied before privileged side effects
- [x] wrong store id -> denied before checkout RPC access
- [ ] tampered invitation id -> denied for owner cross-store lifecycle action
- [x] expired delegation -> denied in database-backed action path
- [x] revoked delegation -> denied in database-backed action path
- [x] forged role payload -> ignored
- [x] forged actor id payload -> ignored
- [x] active cashier direct calls to catalog/import/delete/favorite/inventory/store/staff management actions are denied before business mutation/rate-limit/activity side effects unless backed by an active released delegation
- [x] active delegated cashier inventory adjustment writes activity with `privilegeSource: "delegation"`, delegation id, and grantor user id metadata
- [x] active delegated cashier catalog create/update/import/delete/favorite actions write activity with `privilegeSource: "delegation"`, delegation id, and grantor user id metadata
- [x] suspended cashier direct checkout is denied before checkout RPC access
- [x] active cashier direct checkout and profile update still succeed with `cashier_role` activity attribution

## Log privacy

Generate activity events with suspicious values:

- email in metadata
- fake token fields
- newline/log injection attempt
- long text fields

Expected:

- sensitive keys redacted or rejected
- newlines sanitized
- metadata size bounded
- no service key/session/cookie appears

---

# 9. PERFORMANCE TESTS

## Activity timeline query

Seed:

- 10 users
- 10,000 activity events in one store
- 10,000 activity events in another store

Queries:

```sql
explain analyze
select *
from public.activity_events
where store_id = '<store>'
order by occurred_at desc, id desc
limit 50;
```

Expected:

- uses `activity_events_store_time_idx`
- stable under cursor pagination
- no full-table scan across tenants

## Delegation check query

Seed:

- many expired delegations
- a few active delegations

Expected:

- active check uses partial index
- no significant slowdown on product/stock actions

---

# 10. CONFIRMATION GATE

Before merging V1.1 into `main`:

```bash
npm run lint
npm run build
npm test
npm run test:e2e
npm audit --audit-level=high

supabase db reset
supabase db lint --local --fail-on error
```

If testing against a remote staging project later:

```bash
supabase migration list --linked
supabase db push --dry-run
supabase db lint --linked --fail-on error
supabase db advisors --linked
```

Do not run linked commands against production during active V1.1 development.

---

# 11. ACCEPTANCE CRITERIA

V1.1 Staff + Activity can be considered beta-ready only when:

- owner can invite cashier
- cashier can accept and use POS
- cashier cannot access owner-only tools
- owner can suspend/reactivate cashier
- owner can see activity timeline
- invoices show sold-by attribution
- activity shows actor and role
- delegated access works only within active scope/time
- revocation takes effect immediately
- all privileged actions are logged durably
- audit/activity tables are immutable to browser clients
- no production backend is used by V1.1 preview/dev testing
- release gates pass
