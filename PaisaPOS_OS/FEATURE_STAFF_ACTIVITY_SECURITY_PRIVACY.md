# SECURITY AND PRIVACY DESIGN: STAFF, ACTIVITY, AND DELEGATION

Version: 1.0  
Status: RESEARCHED AND PLANNED  
Last Updated: 2026-05-25

---

# 1. SECURITY GOAL

The feature introduces staff accounts, owner-visible activity, and optional temporary delegation. This increases product power, so the security design must prevent:

- cashier self-promotion
- cross-store invitation abuse
- fake audit/activity rows
- direct Supabase Data API bypass
- stale JWT authorization mistakes
- hidden use of shared passwords
- sensitive data leakage through logs
- delegated privilege that cannot be revoked immediately

The security rule is:

```text
Every privileged mutation must be authorized at the server/database boundary and must write an immutable activity event.
```

---

# 2. TRUST BOUNDARIES

## Browser

The browser is untrusted.

Allowed:

- read own store data through RLS
- submit forms to Server Actions
- display role-gated UI

Not allowed:

- service role key
- staff creation without Server Action
- direct audit/activity writes
- direct delegation writes
- permanent role changes

## Server Actions

Server Actions are the primary privileged mutation boundary.

Next 16 local docs warn that Server Functions are reachable by direct POST, not only through the UI. Therefore, every Server Action must validate authentication and authorization internally.

Rules:

- parse all inputs with Zod
- call `requireTenantContext` or `requirePrivilege`
- rate limit by user and/or IP
- write activity events
- return expected errors via `useActionState`-style state for forms
- never return raw Supabase user/admin objects

## Database

The database is the final authority.

Rules:

- enable RLS on all public tables
- grant only deliberate permissions
- keep staff/delegation/activity write paths behind Server Actions or RPCs
- use tenant constraints and indexes
- use immutable activity triggers where possible

---

# 3. AUTHORIZATION PATTERN

## Do not store authorization in user metadata

Supabase documents that `raw_user_meta_data` can be modified by authenticated users, so it must not control authorization. Authorization remains in `public.users`, `staff_invitations`, and `privilege_delegations`.

## Do not rely on JWT freshness for delegation

Supabase notes JWT values may not reflect updates until refresh. Temporary delegation must be checked from the database on each privileged action, not embedded only in `app_metadata`.

## Centralize permission checks

All privileged app actions should use:

```ts
requirePrivilege(scope)
```

Do not scatter role checks like:

```ts
if (user.role !== "owner") throw new Error("Unauthorized");
```

The centralized helper should:

1. authenticate with `supabase.auth.getUser()`
2. load active profile and store
3. reject suspended users
4. allow permanent owner
5. allow cashier-native scopes like `checkout.create`
6. check active unexpired delegation for admin scopes
7. return actor, store, privilege source, and delegation id

---

# 4. STAFF INVITE SECURITY

## Server-only admin client

Create a server-only admin Supabase client:

```ts
import "server-only";
import { createClient } from "@supabase/supabase-js";

export function getSupabaseAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}
```

This file must never be imported into Client Components.

## Invite constraints

Staff invitation Server Action must enforce:

- caller is active owner
- invite email normalized with lower-case trim
- target role is cashier only
- invite belongs to caller's store
- pending invite uniqueness per store/email
- expiry is short, recommended 48 hours
- no invite to existing user from another store
- rate limit, recommended 10 invites per owner per day for beta

## Accept constraints

Invite acceptance must enforce:

- authenticated user exists
- authenticated user email matches invite email
- invite is pending
- invite is not expired
- invite store exists
- user does not already belong to another store
- resulting profile role is cashier
- activity event is written

---

# 5. DELEGATION SECURITY

## Delegation is scoped and short-lived

Delegation must include:

- exact scopes
- expiry
- reason
- grantor
- grantee
- store

Default duration: 2 hours  
Maximum duration: 24 hours  
Recommended beta scopes: `catalog.manage`, `inventory.adjust`, `store.settings`

Do not delegate:

- `staff.manage`
- role changes
- owner transfer
- deletion of audit/activity data

## Step-up authentication

Granting delegation is high risk. It should require one of:

1. Supabase MFA `aal2` when MFA is available.
2. Supabase reauthentication OTP.
3. As a fallback for dev only, password confirmation with a server-side sign-in check.

The production target should be OTP/MFA, not a client-only confirmation modal.

## Immediate revocation

Because delegation is checked from the database on each action, revocation works immediately:

```sql
update public.privilege_delegations
set revoked_at = now(), revoked_by_user_id = auth.uid()
where id = p_delegation_id
  and store_id = public.get_user_store_id();
```

Do not put delegation only in JWT claims.

---

# 6. ACTIVITY LOG SECURITY

## Activity writes

Direct browser writes must be blocked:

```sql
revoke insert, update, delete on public.activity_events from authenticated;
```

Writes should happen through:

- server-only activity helper using service role, or
- tightly controlled RPC with caller validation

