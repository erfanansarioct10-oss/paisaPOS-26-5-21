# STAFF MANAGEMENT AUDIT FIX PLAN

Status: SM-AUDIT-01 through SM-AUDIT-14 patched locally; full release gate still pending
Last updated: 2026-05-27

---

# 1. PURPOSE

This document is the shared handoff plan for staff-management audit fixes.

It records:

- the audit issues that can affect security, integrity, scalability, or maintainability
- the release decision for Vercel Preview, external beta, and production
- the required implementation approach for each issue
- the verification gate every agent must satisfy before marking work complete
- a proof log that future agents must update after each fix

This is intentionally documentation-only. It does not change code, migrations, tests, or Supabase state.

---

# 2. RELEASE DECISION

Current decision:

```text
Do not move Staff Management V1.1 to production with real staff/account usage until the production blockers in this document are fixed and verified.
```

Allowed now:

```text
Vercel Preview and internal testing may continue with staging/dev data only.
```

Not allowed yet:

```text
Do not treat the staff-management feature as production-ready.
Do not test with real customer staff accounts until production blockers are fixed.
Do not run linked Supabase production changes for these fixes without release approval.
```

External beta with real staff/accounts should wait until:

- every production blocker is fixed
- focused tests pass for each fixed issue
- local Supabase/RLS proof is recorded
- Vercel Preview is pointed only at a non-production backend

Production should wait until:

- production blockers are fixed
- core external-beta fixes are complete or explicitly accepted as known risk
- the verification gate in this document passes
- release approval is recorded

---

# 3. ISSUE PRIORITY MATRIX

| ID | Issue | Priority | Release status |
|---|---|---:|---|
| SM-AUDIT-01 | Delegated inventory writes bypass database revalidation | Production blocker | Patched and verified locally |
| SM-AUDIT-02 | Delegation grant is not transactionally safe | Production blocker | Patched and verified locally |
| SM-AUDIT-03 | Invite acceptance can partially mutate Auth user before DB acceptance succeeds | Production blocker | Patched and verified locally |
| SM-AUDIT-04 | Suspending staff does not revoke active temporary delegations | Production blocker | Patched and verified locally |
| SM-AUDIT-05 | Privileged delegated writes and activity logging are not transactionally coupled | Production blocker | Patched and verified locally |
| SM-AUDIT-06 | Staff invite acceptance lacks dedicated rate limiting | Production blocker | Patched and verified locally |
| SM-AUDIT-07 | Invite accept UI/session flow is fragile | Fix before external beta | Patched and verified locally |
| SM-AUDIT-08 | Staff management DTO/list rendering needs pagination and scale cleanup | Fix before external beta | Patched and verified locally |
| SM-AUDIT-09 | Missing FK/search indexes and activity search scaling improvements | Fix before external beta | Patched and verified locally |
| SM-AUDIT-10 | Integration and Playwright coverage gaps remain | Fix before external beta | Patched and verified locally |
| SM-AUDIT-11 | `src/lib/schema.sql` is stale | Can wait after beta | Patched and targeted-verified locally |
| SM-AUDIT-12 | Authorization helper centralization cleanup | Can wait after beta | Patched and targeted-verified locally |
| SM-AUDIT-13 | Destructive action confirmations are missing | Can wait after beta | Patched and targeted-verified locally |
| SM-AUDIT-14 | Minor staff directory polish | Can wait after beta | Patched and targeted-verified locally |

---

# 4. PRODUCTION BLOCKERS

## SM-AUDIT-01: Delegated Inventory Writes Bypass Database Revalidation

Risk:

Delegated inventory adjustment is authorized in the Server Action, then performs a service-role write directly. That bypasses the database-side revalidation pattern already used by delegated catalog RPCs.

Required fix:

- Create a service-role-only SQL RPC for delegated inventory adjustment.
- The RPC must validate actor user id, store id, staff status, delegation id, delegation scope, expiry, revocation state, and target inventory ownership before updating stock.
- The Server Action must call this RPC instead of directly updating `inventory` with the service-role client.
- The RPC must reject stale, revoked, expired, cross-store, wrong-scope, and wrong-actor delegation attempts.

Completion proof:

