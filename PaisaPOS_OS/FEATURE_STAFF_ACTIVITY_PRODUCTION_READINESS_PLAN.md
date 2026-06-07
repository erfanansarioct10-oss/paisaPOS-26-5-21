# PRODUCTION READINESS FIX PLAN: STAFF, ACTIVITY, AND ACCOUNTABILITY

Status: PR-01, PR-02, PR-03, PR-04 COMPLETE LOCALLY - MANUAL LOCAL QA / PR-05 NEXT
Last updated: 2026-05-26 10:02 NPT

---

# 1. PURPOSE

This document turns the staff/activity audit findings into an ordered implementation and verification plan.

We should not fix the remaining gaps randomly. Each fix must have:

- a clear production risk
- a scoped implementation slice
- focused tests
- local Supabase proof
- a full local release gate before staging or production

The current V1.1 staff feature is useful for local beta validation, but it is not production-ready until the blockers below are closed and verified.

---

# 2. RELEASE DECISION

Current decision:

```text
Do not move Staff, Activity, or Delegation V1.1 to production yet.
```

Allowed next step:

```text
Fix and verify locally on beta/v1.1 using local/dev Supabase.
```

Not allowed yet:

```text
Do not run linked Supabase production commands.
Do not run supabase db push --linked against production.
Do not enable unreleased delegation scopes in production UI or server behavior.
```

Production can be considered only after:

- all blocker slices in this file are complete
- focused tests for each slice pass
- full local gate passes
- staging or production-like preview passes against a separate non-production backend
- release approval is recorded

---

# 3. SOURCE DOCUMENTS

Use this document as the fix control plan. Keep these existing docs as supporting evidence:

- `PaisaPOS_OS/FEATURE_STAFF_ACTIVITY_IMPLEMENTATION_SLICES.md`
- `PaisaPOS_OS/FEATURE_STAFF_ACTIVITY_TEST_PLAN.md`
- `PaisaPOS_OS/FEATURE_STAFF_ACTIVITY_SECURITY_PRIVACY.md`
- `PaisaPOS_OS/FEATURE_STAFF_ACTIVITY_ACCOUNTABILITY.md`

When a fix is completed, record the proof here and update the test plan if the proof changes the release status.

---

# 4. BLOCKER SUMMARY

| ID | Risk | Severity | Production status |
|---|---|---:|---|
| PR-01 | Delegation grant uses typed confirmation but no server-verified step-up auth | Blocker | Completed locally |
| PR-02 | Invite acceptance is not fully transaction/race-safe | Blocker | Completed locally |
| PR-03 | Unreleased delegation scopes still exist in schema/client vocabulary | Blocker | Completed locally |
| PR-04 | Negative/security test cases remain unchecked in the test plan | Blocker | Completed locally |
| PR-05 | Local-only release proof exists, but no staging/backend proof exists | Blocker for production | Must run after local fixes |
| PR-06 | Route/status hardening for staff/activity routes should be tightened | Recommended | Fix before production if low-risk |
| PR-07 | Staff directory polish gaps remain, such as unavailable staff email and remove-vs-suspend wording | Non-blocking | Fix if time permits |

---

# 5. IMPLEMENTATION SLICES

## Slice PR-01: Server-Verified Step-Up For Delegation Grants

Risk:

Granting temporary privileges is high risk. A typed `GRANT` confirmation is useful as friction, but it is not production-grade authentication.

Goal:

Require server-verified step-up authentication before an owner can grant a cashier delegated privileges.

Preferred production approach:

- Research the current Supabase Auth MFA/reauthentication APIs before coding.
- Use a server-verifiable OTP/MFA or equivalent reauthentication challenge.
- Keep the existing typed `GRANT` confirmation only as additional intent confirmation, not as the main security control.

Files likely affected:

- `src/app/staff-actions.ts`
- `src/features/staff/components/staff-management-page.tsx`
- auth/client helpers if a challenge flow is needed
- staff action tests
- Playwright staff management tests

Implementation notes:

- The grant Server Action must reject requests without fresh step-up proof.
- Step-up proof must not be trusted from editable client state alone.
- Activity logging must record successful grants and denied grant attempts where useful.
- Revocation must remain immediate and must not require step-up.

Focused tests:

