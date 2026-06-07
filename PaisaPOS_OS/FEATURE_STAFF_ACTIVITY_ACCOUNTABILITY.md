# FEATURE: STAFF, ACTIVITY, AND ACCOUNTABILITY

Version: 1.0  
Status: RESEARCHED AND PLANNED  
Roadmap Section: Beta V1.1 Operational Trust Layer  
Priority: HIGHEST  
Last Updated: 2026-05-25

---

# 1. WHY THIS FEATURE EXISTS

PaisaPOS is now live for Beta V1. The current app has a technically correct owner/cashier split, but the workflow is incomplete for real boutique operations:

- owners are often away from the shop
- cashiers or helpers need to sell without full administrative power
- owners need to know who sold, edited, imported, deleted, or adjusted stock
- shared passwords create blame ambiguity
- hidden owner-only buttons confuse staff unless the role model is visible

The feature goal is not "enterprise RBAC." The goal is boutique trust:

```text
Every shop action should answer: who did it, when, what changed, and under whose authority.
```

---

# 2. PRODUCT PRINCIPLE

## Owner-first, staff-optional

Small boutiques are normally owner-operated. V1.1 should keep the default product simple:

- signup creates an owner account
- owner can run the shop alone forever
- staff features appear only when the owner adds staff

## No shared staff accounts

Every staff member must have a unique login. A shared "cashier" password destroys accountability because the system can only identify the account, not the human.

## Delegation is not role mutation

Temporary owner privileges must not change `users.role` from `cashier` to `owner`.

Instead, a cashier remains a cashier and receives a short-lived delegation record:

```text
Actor: Hassan Tamang
Permanent role: cashier
Temporary privilege: inventory.adjust, catalog.manage
Granted by: Irfan Ansari
Expires: 2026-05-25 14:00 NPT
Reason: Owner away for supplier pickup
```

Every delegated action must display and log:

```text
Hassan adjusted stock while using delegated owner privilege granted by Irfan.
```

---

# 3. USER STORIES

## Staff invitations

1. As an owner, I can invite a cashier by email.
2. As an owner, I can see pending, accepted, expired, and revoked invitations.
3. As an invited cashier, I can accept the invite and join the correct store.
4. As a cashier, I cannot create a separate accidental store during invite acceptance.
5. As an owner, I can suspend a cashier without deleting historical activity.

## Activity accountability

1. As an owner, I can see a store activity timeline.
2. As an owner, I can filter activity by actor, action, result, date, and target type.
3. As an owner, I can open an invoice and see who sold it.
4. As an owner, I can inspect stock/catalog changes with before/after values where safe.
5. As a cashier, I can see my own current delegated access and recent own actions.

## Temporary delegation

1. As an owner, I can grant a cashier temporary access to a specific scope.
2. As an owner, I must provide a reason and expiry.
3. As an owner, I can revoke delegation immediately.
4. As a cashier, I see a clear banner when delegated access is active.
5. As a cashier, I cannot grant delegation to anyone else.

---

# 4. PERMISSION MODEL

## Permanent roles

The existing `users.role` values remain:

```sql
'owner'
'cashier'
```

## Proposed scopes

```sql
create type privilege_scope as enum (
  'checkout.create',
  'catalog.manage',
  'inventory.adjust',
  'store.settings',
  'reports.export',
  'invoice.correct',
  'staff.manage'
);
```

## Role and scope matrix

| Capability | Owner | Cashier | Delegated cashier |
|---|---:|---:|---:|
| Sign in | yes | yes | yes |
| View dashboard | yes | yes | yes |
| Checkout/create invoice | yes | yes | yes |
| View invoices | yes | yes | yes |
| Add/edit/import products | yes | no | only with `catalog.manage` |
| Delete products | yes | no | only with `catalog.manage` plus confirmation |
| Adjust stock | yes | no | only with `inventory.adjust` |
| Toggle favorites | yes | no | only with `catalog.manage` |
| Update store settings | yes | no | only with `store.settings` |
| Export reports | yes | no | only with `reports.export` |
| Invite/remove staff | yes | no | no in V1.1 |
| Grant delegation | yes | no | no |
| View all activity | yes | no | no |
| View own activity | yes | yes | yes |

Important V1.1 guardrail:

```text
staff.manage is not delegatable in V1.1.
```

This prevents a cashier from creating another cashier, promoting a friend, or extending their own power.

---

# 5. DATA MODEL

## 5.1 Extend users for staff lifecycle

Current table already stores `id`, `name`, `store_id`, and `role`.

Add status fields:

```sql
create type user_status as enum ('active', 'suspended');

alter table public.users
  add column if not exists status user_status not null default 'active',
  add column if not exists invited_by_user_id uuid references public.users(id),
  add column if not exists suspended_at timestamptz,
  add column if not exists suspended_by_user_id uuid references public.users(id);
```

Why status instead of deleting staff:

- historical invoices and activity remain attributable
- owner can immediately block app access
- audit history remains readable
- direct deletion does not guarantee all existing access tokens disappear immediately

All authorization helpers must require:

```sql
users.status = 'active'
```

## 5.2 Staff invitations

```sql
create type staff_invitation_status as enum (
  'pending',
  'accepted',
  'expired',
  'revoked'
);

create table public.staff_invitations (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  email text not null,
  role user_role not null default 'cashier',
  status staff_invitation_status not null default 'pending',
  invited_by_user_id uuid not null references public.users(id),
  accepted_by_user_id uuid references public.users(id),
  accepted_at timestamptz,
  revoked_by_user_id uuid references public.users(id),
  revoked_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint staff_invitation_role_check check (role = 'cashier')
);

create unique index staff_invitations_pending_email_store_idx
  on public.staff_invitations(store_id, lower(email))
  where status = 'pending';
```

V1.1 only invites cashiers. Adding multi-owner transfer can happen later.

## 5.3 Privilege delegations

```sql
create type privilege_source as enum (
  'owner_role',
  'cashier_role',
  'delegation',
  'system'
);

create table public.privilege_delegations (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  grantee_user_id uuid not null references public.users(id) on delete cascade,
  granted_by_user_id uuid not null references public.users(id),
  scopes privilege_scope[] not null,
  reason text not null,
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revoked_by_user_id uuid references public.users(id),
  created_at timestamptz not null default now(),
  constraint delegation_duration_valid check (expires_at > starts_at),
  constraint delegation_max_duration check (expires_at <= starts_at + interval '24 hours'),
  constraint delegation_reason_length check (char_length(reason) between 5 and 300),
  constraint delegation_not_self check (grantee_user_id <> granted_by_user_id),
  constraint delegation_no_staff_manage check (not ('staff.manage'::privilege_scope = any(scopes)))
);

create index privilege_delegations_store_active_idx
  on public.privilege_delegations(store_id, grantee_user_id, expires_at)
  where revoked_at is null;

create index privilege_delegations_scopes_gin_idx
  on public.privilege_delegations using gin(scopes);
```

## 5.4 Activity events

Do not rely only on current `audit_logs` for user-facing accountability. Existing `audit_logs` are useful, but they mix security events and operational events and are archived/purged. OWASP guidance distinguishes security logs from audit/transaction trails, so V1.1 should introduce a store-facing activity ledger.

```sql
create type activity_result as enum ('success', 'failure');

create table public.activity_events (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  actor_user_id uuid references public.users(id),
  actor_name text not null,
  actor_role user_role not null,
  privilege_source privilege_source not null,
  delegation_id uuid references public.privilege_delegations(id),
  action text not null,
  action_scope privilege_scope,
  target_type text not null,
  target_id uuid,
  target_label text,
  summary text not null,
  before_state jsonb,
  after_state jsonb,
  metadata jsonb not null default '{}'::jsonb,
  result activity_result not null,
  error_code text,
  request_id uuid not null default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index activity_events_store_time_idx
  on public.activity_events(store_id, occurred_at desc, id desc);

create index activity_events_store_actor_time_idx
  on public.activity_events(store_id, actor_user_id, occurred_at desc);

create index activity_events_store_action_time_idx
  on public.activity_events(store_id, action, occurred_at desc);
```

Optional hardening for V1.1.1:

- add `previous_hash` and `event_hash`
- compute hash with a trusted trigger
- prevent update/delete through triggers
- periodically export a digest summary

## 5.5 Invoice attribution

Add fast attribution fields to `invoices`:

```sql
alter table public.invoices
  add column if not exists sold_by_user_id uuid references public.users(id),
  add column if not exists sold_by_name text,
  add column if not exists sold_by_role user_role,
  add column if not exists sold_with_delegation_id uuid references public.privilege_delegations(id);

create index invoices_store_sold_by_created_idx
  on public.invoices(store_id, sold_by_user_id, created_at desc);
```

Why denormalize name/role:

- invoice history remains explainable if staff display name changes later
- receipt can say "Sold by Mina" without extra joins
- store owners see historical truth at the time of sale

---

# 6. AUTH AND INVITATION FLOW