```text
[x] Migration applies locally
[x] RPC grants are service-role-only
[x] Live RLS/RPC tests prove valid delegated adjustment succeeds
[x] Live RLS/RPC tests prove revoked, expired, cross-store, and wrong-scope delegation fails
[x] Activity event includes delegated actor and delegation id in Server Action tests
```

## SM-AUDIT-02: Delegation Grant Is Not Transactionally Safe

Risk:

Grant creation and activity logging can drift. A grant may become active without durable proof if activity logging fails, and concurrent grants can race.

Required fix:

- Move delegation grant creation and activity event insertion into one SQL transaction/RPC.
- Add an active-overlap constraint or locking strategy for same store, staff member, and scope.
- Keep step-up proof validation server-side and consume proof before or inside the transactional grant boundary.
- Return clean expected errors for duplicate active grants, invalid staff status, expired proof, or cross-store attempts.

Completion proof:

```text
[x] Transactional grant RPC applies locally
[x] Duplicate active grant race cannot create overlapping active delegations
[x] Activity event is inserted in the same transaction as the grant
[x] Failed activity insert rolls back the grant
[x] Focused Server Action tests pass
```

## SM-AUDIT-03: Invite Acceptance Can Partially Mutate Auth User

Risk:

The accept flow can update Supabase Auth password/metadata before the database invite acceptance succeeds. If the DB acceptance later rejects the invite, the Auth user can be changed without a matching accepted staff profile.

Required fix:

- Prefer DB validation/consumption before Auth user mutation where product flow allows it.
- If Auth mutation must happen first, add explicit compensation for DB rejection.
- Ensure expired, revoked, wrong-email, already-accepted, cross-store, and tampered invitation ids cannot leave partial state.
- Keep expected failures user-friendly and avoid exposing raw Supabase errors.

Completion proof:

```text
[x] Expired invite does not mutate Auth user
[x] Revoked invite does not mutate Auth user
[x] Wrong-email invite does not mutate Auth user
[x] Already accepted invite is denied cleanly
[x] Successful acceptance creates/updates exactly one intended cashier profile
```

## SM-AUDIT-04: Suspending Staff Does Not Revoke Active Delegations

Risk:

Suspending a cashier updates staff status but can leave temporary delegations active. If the cashier is reactivated before expiry, old temporary access can return unexpectedly.

Required fix:

- Update the suspend lifecycle RPC/transaction to revoke all active delegations for the suspended staff member.
- Record revocation metadata and activity in the same lifecycle transaction.
- Reactivation must not restore old temporary delegations.
- Existing active delegations for a suspended user should be treated as invalid even before cleanup.

Completion proof:

```text
[x] Suspend revokes active delegations in the same transaction
[x] Reactivation does not restore revoked temporary access
[x] Suspended cashier cannot use delegated inventory or catalog actions
[x] Activity timeline records suspend and delegation revocation proof
```

## SM-AUDIT-05: Privileged Writes And Activity Logging Are Not Transactionally Coupled

Risk:

Delegated catalog/inventory writes can succeed while activity logging fails later. That weakens owner accountability for privileged actions.

Required fix:

- For delegated catalog and inventory writes, couple the business mutation and `activity_events` insert in one database transaction.
- Prefer service-role-only RPCs that validate delegation and write the activity event before commit.
- Treat activity logging as required for privileged delegated mutations, not best effort.
- Keep non-privileged low-risk activity logging behavior separate if needed.

Completion proof:

```text
[x] Delegated catalog mutation and activity insert commit together
[x] Delegated inventory mutation and activity insert commit together
[x] Simulated activity failure prevents the privileged mutation
[x] Activity metadata includes actor, grantor, scope, and delegation id
```

## SM-AUDIT-06: Staff Invite Acceptance Lacks Dedicated Rate Limiting

Risk:

Invite acceptance is an externally reachable account-transition path. Without dedicated throttling, it is easier to brute-force, spam, or abuse.

Required fix:

- Add `enforceRateLimit` to the invite acceptance Server Action.
- Key the rate limit by authenticated user id and invitation id.
- Include IP or request fingerprint if the existing limiter supports it safely.
- Preserve expected UX for legitimate repeated form submission.

Completion proof:

