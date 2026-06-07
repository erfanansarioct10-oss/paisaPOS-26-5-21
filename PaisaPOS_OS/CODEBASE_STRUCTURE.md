# CODEBASE_STRUCTURE

Version: 1.0
Status: Active
Last Updated: 2026-05-29

---

# 1. PURPOSE

PaisaPOS uses a feature-first modular monolith structure.

The goal is to keep the app:
- manageable
- readable
- safe to refactor
- scalable without premature microservices

This document is a placement contract for new code.

---

# 2. TOP-LEVEL BOUNDARIES

```text
src/
  app/        Next.js routes, layouts, loading/error files, route handlers, and stable server action entrypoints
  features/   Product-domain modules such as inventory, billing, staff, activity, invoices, auth, and settings
  shared/     Cross-feature UI, layout, hooks, and utilities
  server/     Server-only infrastructure, DAL access, auth/permission helpers, logging, rate limiting
  lib/        Truly universal helpers and the central app store entrypoint/types only
```

---

# 3. ROUTING RULES

`src/app` should stay thin.

Allowed in `src/app`:
- `page.tsx`
- `layout.tsx`
- `loading.tsx`
- `error.tsx`
- `route.ts`
- metadata files
- server action wrapper files kept for compatibility

Avoid adding large UI, domain logic, database queries, or state slices directly in `src/app`.

---

# 4. FEATURE RULES

New domain code belongs in:

```text
src/features/<feature>/
  components/
  server/
  state/
  hooks/
  import/
  types.ts
```

Use the smallest folder set needed for the feature.

Current feature homes:
- Inventory: `src/features/inventory`
- Billing: `src/features/billing`
- Staff: `src/features/staff`
- Activity: `src/features/activity`
- Dashboard: `src/features/dashboard`
- Invoices: `src/features/invoices`
- Auth: `src/features/auth`
- Settings: `src/features/settings`

Do not add new files to the retired global `src/components` folder. Domain UI belongs in `src/features/<feature>/components`; cross-feature UI belongs in `src/shared/ui` or `src/shared/layout`.

---

# 5. SERVER RULES

Any module that uses these must live under `src/server` or a feature `server/` folder:
- `headers()`
- `cookies()`
- service-role keys
- Supabase admin clients
- privileged database/RPC logic
- rate limiting
- request logging

Add `import "server-only";` to modules that must never be imported into a client bundle.

Client components may import server DTOs and types only with `import type`.

---

# 6. MIGRATION RULE

Refactors should be wrapper-first:

1. Move implementation to the new feature/server/shared location.
2. Leave an old-path re-export wrapper.
3. Update new code to import from the new location.
4. Remove wrappers only after no imports use them.

This keeps behavior stable while the codebase is reorganized.

The first organization pass has already removed the temporary component, server utility, importer, and state-slice compatibility wrappers. Do not reintroduce old-path aliases unless a future migration explicitly needs a short-lived bridge.

Run `npm run check:architecture` before committing structural work. The guardrail blocks retired import paths, files under `src/components`, and server-only runtime APIs inside general-purpose `src/lib`.
