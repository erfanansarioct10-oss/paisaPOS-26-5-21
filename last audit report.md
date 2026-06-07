# PaisaPOS Last Audit Report

Audit date: 2026-05-31 20:41:56 +05:45
Audited by: Codex
Workspace: `c:\nooridigital_assets\my-projects\billing-system-26-5-21`

This report is a pause/handoff snapshot. It is not a production release approval.

## 1. Current Position

- Product: PaisaPOS, a Next.js 16 + Supabase POS, billing, inventory, staff, and activity accountability app for Nepali retail pilots.
- Branch: `beta/v1.1`
- HEAD: `cefd47c docs(staff): record v1.1 release proof`
- Working tree state before this report: dirty and mid-flight.
- Dirty entries before this report: 120 total, with 54 modified, 28 deleted, and 38 untracked entries.
- Tracked diff before this report: 82 tracked files, about 4,542 insertions and 11,174 deletions.
- The large deletion count is expected from the architecture move away from global legacy folders.

Important: future agents should not assume the working tree is ready to commit as-is. Review the dirty diff first.

## 2. What We Were Doing

The active work is V1.1 staff/activity/accountability hardening plus a structural refactor into a feature-first modular monolith.

The old global locations were intentionally retired:

- `src/components`
- `src/lib/server`
- `src/lib/importer.ts`
- `src/lib/logger.ts`
- `src/lib/network.ts`
- `src/lib/rate-limiter.ts`
- `src/lib/store/authSlice.ts`
- `src/lib/store/cartSlice.ts`
- `src/lib/store/inventorySlice.ts`

The new canonical structure is:

- `src/app` - thin Next.js route files, layouts, route handlers, compatibility server-action entrypoints.
- `src/features` - product-domain modules: activity, auth, billing, dashboard, inventory, invoices, settings, staff.
- `src/server` - server-only auth, DAL, Supabase admin access, logging, rate limiting, network, observability.
- `src/shared` - shared layout, UI, Supabase generated types, hooks/utilities.
- `src/lib` - universal helpers plus the central Zustand store entrypoint/types.

The placement contract is documented in `PaisaPOS_OS/CODEBASE_STRUCTURE.md`.

## 3. Local Framework Rules Confirmed

The project uses Next.js `16.2.6` and React `19.2.4`.

Per `AGENTS.md`, local Next docs were checked under `node_modules/next/dist/docs/` before writing this report. The important active rules are:

- Next 16 uses `proxy.ts`, not `middleware.ts`.
- `params` and `searchParams` are async in App Router pages.
- Client components must not be async and server-to-client props must stay serializable.
- Server-only modules should use `import "server-only"`.
- Proxy is not a full authorization system; sensitive authz stays in server code and the database.

Current code follows the Next 16 proxy convention via `src/proxy.ts`.

## 4. Database Source Of Truth

Do not use `src/lib/schema.sql` as executable schema. It is now intentionally comment-only and says the canonical database history lives in `supabase/migrations/`.

Recent important migrations include:

- `20260526031511_freeze_v11_delegation_scopes.sql`
- `20260526032925_transaction_safe_staff_invite_acceptance.sql`
- `20260526034611_delegation_step_up_proofs.sql`
- `20260526042858_harden_staff_lifecycle_accountability.sql`
- `20260526124720_add_delegated_inventory_adjustment_rpc.sql`
- `20260526130912_couple_delegated_activity_logging.sql`
- `20260526135906_transaction_safe_delegation_grants.sql`
- `20260526141101_revoke_delegations_on_staff_suspension.sql`
- `20260526142125_harden_invite_accept_auth_order.sql`
- `20260526153037_staff_management_scale_indexes.sql`
- `20260529064145_harden_database_contracts.sql`
- `20260529065204_fix_users_profile_rls_recursion.sql`
- `20260530020310_checkout_counter_idempotency.sql`
- `20260530022804_checkout_replay_result_observability.sql`
- `20260531022126_security_scan_hardening.sql`