```text
[x] Repeated acceptance attempts are throttled
[x] Valid single acceptance remains unaffected
[x] Rate-limit denial does not mutate Auth or DB state
[x] Tests cover the throttled path
```

---

# 5. EXTERNAL BETA FIXES

## SM-AUDIT-07: Invite Accept UI And Session Flow

Required fix:

- Preserve `/staff/accept?...` return context through login.
- Avoid reading `window.location.hash` during initial render in a way that can cause hydration mismatch.
- Add a clear switch-account or sign-out path when the authenticated email does not match the invite.
- Keep invite acceptance reachable for authenticated users who do not yet have a store profile.

Completion proof:

```text
[x] Staff accept sign-in links use a safe `/?next=/staff/accept?...` return path
[x] Login returns invited users to `/staff/accept?...` without requiring an existing store profile
[x] Staff accept page no longer reads `window.location.hash` during initial render
[x] Mismatched signed-in users see a clear switch-account path
[x] Playwright covers mismatched account context and manual invited-user return-to-accept flow
```

## SM-AUDIT-08: Staff Management Scale Cleanup

Required fix:

- Add pagination or bounded queries for staff, invitations, and active delegations.
- Avoid deriving counts from truncated invitation lists.
- Avoid rendering the same staff list twice for desktop/mobile when a shared responsive structure can do the job.
- Use Zustand selectors or narrower subscriptions for staff page callbacks.

Completion proof:

```text
[x] Staff, invitation, and active delegation reads are bounded and page independently
[x] Staff dashboard counts are exact count queries, not derived from truncated lists
[x] Active delegation names are resolved even when the related staff user is not on the current staff page
[x] Staff directory renders each row/action form once with a responsive shared structure
[x] Staff/activity tab callbacks use narrow Zustand selectors
[x] Playwright covers the owner staff page and suspension workflow after the responsive cleanup
```

## SM-AUDIT-09: Indexing And Activity Search Scale

Required fix:

- Add missing indexes for FK/filter columns used by staff, delegation, invitation, and activity queries.
- Review `activity_events` search and replace broad multi-column `%term% ILIKE` scans with trigram or full-text search when log volume grows.
- Confirm query plans with representative activity and staff data.

Completion proof:

```text
[x] Activity search uses generated full-text `search_vector` instead of multi-column `%term% ILIKE`
[x] Store-scoped activity search has a composite GIN index with `btree_gin` installed in `extensions`
[x] Staff, invitation, delegation, and staff/activity FK paths have targeted indexes
[x] Representative activity plan uses `idx_activity_events_store_search_vector` at 100k rows
[x] Representative staff, invitation, and active delegation plans use the new paging indexes
[x] Supabase lint/advisors pass with only existing documented warnings
```

## SM-AUDIT-10: Integration And Playwright Coverage Gaps

Required fix:

- Add live Supabase/RLS tests for invite acceptance, delegation grants, inventory delegation, suspension, revocation, and activity logging.
- Add Playwright coverage for unauthorized cashier `/staff` access, invite acceptance, wrong-email flow, stale delegation expiry, suspension, and revocation.
- Add component or browser coverage for staff accept hydration/session behavior.

Completion proof:

```text
[x] Live Supabase/RLS tests cover invite acceptance, wrong-email denial, rollback compensation, and service-role-only execution
[x] Live Supabase/RLS tests cover delegation grant proof consumption, activity logging, and active-overlap protection
[x] Live Supabase/RLS tests cover delegated inventory ownership revalidation, direct-call denial, revocation, and transactional activity proof
[x] Live Supabase/RLS tests cover staff suspension revoking active delegations with activity proof
[x] Playwright covers staff accept context under mismatched signed-in session
[x] Playwright covers owner suspension UI and verifies active temporary access is cleared
```

---

# 6. POST-BETA CLEANUP

## SM-AUDIT-11: Stale `src/lib/schema.sql`

Required cleanup:

- Update or clearly deprecate the stale schema snapshot.
- Ensure it does not instruct agents or developers to paste unsafe old SQL into Supabase.

Implemented cleanup:

- Replaced `src/lib/schema.sql` with a non-executable deprecation notice that points developers to `supabase/migrations/` and `supabase db reset --local`.
- Added a static regression test that rejects the old pasteable DDL wording and executable `create table` / `create or replace function` content.

