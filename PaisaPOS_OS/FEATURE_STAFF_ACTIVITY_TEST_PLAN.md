# TEST AND CONFIRMATION PLAN: STAFF, ACTIVITY, AND ACCOUNTABILITY

Version: 1.0  
Status: PLANNED  
Last Updated: 2026-05-25

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

- owner passes `catalog.manage`
- owner passes `staff.manage`
- active cashier passes `checkout.create`
- cashier fails `catalog.manage` without delegation
- cashier passes `catalog.manage` with active delegation
- cashier fails when delegation is expired
- cashier fails when delegation is revoked
- suspended cashier fails every scope
- deleted/missing profile fails every scope

## Activity serializer tests

Test `recordActivityEvent`:

- redacts sensitive keys
- rejects oversized metadata
- stores actor snapshot
- stores delegation id when present
- rejects missing store id
- rejects missing target type
- rejects invalid action names if using enum/allowlist

## Staff invite validation tests

- invalid email rejected
- role other than cashier rejected
- duplicate pending invite rejected
- inviting self rejected
- cross-store invite rejected
- expired invite rejected on accept

---

# 5. DATABASE/RLS TESTS

Use live local Supabase tests similar to existing `rls-verification.test.ts`.

## Staff invitation isolation

Create:

- owner A/store A
- owner B/store B
- cashier email C

Assertions:

- owner A can create invite for C into store A
- owner B cannot read store A invite
- cashier C cannot accept invite if signed in as a different email
- cashier C cannot change invite store id
- owner B cannot revoke owner A invite

## Activity isolation

Assertions:

- owner A can read store A activity
- owner A cannot read store B activity
- cashier A can read own activity only
- cashier A cannot insert activity directly
- cashier A cannot update/delete activity directly
- service/server path can record activity

## Delegation isolation

Assertions:

- owner A can grant cashier A `inventory.adjust`
- cashier A can adjust stock through Server Action during active delegation
- cashier A cannot mutate product table directly through Data API
- cashier A cannot grant delegation
- cashier A cannot add `staff.manage`
- owner B cannot revoke delegation from store A
- revoked delegation denies the next action
- expired delegation denies the next action

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

- cashier attempts `insert` into `activity_events` -> denied
- cashier attempts `insert` into `privilege_delegations` -> denied
- cashier attempts `update users set role='owner'` -> denied
- cashier attempts `update products` without delegation through Data API -> denied or not relied on
- owner from another store attempts to read invite/activity -> denied

## Server Action abuse

Call actions programmatically:

- missing auth -> denied
- wrong store id -> denied
- tampered invitation id -> denied
- expired delegation -> denied
- revoked delegation -> denied
- forged role payload -> ignored
- forged actor id payload -> ignored

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