- Owner cannot grant delegation without step-up proof.
- Owner can grant delegation after successful step-up proof.
- Expired or reused step-up proof is denied.
- Cashier cannot grant delegation even with tampered form payload.
- Grant still writes an activity event with delegation details.

Completion proof:

```text
[x] Focused unit/action tests pass
[x] Staff Playwright smoke passes locally
[x] Activity event proof captured
[x] Full local gate passes
```

Status:

```text
Completed locally on 2026-05-26.

Implemented:
- `20260526034611_delegation_step_up_proofs.sql` adds private, service-role-only `staff_step_up_proofs` rows.
- `createDelegationStepUpProofAction()` verifies Supabase MFA `aal2` using the current session JWT and requires a fresh authentication-method timestamp before minting a short-lived proof.
- `grantPrivilegeDelegationFormAction()` now consumes a matching one-time proof before reading the target staff profile or inserting `privilege_delegations`.
- Missing, expired, or reused proofs deny the grant and write a `delegation.grant_denied` activity event.
- The Staff page grant form performs a TOTP MFA challenge before asking the server to mint and submit the proof.
- Revocation remains immediate and does not require step-up.

Verified:
- Focused Vitest: Server Action and migration hardening tests passed, 50 tests total.
- Full Vitest: 17 files, 169 tests passed.
- `supabase db reset --local` passed through `20260526034611_delegation_step_up_proofs.sql`.
- Live local SQL proof: a fresh proof consumed once, a second consume returned 0 rows, and an expired proof returned 0 rows.
- Grant proof: `staff_step_up_proofs` has RLS enabled and table privileges only for `service_role`, not `anon` or `authenticated`.
- `supabase db lint --local --fail-on error` passed.
- `supabase db advisors --local --type all --level warn --fail-on error` passed with pre-existing warning-level items only.
- `npm run lint`, `npm run build`, Chromium Playwright, `npm run audit`, and `git diff --check` passed.
- Real browser MFA grant should be repeated in PR-05 staging proof with an enrolled owner factor and deployed callback/cookie settings.
```

## Slice PR-02: Transaction-Safe Invite Acceptance

Risk:

Invite acceptance currently updates/creates the user profile before proving that the pending invitation row was successfully consumed. Concurrent accept attempts or stale/tampered invite state can create confusing partial behavior.

Goal:

Make invite acceptance one atomic operation from the product perspective.

Preferred approach:

- Move acceptance into a Postgres RPC or equivalent server-side transaction.
- The transaction should validate invite id, email, status, expiry, store, and existing user profile state.
- The same transaction should consume the invitation and create/update the cashier profile.
- The Server Action should call the transactional boundary and return a clean expected error on failure.

Files likely affected:

- new Supabase migration
- `src/app/staff-actions.ts`
- staff invitation tests
- RLS/migration-hardening tests
- Playwright invite acceptance tests

Implementation notes:

- Do not allow accepting an invite for the wrong authenticated email.
- Do not allow accepting an expired invite.
- Do not allow accepting an already accepted/revoked invite.
- Do not allow a user from another store to accept.
- Do not allow a tampered invitation id.
- Ensure only the intended user becomes a cashier for the intended store.
- Record a successful activity event after acceptance.

Focused tests:

- Happy path invite accept creates cashier profile and consumes invite.
- Expired invite is denied.
- Revoked invite is denied.
- Wrong email is denied.
- Already accepted invite is denied.
- User already assigned to another store is denied.
- Two accept attempts cannot both succeed.
- Tampered invite id is denied.

Completion proof:

```text
[x] Migration applies cleanly on local reset
[x] Focused invite/action tests pass
[x] Live local RPC proof passes
[x] Playwright staff smoke passes
[x] Full local gate passes for this slice
```

Status:

```text
Completed locally on 2026-05-26.

Implemented:
- `20260526032925_transaction_safe_staff_invite_acceptance.sql` adds `public.accept_staff_invitation(...)`.
- The RPC validates invite id, authenticated user id, normalized email, pending status, expiry, store existence, existing profile store/role/status, and intended cashier role.
- The RPC uses row locks plus a per-user transaction advisory lock to prevent concurrent accept attempts from producing split profile/invitation state.
- The same transaction creates or updates the cashier profile, marks the invitation accepted, and records `staff.invite_accepted`.
- Execute access is revoked from `PUBLIC`, `anon`, and `authenticated`, then granted only to `service_role`.
- `acceptStaffInviteFormAction` now calls the RPC and maps expected database denial codes to clean UI errors.

Verified:
- Focused Vitest: Server Action and migration hardening tests passed, 45 tests total.
- Full Vitest: 17 files, 164 tests passed.
- `supabase db reset --local` passed through `20260526032925_transaction_safe_staff_invite_acceptance.sql`.
- Live local SQL proof: RPC accepted a pending invite, consumed it, created an active cashier profile in the intended store, and wrote one `staff.invite_accepted` event.
- Live local SQL proof: second accept attempt failed with `staff_invitation_not_pending`.
- Grant proof: `accept_staff_invitation` execute privilege is present for `service_role` and owner `postgres`, not `anon` or `authenticated`.
- Function proof: `accept_staff_invitation` is `SECURITY INVOKER` with `search_path=public`.
- `supabase db lint --local --fail-on error` passed.
- `supabase db advisors --local --type all --level warn --fail-on error` passed with pre-existing warning-level items only.
- `npm run lint`, `npm run build`, Chromium Playwright, `npm run audit`, and `git diff --check` passed.
```

## Slice PR-03: Freeze Delegation Scope Vocabulary For V1.1

Risk:

Deferred scopes such as `reports.export` and `invoice.correct` are present in some shared vocabulary/schema paths even though V1.1 only releases `catalog.manage` and `inventory.adjust`. This can confuse owners and creates future privilege-surface risk.

Goal:

Make the V1.1 production behavior expose and honor only the released delegation scopes.

Implementation decision:

- Chosen path: tighten the database constraint to only released V1.1 scopes and hard-filter server/client reads as defense in depth.

Preferred production posture:

- Server authorization must accept delegated admin scopes only if they are in the active released list.
- Owner grant UI must show only released scopes.
- Cashier delegation banner must show only released scopes.
- Tests must prove unreleased scopes do not unlock behavior, even if rows exist.

Files likely affected:

- `src/lib/staff-capabilities.ts`
- `src/server/auth/permissions.ts`
- `src/features/auth/state/auth-slice.ts`
- `src/shared/layout/authenticated-shell.tsx`
- `src/features/staff/components/staff-management-page.tsx`
- Supabase migration if database constraints are tightened

Focused tests:

- Owner cannot grant unreleased scopes through Server Action payload tampering.
- Cashier with an unreleased delegation row does not gain permission.
- Cashier banner does not display unreleased scopes.
- Reports/invoice/settings controls remain unavailable unless a later release explicitly implements them.

Completion proof:

```text
[x] Permission matrix tests pass
[x] Server Action abuse tests pass
[x] UI/read helpers prove unreleased scopes are hidden
[x] Full local gate passes for this slice
```

Status:

```text
Completed locally on 2026-05-26.

Implemented:
- `20260526031511_freeze_v11_delegation_scopes.sql` freezes `privilege_delegations.scope` to `catalog.manage` and `inventory.adjust`.
- `src/lib/staff-capabilities.ts` now treats only active V1.1 scopes as usable delegated privileges.
- `src/server/auth/permissions.ts` denies unreleased delegated scopes even when an in-memory delegation row is supplied.
- `src/features/auth/state/auth-slice.ts`, `src/server/supabase/dal.ts`, and `src/shared/layout/authenticated-shell.tsx` filter active delegation reads/banner display to released scopes.

Verified:
- Focused Vitest: 4 files, 53 tests passed.
- Full Vitest: 17 files, 155 tests passed.
- `supabase db reset --local` passed through `20260526031511_freeze_v11_delegation_scopes.sql`.
- Constraint query confirmed only `catalog.manage` and `inventory.adjust` are allowed.
- `supabase db lint --local --fail-on error` passed.
- `supabase db advisors --local --type all --level warn --fail-on error` passed with pre-existing warning-level items only.
- `npm run lint`, `npm run build`, Chromium Playwright, `npm run audit`, and `git diff --check` passed.
```

## Slice PR-04: Complete Missing Negative/Security Tests

Risk:

The implementation has strong happy-path and core abuse coverage, but several checklist items in the test plan remain unchecked. Production readiness needs proof for the uncomfortable cases, not only the intended flows.

Goal:

Close the remaining test-plan gaps with automated tests where practical and manual proof notes where automation would be disproportionate.

Required coverage:

- activity payload validation
- sensitive metadata redaction
- oversized metadata bounding
- invalid invite email direct Server Action test
- expired invite accept denial
- cashier wrong-email invite accept denial
- owner B cannot revoke owner A invite through Server Action
- tampered invitation id denied
- direct Server Action payload tampering for delegation scopes
- suspended cashier cannot use delegated actions

Files likely affected:

- `src/app/__tests__/server-action-permissions.test.ts`
- `src/server/activity/__tests__/activity.test.ts`
- `src/lib/__tests__/migration-hardening.test.ts`
- `src/lib/store/__tests__/rls-verification.test.ts`
- Playwright staff/activity specs
- `PaisaPOS_OS/FEATURE_STAFF_ACTIVITY_TEST_PLAN.md`

Completion proof:

```text
[x] Every required coverage item above is checked off or documented with manual proof
[x] Focused test files pass
[x] Full local gate passes
```

Status:

```text
Completed locally on 2026-05-26.

Implemented:
- Activity payload construction now rejects blank required event identifiers before attempting an admin insert.
- Activity helper tests now prove required-field validation, newline sanitization, text bounding, sensitive metadata redaction, and oversized metadata truncation.
- Server Action abuse tests now prove invalid invite email rejection before authz/admin access, wrong signed-in invitee email denial through the transactional RPC path, owner cross-store invitation revoke denial before mutation, and suspended cashier delegated-action denial before delegation lookup.
- Existing PR-02/PR-03 tests continue to prove expired invite accept denial, tampered invitation id denial, and unreleased delegation scope payload tampering denial.

Verified:
- Focused Vitest: `src/server/activity/__tests__/activity.test.ts` and `src/app/__tests__/server-action-permissions.test.ts` passed, 48 tests total.
- Full Vitest: 17 files, 175 tests passed.
- `supabase db reset --local` passed through `20260526034611_delegation_step_up_proofs.sql`.
- `supabase migration list --local` includes PR-03, PR-02, and PR-01 migrations.
- `supabase db lint --local --fail-on error` passed.
- `supabase db advisors --local --type all --level warn --fail-on error` passed with the same pre-existing warning-level items documented in the test plan.
- `npm run lint`, `npm run build`, Chromium Playwright, `npm run audit`, and `git diff --check` passed.
```

## Slice PR-05: Production-Like Staging Proof

Risk:

Local proof is necessary but not enough for production. Supabase Auth callback URLs, deployed environment variables, RLS grants, and Vercel runtime behavior can differ from local development.

Goal:

Run the completed feature against a separate non-production backend before production.

Prerequisites:

- PR-01 through PR-04 complete locally.
- Full local gate passes.
- A separate staging/dev Supabase project is available.
- Vercel preview env vars point only to the staging/dev backend.

Staging verification:

- apply migrations to staging/dev backend
- verify staff invitation email/callback flow
- verify invite acceptance with real deployed callback URL
- verify owner Staff page
- verify owner Activity page
- verify delegation grant with step-up
- verify delegated inventory and catalog actions
- verify suspended cashier denial
- verify direct browser writes to activity/delegation tables are blocked
- verify no service role key is exposed to the browser bundle

Completion proof:

```text
[ ] Staging migration proof recorded
[ ] Staging smoke proof recorded
[ ] RLS/browser-write denial proof recorded
[ ] Release approval recorded
```

Status:

```text
Not started. Eligible after local manual QA, using a separate non-production backend.
```

## Slice PR-06: Route And Active-Status Hardening

Risk:

The staff/activity pages have server-side role gates, but route protection should be reviewed so stale sessions, suspended profiles, and direct navigation fail consistently.

Goal:

Make route-level behavior match the server/data authorization model without breaking invite acceptance or onboarding.

Review points:

- confirm `/staff` and `/activity` are protected at the proxy or route layer
- confirm authenticated layout behavior for users without active tenant context
- confirm suspended cashiers are redirected or signed out consistently
- confirm invite acceptance remains reachable for authenticated users who do not yet have a store profile

Focused tests:

- unauthenticated user cannot access `/staff`
- unauthenticated user cannot access `/activity`
- cashier cannot access owner-only pages
- suspended cashier cannot access authenticated app surfaces
- invite accept page remains usable for the intended authenticated invitee

Completion proof:

```text
[ ] Route tests pass
[ ] Playwright navigation smoke passes
[ ] Full local gate passes
```

Status:

```text
Not started.
```