## SM-AUDIT-12: Authorization Helper Centralization

Required cleanup:

- Keep owner-only and delegated privilege checks routed through central helpers where possible.
- Reduce future drift between `requireOwnerContext()`, `requirePrivilege()`, and staff/activity route behavior.

Implemented cleanup:

- Routed staff and activity pages through `requirePrivilege("staff.manage")` / `requirePrivilege("activity.read")`.
- Added DAL-side role-privilege assertion helpers so server DTO functions still protect direct imports without duplicating route-only checks.
- Kept owner-only DTO fallback checks tied to the shared role privilege matrix.

## SM-AUDIT-13: Destructive Action Confirmations

Required cleanup:

- Add confirmation affordances for suspend staff, revoke invite, and revoke delegation.
- Keep copy operational and concise.

Implemented cleanup:

- Added typed confirmations for suspend staff, revoke invite, and revoke temporary access in the staff-management UI.
- Added matching Server Action validation so direct action POSTs cannot bypass the confirmation requirement.
- Updated unit and Playwright coverage for the new confirmation flow.

## SM-AUDIT-14: Staff Directory Polish

Required cleanup:

- Clarify suspend vs remove wording.
- Decide whether owners should see cashier email addresses in the staff directory.
- Make unavailable staff-email states intentional and documented.

Implemented cleanup:

- Changed destructive action labels to `Suspend access`, `Revoke invite`, and `Revoke access`.
- Decided owners may see cashier emails when the email is available from an accepted staff invitation or the current authenticated session.
- Replaced the vague `Unavailable` email state with an intentional `No invite email recorded` fallback.

---

# 7. IMPLEMENTATION ORDER

Recommended order:

1. SM-AUDIT-01: move delegated inventory adjustment into a validating RPC.
2. SM-AUDIT-05: transactionally couple delegated privileged writes with activity logging.
3. SM-AUDIT-02: move delegation grant and activity logging into one transaction with overlap protection.
4. SM-AUDIT-04: revoke active delegations during staff suspension.
5. SM-AUDIT-03: remove partial Auth mutation risk from invite acceptance.
6. SM-AUDIT-06: add invite acceptance rate limiting.
7. SM-AUDIT-10: add focused live Supabase/RLS and Playwright coverage for the fixed blockers.
8. SM-AUDIT-07: harden invite accept UI/session flow before external beta.
9. SM-AUDIT-08 and SM-AUDIT-09: add pagination, indexes, and search scalability work.
10. SM-AUDIT-11 through SM-AUDIT-14: complete post-beta cleanup.

Reasoning:

- Inventory and activity integrity are highest risk because they affect stock trust and accountability.
- Delegation grant/suspension fixes close privilege lifetime risks.
- Invite acceptance and rate limiting close account-transition risks.
- Test coverage must lock the behavior before external beta.
- Scale and cleanup work should follow once the core security model is stable.

---

# 8. VERIFICATION GATE

Run this gate before marking the staff-management audit fixes production-ready:

```bash
npm run lint
npm run build
npm test
npm run test:e2e -- --project=chromium
npm run audit
supabase db reset --local
supabase db lint --local --fail-on error
supabase db advisors --local --type all --level warn --fail-on error
```

Required targeted proof:

- invite acceptance live Supabase/RLS tests
- delegation grant transaction/race tests
- delegated inventory adjustment RPC tests
- staff suspension and delegation revocation tests
- delegated catalog/inventory activity atomicity tests
- invite acceptance rate-limit tests
- Playwright tests for invite accept, wrong-email flow, cashier denial, expiry, suspension, and revocation

Expected result:

```text
All required commands pass.
Advisor warnings, if any, are reviewed and recorded.
No linked production Supabase command is run during local verification.
Staging proof is recorded before production release.
```

---

# 9. PROOF LOG

Future agents must update this table when completing any fix.

