# Memory
> Last updated: 2026-05-22 08:41 NPT

## Technical Patch: Responsive Checkout Button Hotkey Label (2026-05-22)

**Observation:** The checkout button in the POS cart footer displayed `Checkout (Ctrl+Enter)`. The `(Ctrl+Enter)` text does not make sense on mobile or tablet touch interfaces.
**Action:**
- Wrapped the keyboard shortcut hint text ` (Ctrl+Enter)` inside [src/components/billing-tab.tsx](file:///c:/nooridigital_assets/my-projects/billing-system-26-5-21/src/components/billing-tab.tsx#L491) in a responsive span: `<span className="hidden lg:inline text-xs opacity-80 font-normal ml-1">`.
- This automatically hides the shortcut hint on mobile and tablet viewport widths (< `lg`) while retaining it with a clean secondary styling on desktop displays (>= `lg`).
- Verified all **24 tests passed** and `npm run build` compiled successfully with zero errors.
**Lesson:** Interface hint elements that depend on physical keyboards should always be conditionally hidden or adapted using responsive breakpoints (e.g. `hidden lg:inline`) to maintain clean UX across mobile touch devices.

## Technical Patch: Flat Page Routing & Back Navigation Warning Guard (2026-05-22)

**Observation:** The user wanted flat URL segments directly at root (e.g. `/inventory` instead of `/dashboard/inventory`) and a safety warning when pressing the browser back button with an active cashier cart.
**Action:**
- Utilized Next.js **Route Groups** folder convention `src/app/(authenticated)/` to support flat URL targets (`/dashboard`, `/billing`, `/inventory`, `/invoices`) while keeping the shared layout, sidebar, session checks, and receipt overlay intact.
- Updated route checks inside proxy middleware [src/proxy.ts](file:///c:/nooridigital_assets/my-projects/billing-system-26-5-21/src/proxy.ts) to protect the flat endpoints from unauthenticated visits, and updated [sidebar.tsx](file:///c:/nooridigital_assets/my-projects/billing-system-26-5-21/src/components/sidebar.tsx) path targets.
- Cleaned the build tree by recursively removing the old legacy `src/app/dashboard` folder structure.
- Implemented **Option A warning guard** in [billing/page.tsx](file:///c:/nooridigital_assets/my-projects/billing-system-26-5-21/src/app/(authenticated)/billing/page.tsx): uses `beforeunload` for exits/reloads, and inserts a browser history state checkpoint to intercept `popstate` on back-button nav (prompting a confirmation warning, but preserving cart state in background if they choose to leave).
- Verified that all **24 tests passed** and production static page compilation completed with 0 errors.
**Lesson:** Next.js Route Groups `(name)` are perfect for sharing structures (like sidebar menus) across flat routes without polluting path names. Using popstate history markers allows reliable back-navigation interception in React without losing background state.

## Technical Patch: Browser Back Navigation Redirect Flash Fix (2026-05-22)

**Observation:** Clicking the browser or phone back button from `/dashboard` would cause a brief flash of the `/` (login/auth) screen before redirecting back to `/dashboard`.
**Action:**
- Modified [src/proxy.ts](file:///c:/nooridigital_assets/my-projects/billing-system-26-5-21/src/proxy.ts) (which conforms to Next.js 16's custom proxy middleware convention) to intercept requests to `/` and immediately return a server-side redirect to `/dashboard` if a valid session exists.
- Replaced `router.push` with `router.replace` in both [page.tsx](file:///c:/nooridigital_assets/my-projects/billing-system-26-5-21/src/app/page.tsx) and [dashboard/page.tsx](file:///c:/nooridigital_assets/my-projects/billing-system-26-5-21/src/app/dashboard/page.tsx) to ensure redirected routes do not linger in the browser's history stack.
- Deleted the deprecated `middleware.ts` wrapper file to clean the build pipeline and satisfy Next.js 16 compiler requirements.
- Ran the test suite via `npm run test` and validated the Next.js production compilation build via `npm run build` (both succeeded with 0 warnings/failures).
**Lesson:** Client-side route protection should always be paired with server/middleware-level redirection on landing pages to avoid visual flashes. Use `router.replace` when performing session-state redirections to avoid history stack pollution.

## Technical Patch: Concurrency Test Verification, Schema Alignment & ESLint Fixes (2026-05-22)

**Observation:** Needed to verify if the concurrency stress test suite was updated and aligned, ensure the DB schema declaration was in sync, and address ESLint TypeScript `no-explicit-any` errors in test files.
**Action:** 
- Inspected [stress.test.ts](file:///c:/nooridigital_assets/my-projects/billing-system-26-5-21/src/lib/store/__tests__/stress.test.ts) and confirmed it is fully updated with current Server Action mocks and concurrency race validation rules.
- Added `/* eslint-disable @typescript-eslint/no-explicit-any */` and resolved redundant unused local rules across [store.test.ts](file:///c:/nooridigital_assets/my-projects/billing-system-26-5-21/src/lib/store/__tests__/store.test.ts) and [stress.test.ts](file:///c:/nooridigital_assets/my-projects/billing-system-26-5-21/src/lib/store/__tests__/stress.test.ts) to clean up 28 compilation ESLint blockers.
- Ran the test suite using `vitest run` and verified all **24 tests** passed successfully, including the high-throughput scale and race-condition checks.
- Verified that the `check_payment_method` DB constraint is correctly mirrored in the base [schema.sql](file:///c:/nooridigital_assets/my-projects/billing-system-26-5-21/src/lib/schema.sql) declaration.
**Lesson:** Continuous verification of integration test files against server action interfaces maintains testing safety nets, and local/file-level ESLint annotations keep CI build pipelines green without sacrificing test ergonomics.

## Technical Patch: Security Audits Remediation (2026-05-22)

**Observation:** Audits flagged vulnerabilities: fail-open middleware on missing Supabase URL/key, missing Server Action Zod validations, dependency vulnerabilities in PostCSS, and database quantity checks.
**Action:** Implemented all security remediations:
- Hardened middleware redirect in [proxy.ts](file:///c:/nooridigital_assets/my-projects/billing-system-26-5-21/src/proxy.ts) for `/dashboard` paths.
- Added strict Zod validation schemas to `checkoutAction` and `upsertProductAction` in [actions.ts](file:///c:/nooridigital_assets/my-projects/billing-system-26-5-21/src/app/actions.ts).
- Logged product deletions in [actions.ts](file:///c:/nooridigital_assets/my-projects/billing-system-26-5-21/src/app/actions.ts) under the `audit_logs` table.
- Overrode PostCSS version to `^8.5.10` in [package.json](file:///c:/nooridigital_assets/my-projects/billing-system-26-5-21/package.json).
- Added explicit parameter checks (`<= 0`) in the database `create_invoice_and_deduct_stock` RPC inside [schema.sql](file:///c:/nooridigital_assets/my-projects/billing-system-26-5-21/src/lib/schema.sql) and the new migration.
- Executed unit, integration, and stress tests (24 passed).
**Lesson:** Enforcing validations across all three tiers (middleware router guards -> zod schemas -> database RPCs) ensures robust protection against injection and tampering attempts.

## Technical Patch: Explored Demo Store Button & Fallback (2026-05-22)


**Observation:** The "Explore Demo Store" button on the login screen ([page.tsx](file:///c:/nooridigital_assets/my-projects/billing-system-26-5-21/src/app/page.tsx)) allows users to bypass database connection requirements. Additionally, the system automatically falls back to Demo Mode if Supabase environment variables are missing.
**Action:** Confirmed execution logic in [authSlice.ts](file:///c:/nooridigital_assets/my-projects/billing-system-26-5-21/src/lib/store/authSlice.ts):
- Checks if Supabase config is available (`hasSupabaseConfig()`).
- If missing, logs `"Supabase config not found. Auto-booting in Demo Mode."` and boots local pre-seeded datasets (`DEMO_STORE`, `DEMO_PROFILE`, `DEMO_PRODUCTS`, etc.).
- Persists demo status in `localStorage` (`paisapos_demo_mode`).
- Tab state is synchronized in Demo Mode using `BroadcastChannel("paisapos-demo-sync")` combined with security token validation in [broadcast.ts](file:///c:/nooridigital_assets/my-projects/billing-system-26-5-21/src/lib/broadcast.ts) to prevent data corruption.
**Lesson:** Providing a full offline-simulated walkthrough path using pre-seeded local storage data ensures developer ergonomics and instant sales/onboarding demonstrations without immediate cloud infrastructure setup.

## Technical Patch: Transaction Hardening, Row Locking & Deadlock Prevention (2026-05-21)

**Observation:** Concurrent POS checkouts presented risk of race conditions, inventory overselling, and database deadlocks.
**Action:** Implemented comprehensive database transaction hardening across Server Actions and database migrations:
- **Deadlock Mitigation:** In [actions.ts](file:///c:/nooridigital_assets/my-projects/billing-system-26-5-21/src/app/actions.ts), invoice line items are sorted alphabetically by `variant_id` UUID in the payload before invoking the database RPC. This ensures all locks on `inventory` rows are acquired in a deterministic order across all concurrent requests.
- **Row Locking:** The PL/pgSQL checkout RPC [pre_deploy_fixes.sql](file:///c:/nooridigital_assets/my-projects/billing-system-26-5-21/supabase/migrations/20260521191000_pre_deploy_fixes.sql) executes `FOR UPDATE` on `stores` to serialize checkout counts for the specific store, and `FOR UPDATE` on `inventory` to block concurrent checkout tasks on the same item.
- **Price Tampering Protection:** The RPC verifies all items. It recalculates the total unit cost using authentic database prices (`price` from `product_variants`) and compares this server-verified total against the client-reported total. If the difference exceeds `0.01`, the transaction throws a price tampering exception and rolls back.
- **Transactional Audit Logging:** Failed checkouts are caught, and a failure entry is inserted into the `audit_logs` table outside of the main transaction block using an isolated connection to preserve audit trail visibility. Successful checkouts log a `SUCCESS` event.
**Lesson:** High-concurrency retail transactions must never trust client computations. Always serialize updates deterministically (alphabetical ID sorting) to avoid Postgres deadlocks, lock updated records exclusively, and recalculate totals server-side.

## Current Project Status: Phase 1 (Core MVP) Active (2026-05-22)

- **Phase 1 (Core POS MVP):** 90% Complete. Building operationally stable inventory + billing POS.
- **Primary Objectives:**
  - **Inventory System:** Products, variants, real-time stock levels, and automated low-stock warnings (threshold-based).
  - **Billing System:** Cart interactions, payment method tracking (Cash, eSewa, Khalti, Fonepay), invoice generation, and thermal receipt printing.
  - **Variant Matrix Generator:** Built-in bulk generation utility combining comma-separated sizes and colors.
  - **Multi-Tenant Isolation:** Multi-store SaaS readiness with secure RLS policies.
- **Current Priorities:**
  - **Priority 1:** Finalize Row Level Security (RLS) policy validation and run unauthorized access checks.
  - **Priority 2:** Mobile UX stress testing on lower-end Android/tablet hardware to ensure smooth touch targets and fast list renders.
  - **Priority 3:** Spacing and formatting refinements for thermal printer browser sheets (`window.print()`).

## PaisaPOS Target Market & Niche Intelligence (2026-05-22)

### Target ICP
- **Primary Market:** Nepali fashion boutique owners, physical clothing retailers, streetwear brands, and hybrid social-commerce (Instagram/TikTok) retailers.
- **Scale:** Small businesses with 1–10 employees, active catalogs (100–1000+ SKU variants), seeking a lightweight daily POS utility.

### Hardware & Environment Constraints
- Operators utilize low-to-mid range Android tablets/phones. Spacing must support a minimum `44px` touch target.
- Internet connections can be highly unstable in physical commercial complexes in Kathmandu. System must handle load states gracefully.
- Nepali invoicing standards involve PAN/VAT declarations. The `stores` schema includes optional `pan_vat` values printed directly on invoices.

### UX Directives
- **Visual Tone:** Operational, calm, clean, high-contrast, text-led UI (Shopify Admin / Linear style). Flashy gradients, animations, or glassmorphism are explicitly banned.
- **POS Speed:** Keyboard-centric controls (Enter to add, Escape to clear, Ctrl+Enter to checkout) to facilitate rapid checkout in busy environments.
- **Search UX:** Typo-tolerant, SKU-capable local search for items to prevent check-out slowdowns.

## Critical Protocols (PaisaPOS OS)

- **Zero Trust Client:** The React client is an interface, not an authority. Client-reported item prices, total math, and stock validation are entirely recalculated and enforced server-side.
- **Store-Scoped RLS:** All database rows are restricted by store ownership using the optimized SQL helper function `get_user_store_id()`. No direct tables are queried without store context.
- **Zustand Scope:** The frontend store ([useAppStore](file:///c:/nooridigital_assets/my-projects/billing-system-26-5-21/src/lib/store/useAppStore.ts)) handles UI flags, active tab routing, and the active billing cart. All transactional and write logic goes through Next.js Server Actions or direct Supabase RPC calls.
- **Realtime Sync:** Real-time updates are enabled via Postgres Changes subscriptions debounced to 100ms. Demo mode tabs coordinate state updates using `BroadcastChannel` with cryptographic sync tokens to prevent drift.

## Database Schema Gotchas

### Core Tables
- `stores`: Business name, phone, address, optional `pan_vat` standard.
- `users`: Authenticated profiles linked with Supabase `auth.users` on cascade delete. Holds the `store_id` reference.
- `products`: Product catalog headers (store-scoped). Holds metadata only.
- `product_variants`: Size/color child elements. Contains `sku` (unique text) and `price` (check numeric `>= 0`).
- `inventory`: Variant-specific stock levels (unique constraint on `variant_id` with check `quantity >= 0`).
- `invoices`: Sales headers (unique store-scoped invoice number `unique(store_id, invoice_number)`).
- `invoice_items`: Line-item details capturing `unit_price` and `quantity` checks.
- `audit_logs`: Immutable security log storage.

### Onboarding Deadlock Solution
- Standard row inserts to `stores` and `users` from the client were blocked by RLS circular reference rules during registration. This was fixed by implementing the `register_store_and_user` security definer RPC ([init_schema.sql](file:///c:/nooridigital_assets/my-projects/billing-system-26-5-21/supabase/migrations/20260521084324_init_schema.sql)) which creates both records atomically and bypasses initial checks.

### Audit Trigger Conflicts
- Automated triggers (`trg_log_inventory_adjustment` and `trg_log_price_update`) are defined in [phase3_security_fixes.sql](file:///c:/nooridigital_assets/my-projects/billing-system-26-5-21/supabase/migrations/20260521185000_phase3_security_fixes.sql) to audit manual adjustments.
- During checkout, the RPC sets `app.checkout_active = 'true'` to temporarily disable these triggers and prevent redundant/duplicate audit entries from concurrent stock updates.