## Activity reads

Owner should read all store activity.

Cashier should read:

- own activity
- active delegation events involving them
- optionally recent checkout events they created

Recommended V1.1 RLS:

```sql
create policy "Owners can read store activity"
on public.activity_events
for select
to authenticated
using (
  store_id = (select public.get_user_store_id())
  and (select role from public.users where id = (select auth.uid())) = 'owner'
);

create policy "Cashiers can read own activity"
on public.activity_events
for select
to authenticated
using (
  store_id = (select public.get_user_store_id())
  and actor_user_id = (select auth.uid())
);
```

## Immutability

No normal user should update/delete activity rows.

Optional trigger:

```sql
create or replace function public.prevent_activity_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'Activity events are immutable.';
end;
$$;
```

Bind it to `before update or delete`.

## Sensitive data rules

Do not log:

- passwords
- access tokens
- refresh tokens
- service role keys
- session cookies
- raw customer phone numbers in metadata
- full request bodies
- payment provider secrets

Safe examples:

- invoice id
- invoice number
- SKU
- product id
- product name
- before/after stock quantity
- actor user id
- actor display name snapshot
- role
- delegation id

Phone numbers should stay in invoice records, not activity metadata.

---

# 7. DATA API HARDENING

The V1.0 hardening already reduced broad direct writes, but V1.1 should continue this direction:

- browser access should be read-mostly
- privileged mutations should go through Server Actions/RPCs
- direct table grants for `staff_invitations`, `privilege_delegations`, and `activity_events` should not include browser DML
- RLS remains enabled as defense in depth

For delegated privileges, do not allow a cashier to mutate `products` directly via REST just because a delegation exists. Delegated admin mutations must pass through Server Actions so we can enforce scope, reason, expiry, rate limit, and activity logging.

---

# 8. DATABASE FUNCTION SECURITY

Supabase docs recommend security invoker by default. When `security definer` is required:

- place helpers in a private schema if possible
- set `search_path = ''` or explicitly set and qualify all tables
- revoke function execution from `public`, `anon`, and unrelated roles
- grant only needed execution to `authenticated` or `service_role`
- run `supabase db lint` and advisors

Recommended helper:

```sql
create schema if not exists private;

create or replace function private.has_store_privilege(p_scope public.privilege_scope)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.users u
    where u.id = (select auth.uid())
      and u.status = 'active'
      and (
        u.role = 'owner'
        or p_scope = 'checkout.create'::public.privilege_scope
        or exists (
          select 1
          from public.privilege_delegations d
          where d.store_id = u.store_id
            and d.grantee_user_id = u.id
            and d.revoked_at is null
            and now() between d.starts_at and d.expires_at
            and p_scope = any(d.scopes)
        )
      )
  );
$$;

revoke execute on function private.has_store_privilege(public.privilege_scope) from public, anon;
grant execute on function private.has_store_privilege(public.privilege_scope) to authenticated;
```

Use this for RLS only when needed. Server Actions can query richer context for activity logging.

---

# 9. PRIVACY POSTURE

## Data minimization

Collect only what the feature needs:

- staff name
- staff email
- role
- status
- action history

Avoid:

- location tracking
- device fingerprinting
- personal notes about staff behavior
- logging customer phone in activity metadata

## Visibility

Owner can see store activity. Cashier can see their own activity and active delegation status.

Do not expose staff email lists to other cashiers.

## Retention

Recommended:

- active activity events: 180 days
- archive: 1 year
- security alert logs: existing policy can remain separate
- export/delete policy to be revisited before paid/enterprise usage

---

# 10. ABUSE AND CONFLICT CONTROLS

## Rate limits

Add limiters:

- staff invite: 10/day/owner
- staff suspend/reactivate: 20/hour/owner
- delegation grant: 10/day/owner
- delegation revoke: 30/hour/owner
- activity export: 5/day/owner
- activity search: normal read path, no aggressive limit unless abused

## Conflict handling

When two users update the same product/stock:

- keep current transaction safety
- activity records show both actions in order
- optional later: optimistic version columns for product and inventory rows

For V1.1, chronological accountability is enough. Do not introduce heavy locking UI unless beta users actually hit conflicts.

---

# 11. SECURITY ACCEPTANCE CRITERIA

The feature is not complete until all are true:

- cashier cannot self-promote
- cashier cannot invite staff
- cashier cannot grant delegation
- cashier cannot directly write activity/delegation/staff tables via REST
- owner can invite cashier
- cashier can accept only their own invite
- invite cannot be accepted after expiry/revoke
- suspended staff cannot access protected routes or Server Actions
- delegated cashier can perform only delegated scopes
- revoked delegation stops immediately
- expired delegation stops without manual cleanup
- every privileged action writes activity with actor, role, source, target, result, and timestamp
- activity entries cannot be updated/deleted by authenticated users
- activity metadata does not contain secrets or raw tokens
- owner can prove who sold an invoice

