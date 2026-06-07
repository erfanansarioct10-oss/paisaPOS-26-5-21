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

const delegatedCatalogMigrationSql = readFileSync(
  join(process.cwd(), "supabase/migrations/20260526020902_add_delegated_catalog_actions.sql"),
  "utf8"
).toLowerCase();

const delegatedInventoryMigrationSql = readFileSync(
  join(process.cwd(), "supabase/migrations/20260526124720_add_delegated_inventory_adjustment_rpc.sql"),
  "utf8"
).toLowerCase();

const delegatedActivityCouplingMigrationSql = readFileSync(
  join(process.cwd(), "supabase/migrations/20260526130912_couple_delegated_activity_logging.sql"),
  "utf8"
).toLowerCase();

const delegationGrantTransactionMigrationSql = readFileSync(
  join(process.cwd(), "supabase/migrations/20260526135906_transaction_safe_delegation_grants.sql"),
  "utf8"
).toLowerCase();

const delegationScopeFreezeMigrationSql = readFileSync(
  join(process.cwd(), "supabase/migrations/20260526031511_freeze_v11_delegation_scopes.sql"),
  "utf8"
).toLowerCase();

const inviteAcceptanceMigrationSql = readFileSync(
  join(process.cwd(), "supabase/migrations/20260526032925_transaction_safe_staff_invite_acceptance.sql"),
  "utf8"
).toLowerCase();

const inviteAcceptAuthOrderMigrationSql = readFileSync(
  join(process.cwd(), "supabase/migrations/20260526142125_harden_invite_accept_auth_order.sql"),
  "utf8"
).toLowerCase();

const delegationStepUpMigrationSql = readFileSync(
  join(process.cwd(), "supabase/migrations/20260526034611_delegation_step_up_proofs.sql"),
  "utf8"
).toLowerCase();

const staffLifecycleAccountabilityMigrationSql = readFileSync(
  join(process.cwd(), "supabase/migrations/20260526042858_harden_staff_lifecycle_accountability.sql"),
  "utf8"
).toLowerCase();

const staffSuspensionDelegationRevocationMigrationSql = readFileSync(
  join(process.cwd(), "supabase/migrations/20260526141101_revoke_delegations_on_staff_suspension.sql"),
  "utf8"
).toLowerCase();

const staffInviteOwnerRegistrationBlockMigrationSql = readFileSync(
  join(process.cwd(), "supabase/migrations/20260526061702_block_staff_invites_from_owner_registration.sql"),
  "utf8"
).toLowerCase();

const databaseContractHardeningMigrationSql = readFileSync(
  join(process.cwd(), "supabase/migrations/20260529064145_harden_database_contracts.sql"),
  "utf8"
).toLowerCase();

const checkoutCounterIdempotencyMigrationSql = readFileSync(
  join(process.cwd(), "supabase/migrations/20260530020310_checkout_counter_idempotency.sql"),
  "utf8"
).toLowerCase();

const checkoutReplayResultMigrationSql = readFileSync(
  join(process.cwd(), "supabase/migrations/20260530022804_checkout_replay_result_observability.sql"),
  "utf8"
).toLowerCase();

const securityScanHardeningMigrationSql = readFileSync(
  join(process.cwd(), "supabase/migrations/20260531022126_security_scan_hardening.sql"),
  "utf8"
).toLowerCase();

const deprecatedSchemaSnapshotSql = readFileSync(
  join(process.cwd(), "src/lib/schema.sql"),
  "utf8"
).toLowerCase();

