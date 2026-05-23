# Memory
> Last updated: 2026-05-23 11:30 NPT

## Multi-Tenant Store-Scoped SKU & Database Trigger (2026-05-23)

**Observation:** The global unique SKU constraint (`product_variants_sku_key`) prevented operators in different tenant stores from creating identical product SKUs, resulting in `500 (Internal Server Error)` database conflicts. Additionally, making the new `store_id` field `NOT NULL` in `product_variants` broke direct client-side insertions and unit test suites that omit `store_id` from their payloads.

**Action:**
- **Store-Scoped Composite SKU Key:** Dropped the global constraint and created a composite constraint `UNIQUE (store_id, sku)` to permit SKU duplication across different stores while maintaining strict inner-store uniqueness.
- **Auto-Populating Database Trigger:** Created migration `20260523110000_add_product_variants_store_id_trigger.sql` establishing a `BEFORE INSERT` trigger function (`set_product_variant_store_id()`). It automatically resolves and populates `store_id` from the parent `products` table if omitted, preserving full backward compatibility.
- **Graceful SKU Error Mapping:** Intercepted database constraint violations in `upsertProductAction` on the server before network transmission, mapping them to the clean string `"Failed to save product: A variant with this SKU already exists."`.
- **Defensive Client Parsing:** Hardened `mapProductError` in `inventorySlice.ts` to defensively parse native `Error` instances, string fallbacks, and serialized network error objects (extracting nested `.message` and `.error` properties) to render modal alerts cleanly instead of breaking the browser layout.

**Lesson:** Multi-tenant catalog systems should never enforce global SKU constraints; scoping keys composites with a tenant ID is the correct design. When retrofitting a required tenant ID column onto a child table, utilizing a `BEFORE INSERT` trigger to automatically look up and resolve it from parent records ensures zero disruption to existing client-side logic, API endpoints, or test coverage.

---

## Quick-Access Favorite Chips with Momentum Scroll (2026-05-23)

**Observation:** Standard wrapping chips below the POS search bar become visually cluttered and block dynamic card rows on narrow mobile viewports, especially when catalog configurations have up to 200 favorite items.

**Action:**
- **Horizontal Momentum Scroll:** Engineered a single-row momentum scrollable layout (`overflow-x-auto whitespace-nowrap scrollbar-none`) next to a statically pinned, `shrink-0` `"Favorites"` badge anchor.
- **Dynamic Glassmorphic Fades:** Created `canScrollLeft` and `canScrollRight` boundary states and attached a lightweight scroll/resize tracker. Added absolute-positioned gradient overlays (`bg-gradient-to-r` and `bg-gradient-to-l` from white/slate-950) that smoothly fade in/out (`transition-opacity duration-300`) to signal scrollable area boundaries.
- **UX Modals Integration:** Placed the `errorMsg` strip directly inside both the `Quick Product Wizard` and `Edit Product` modal scrollable form wrappers to guarantee instant error visibility, and added a unified state effect to automatically clear active warnings when opening/closing product dialogs.

**Lesson:** In dense mobile POS workspaces, list containers should scroll horizontally with pinned textual headers to maintain visual anchoring. Edge gradient overlays enhance responsiveness on low-end tablets, and modal dialog forms must encapsulate their own dynamic error states internally rather than relying on parent page indicators which get visually masked by overlays.

---

## Ad-hoc Custom Cart Item (Fast Checkout) (2026-05-23)

**Observation:** Store operators needed the ability to check out unlisted/custom fees (e.g., tailoring, gift wraps, custom services) directly inside the billing cart without altering the standard inventory catalog.

