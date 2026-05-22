# SECURITY_SYSTEM

Version: 2.0  
Status: Active  
Last Updated: 2026-05-21  

---

# 1. PURPOSE

This document defines the security architecture, defensive principles, modern OWASP protections, authentication standards, infrastructure hardening, and operational security requirements for PaisaPOS.

The goal is to protect:
- Inventory integrity
- Financial records
- Multi-tenant store isolation
- Customer trust
- Operational continuity

---

# 2. CORE SECURITY PRINCIPLE

The absolute, non-negotiable rule of PaisaPOS:

```text
Never trust the client.
```

All sensitive operations must be validated:
- **Server-side** (via Next.js server context, API endpoints, or Server Actions)
- **Database-side** (via Row-Level Security and explicit constraints)
- **Transactionally** (via ACID-compliant PL/pgSQL functions)

---

# 3. SECURITY PRIORITIES

Security priorities order:
1. Inventory Safety & Pricing Integrity
2. Multi-Tenant Authorization Isolation
3. Authentication Security
4. Transaction Integrity
5. Secure Data Protection
6. Infrastructure & Deployment Hardening

---

# 4. SECURITY MODEL

PaisaPOS adheres strictly to the following security architectures:
- **Zero Trust Architecture:** Every request, internal or external, must authenticate and authorize.
- **Least Privilege Access:** Users and backend processes run with the minimal set of privileges required.
- **Defense In Depth:** Layered controls (Frontend client constraints $\rightarrow$ Next.js Server logic $\rightarrow$ Postgres Database constraints).
- **Secure By Default:** RLS is default-enabled on all new tables; public APIs are disabled by default.

---

# 5. OWASP SECURITY COMPLIANCE

PaisaPOS is hardened against the modern threat landscape, specifically aligned with **OWASP Top 10:2025/2026** and **OWASP Top 10 for Agentic Applications 2026**:

1. **A01:2025/2026 – Broken Access Control** (including SSRF)
2. **A02:2025/2026 – Security Misconfiguration**
3. **A03:2025/2026 – Software Supply Chain Failures**
4. **A04:2025/2026 – Cryptographic Failures**
5. **A05:2025/2026 – Injection**
6. **A06:2025/2026 – Insecure Design**
7. **A07:2025/2026 – Identification and Authentication Failures**
8. **A08:2025/2026 – Software and Data Integrity Failures**
9. **A09:2025/2026 – Security Logging and Monitoring Failures**
10. **A10:2025/2026 – Mishandling of Exceptional Conditions**

---

# 6. OWASP A01:2025/2026 — BROKEN ACCESS CONTROL

## Risks
- Unauthorized multi-tenant store access (data crossing store boundaries)
- Privilege escalation from normal employee to store owner or administrator
- Direct Object Reference (IDOR) traversal on invoices, stock adjustments, or customers
- Server-Side Request Forgery (SSRF) via malicious outbound loops

## Protections

### Row Level Security (RLS)
All database tables must explicitly enable RLS. Policies must restrict read/write access using the stable, security-definer helper:
```sql
store_id = get_user_store_id()
```

### Store Isolation
Users must NEVER be able to read, update, or delete:
- Another store's inventory
- Another store's invoices or financial summaries
- Another store's customer logs or profiles

### Server-Side Route Guarding
All Next.js app routes under `/dashboard` require a valid, authenticated session checked server-side via Next.js middleware and secure Supabase server-side contexts.

### SSRF Mitigation
No frontend input is ever used directly to perform arbitrary outbound HTTP requests from our server-side environment. Outbound requests are strictly limited to pre-configured, trusted payment gateway and auth API domains.

---

# 7. OWASP A02:2025/2026 — SECURITY MISCONFIGURATION

## Risks
- Leaking internal database structure or stack traces to client browsers
- Publicly accessible configuration files, debug endpoints, or API consoles
- Exposing administrative service keys on the client-side bundle

## Protections

### Environment Separation
Maintain isolated configurations for:
- `development` (local sandbox, mock auth)
- `staging` (pre-production mirror)
- `production` (production-only Supabase DB and restricted environmental access)

### Exposed Secrets Prevention
- The `SUPABASE_SERVICE_ROLE_KEY` must **never** be exposed in client bundles or referenced in code running on the client.
- Client keys must only possess limited, authenticated RLS permissions.