Local Supabase was running during this audit. CLI version observed: `2.101.0`. The CLI reported an available update to `2.102.0`.

No local Supabase keys or secrets are included in this report.

## 5. Staff And Activity Readiness Status

The existing readiness docs say PR-01 through PR-04 are complete locally, but production proof is not complete.

Current blocker summary from `PaisaPOS_OS/FEATURE_STAFF_ACTIVITY_PRODUCTION_READINESS_PLAN.md`:

- PR-01 delegation grant step-up proof: completed locally.
- PR-02 transaction-safe invite acceptance: completed locally.
- PR-03 V1.1 delegation scope freeze: completed locally.
- PR-04 negative/security test coverage: completed locally.
- PR-05 production-like staging proof: not started, blocker for production.
- PR-06 route and active-status hardening: not started, recommended before production.
- PR-07 staff directory polish: deferred/non-blocking.

Do not run linked production Supabase commands for V1.1 until staging proof and release approval are explicitly recorded.

## 6. Current Validation Results

Commands run during this audit:

| Command | Result | Notes |
|---|---:|---|
| `npm run lint` | Pass | Includes `npm run check:architecture`; architecture guardrail passed. |
| `npm run typecheck` | Pass | `tsc --noEmit --project tsconfig.typecheck.json`. |
| `npm test` | Pass | 16 files, 197 passed, 5 skipped. |
| `npm run build` | Pass | Next.js 16.2.6 Turbopack production build compiled successfully. |
| `npm audit --audit-level=high` | Pass | 0 vulnerabilities found. |
| `npm run db:lint` | Pass with warnings | No error-level failure; warnings are unused parameters in `public.create_invoice_and_deduct_stock`. |
| `npm run db:advisors` | Pass | No issues found. |
| `npm run test:e2e -- --project=chromium` | Pass | 20 passed in Chromium. |
| `npm run test:db` | Pass | 5 files, 24 passed. |
| `npm run test:live` | Fail | 3 failures in `src/lib/store/__tests__/security-stress.test.ts`. See section 7. |
| `git diff --check` | Fail | One trailing whitespace issue in `PaisaPOS_OS/SECURITY_SYSTEM.md:5`. CRLF warnings also printed. |

The Chromium E2E lane logged `E2E Search Results Count: 0` and "No favorites registered" in the current seeded browser state, but the tests still passed. Future E2E coverage would benefit from richer seeded catalog/favorite data.

## 7. Known Failing Checks

### `npm run test:live`

Only `src/lib/store/__tests__/security-stress.test.ts` failed.

Failures observed:

1. Stale assertion:
   - Expected substring: `Only store owners can add or modify products`
   - Actual message: `Unauthorized. Only active store owners can add or modify products.`
   - This appears to be test drift after active-status hardening.

2. Product setup failures in the price-tampering and deadlock stress tests:
   - Both fail because direct authenticated inserts into `products` now return `null`, then the test reads `product.id`.
   - Current DB privileges confirm `authenticated` has `SELECT` on `products`, but not direct `INSERT`, `UPDATE`, or `DELETE`.
   - This matches `20260531022126_security_scan_hardening.sql`, which revokes direct authenticated product/variant/inventory writes and routes catalog writes through RPCs.
   - The test should probably use the existing `upsertCatalogProduct()` helper from `src/lib/store/__tests__/supabase-test-utils.ts` instead of direct product/variant/inventory DML.

Interpretation: this looks mostly like live stress test drift against a hardened database contract, not an observed product regression. However, the price-tampering and deadlock stress behavior is not currently verified by `test:live` until that test setup is repaired.

### `git diff --check`

One real whitespace issue:

- `PaisaPOS_OS/SECURITY_SYSTEM.md:5` has trailing whitespace after `Last Updated: 2026-05-29`.