**Action:**
- **Database Schema:** Created migration [20260523083000_add_adhoc_billing_items.sql](file:///c:/nooridigital_assets/my-projects/billing-system-26-5-21/supabase/migrations/20260523083000_add_adhoc_billing_items.sql) dropping the `NOT NULL` constraint on `invoice_items.variant_id` and adding a `custom_name` text column.
- **Checkout RPC:** Updated `create_invoice_and_deduct_stock` to check if `variant_id` is null, bypassing inventory stock queries/locks/deductions and saving the custom description to the new `custom_name` column.
- **Deadlock Mitigation:** In both the server action and the PL/pgSQL loop, cart items are sorted alphabetically by `variant_id` (putting `NULL`s at the end) to ensure deterministic lock acquisition order.
- **Frontend & UI:** Added a popup modal in [billing-tab.tsx](file:///c:/nooridigital_assets/my-projects/billing-system-26-5-21/src/components/billing-tab.tsx) triggered by `+ Custom` with quantity merging for duplicate names. Updated receipts, drawers, and tables to fallback to `custom_name`.
- **Verification:** Integrated live database checkout checks against the local Supabase container inside [live-crud.test.ts](file:///c:/nooridigital_assets/my-projects/billing-system-26-5-21/src/lib/store/__tests__/live-crud.test.ts) alongside unit/stress tests. All 33 tests passed cleanly.

**Lesson:** Supporting ad-hoc cart items in transactional catalogs requires making relational join foreign keys nullable, caching/storing descriptions statically on the line item record, and placing null variant IDs last in deadlock sorting queues to preserve concurrency integrity.

---

## Database RLS Caching Optimization & Foreign Key Indexing (2026-05-23)

**Observation:** Row-Level Security (RLS) policies called custom functions (like `get_user_store_id()`) directly, causing PostgreSQL to re-evaluate them row-by-row on large queries. Missing foreign key indexes on `users(store_id)`, `invoice_items(variant_id)`, and `audit_logs(store_id)` also risked slow table scans.

**Action:**
- **RLS Query Optimization:** Wrapped function evaluations in a `SELECT` statement (e.g. `(SELECT get_user_store_id())`) inside [20260523074500_rls_optimizations_and_indexes.sql](file:///c:/nooridigital_assets/my-projects/billing-system-26-5-21/supabase/migrations/20260523074500_rls_optimizations_and_indexes.sql) to enable planner-level caching and avoid per-row re-evaluation.
- **Index Reinforcement:** Added indexes on foreign key columns used in joins and policies (`users.store_id`, `invoice_items.variant_id`, and `audit_logs.store_id`).

**Lesson:** Wrapping function calls in a `(SELECT ...)` subquery within RLS policy statements forces PostgreSQL to evaluate them once and reuse the value, protecting search execution speed.

---

## Supabase Client Build-Time Prerendering Resolution (2026-05-23)

**Observation:** During `npm run build`, Next.js static prerendering processes evaluated module-level client initializations in [supabase.ts](file:///c:/nooridigital_assets/my-projects/billing-system-26-5-21/src/lib/supabase.ts). Lacking env vars, the build crashed with `Error: supabaseKey is required`.

**Action:**
- **Dynamic Fallbacks:** Modified `supabase.ts` to fall back to dummy/placeholder credentials (`"https://placeholder-project.supabase.co"` and `"placeholder-anon-key"`) if `process.env.NEXT_PUBLIC_SUPABASE_URL` or `process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY` are not set.

**Lesson:** Any module-level service client that initializes at compile time must provide default/fallback structures when environment credentials are not present, ensuring Next.js static prerendering does not crash.

---

## Consolidated Historical Resolutions (May 2026)

* **Vercel Build Cache & ESLint Ignores:** Deploying from the Vercel CLI with the `--force` flag bypassed outdated configuration path caches when moving configuration extensions (e.g. `.ts` to `.mjs`). Added `.vercel/**` to global ignores in `eslint.config.mjs` to block syntax validation of production build files.
* **Store Settings & Input Validation:** Built Zod schemas (`updateStoreSchema`, `updateProfileSchema`) to strictly validate store configuration limits inside `actions.ts`. Utilized React 19 dynamic `key={store?.id}` binding to remount and safely populate settings input fields once async database load completes (avoiding React effect warnings).
* **Zustand Concurrency & Flickering:** Fixed UI flickering on rapid stock clicks. Introduced `pendingStockRequests` and `pendingStockUpdates` tracking. In `fetchStoreData`, fetched DB values are ignored if local client adjustments are in-flight, falling back to clean rollbacks per variant on ultimate request failures.
* **Network & UI Hardening:** Hardened checkout client gates against connection drops (`navigator.onLine === false`). Added `maxLength` bounds to prevent validation overflows, wrapped pages in `<ErrorBoundary>`, and implemented a top connectivity warning banner.
* **Mobile UX Responsive Tweaks:** Optimized table layouts on narrow views (320px) using scrollable wrappers (`overflow-x-auto` with absolute `min-w-[600px]`) instead of squeezing text. Shifted mobile cart action options to clean vertical stacks.
* **Theme System:** Developed a global dark/light/system theme toggler utilizing `theme-provider.tsx` and a heads-up IIFE script inside `layout.tsx` to pre-apply `.dark` styling before DOM paint (eliminating white hydration flashes).
* **Demo Mode Removal:** Stripped all legacy mock pre-seed configurations, local storage hooks, and fallback client checks to enforce pure Supabase database authentication in production.

---

## Niche Intelligence & Critical Protocols

### Target ICP & Environment
* **Target ICP:** Nepali fashion boutique owners, streetwear brands, and hybrid social-commerce clothing retailers.
* **Hardware:** Lower-to-mid range Android tablets/phones (requires min `44px` touch targets). Invoicing standards require optional `pan_vat` values.

### Core Policies
* **Zero Trust Client:** Client-reported prices, cart math, and stock levels are treated as untrusted interfaces. All calculations and validations are strictly recalculated and enforced server-side inside database transactions.
* **Store-Scoped RLS:** All tables are secured via RLS using the stable security definer function `get_user_store_id()`. No tables are queried without tenant context.
* **Database Schema Gotchas:**
  * `invoices.invoice_number` is sequentially incremented per-store using exclusive write locks (`FOR UPDATE` on `stores`) to enforce gapless sequences.
  * relational Supabase queries require explicit nested selectors (e.g. `*, child_table(*)`) to fetch child details, rather than a flat `*`.
  * `daily-audit-log-archiving` pg_cron task purges audit records older than 30 days to prevent index bloat on large transactional databases.
