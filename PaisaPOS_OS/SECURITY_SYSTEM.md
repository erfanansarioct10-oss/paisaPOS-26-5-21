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