## Slice PR-07: Staff Directory Polish

Risk:

This is not a core security blocker, but rough staff directory behavior can confuse owners during production rollout.

Goal:

Clean up owner-facing staff management details after blockers are done.

Candidate fixes:

- clarify suspend vs remove wording
- decide whether owners should see staff email addresses
- make unavailable staff email state intentional and documented
- ensure activity copy is understandable for invite, suspend, reactivate, grant, and revoke events

Completion proof:

```text
[ ] Product copy reviewed
[ ] Staff page smoke test passes
```

Status:

```text
Deferred until blockers are complete.
```

---

# 6. LOCAL VERIFICATION GATE

Run focused tests after each slice, then run the full gate before staging.

Required local commands:

```bash
git status -sb
supabase status
supabase db reset --local
supabase migration list --local
supabase db lint --local --fail-on error
supabase db advisors --local --type all --level warn --fail-on error
npm run lint
npm run build
npm test
npm run test:e2e -- --project=chromium
npm run audit
git diff --check
```

Expected result:

```text
All required local commands pass.
Advisor warnings, if any, are reviewed and documented.
No linked or production Supabase command is run during local verification.
```

---

# 7. IMPLEMENTATION ORDER

Recommended order:

1. PR-03 freeze active delegation scopes.
2. PR-02 make invite acceptance transaction-safe.
3. PR-01 add server-verified step-up for delegation grants.
4. PR-04 close negative/security test gaps.
5. PR-06 harden route/status behavior if the patch is low-risk.
6. Full local verification gate.
7. PR-05 staging proof against a separate backend.
8. PR-07 staff directory polish if still desired before production.

Reasoning:

- PR-03 is the smallest surface-reduction fix and makes later tests less ambiguous.
- PR-02 protects account/store membership integrity before production data is involved.
- PR-01 protects privilege escalation before owners use delegation for real.
- PR-04 converts the audit concerns into durable regression coverage.
- PR-05 must wait until the local implementation is stable.

---

# 8. PROOF LOG

Record completed work here as the fix pass progresses.

| Date | Slice | Proof | Commit |
|---|---|---|---|
| 2026-05-26 | Plan created | Readiness plan added. No implementation changes yet. | pending |
| 2026-05-26 | PR-03 | Delegation scope vocabulary frozen locally to `catalog.manage` and `inventory.adjust`; migration, focused tests, full tests, lint, build, e2e, audit, DB lint/advisors, constraint query, and diff check passed. | pending |
| 2026-05-26 | PR-02 | Invite acceptance moved to transaction-safe `accept_staff_invitation` RPC; local reset, focused/full tests, live RPC proof, second-accept denial, grant/search-path checks, lint, build, e2e, audit, DB lint/advisors, and diff check passed. | pending |
| 2026-05-26 | PR-01 | Delegation grants now require server-minted MFA/AAL2 step-up proofs; missing/stale/reused proof denial, successful proof-backed grant, grant-denied activity, private proof table grants, local reset, focused/full tests, lint, build, e2e, audit, DB lint/advisors, and diff check passed. | pending |
| 2026-05-26 | PR-04 | Missing negative/security checklist coverage closed with activity validation, metadata privacy/bounding tests, invalid/wrong-email invite tests, cross-store invite revoke denial, suspended delegated-action denial, focused/full tests, local reset, lint, build, e2e, audit, DB lint/advisors, and diff check passed. | pending |

---

# 9. OPEN QUESTIONS

Resolve these before or during implementation:

1. Resolved for PR-01: use Supabase MFA/AAL2 with a fresh AMR timestamp and a server-minted one-time proof for delegation grants.
2. Resolved for PR-03: V1.1 now tightens the database constraint to only `catalog.manage` and `inventory.adjust`, with app-side filtering as defense in depth.
3. Resolved for PR-02: invite acceptance now uses a dedicated service-role-only transactional RPC.
4. Should staff removal exist in V1.1, or should product language explicitly say suspend/reactivate only?
5. Should owners see cashier email addresses in the staff directory, or should privacy design intentionally hide them?

---

# 10. PRODUCTION EXIT CRITERIA

The feature is production-ready only when all of the following are true:

- PR-01 complete
- PR-02 complete
- PR-03 complete
- PR-04 complete
- full local verification gate passed
- staging proof completed against non-production backend
- release approval recorded
- docs updated with final proof