| Date | Issue | Fix Status | Verification | Commit/PR |
|---|---|---|---|---|
| 2026-05-26 | SM-AUDIT-01 | Patched and verified locally | Added service-role-only `adjust_inventory_for_delegation` RPC, routed delegated `adjustStockAction` through it, added admin-client type coverage, and added unit/static tests. `npm test -- src/app/__tests__/server-action-permissions.test.ts src/lib/__tests__/migration-hardening.test.ts` passed. `npm run lint` passed. `npm run build` passed. `supabase db reset --local` passed. `supabase db lint --local --fail-on error` passed. `supabase db advisors --local --type all --level warn --fail-on error` passed with existing warnings recorded below. Live SQL proof passed for valid, wrong-scope, revoked, expired, wrong-actor, suspended-grantee, cross-store, and authenticated-role-denied cases. | pending |
| 2026-05-26 | SM-AUDIT-05 | Patched and verified locally | Added service-role-only `record_delegated_mutation_activity`, replaced delegated catalog/inventory RPC bodies so successful privileged delegated writes insert `activity_events` before commit, and removed duplicate app-side delegated success activity logging. `npm test -- src/app/__tests__/server-action-permissions.test.ts src/lib/__tests__/migration-hardening.test.ts` passed. `npm test` passed. `npm run lint` passed. `npm run build` passed. `supabase db reset --local` passed. `supabase db lint --local --fail-on error` passed. `supabase db advisors --local --type all --level warn --fail-on error` passed with existing warnings recorded below. Live SQL proof passed for delegated inventory/catalog activity metadata and simulated activity insert failure rolling the stock mutation back. | pending |
| 2026-05-26 | SM-AUDIT-02 | Patched and verified locally | Added service-role-only `grant_privilege_delegation` RPC that validates active owner/cashier, validates and consumes one-time AAL2 step-up proof, takes a transaction advisory lock by store/staff/scope, blocks overlapping active grants, inserts `privilege_delegations`, and inserts `activity_events` before commit. Routed `grantPrivilegeDelegationFormAction` through the RPC and removed direct app-side grant insertion/success logging. `npm test -- src/app/__tests__/server-action-permissions.test.ts src/lib/__tests__/migration-hardening.test.ts` passed. `npm test` passed. `npm run lint` passed. `npm run build` passed. `supabase db reset --local` passed. `supabase db lint --local --fail-on error` passed. `supabase db advisors --local --type all --level warn --fail-on error` passed with existing warnings recorded below. Live SQL proof passed for successful grant, duplicate-overlap denial, service-role-only execution, consumed/unused proof states, activity metadata, and simulated activity insert failure rolling back grant plus proof consumption. | pending |
| 2026-05-26 | SM-AUDIT-04 | Patched and verified locally | Added replacement service-role-only `suspend_staff_user` RPC body that revokes unexpired active delegations before changing cashier status, inserts `delegation.revoked` activity rows with `staff_suspension` metadata, inserts `staff.suspended` metadata with revoked delegation ids/scopes/count, and keeps reactivation from restoring revoked access. Added admin-client result typing plus unit/static tests. `npm test -- src/app/__tests__/server-action-permissions.test.ts src/lib/__tests__/migration-hardening.test.ts` passed. `npm test` passed. `npm run lint` passed. `npm run build` passed. `npm run audit` passed with 0 high vulnerabilities. `supabase db reset --local` passed. `supabase db lint --local --fail-on error` passed. `supabase db advisors --local --type all --level warn --fail-on error` passed with existing warnings recorded below. Live rollback SQL proof passed for service-role-only execute grants, simulated activity insert failure rolling back suspension and revocation, successful delegation revocation plus activity proof, and reactivation not restoring unexpired delegated access. | pending |
| 2026-05-26 | SM-AUDIT-03 | Patched and verified locally | Reordered `acceptStaffInviteFormAction` so the database `accept_staff_invitation` RPC succeeds before `supabase.auth.updateUser` mutates password/metadata, added service-role-only `rollback_staff_invitation_acceptance` compensation for post-DB Auth update failure, returned profile disposition/previous profile state from acceptance, and added a narrow session-flag bypass to `protect_user_store_id` only for restoring a detached profile during rollback. Unit tests prove DB invite denials do not call `updateUser`, success updates Auth after DB acceptance, and Auth failure calls rollback. `npm test -- src/app/__tests__/server-action-permissions.test.ts src/lib/__tests__/migration-hardening.test.ts` passed. `npm test` passed. `npm run lint` passed. `npm run build` passed. `npm run audit` passed with 0 high vulnerabilities. `supabase db reset --local` passed. `supabase db lint --local --fail-on error` passed. `supabase db advisors --local --type all --level warn --fail-on error` passed with existing warnings recorded below. Live rollback SQL proof passed for service-role-only execute grants, created-profile rollback, attached-profile rollback, rollback activity proof, and wrong-email DB rejection without invitation/profile mutation. | pending |
| 2026-05-26 | SM-AUDIT-06 | Patched and verified locally | Added dedicated `staffInviteAcceptLimiter` keyed by authenticated user id plus invitation id, added a second trusted-IP plus invitation bucket, enforced both in `acceptStaffInviteFormAction` before invite preview/admin access/DB acceptance/Auth mutation, and added unit coverage proving rate-limit denial stops all privileged side effects while a valid single acceptance still succeeds. `npm test -- src/app/__tests__/server-action-permissions.test.ts` passed. `npm test` passed. `npm run lint` passed. `npm run build` passed. `npm run audit` passed with 0 high vulnerabilities. `supabase db reset --local` passed. `supabase db lint --local --fail-on error` passed. `supabase db advisors --local --type all --level warn --fail-on error` passed with existing warnings recorded below. | pending |
| 2026-05-26 | SM-AUDIT-10 | Patched and verified locally | Added focused live Supabase/RLS coverage in `src/lib/store/__tests__/staff-audit-live.test.ts` for invite acceptance/rollback, service-role-only RPC execution, delegation proof consumption and overlap denial, delegated inventory ownership revalidation, explicit delegation revocation, staff suspension revoking active delegations, and owner-visible activity proof. Expanded `tests/e2e/staff-management.spec.ts` with DB-backed Playwright checks for mismatched invite accept context and owner suspension clearing active temporary access. `npm test -- src/lib/store/__tests__/staff-audit-live.test.ts` passed. `npm test` passed. `npm run lint` passed. `npm run build` passed. `npm run audit` passed with 0 high vulnerabilities. `npm run test:e2e -- --project=chromium tests/e2e/staff-management.spec.ts` passed. `npm run test:e2e -- --project=chromium` passed. `supabase db reset --local` passed. `supabase db lint --local --fail-on error` passed. `supabase db advisors --local --type all --level warn --fail-on error` passed with existing warnings recorded below. | pending |
| 2026-05-26 | SM-AUDIT-07 | Patched and verified locally | Added safe invite return helpers, changed the login page to preserve `/staff/accept?...` context through `?next=`, bypassed normal store-profile bootstrap for invited users returning to staff acceptance, removed initial-render hash reads from the staff accept page, and added a visible switch-account path for mismatched sessions. Added helper unit coverage and DB-backed Playwright coverage for manual invited-user sign-in returning to the accept page before profile creation. `npm test -- src/lib/__tests__/invite-redirect.test.ts` passed. `npm run test:e2e -- --project=chromium tests/e2e/staff-management.spec.ts` passed. `npm test` passed. `npm run lint` passed. `npm run build` passed. `npm run audit` passed with 0 high vulnerabilities. `npm run test:e2e -- --project=chromium` passed. `supabase db reset --local` passed. `supabase db lint --local --fail-on error` passed. `supabase db advisors --local --type all --level warn --fail-on error` passed with existing warnings recorded below. | pending |
| 2026-05-26 | SM-AUDIT-08 / SM-AUDIT-09 | Patched and verified locally | Added paged staff-management DTO reads with exact counts, page controls for staff/invitations/active delegations, delegation name resolution independent of the current staff page, a single responsive staff directory row rendering path, and narrow Zustand tab selectors. Added generated `activity_events.search_vector`, store-scoped full-text GIN search index, paging indexes, and missing staff/activity FK indexes in `20260526153037_staff_management_scale_indexes.sql`. `npm test -- src/lib/server/__tests__/activity-dal.test.ts` passed. `npm test` passed. `npm run lint` passed. `npm run build` passed. `npm run audit` passed with 0 high vulnerabilities. `npm run test:e2e -- --project=chromium tests/e2e/staff-management.spec.ts` passed. `npm run test:e2e -- --project=chromium` passed. `supabase db reset --local` passed. `supabase db lint --local --fail-on error` passed. `supabase db advisors --local --type all --level warn --fail-on error` passed with existing warnings recorded below. Representative rollback SQL proof showed activity search using `idx_activity_events_store_search_vector` at 100k rows, staff paging using `idx_staff_users_store_created_page`, invitation paging using `idx_staff_invitations_store_created_page`, and active delegation paging using `idx_privilege_delegations_staff_active_page`. | pending |
| 2026-05-27 | SM-AUDIT-11 / SM-AUDIT-12 / SM-AUDIT-13 / SM-AUDIT-14 | Patched and targeted-verified locally | Deprecated the stale `src/lib/schema.sql` into a non-executable comments-only handoff that points to migrations, routed staff/activity pages through `requirePrivilege`, added DAL role-privilege fallback assertions, added typed destructive confirmations with matching Server Action validation, updated staff directory wording/email fallback behavior, and resolved accepted cashier emails from accepted invitations. `npm test -- src/app/__tests__/server-action-permissions.test.ts src/lib/__tests__/migration-hardening.test.ts` passed. `npm test` passed. `npm run lint -- "src/app/staff-actions.ts" "src/components/staff-management-page.tsx" "src/lib/server/dal.ts" "src/app/(authenticated)/staff/page.tsx" "src/app/(authenticated)/activity/page.tsx" "src/lib/__tests__/migration-hardening.test.ts" "src/app/__tests__/server-action-permissions.test.ts"` passed. `npm run lint` passed. `npm run build` passed. `npm run audit` passed with 0 high vulnerabilities. `npm run test:e2e -- --project=chromium tests/e2e/staff-management.spec.ts` passed. Local Supabase reset/lint/advisors and full Playwright remain pending. | pending |
| 2026-05-26 | Plan created | Documentation-only plan added | File created for agent handoff; no code, migration, test, or Supabase change | pending |