### Cross-Origin Resource Sharing (CORS)
Production Supabase and API endpoints must restrict allowed origins strictly to the authorized PaisaPOS deployment domains.

---

# 8. OWASP A03:2025/2026 — SOFTWARE SUPPLY CHAIN FAILURES

## Risks
- Malicious third-party npm package updates hijacking server actions or stealing customer data
- Unsigned or unverified packages introducing backdoors during continuous integration

## Protections

### Lockfile Integrity
All dependencies must be locked down strictly using `package-lock.json` or `pnpm-lock.yaml`. Never bypass or delete lockfiles.

### Dependency Vulnerability Audits
Run automated vulnerability checks regularly:
```bash
npm audit
```
Integrate automated dependency checking (e.g. Snyk, Dependabot) in the repository to block builds with critical or high-risk vulnerabilities.

### Minimal Dependency Principle
Avoid bloating the project with redundant utility libraries. Prioritize native Next.js/React APIs and vanilla CSS over external UI layout components.

---

# 9. OWASP A04:2025/2026 — CRYPTOGRAPHIC FAILURES

## Risks
- Plaintext storage of sensitive configurations or session tokens
- Insecure transmission of invoices or customer profiles over HTTP
- Weak cryptographic algorithms used for token creation

## Protections

### HTTPS Enforcement
All production endpoints must enforce TLS 1.3 only. HTTP requests must be automatically redirected to HTTPS.

### Safe Token Handling
Tokens must be securely stored using modern, browser-protected secure cookie settings:
```text
httpOnly: true
secure: true
sameSite: "Lax"
```

### Password Delegation
We do not salt, hash, or store passwords manually. All credential authentication is delegated to secure, compliance-certified identity providers (Supabase Auth).

---

# 10. OWASP A05:2025/2026 — INJECTION

## Risks
- SQL Injection via string-concatenated SQL queries in RPC or Server Actions
- Cross-Site Scripting (XSS) from malicious product name inputs or custom notes

## Protections

### Parameterized Queries
Never concatenate raw strings in SQL. All database queries must run through the Supabase JS SDK client (which compiles to prepared statements) or safe database RPCs:
```sql
-- Safe parameterized function
CREATE OR REPLACE FUNCTION get_product_by_code(p_code TEXT) ...
```

### Input Sanitization & React Escaping
- All text inputs (e.g., product names, categories, invoice notes) are sanitized prior to database insertion.
- React default rendering engine escapes standard strings, preventing script injection. Never use `dangerouslySetInnerHTML` unless input has passed a strict, verified HTML sanitizer.

---

# 11. OWASP A06:2025/2026 — INSECURE DESIGN

## Risks
- Race conditions during peak checkout hours causing negative stock levels
- Client-side price tampering (allowing users to buy high-value items for cheap prices)
- Incomplete sales leaving orphaned stock deductions

## Protections

### Database-Level Pricing Verification
Never trust checkout totals computed on the client. During invoice creation, the server/database must:
1. Re-query the actual `price` of each variant directly from the database.
2. Multiply by the user's requested quantities.
3. Compute the final invoice totals server-side.
4. Compare and commit. If any price mismatches are found, the transaction is rejected immediately.

### Atomic ACID Transactions
All invoice generation and inventory deduction operations must reside inside a single database transaction. If inventory deduction or invoice writing fails, the entire transaction rolls back completely:
```sql
-- Transaction block inside create_invoice_and_deduct_stock
BEGIN
  -- Deduct inventory
  -- Record invoice
  -- Record audit logs
EXCEPTION WHEN OTHERS THEN
  ROLLBACK;
END;
```

### Row Locking for Race Condition Prevention
Use `FOR UPDATE` lock modifiers inside database checkouts to guarantee that multiple concurrent checkouts on the exact same variant resolve sequentially without overselling.

---

# 12. OWASP A07:2025/2026 — IDENTIFICATION AND AUTHENTICATION FAILURES

## Risks
- Session hijacking or reuse of expired user credentials
- Brute-force attacks on user signup/login endpoints

## Protections

### Session Expiration & Refresh
Implement automatic token renewal via client refresh tokens, and enforce short-lived access tokens (JWTs) that auto-expire.

### Secure Logout Processes
Logout operations must atomically revoke all active sessions on the backend database and clear all client-side session contexts, state arrays, and cached tokens.

---

# 13. OWASP A08:2025/2026 — SOFTWARE AND DATA INTEGRITY FAILURES

