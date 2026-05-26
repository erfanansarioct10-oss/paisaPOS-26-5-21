import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migrationSql = readFileSync(
  join(process.cwd(), "supabase/migrations/20260525050559_harden_data_api_tenant_integrity.sql"),
  "utf8"
).toLowerCase();

const activityMigrationSql = readFileSync(
  join(process.cwd(), "supabase/migrations/20260525112112_add_activity_events_foundation.sql"),
  "utf8"
).toLowerCase();

const invoiceAttributionMigrationSql = readFileSync(
  join(process.cwd(), "supabase/migrations/20260525114332_add_invoice_seller_attribution.sql"),
  "utf8"
).toLowerCase();

const staffInvitationMigrationSql = readFileSync(
  join(process.cwd(), "supabase/migrations/20260525121333_add_staff_invitations.sql"),
  "utf8"
).toLowerCase();

const privilegeDelegationMigrationSql = readFileSync(
  join(process.cwd(), "supabase/migrations/20260525151258_add_privilege_delegations.sql"),
  "utf8"
).toLowerCase();

describe("data api and tenant-integrity hardening migration", () => {
  test("revokes direct invoice and audit mutations from authenticated users", () => {
    expect(migrationSql).toContain("revoke insert, update, delete on table public.invoices from authenticated");
    expect(migrationSql).toContain("revoke insert, update, delete on table public.invoice_items from authenticated");
    expect(migrationSql).toContain("revoke insert, update, delete on table public.audit_logs from authenticated");
    expect(migrationSql).toContain('drop policy if exists "users can insert invoices"');
    expect(migrationSql).toContain('drop policy if exists "users can insert invoice items"');
  });

  test("enforces denormalized tenant columns at database boundary", () => {
    expect(migrationSql).toContain("function public.set_product_variant_store_id()");
    expect(migrationSql).toContain("function public.set_inventory_store_id()");
    expect(migrationSql).toContain("function public.enforce_invoice_item_tenant_integrity()");
    expect(migrationSql).toContain("variant store_id");
    expect(migrationSql).toContain("invoice item variant store_id");
  });

  test("adds explicit data api grants and tenant indexes", () => {
    expect(migrationSql).toContain("grant select on table");
    expect(migrationSql).toContain("to authenticated");
    expect(migrationSql).toContain("idx_inventory_store_variant");
    expect(migrationSql).toContain("idx_products_store_lower_name_category");
    expect(migrationSql).toContain("idx_product_variants_store_upper_sku");
  });

  test("adds immutable activity events with store-scoped RLS and no browser writes", () => {
    expect(activityMigrationSql).toContain("create table if not exists public.activity_events");
    expect(activityMigrationSql).toContain("alter table public.activity_events enable row level security");
    expect(activityMigrationSql).toContain("grant select on table public.activity_events to authenticated");
    expect(activityMigrationSql).toContain("revoke insert, update, delete on table public.activity_events from authenticated");
    expect(activityMigrationSql).toContain("idx_activity_events_store_time");
    expect(activityMigrationSql).toContain("idx_activity_events_store_actor_time");
    expect(activityMigrationSql).toContain("trg_prevent_activity_event_update");
  });

  test("adds invoice seller attribution from trusted database context", () => {
    expect(invoiceAttributionMigrationSql).toContain("add column if not exists sold_by_user_id");
    expect(invoiceAttributionMigrationSql).toContain("add column if not exists sold_by_name");
    expect(invoiceAttributionMigrationSql).toContain("add column if not exists sold_by_role");
    expect(invoiceAttributionMigrationSql).toContain("idx_invoices_store_sold_by_created");
    expect(invoiceAttributionMigrationSql).toContain("v_user_id := auth.uid()");
    expect(invoiceAttributionMigrationSql).toContain("select u.name, u.role");
    expect(invoiceAttributionMigrationSql).toContain("sold_by_user_id");
    expect(invoiceAttributionMigrationSql).toContain("v_seller_name");
    expect(invoiceAttributionMigrationSql).toContain("v_seller_role");
  });

  test("adds staff invitations with RLS, explicit grants, and no browser writes", () => {
    expect(staffInvitationMigrationSql).toContain("create table if not exists public.staff_invitations");
    expect(staffInvitationMigrationSql).toContain("alter table public.staff_invitations enable row level security");
    expect(staffInvitationMigrationSql).toContain("grant select on table public.staff_invitations to authenticated");
    expect(staffInvitationMigrationSql).toContain("revoke insert, update, delete on table public.staff_invitations from authenticated");
    expect(staffInvitationMigrationSql).toContain("idx_staff_invitations_pending_email_store");
    expect(staffInvitationMigrationSql).toContain("protect_user_staff_lifecycle_fields");
    expect(staffInvitationMigrationSql).toContain("status = 'active'::public.user_status");
  });

  test("adds temporary privilege delegations with RLS, constraints, indexes, and no browser writes", () => {
    expect(privilegeDelegationMigrationSql).toContain("create table if not exists public.privilege_delegations");
    expect(privilegeDelegationMigrationSql).toContain("alter table public.privilege_delegations enable row level security");
    expect(privilegeDelegationMigrationSql).toContain("grant select on table public.privilege_delegations to authenticated");
    expect(privilegeDelegationMigrationSql).toContain("revoke insert, update, delete on table public.privilege_delegations from authenticated");
    expect(privilegeDelegationMigrationSql).toContain("privilege_delegations_scope_allowed");
    expect(privilegeDelegationMigrationSql).not.toContain("'staff.manage'::public.privilege_scope");
    expect(privilegeDelegationMigrationSql).toContain("idx_privilege_delegations_active_lookup");
    expect(privilegeDelegationMigrationSql).toContain("validate_privilege_delegation");
    expect(privilegeDelegationMigrationSql).toContain("activity_events_delegation_id_fkey");
    expect(privilegeDelegationMigrationSql).toContain("invoices_sold_with_delegation_id_fkey");
  });
});