Advisor warnings observed during SM-AUDIT-01, SM-AUDIT-05, SM-AUDIT-02, SM-AUDIT-04, SM-AUDIT-03, SM-AUDIT-06, SM-AUDIT-10, SM-AUDIT-07, SM-AUDIT-08, and SM-AUDIT-09 verification:

- Existing `auth_rls_initplan` performance warnings on `public.stores` and `public.users` policies.
- Existing `multiple_permissive_policies` performance warnings on `public.activity_events` and `public.privilege_delegations`.
- Existing `function_search_path_mutable` security warnings on older functions: `log_inventory_adjustment`, `log_price_update`, `log_store_registration`, and `archive_and_purge_old_audit_logs`.
- The prior `protect_user_store_id` search-path warning is resolved by SM-AUDIT-03.
- No advisor warning was emitted for `adjust_inventory_for_delegation`, `record_delegated_mutation_activity`, `grant_privilege_delegation`, the replacement `suspend_staff_user`, `accept_staff_invitation`, `rollback_staff_invitation_acceptance`, or the SM-AUDIT-09 index/search migration. `btree_gin` is installed in the `extensions` schema.

---

# 10. AGENT HANDOFF NOTES

All agents continuing this work must follow these rules:

- Treat this document as the staff-management audit fix control plan.
- Update the proof log after each completed fix.
- Keep production blockers separate from external-beta fixes and post-beta cleanup.
- Use local/dev Supabase first for implementation and proof.
- Do not run linked production Supabase commands unless release approval is explicit.
- Preserve tenant isolation, RLS safety, and service-role secrecy in every fix.
- Prefer SQL RPC transaction boundaries for inventory, delegation, staff lifecycle, and audit-critical behavior.
- Keep UI changes operational and mobile-safe; do not introduce broad product scope while fixing audit issues.
- If a fix changes the release status, update this file and the relevant staff/activity test plan.

Use these supporting documents when implementing fixes:

- `PaisaPOS_OS/FEATURE_STAFF_ACTIVITY_PRODUCTION_READINESS_PLAN.md`
- `PaisaPOS_OS/FEATURE_STAFF_ACTIVITY_TEST_PLAN.md`
- `PaisaPOS_OS/FEATURE_STAFF_ACTIVITY_SECURITY_PRIVACY.md`
- `PaisaPOS_OS/FEATURE_STAFF_ACTIVITY_ACCOUNTABILITY.md`
- `PaisaPOS_OS/AI_AGENT_RULEBOOK.md`