## Risks
- Untrusted modifications committed directly to production files
- Unverified third-party libraries loaded at runtime

## Protections

### Compile-Time Checks
All changes must pass strict Next.js production builds and TypeScript type compilation checks:
```bash
npm run build
```
Any type error or lint warning must block the deployment pipeline.

### Protected Branches
Direct commits to production branches are prohibited. All code additions must flow through Pull Requests with mandatory reviews, automated check passes, and verification tests.

---

# 14. OWASP A09:2025/2026 — SECURITY LOGGING AND MONITORING FAILURES

## Risks
- Undetected pricing manipulation or database access bypass
- Lack of audit trails for inventory adjustments

## Protections

### Server-Side Immutability logs
Log all high-importance events inside a dedicated `audit_logs` database table:
- User signup and onboarding creations
- Completed checkouts and invoice generations
- Stock manual adjustments and pricing updates

The `audit_logs` table must restrict updates and deletions using custom database RLS policies. It is write-only for audit integrity.

---

# 15. OWASP A10:2025/2026 — MISHANDLING OF EXCEPTIONAL CONDITIONS

## Risks
- Database failures leaking raw schema outlines or storage paths in error payloads
- Application crashes leaving partial transactions committed (data corruption)
- Quiet swallows of critical security failures (e.g., auth service down but continuing flow)

## Protections

### Exception Handling in DB RPCs
Database PL/pgSQL functions must utilize structured exception catch-blocks, log the error internally, rollback partial changes, and return safe, sanitised error descriptions:
```sql
EXCEPTION
  WHEN foreign_key_violation THEN
    RAISE EXCEPTION 'Invalid reference provided. Operation aborted.';
  WHEN OTHERS THEN
    RAISE EXCEPTION 'An unexpected transactional error occurred.';
```

### Safe React Failures
Use structured React Error Boundaries around high-interaction POS zones (like the billing grid and inventory scanner) to prevent full-application crashes, reverting the local state safely to stable backups.

---

# 16. RATE LIMITING

Rate limiting protects PaisaPOS from brute-force attempts and denial-of-service spikes:
- **Authentication Routes:** Strict limiting on signup and login attempts.
- **Transactional Routes:** Max limits on invoice generation per IP / per user token to prevent spam checkouts.
- **Search Routes:** Rate limit real-time search queries to optimize DB performance.

---

# 17. DATABASE SECURITY RULES
1. **RLS Mandatory:** RLS must be active on every table. Default RLS bypass is completely banned.
2. **Helper-Driven Performance:** Use cached Stable SQL helper functions for RLS filters to prevent expensive recursive joins.
3. **Strict Constraints:** Enforce constraints (`quantity >= 0`, `price >= 0`) at the DB schema layer.

---

# 18. AI AGENT SECURITY RULES (OWASP AGENTIC TOP 10)

AI agents (including design, engineering, and auditing agents) must adhere strictly to these operational limits:
- **Never bypass access controls:** Do not weaken DB schemas or disable RLS policies to make tests pass.
- **Never trust client input:** When designing actions or pages, enforce strict, server-side data checks.
- **Conceal secrets:** Never hardcode passwords, API tokens, or internal environment configurations into files or logs.
- **Defensive Error Handling:** Ensure all code written by AI agents handles exception states cleanly and safe-fails without crashing.

---

# 19. SECURITY CHECKLIST FOR RELEASE

```text
[ ] Row-Level Security active on all DB tables.
[ ] Client-side pricing is fully validated and recalculated server-side.
[ ] Negative stock check constraints verified at schema layer.
[ ] SUPABASE_SERVICE_ROLE_KEY fully concealed from frontend bundles.
[ ] Parameterized database RPC functions handle complex checkouts.
[ ] Dependency scan passes with 0 critical alerts.
[ ] Build completes synchronously with no lint or TypeScript errors.
```

---

# 20. COMPREHENSIVE SECURITY AUDIT LOG

This audit evaluates the PaisaPOS codebase across five target security domains. It outlines identified risks, vulnerable locations, severity ratings, attack proof-of-concepts, and fixed/secure remediation structures.

---

## 20.1 Authentication & Authorization Audit