describe("data api and tenant-integrity hardening migration", () => {
  test("keeps the legacy schema snapshot non-executable and points to migrations", () => {
    expect(deprecatedSchemaSnapshotSql).toContain("schema snapshot deprecated");
    expect(deprecatedSchemaSnapshotSql).toContain("do not paste this file into the supabase sql editor");
    expect(deprecatedSchemaSnapshotSql).toContain("supabase/migrations/");
    expect(deprecatedSchemaSnapshotSql).not.toContain("copy and paste this script directly");
    expect(deprecatedSchemaSnapshotSql).not.toContain("create table");
    expect(deprecatedSchemaSnapshotSql).not.toContain("create or replace function");
  });

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

  test("adds delegated catalog RPCs that are service-role-only and revalidate catalog delegation", () => {
    expect(delegatedCatalogMigrationSql).toContain("upsert_product_and_variants_for_delegation");
    expect(delegatedCatalogMigrationSql).toContain("bulk_upsert_products_and_variants_for_delegation");
    expect(delegatedCatalogMigrationSql).toContain("delete_product_for_delegation");
    expect(delegatedCatalogMigrationSql).toContain("set_product_favorite_for_delegation");
    expect(delegatedCatalogMigrationSql).toContain("d.scope = 'catalog.manage'::public.privilege_scope");
    expect(delegatedCatalogMigrationSql).toContain("d.revoked_at is null");
    expect(delegatedCatalogMigrationSql).toContain("d.starts_at <= now()");
    expect(delegatedCatalogMigrationSql).toContain("d.expires_at > now()");
    expect(delegatedCatalogMigrationSql).toContain("revoke execute on function public.upsert_product_and_variants_for_delegation");
    expect(delegatedCatalogMigrationSql).toContain("revoke execute on function public.bulk_upsert_products_and_variants_for_delegation");
    expect(delegatedCatalogMigrationSql).toContain("revoke execute on function public.delete_product_for_delegation");
    expect(delegatedCatalogMigrationSql).toContain("revoke execute on function public.set_product_favorite_for_delegation");
    expect(delegatedCatalogMigrationSql).toContain("grant execute on function public.upsert_product_and_variants_for_delegation");
    expect(delegatedCatalogMigrationSql).toContain("to service_role");
  });

  test("adds delegated inventory adjustment RPC with database revalidation", () => {
    expect(delegatedInventoryMigrationSql).toContain("function public.adjust_inventory_for_delegation");
    expect(delegatedInventoryMigrationSql).toContain("d.scope = 'inventory.adjust'::public.privilege_scope");
    expect(delegatedInventoryMigrationSql).toContain("d.revoked_at is null");
    expect(delegatedInventoryMigrationSql).toContain("d.starts_at <= now()");
    expect(delegatedInventoryMigrationSql).toContain("d.expires_at > now()");
    expect(delegatedInventoryMigrationSql).toContain("grantee.role = 'cashier'::public.user_role");
    expect(delegatedInventoryMigrationSql).toContain("grantee.status = 'active'::public.user_status");
    expect(delegatedInventoryMigrationSql).toContain("grantor.role = 'owner'::public.user_role");
    expect(delegatedInventoryMigrationSql).toContain("grantor.status = 'active'::public.user_status");
    expect(delegatedInventoryMigrationSql).toContain("join public.product_variants pv");
    expect(delegatedInventoryMigrationSql).toContain("join public.products p");
    expect(delegatedInventoryMigrationSql).toContain("i.store_id = p_store_id");
    expect(delegatedInventoryMigrationSql).toContain("pv.store_id = p_store_id");
    expect(delegatedInventoryMigrationSql).toContain("p.store_id = p_store_id");
    expect(delegatedInventoryMigrationSql).toContain("for update of i");
    expect(delegatedInventoryMigrationSql).toContain("revoke execute on function public.adjust_inventory_for_delegation");
    expect(delegatedInventoryMigrationSql).toContain("from public, anon, authenticated");
    expect(delegatedInventoryMigrationSql).toContain("grant execute on function public.adjust_inventory_for_delegation");
    expect(delegatedInventoryMigrationSql).toContain("to service_role");
  });

  test("transactionally couples delegated privileged writes with activity events", () => {
    expect(delegatedActivityCouplingMigrationSql).toContain("function public.record_delegated_mutation_activity");
    expect(delegatedActivityCouplingMigrationSql).toContain("insert into public.activity_events");
    expect(delegatedActivityCouplingMigrationSql).toContain("d.scope = p_action_scope");
    expect(delegatedActivityCouplingMigrationSql).toContain("delegationgrantoruserid");
    expect(delegatedActivityCouplingMigrationSql).toContain("delegationscope");
    expect(delegatedActivityCouplingMigrationSql).toContain("'privilegesource', 'delegation'");
    expect(delegatedActivityCouplingMigrationSql.match(/perform public\.record_delegated_mutation_activity/g)?.length).toBeGreaterThanOrEqual(5);
    expect(delegatedActivityCouplingMigrationSql).toContain("upsert_product_and_variants_for_delegation");
    expect(delegatedActivityCouplingMigrationSql).toContain("bulk_upsert_products_and_variants_for_delegation");
    expect(delegatedActivityCouplingMigrationSql).toContain("delete_product_for_delegation");
    expect(delegatedActivityCouplingMigrationSql).toContain("set_product_favorite_for_delegation");
    expect(delegatedActivityCouplingMigrationSql).toContain("adjust_inventory_for_delegation");
    expect(delegatedActivityCouplingMigrationSql).toContain("revoke execute on function public.record_delegated_mutation_activity");
    expect(delegatedActivityCouplingMigrationSql).toContain("from public, anon, authenticated");
    expect(delegatedActivityCouplingMigrationSql).toContain("grant execute on function public.record_delegated_mutation_activity");
    expect(delegatedActivityCouplingMigrationSql).toContain("to service_role");
  });

  test("adds transaction-safe delegation grants with overlap locking and activity logging", () => {
    expect(delegationGrantTransactionMigrationSql).toContain("function public.grant_privilege_delegation");
    expect(delegationGrantTransactionMigrationSql).toContain("pg_advisory_xact_lock");
    expect(delegationGrantTransactionMigrationSql).toContain("hashtextextended");
    expect(delegationGrantTransactionMigrationSql).toContain("tstzrange(starts_at, expires_at, '[)') && tstzrange");
    expect(delegationGrantTransactionMigrationSql).toContain("from public.staff_step_up_proofs");
    expect(delegationGrantTransactionMigrationSql).toContain("for update");
    expect(delegationGrantTransactionMigrationSql).toContain("set used_at = v_now");
    expect(delegationGrantTransactionMigrationSql).toContain("insert into public.privilege_delegations");
    expect(delegationGrantTransactionMigrationSql).toContain("insert into public.activity_events");
    expect(delegationGrantTransactionMigrationSql).toContain("'delegation.granted'");
    expect(delegationGrantTransactionMigrationSql).toContain("delegation_already_active");
    expect(delegationGrantTransactionMigrationSql).toContain("step_up_invalid_or_expired");
    expect(delegationGrantTransactionMigrationSql).toContain("revoke execute on function public.grant_privilege_delegation");
    expect(delegationGrantTransactionMigrationSql).toContain("from public, anon, authenticated");
    expect(delegationGrantTransactionMigrationSql).toContain("grant execute on function public.grant_privilege_delegation");
    expect(delegationGrantTransactionMigrationSql).toContain("to service_role");
  });

  test("freezes V1.1 privilege delegations to released catalog and inventory scopes", () => {
    expect(delegationScopeFreezeMigrationSql).toContain("drop constraint if exists privilege_delegations_scope_allowed");
    expect(delegationScopeFreezeMigrationSql).toContain("add constraint privilege_delegations_scope_allowed");
    expect(delegationScopeFreezeMigrationSql).toContain("'catalog.manage'::public.privilege_scope");
    expect(delegationScopeFreezeMigrationSql).toContain("'inventory.adjust'::public.privilege_scope");
    expect(delegationScopeFreezeMigrationSql).not.toContain("'reports.export'::public.privilege_scope");
    expect(delegationScopeFreezeMigrationSql).not.toContain("'invoice.correct'::public.privilege_scope");
  });

  test("adds transaction-safe staff invite acceptance as a service-role-only RPC", () => {
    expect(inviteAcceptanceMigrationSql).toContain("function public.accept_staff_invitation");
    expect(inviteAcceptanceMigrationSql).toContain("for update");
    expect(inviteAcceptanceMigrationSql).toContain("pg_advisory_xact_lock");
    expect(inviteAcceptanceMigrationSql).toContain("status = 'accepted'::public.staff_invitation_status");
    expect(inviteAcceptanceMigrationSql).toContain("insert into public.users");
    expect(inviteAcceptanceMigrationSql).toContain("insert into public.activity_events");
    expect(inviteAcceptanceMigrationSql).toContain("staff.invite_accepted");
    expect(inviteAcceptanceMigrationSql).toContain("revoke execute on function public.accept_staff_invitation");
    expect(inviteAcceptanceMigrationSql).toContain("from public, anon, authenticated");
    expect(inviteAcceptanceMigrationSql).toContain("grant execute on function public.accept_staff_invitation");
    expect(inviteAcceptanceMigrationSql).toContain("to service_role");
  });

  test("hardens invite acceptance before Auth mutation with rollback compensation", () => {
    expect(inviteAcceptAuthOrderMigrationSql).toContain("function public.accept_staff_invitation");
    expect(inviteAcceptAuthOrderMigrationSql).toContain("function public.protect_user_store_id");
    expect(inviteAcceptAuthOrderMigrationSql).toContain("set search_path = public");
    expect(inviteAcceptAuthOrderMigrationSql).toContain("current_setting('app.staff_invite_rollback', true) = 'true'");
    expect(inviteAcceptAuthOrderMigrationSql).toContain("set_config('app.staff_invite_rollback', 'true', true)");
    expect(inviteAcceptAuthOrderMigrationSql).toContain("hashtextextended('staff_invite_accept:'");
    expect(inviteAcceptAuthOrderMigrationSql).toContain("profiledisposition");
    expect(inviteAcceptAuthOrderMigrationSql).toContain("previousprofile");
    expect(inviteAcceptAuthOrderMigrationSql).toContain("case when v_profile_disposition = 'created' then null else p_auth_user_id end");
    expect(inviteAcceptAuthOrderMigrationSql).toContain("function public.rollback_staff_invitation_acceptance");
    expect(inviteAcceptAuthOrderMigrationSql).toContain("status = 'pending'::public.staff_invitation_status");
    expect(inviteAcceptAuthOrderMigrationSql).toContain("staff_invitation_acceptance_rolled_back");
    expect(inviteAcceptAuthOrderMigrationSql).toContain("auth_update_failed");
    expect(inviteAcceptAuthOrderMigrationSql).toContain("revoke execute on function public.accept_staff_invitation");
    expect(inviteAcceptAuthOrderMigrationSql).toContain("revoke execute on function public.rollback_staff_invitation_acceptance");
    expect(inviteAcceptAuthOrderMigrationSql).toContain("from public, anon, authenticated");
    expect(inviteAcceptAuthOrderMigrationSql).toContain("grant execute on function public.rollback_staff_invitation_acceptance");
    expect(inviteAcceptAuthOrderMigrationSql).toContain("to service_role");
  });

  test("adds private one-time step-up proofs for delegation grants", () => {
    expect(delegationStepUpMigrationSql).toContain("create table if not exists public.staff_step_up_proofs");
    expect(delegationStepUpMigrationSql).toContain("purpose = 'delegation.grant'");
    expect(delegationStepUpMigrationSql).toContain("assurance_level = 'aal2'");
    expect(delegationStepUpMigrationSql).toContain("expires_at <= authenticated_at + interval '10 minutes'");
    expect(delegationStepUpMigrationSql).toContain("where used_at is null");
    expect(delegationStepUpMigrationSql).toContain("alter table public.staff_step_up_proofs enable row level security");
    expect(delegationStepUpMigrationSql).toContain("revoke all on table public.staff_step_up_proofs from public, anon, authenticated");
    expect(delegationStepUpMigrationSql).toContain("grant all privileges on table public.staff_step_up_proofs to service_role");
  });

  test("adds transactional staff lifecycle RPCs with service-role-only execution", () => {
    expect(staffLifecycleAccountabilityMigrationSql).toContain("function public.revoke_staff_invitation");
    expect(staffLifecycleAccountabilityMigrationSql).toContain("function public.suspend_staff_user");
    expect(staffLifecycleAccountabilityMigrationSql).toContain("function public.reactivate_staff_user");
    expect(staffLifecycleAccountabilityMigrationSql).toContain("function public.revoke_privilege_delegation");
    expect(staffLifecycleAccountabilityMigrationSql).toContain("for update");
    expect(staffLifecycleAccountabilityMigrationSql).toContain("insert into public.activity_events");
    expect(staffLifecycleAccountabilityMigrationSql).toContain("status = 'pending'::public.staff_invitation_status");
    expect(staffLifecycleAccountabilityMigrationSql).toContain("accepted_at is null");
    expect(staffLifecycleAccountabilityMigrationSql).toContain("staff_invitation_not_pending");
    expect(staffLifecycleAccountabilityMigrationSql).toContain("delegation_already_revoked");
    expect(staffLifecycleAccountabilityMigrationSql).toContain("revoke execute on function public.revoke_staff_invitation");
    expect(staffLifecycleAccountabilityMigrationSql).toContain("revoke execute on function public.suspend_staff_user");
    expect(staffLifecycleAccountabilityMigrationSql).toContain("revoke execute on function public.reactivate_staff_user");
    expect(staffLifecycleAccountabilityMigrationSql).toContain("revoke execute on function public.revoke_privilege_delegation");
    expect(staffLifecycleAccountabilityMigrationSql).toContain("from public, anon, authenticated");
    expect(staffLifecycleAccountabilityMigrationSql).toContain("to service_role");
  });

  test("revokes active delegations during staff suspension in the lifecycle RPC", () => {
    expect(staffSuspensionDelegationRevocationMigrationSql).toContain("function public.suspend_staff_user");
    expect(staffSuspensionDelegationRevocationMigrationSql).toContain("with revoked_delegations as");
    expect(staffSuspensionDelegationRevocationMigrationSql).toContain("update public.privilege_delegations");
    expect(staffSuspensionDelegationRevocationMigrationSql).toContain("revoked_at = v_suspended_at");
    expect(staffSuspensionDelegationRevocationMigrationSql).toContain("revoked_by_user_id = v_actor.id");
    expect(staffSuspensionDelegationRevocationMigrationSql).toContain("granted_to_user_id = v_staff.id");
    expect(staffSuspensionDelegationRevocationMigrationSql).toContain("expires_at > v_suspended_at");
    expect(staffSuspensionDelegationRevocationMigrationSql).toContain("insert into public.activity_events");
    expect(staffSuspensionDelegationRevocationMigrationSql).toContain("'delegation.revoked'");
    expect(staffSuspensionDelegationRevocationMigrationSql).toContain("'staff.suspended'");
    expect(staffSuspensionDelegationRevocationMigrationSql).toContain("revokeddelegationcount");
    expect(staffSuspensionDelegationRevocationMigrationSql).toContain("revokeddelegationids");
    expect(staffSuspensionDelegationRevocationMigrationSql).toContain("revoke execute on function public.suspend_staff_user");
    expect(staffSuspensionDelegationRevocationMigrationSql).toContain("from public, anon, authenticated");
    expect(staffSuspensionDelegationRevocationMigrationSql).toContain("grant execute on function public.suspend_staff_user");
    expect(staffSuspensionDelegationRevocationMigrationSql).toContain("to service_role");
  });

  test("blocks staff invite auth users from owner registration at the RPC boundary", () => {
    expect(staffInviteOwnerRegistrationBlockMigrationSql).toContain("function public.register_store_and_user");
    expect(staffInviteOwnerRegistrationBlockMigrationSql).toContain("staff_account_cannot_register_store");
    expect(staffInviteOwnerRegistrationBlockMigrationSql).toContain("staff_invitation_pending_register_blocked");
    expect(staffInviteOwnerRegistrationBlockMigrationSql).toContain("from public.staff_invitations");
    expect(staffInviteOwnerRegistrationBlockMigrationSql).toContain("status = 'pending'::public.staff_invitation_status");
    expect(staffInviteOwnerRegistrationBlockMigrationSql).toContain("grant execute on function public.register_store_and_user");
    expect(staffInviteOwnerRegistrationBlockMigrationSql).toContain("to authenticated");
  });

  test("resets Data API privileges before granting the explicit app surface", () => {
    expect(databaseContractHardeningMigrationSql).toContain(
      "revoke all privileges on all tables in schema public from public, anon, authenticated",
    );
    expect(databaseContractHardeningMigrationSql).toContain(
      "revoke all privileges on all routines in schema public from public, anon, authenticated",
    );
    expect(databaseContractHardeningMigrationSql).toContain("grant select on table");
    expect(databaseContractHardeningMigrationSql).toContain("public.activity_events");
    expect(databaseContractHardeningMigrationSql).toContain("public.privilege_delegations");
    expect(databaseContractHardeningMigrationSql).toContain("grant execute on function public.create_invoice_and_deduct_stock");
    expect(databaseContractHardeningMigrationSql).toContain("grant execute on function public.bulk_upsert_products_and_variants");
  });

  test("adds database validation constraints matching app schema ceilings", () => {
    expect(databaseContractHardeningMigrationSql).toContain("stores_profile_fields_contract");
    expect(databaseContractHardeningMigrationSql).toContain("products_catalog_fields_contract");
    expect(databaseContractHardeningMigrationSql).toContain("product_variants_catalog_fields_contract");
    expect(databaseContractHardeningMigrationSql).toContain("sku ~ '^[a-z0-9_-]+$'");
    expect(databaseContractHardeningMigrationSql).toContain("inventory_quantity_contract");
    expect(databaseContractHardeningMigrationSql).toContain("invoices_customer_money_contract");
    expect(databaseContractHardeningMigrationSql).toContain("invoice_items_quantity_money_contract");
  });

  test("aligns privilege vocabulary, hardens definer routines, and indexes missing FKs", () => {
    expect(databaseContractHardeningMigrationSql).toContain("add value if not exists 'activity.read'");
    expect(databaseContractHardeningMigrationSql).toContain("add value if not exists 'profile.update'");
    expect(databaseContractHardeningMigrationSql).toContain("set search_path = ''");
    expect(databaseContractHardeningMigrationSql).toContain("users can read permitted activity events");
    expect(databaseContractHardeningMigrationSql).toContain("users can read permitted privilege delegations");
    expect(databaseContractHardeningMigrationSql).toContain("idx_invoices_sold_with_delegation_id_fk");
    expect(databaseContractHardeningMigrationSql).toContain("idx_invoices_sold_by_user_id_fk");
    expect(databaseContractHardeningMigrationSql).toContain("idx_staff_step_up_proofs_store_id_fk");
  });

  test("hardens checkout sequencing with counters and idempotency without dropping the legacy rpc", () => {
    expect(checkoutCounterIdempotencyMigrationSql).toContain("public.store_invoice_counters");
    expect(checkoutCounterIdempotencyMigrationSql).toContain("public.checkout_requests");
    expect(checkoutCounterIdempotencyMigrationSql).toContain("p_idempotency_key uuid");
    expect(checkoutCounterIdempotencyMigrationSql).toContain("on conflict (store_id, user_id, idempotency_key) do nothing");
    expect(checkoutCounterIdempotencyMigrationSql).toContain("return public.create_invoice_and_deduct_stock");
    expect(checkoutCounterIdempotencyMigrationSql).toContain("parsed_invoice_numbers");
    expect(checkoutCounterIdempotencyMigrationSql).toContain("do not backfill historical invoices");
    expect(checkoutCounterIdempotencyMigrationSql).not.toContain("update public.invoices");
    expect(checkoutCounterIdempotencyMigrationSql).not.toContain("count(*) + 1");
  });

  test("makes idempotent checkout replays observable without changing the legacy uuid rpc", () => {
    expect(checkoutReplayResultMigrationSql).toContain("replay_count");
    expect(checkoutReplayResultMigrationSql).toContain("last_replayed_at");
    expect(checkoutReplayResultMigrationSql).toContain("'was_replayed', true");
    expect(checkoutReplayResultMigrationSql).toContain("'was_replayed', false");
    expect(checkoutReplayResultMigrationSql).toContain("returns jsonb");
    expect(checkoutReplayResultMigrationSql).toContain("returns uuid");
    expect(checkoutReplayResultMigrationSql).toContain("return (v_result->>'invoice_id')::uuid");
  });

  test("moves browser-authenticated table writes behind server-side controls", () => {
    expect(securityScanHardeningMigrationSql).toContain(
      "revoke update, delete on table public.stores from authenticated",
    );
    expect(securityScanHardeningMigrationSql).toContain(
      "revoke update, delete on table public.users from authenticated",
    );
    expect(securityScanHardeningMigrationSql).toContain(
      "revoke insert, update, delete on table public.products from authenticated",
    );
    expect(securityScanHardeningMigrationSql).toContain(
      "revoke insert, update, delete on table public.product_variants from authenticated",
    );
    expect(securityScanHardeningMigrationSql).toContain(
      "revoke insert, update, delete on table public.inventory from authenticated",
    );
    expect(securityScanHardeningMigrationSql).toContain(
      'drop policy if exists "users can delete their own user profile"',
    );
  });

  test("wraps public catalog RPCs with active-owner checks and cardinality limits", () => {
    expect(securityScanHardeningMigrationSql).toContain("rename to upsert_product_and_variants_unchecked");
    expect(securityScanHardeningMigrationSql).toContain("rename to bulk_upsert_products_and_variants_unchecked");
    expect(securityScanHardeningMigrationSql).toContain("u.status");
    expect(securityScanHardeningMigrationSql).toContain("'active'::public.user_status");
    expect(securityScanHardeningMigrationSql).toContain("jsonb_array_length(p_variants)");
    expect(securityScanHardeningMigrationSql).toContain("v_variant_count > 100");
    expect(securityScanHardeningMigrationSql).toContain("v_deleted_variant_count > 200");
    expect(securityScanHardeningMigrationSql).toContain("v_product_count > 1000");
    expect(securityScanHardeningMigrationSql).toContain("from public, anon, authenticated");
    expect(securityScanHardeningMigrationSql).toContain("to authenticated");
  });

  test("requires idempotent checkout RPC calls and disables the legacy signature", () => {
    expect(securityScanHardeningMigrationSql).toContain("rename to create_invoice_and_deduct_stock_unbounded");
    expect(securityScanHardeningMigrationSql).toContain("jsonb_array_length(p_items) > 100");
    expect(securityScanHardeningMigrationSql).toContain("p_idempotency_key is null");
    expect(securityScanHardeningMigrationSql).toContain("deprecated checkout rpc signature requires an idempotency key");
    expect(securityScanHardeningMigrationSql).toContain(
      "from public, anon, authenticated",
    );
  });
});