## Preferred Supabase flow

Use Supabase Auth Admin invitation from a Server Action:

```ts
supabaseAdmin.auth.admin.inviteUserByEmail(email, {
  data: {
    invitation_id: invitationId,
    invited_role: "cashier",
  },
  redirectTo: `${APP_URL}/auth/callback?next=/staff/accept?invitationId=${invitationId}`,
});
```

Rules:

- service role key stays server-only
- browser never receives service role key
- owner action creates `staff_invitations` first
- invitation email is sent only after database invite row exists
- accept action verifies current session email equals invitation email
- invitation must be pending and not expired
- accepted user profile is linked to the owner's store as `cashier`

## Avoiding accidental store creation

The existing onboarding trigger creates owner stores only when signup metadata contains the owner onboarding fields. Staff invites must not pass `store_name`. This prevents a cashier invite from becoming an accidental new store owner.

## Existing-user rule

V1.1 should support one account per store only:

| Condition | Behavior |
|---|---|
| Email has no public profile | Accept invite and create cashier profile |
| Email has profile in same store | Allow reactivation or show already joined |
| Email has profile in another store | Block and show support message |
| Email is owner of another store | Block |

---

# 7. SERVER-SIDE ARCHITECTURE

## New DAL helpers

Add to `src/server/supabase/dal.ts` or a split module `src/server/auth/permissions.ts`:

```ts
export type PrivilegeCheckResult = TenantContextDTO & {
  privilegeSource: "owner_role" | "cashier_role" | "delegation";
  delegationId?: string;
  grantedByUserId?: string;
};

export async function requirePrivilege(
  scope: PrivilegeScope,
): Promise<PrivilegeCheckResult> {
  // 1. require active tenant context
  // 2. owner passes
  // 3. cashier passes only if scope is cashier-native or active delegation exists
  // 4. return actor plus privilege source for activity logging
}
```

Then replace:

```ts
await requireOwnerContext()
```

with:

```ts
await requirePrivilege("catalog.manage")
await requirePrivilege("inventory.adjust")
await requirePrivilege("store.settings")
```

Checkout should use:

```ts
await requirePrivilege("checkout.create")
```

## Server Actions

New files:

```text
src/app/staff-actions.ts
src/app/activity-actions.ts
src/server/auth/permissions.ts
src/server/activity/activity.ts
src/server/supabase/admin-supabase.ts
```

Action rules:

- every action validates input with Zod
- every action calls `requirePrivilege`
- every action writes `activity_events`
- expected form errors return state for `useActionState`
- unexpected errors are logged and mapped to friendly messages
- no Server Action trusts UI role gates

## Server Components

Add routes:

```text
src/app/(authenticated)/staff/page.tsx
src/app/(authenticated)/activity/page.tsx
src/app/staff/accept/page.tsx
```

Recommended rendering:

- Staff and Activity pages should be Server Components.
- Fetch initial DTOs through server-only DAL.
- Pass minimal DTOs to small Client Components for forms, filters, modals, and optimistic banners.
- Use cursor pagination for activity.

---

# 8. UX DESIGN

## Sidebar

Owner navigation:

```text
Dashboard
Billing POS
Inventory
Invoices
Activity
Staff
Settings
```

Cashier navigation:

```text
Dashboard
Billing POS
Inventory
Invoices
Settings
```

Cashier sees no Staff page. Cashier sees own role badge in sidebar.

## Staff page

Sections:

- active staff
- pending invites
- temporary access
- suspended staff

Owner actions:

- invite cashier
- resend invite
- revoke invite
- suspend staff
- reactivate staff
- grant temporary access
- revoke temporary access

## Activity page

Filters:

- today, 7 days, 30 days, custom range
- actor
- action
- result
- target type

Activity card examples:

```text
2:18 PM
Mina Tamang sold invoice #42
Role: Cashier
Amount: NPR 2,450
Result: Success
```

```text
3:04 PM
Hassan adjusted stock for SKU KURTA-BLK-M from 8 to 11
Role: Cashier
Privilege: Delegated inventory.adjust by Irfan
Reason: Owner away for supplier pickup
Result: Success
```

## Delegation banner

When a cashier has active delegation:

```text
Temporary owner access active until 2:00 PM
Allowed: Catalog, Inventory
Granted by: Irfan
```

This banner should be visible but not frightening.

---

# 9. ACTIONS THAT MUST BE LOGGED

## Billing

- `checkout.created`
- `checkout.failed`
- `discount.applied`
- future: `invoice.voided`
- future: `invoice.refunded`

## Inventory/catalog