### Issue 1: Fail-Open Route Guarding Middleware on Missing Environment Configuration
- **Vulnerability Explanation:** The Next.js middleware implementation checks for the existence of Supabase client credentials (`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`). If these variables are missing or undefined in the environment, the middleware catches this configuration absence and returns `NextResponse.next()`, failing open. As a result, route guarding for pathnames starting with `/dashboard` is bypassed, allowing access to the protected workspace routes. While the frontend will default to local Demo Mode, exposing the underlying pages and API calls represents a security route bypass.
- **Affected Code:** [proxy.ts:L23-28](file:///c:/nooridigital_assets/my-projects/billing-system-26-5-21/src/proxy.ts#L23-28)
- **Severity:** High
- **Fixed/Secure Code Pattern:**
  ```typescript
  // src/proxy.ts
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    // Enforce redirection to home/auth page for dashboard routes to prevent fail-open bypasses
    const { pathname } = request.nextUrl
    if (pathname.startsWith('/dashboard')) {
      const url = request.nextUrl.clone()
      url.pathname = '/'
      url.search = ''
      return NextResponse.redirect(url)
    }
    return response
  }
  ```

### Issue 2: Absence of User Role Separation (Privilege Escalation Vector)
- **Vulnerability Explanation:** Users registered in the [users](file:///c:/nooridigital_assets/my-projects/billing-system-26-5-21/src/lib/schema.sql#L29-35) table are associated with a `store_id` but have no specific user role (e.g. Cashier vs Store Owner/Admin). Row Level Security (RLS) policies and Server Actions authorize any user linked to the store to run all database modifications. A malicious regular user (cashier) can adjust stock balances, update prices, or delete products.
- **Affected Code:** [schema.sql](file:///c:/nooridigital_assets/my-projects/billing-system-26-5-21/src/lib/schema.sql) (Database schema structure) and Server Actions in [actions.ts](file:///c:/nooridigital_assets/my-projects/billing-system-26-5-21/src/app/actions.ts)
- **Severity:** Medium
- **Fixed/Secure Code Pattern:**
  Add a role column to the users table and update the RLS policies to restrict pricing/inventory configuration to owners:
  ```sql
  -- Create enum and update users table
  CREATE TYPE user_role AS ENUM ('owner', 'cashier');
  ALTER TABLE users ADD COLUMN role user_role NOT NULL DEFAULT 'cashier';

  -- Restrict product adjustments to owner role
  CREATE POLICY "Owners can modify products in their store" ON products
    FOR UPDATE, DELETE USING (
      store_id = get_user_store_id() AND
      (SELECT role FROM users WHERE id = auth.uid()) = 'owner'
    );
  ```

---

## 20.2 Injection & Input Validation Audit

### Issue 1: Missing Server-Side Input Length Constraints (Denial of Service & DB Storage Exhaustion)
- **Vulnerability Explanation:** Server Actions in [actions.ts](file:///c:/nooridigital_assets/my-projects/billing-system-26-5-21/src/app/actions.ts) accept string parameters (`customerName`, `customerPhone`, `invoiceNumber`, product `name`, variant `sku`) directly from the client and pass them into database RPC functions or updates. There is no server-side validation using schemas (such as Zod) to restrict string lengths. A malicious user can transmit excessively large text payloads (e.g. 50MB strings), resulting in buffer issues, request timeouts, and disk storage exhaustion on the database server.
- **Affected Code:** [checkoutAction](file:///c:/nooridigital_assets/my-projects/billing-system-26-5-21/src/app/actions.ts#L36) and [upsertProductAction](file:///c:/nooridigital_assets/my-projects/billing-system-26-5-21/src/app/actions.ts#L103) in `src/app/actions.ts`
- **Severity:** Medium
- **Proof-of-Concept Attack:**
  An attacker triggers the checkout action programmatically with an extremely large payload for the customer's name:
  ```javascript
  const maliciousLargeName = "X".repeat(20 * 1024 * 1024); // 20 MB string
  await checkoutAction({
    storeId: "00000000-0000-0000-0000-000000000000",
    invoiceNumber: "INV-2026-9999",
    customerName: maliciousLargeName,
    customerPhone: null,
    totalAmount: 10,
    discountAmount: 0,
    paidAmount: 10,
    paymentMethod: "Cash",
    items: [{ variant_id: "variant-uuid", quantity: 1, unit_price: 10, subtotal: 10 }]
  });
  ```
- **Remediation & Fixed Code:**
  Validate inputs inside Server Actions using Zod schemas:
  ```typescript
  import { z } from "zod";

  const checkoutSchema = z.object({
    storeId: z.string().uuid(),
    invoiceNumber: z.string().max(50),
    customerName: z.string().min(1).max(100),
    customerPhone: z.string().max(20).nullable(),
    totalAmount: z.number().nonnegative(),
    discountAmount: z.number().nonnegative(),
    paidAmount: z.number().nonnegative(),
    paymentMethod: z.enum(['Cash', 'eSewa', 'Khalti', 'Fonepay']),
    items: z.array(z.object({
      variant_id: z.string().uuid(),
      quantity: z.number().int().positive(),
      unit_price: z.number().nonnegative(),
      subtotal: z.number().nonnegative()
    })).min(1)
  });

  export async function checkoutAction(rawParams: unknown) {
    // Strictly validate input structure and lengths server-side
    const params = checkoutSchema.parse(rawParams);
    
    const supabase = await getSupabaseServerClient();
    const sortedItems = [...params.items].sort((a, b) => a.variant_id.localeCompare(b.variant_id));

    const { data: returnedInvoiceId, error: rpcError } = await supabase.rpc(
      "create_invoice_and_deduct_stock",
      {
        p_store_id: params.storeId,
        p_invoice_number: params.invoiceNumber,
        p_customer_name: params.customerName,
        p_customer_phone: params.customerPhone,
        p_total_amount: params.totalAmount,
        p_discount_amount: params.discountAmount,
        p_paid_amount: params.paidAmount,
        p_payment_method: params.paymentMethod,
        p_items: sortedItems,
      }
    );

    if (rpcError) throw new Error(rpcError.message);
    return returnedInvoiceId;
  }
  ```

---

## 20.3 API & Data Exposure Audit

### Issue 1: Lack of API Request Rate Limiting (Brute-Force & Denial of Service Vulnerability)
- **Vulnerability Explanation:** There is no rate-limiting or request throttling implemented at the Next.js router or middleware layer. Authenticated users can invoke compute-heavy actions (like `checkoutAction` which locks rows and recalculates values, or `upsertProductAction`) at high frequency. Unauthenticated users can flood registration endpoints to exhaust server resources.
- **Affected Endpoints:** All Next.js Server Actions in [actions.ts](file:///c:/nooridigital_assets/my-projects/billing-system-26-5-21/src/app/actions.ts) and Auth pages in [page.tsx](file:///c:/nooridigital_assets/my-projects/billing-system-26-5-21/src/app/page.tsx)
- **Severity:** High
- **Remediation:** Enforce rate-limiting profiles on Supabase auth endpoints (via the Supabase dashboard) and implement a token-bucket/sliding-window middleware check (e.g. using Upstash Redis or local memory caches) on Next.js Server Actions.

### Issue 2: Unpaginated Product and Invoice Lists Retrieval (Mass Data Extraction Risk)
- **Vulnerability Explanation:** The store data sync function (`fetchStoreData`) query loads all products, variants, and invoices matching a tenant store in single unpaginated calls. As invoices grow into the thousands, these queries will degrade database response time, exhaust network bandwidth, and increase client memory footprints.
- **Affected Code:** [authSlice.ts:L336-415](file:///c:/nooridigital_assets/my-projects/billing-system-26-5-21/src/lib/store/authSlice.ts#L336-415)
- **Severity:** Medium
- **Remediation:** Introduce pagination query bounds (`.range()`) on products and invoices:
  ```typescript
  const { data: dbInvoices } = await supabase
    .from("invoices")
    .select("*")
    .eq("store_id", store.id)
    .order("created_at", { ascending: false })
    .range(0, 49); // Retain latest 50 invoices on load
  ```

---

## 20.4 Dependency & Configuration Security Audit

### Issue 1: Vulnerability in CSS Processing Sub-Dependency (`postcss`)
- **Vulnerability Explanation:** Running dependency audits via `npm audit` flags a moderate-severity vulnerability in the `postcss` library (< 8.5.10). An XSS flaw exists where unescaped `</style>` tags inside the CSS stringify outputs can allow code execution under specific circumstances. Because `next` utilizes `postcss` as a build-time dependency, the project's dependencies are affected.
- **Affected Files:** [package.json](file:///c:/nooridigital_assets/my-projects/billing-system-26-5-21/package.json)
- **Severity:** Moderate
- **Remediation:** Lock the PostCSS sub-dependency to a safe, updated version by adding an override configuration inside the package definition:
  ```json
  // In package.json
  "overrides": {
    "postcss": "^8.5.10"
  }
  ```
  Run `npm install` afterwards to apply the update.

---

## 20.5 Business Logic & State Management Audit

### Issue 1: Missing Explicit Positive Quantity Check in `create_invoice_and_deduct_stock`
- **Vulnerability Explanation:** The PL/pgSQL function `create_invoice_and_deduct_stock` iterates through cart checkout items, updates inventory levels (`quantity = quantity - items.quantity`), and inserts logs. The database schema verifies `invoice_items.quantity > 0` through a check constraint, causing insertions to fail and transactions to roll back if quantities are non-positive. However, the inventory quantity deduction is executed prior to the insertion check. Standard security hygiene dictates validating parameters explicitly inside the loops before running updates to prevent logical side-effects.
- **Affected Code:** [20260521191000_pre_deploy_fixes.sql:L111-165](file:///c:/nooridigital_assets/my-projects/billing-system-26-5-21/supabase/migrations/20260521191000_pre_deploy_fixes.sql#L111-165)
- **Severity:** Low / Medium
- **Proof-of-Concept Attack Scenario:**
  An attacker passes a negative item quantity (e.g. `-10`). The loop updates the inventory table `quantity = quantity - (-10)`, which performs an addition and increases store stock. The transaction eventually rolls back when the insert statement violates the `invoice_items` positive quantity check, but relying on constraint ordering for validation rather than validation-first is bad practice.
- **Fixed SQL Code:**
  Update the database RPC to validate inputs explicitly before executing database writes:
  ```sql
  -- Inside create_invoice_and_deduct_stock item loop
  FOR v_item IN 
    SELECT x.val 
    FROM jsonb_array_elements(p_items) AS x(val) 
    ORDER BY (x.val->>'variant_id') 
  LOOP
    -- Explicit validation check
    IF (v_item->>'quantity')::int <= 0 THEN
      RAISE EXCEPTION 'Checkout failed: Quantity for variant ID % must be greater than zero.', (v_item->>'variant_id');
    END IF;
    
    -- Proceed with variant check and row-locking...
  END LOOP;
  ```

### Issue 2: Lack of Idempotency on Invoices Checkout
- **Vulnerability Explanation:** There is no client/server transaction idempotency key enforced on checkout invoices. If a client sends multiple rapid, identical checkout payloads (e.g., due to double-clicks or browser retry attempts), the server locks the store row, processes the requests sequentially, and creates duplicate invoices (e.g. `INV-2026-0001` and `INV-2026-0002`) instead of returning the already created invoice record.
- **Affected Code:** [20260521191000_pre_deploy_fixes.sql:L46-195](file:///c:/nooridigital_assets/my-projects/billing-system-26-5-21/supabase/migrations/20260521191000_pre_deploy_fixes.sql#L46-195)
- **Severity:** Medium
- **Remediation:** Introduce a unique `idempotency_key` (UUID) field on the `invoices` table. The client generates this token when compiling the cart and passes it. The RPC checks if the key matches a committed invoice and returns it directly:
  ```sql
  ALTER TABLE invoices ADD COLUMN idempotency_key uuid UNIQUE;
  ```

### Issue 3: Missing Audit Logs on Product Deletions
- **Vulnerability Explanation:** In `deleteProductAction`, products are deleted from the database. Unlike product creations, product updates, and stock adjustments, product deletions are not logged to the `audit_logs` table, leaving a gap in the store's audit trail.
- **Affected Code:** [deleteProductAction](file:///c:/nooridigital_assets/my-projects/billing-system-26-5-21/src/app/actions.ts#L139-169) in `src/app/actions.ts`
- **Severity:** Low / Medium
- **Fixed Code Snippet:**
  ```typescript
  export async function deleteProductAction(productId: string) {
    const supabase = await getSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthenticated");

    const { data: profile } = await supabase
      .from("users")
      .select("store_id")
      .eq("id", user.id)
      .single();

    if (!profile?.store_id) throw new Error("Store profile not found");

    const { error } = await supabase
      .from("products")
      .delete()
      .eq("id", productId)
      .eq("store_id", profile.store_id);

    if (error) throw new Error(error.message);

    // Audit the deletion safely
    await supabase.from("audit_logs").insert({
      store_id: profile.store_id,
      user_id: user.id,
      operation: "PRODUCT_DELETE",
      affected_entity: "Product ID: " + productId,
      result: "SUCCESS",
    });

    return true;
  }
  ```