I did not edit that file during the audit.

## 8. Architecture Findings

Good current state:

- `npm run check:architecture` passes.
- The custom guardrail blocks retired aliases and server runtime APIs inside generic `src/lib`.
- `src/components` and `src/lib/server` are gone from the current filesystem snapshot.
- Server-only infrastructure now lives under `src/server`.
- Shared UI/layout moved to `src/shared`.
- Domain UI/state/server modules moved under `src/features`.
- Staff and Activity pages are server-rendered route pages that use async `searchParams` correctly.

Important nuance:

- `src/proxy.ts` protects `/dashboard`, `/billing`, `/inventory`, `/invoices`, and `/settings`.
- It does not currently include `/staff` or `/activity` in `protectedRoutes`.
- `/staff` and `/activity` are still guarded by the authenticated route group layout plus page-level `requirePrivilege(...)`.
- This matches the open PR-06 route/status hardening task: review route-level behavior for `/staff`, `/activity`, suspended users, stale sessions, and invite acceptance.

## 9. Security And Permission Notes

Current active privilege model:

- Owner has all core privileges.
- Cashier baseline is `checkout.create` and `profile.update`.
- V1.1 active delegation scopes are only `catalog.manage` and `inventory.adjust`.
- `reports.export` and `invoice.correct` remain modeled but unreleased.
- `staff.manage` is not delegatable.

Important files:

- `src/lib/staff-capabilities.ts`
- `src/server/auth/permissions.ts`
- `src/app/staff-actions.ts`
- `src/server/activity/activity.ts`
- `src/server/supabase/dal.ts`
- `src/server/supabase/admin-supabase.ts`

Server Actions must continue to enforce authorization server-side. UI role gates are only user experience, not a security boundary.

## 10. Resume Checklist

When resuming, start here:

1. Read `AGENTS.md`, then `PaisaPOS_OS/CODEBASE_STRUCTURE.md`.
2. Read `PaisaPOS_OS/FEATURE_STAFF_ACTIVITY_PRODUCTION_READINESS_PLAN.md`.
3. Run `git status --short` and inspect the current diff before editing.
4. Fix or intentionally document the `test:live` drift in `src/lib/store/__tests__/security-stress.test.ts`.
5. Fix or intentionally document the trailing whitespace in `PaisaPOS_OS/SECURITY_SYSTEM.md:5`.
6. Re-run:
   - `npm run lint`
   - `npm run typecheck`
   - `npm test`
   - `npm run test:db`
   - `npm run test:live`
   - `npm run build`
   - `npm run test:e2e -- --project=chromium`
   - `npm audit --audit-level=high`
   - `npm run db:lint`
   - `npm run db:advisors`
   - `git diff --check`
7. Complete PR-06 route/status hardening if still low-risk.
8. Complete PR-05 staging proof against a separate non-production Supabase backend.
9. Only after staging proof and release approval, consider linked Supabase commands or production rollout.

## 11. Do Not Miss

- Do not paste or execute `src/lib/schema.sql`; use `supabase/migrations/`.
- Do not reintroduce old-path wrappers unless a future migration explicitly needs a short-lived bridge.
- Do not place new domain UI in `src/components`.
- Do not put server-only runtime APIs in generic `src/lib`.
- Do not expose `SUPABASE_SERVICE_ROLE_KEY` to browser code.
- Do not expand V1.1 delegation beyond `catalog.manage` and `inventory.adjust` unless the release plan changes.
- Do not run `supabase db push --linked` for V1.1 until PR-05 is done and approved.

## 12. Bottom Line

The local app is in a strong but unfinished handoff state. Lint, typecheck, build, unit tests, DB lane, DB lint/advisors, audit, and Chromium E2E pass. The main open issues are a live stress-test suite that needs updating for the newly hardened database contract, one whitespace failure in docs, missing production-like staging proof, and the still-open route/status hardening pass for staff/activity.