- `product.created`
- `product.updated`
- `product.deleted`
- `product.imported`
- `variant.created`
- `variant.updated`
- `variant.deleted`
- `inventory.adjusted`
- `favorite.toggled`

## Staff/access

- `staff.invited`
- `staff.invite_accepted`
- `staff.invite_revoked`
- `staff.suspended`
- `staff.reactivated`
- `delegation.granted`
- `delegation.revoked`
- `delegation.expired` can be inferred, but optional daily log is useful

## Store/settings

- `store.updated`
- `profile.updated`
- `auth.password_reset_requested`
- `auth.password_updated`

---

# 10. IMPLEMENTATION PHASES

## Phase 1: Activity foundation

1. Add `activity_events`.
2. Add server-only `recordActivityEvent`.
3. Add invoice attribution columns.
4. Update checkout RPC to set `sold_by_*`.
5. Add Activity page read-only timeline.
6. Add "Sold by" to invoices and receipt.

Exit criteria:

- owner sees checkout activity and sold-by attribution
- existing checkout tests still pass
- direct table writes cannot fake activity

## Phase 2: Staff invitations

1. Add `staff_invitations`.
2. Add owner-only invite action.
3. Add invite acceptance route.
4. Add Staff page.
5. Add suspend/reactivate.
6. Add staff activity events.

Exit criteria:

- owner invites cashier
- cashier accepts and can checkout
- cashier cannot access owner tools
- owner sees invite and acceptance in activity

## Phase 3: Delegated privileges

1. Add `privilege_delegations`.
2. Add `requirePrivilege`.
3. Replace owner-only checks with scope checks.
4. Add grant/revoke UI.
5. Add delegated banners.
6. Add activity source attribution.

Exit criteria:

- owner grants inventory adjustment for 2 hours
- cashier can adjust stock during window
- cashier loses access after revoke/expiry
- every delegated action shows actor, grantor, and scope

---

# 11. BEST-PRACTICE RESEARCH USED

- Supabase RLS guide: RLS must be enabled for exposed schemas, grants and RLS are separate controls, `auth.uid()` can be used for user policies, `raw_user_meta_data` is unsafe for authorization, and JWT claims can be stale.  
  https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase Auth Admin invite/create user references: user creation and invitation with Admin APIs must run only on a trusted server; service role key must never be exposed in the browser.  
  https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail  
  https://supabase.com/docs/reference/javascript/auth-admin-createuser
- Supabase MFA and reauthentication references: high-risk actions can use MFA/AAL checks or reauthentication flows.  
  https://supabase.com/docs/guides/auth/auth-mfa  
  https://supabase.com/docs/reference/javascript/auth-reauthentication
- Supabase database functions: prefer security invoker, set `search_path` for security definer functions, and revoke public function execution for protected functions.  
  https://supabase.com/docs/guides/database/functions  
  https://supabase.com/docs/guides/troubleshooting/how-can-i-revoke-execution-of-a-postgresql-function-2GYb0A
- Supabase RLS performance: index RLS columns and wrap stable helper calls in `select` for planner caching where valid.  
  https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv
- Next 16 local docs: Server Functions are reachable by direct POST and must verify auth/authz; server-only code should use `server-only`; use Server Components for data and Server Actions for mutations; use `useActionState` for expected form errors.
  Local references:
  - `node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md`
  - `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`
  - `node_modules/next/dist/docs/01-app/01-getting-started/10-error-handling.md`
- OWASP Authorization Cheat Sheet: least privilege, deny by default, validate permissions on every request.
  https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html
- OWASP Logging Cheat Sheet: log higher-risk functionality, capture when/where/who/what, avoid sensitive data, sanitize event data, and protect logs from tampering.
  https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html
- OWASP Session Management Cheat Sheet: require reauthentication after high-risk events and renew session after privilege-level changes.
  https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html

---

# 12. OPEN DECISIONS BEFORE CODING

1. Should cashiers see all invoices or only invoices they created?
   - Recommendation: all invoices for V1.1, because small shops need continuity.
2. Should owners be able to invite another owner?
   - Recommendation: no in V1.1. Keep ownership transfer out of scope.
3. Should delegation require email OTP/MFA in V1.1?
   - Recommendation: yes for delegation grant. Staff invites can require normal owner session plus rate limiting.
4. Should activity records store before/after values for all fields?
   - Recommendation: store only safe operational fields, never auth secrets, never raw request payloads.
5. Should activity logs be kept forever?
   - Recommendation: keep active 180 days, archive after that, and add export later.
