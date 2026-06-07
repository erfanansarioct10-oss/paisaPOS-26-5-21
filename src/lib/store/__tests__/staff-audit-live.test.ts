import { afterEach, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadEnvConfig } from "@next/env";
import { retryOnTransientJwtClockSkew } from "./supabase-test-utils";

loadEnvConfig(process.cwd());

type JsonRecord = Record<string, unknown>;

type OwnerTenant = {
  client: SupabaseClient;
  email: string;
  userId: string;
  storeId: string;
};

type CashierProfile = {
  userId: string;
  email: string;
  name: string;
};

type SeededInventory = {
  productId: string;
  variantId: string;
  inventoryId: string;
};

type StaffAuditCleanup = {
  authUserIds: string[];
  storeIds: string[];
};

const runLiveStaffAuditTests = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    !process.env.SKIP_LIVE_TESTS,
);

const testPassword = "SecurityDefinerPass123!";

function uniqueId(label: string) {
  return `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function expectRpcDenied(error: { message?: string } | null) {
  expect(error).not.toBeNull();
  expect(error!.message?.toLowerCase()).toMatch(/permission|denied|not authorized|not found/);
}

describe.runIf(runLiveStaffAuditTests)("PaisaPOS staff audit live Supabase/RLS coverage", () => {
  let supabaseUrl: string;
  let supabaseAnonKey: string;
  let serviceRoleKey: string;
  let adminClient: SupabaseClient;
  let cleanup: StaffAuditCleanup;

  beforeAll(() => {
    supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  });

  afterEach(async () => {
    for (const storeId of cleanup.storeIds.reverse()) {
      await adminClient.from("stores").delete().eq("id", storeId);
    }

    for (const authUserId of cleanup.authUserIds.reverse()) {
      await adminClient.auth.admin.deleteUser(authUserId);
    }

    cleanup = { authUserIds: [], storeIds: [] };
  });

  beforeEach(() => {
    cleanup = { authUserIds: [], storeIds: [] };
  });

  async function createOwnerTenant(label: string): Promise<OwnerTenant> {
    const id = uniqueId(label);
    const email = `${id}@paisapos-qa.com`;
    const client = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: signUp, error: signUpError } = await client.auth.signUp({
      email,
      password: testPassword,
    });
    expect(signUpError).toBeNull();
    expect(signUp.user?.id).toBeDefined();

    const userId = signUp.user!.id;
    cleanup.authUserIds.push(userId);

    const { data: storeId, error: registerError } = await retryOnTransientJwtClockSkew(() =>
      client.rpc("register_store_and_user", {
        p_full_name: `Audit Owner ${id}`,
        p_store_name: `Audit Store ${id}`,
      }),
    );
    expect(registerError).toBeNull();
    expect(storeId).toBeDefined();

    cleanup.storeIds.push(storeId as string);

    return {
      client,
      email,
      userId,
      storeId: storeId as string,
    };
  }

  async function createAuthUser(email: string): Promise<string> {
    const client = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await client.auth.signUp({
      email,
      password: testPassword,
    });
    expect(error).toBeNull();
    expect(data.user?.id).toBeDefined();

    cleanup.authUserIds.push(data.user!.id);
    await client.auth.signOut();
    return data.user!.id;
  }

  async function createCashierProfile(owner: OwnerTenant, label: string): Promise<CashierProfile> {
    const id = uniqueId(label);
    const email = `${id}@paisapos-qa.com`;
    const userId = await createAuthUser(email);
    const name = `Audit Cashier ${id}`;

    const { error } = await adminClient.from("users").insert({
      id: userId,
      name,
      store_id: owner.storeId,
      role: "cashier",
      status: "active",
      invited_by_user_id: owner.userId,
    });
    expect(error).toBeNull();

    return { userId, email, name };
  }

  async function createStepUpProof(owner: OwnerTenant): Promise<string> {
    const now = Date.now();
    const { data, error } = await adminClient
      .from("staff_step_up_proofs")
      .insert({
        store_id: owner.storeId,
        user_id: owner.userId,
        purpose: "delegation.grant",
        assurance_level: "aal2",
        authentication_method: "totp",
        authenticated_at: new Date(now - 1000).toISOString(),
        expires_at: new Date(now + 5 * 60 * 1000).toISOString(),
      })
      .select("id")
      .single();

    expect(error).toBeNull();
    expect(data?.id).toBeDefined();
    return data!.id as string;
  }

  async function seedInventory(owner: OwnerTenant, label: string, quantity = 10): Promise<SeededInventory> {
    const id = uniqueId(label);
    const { data: product, error: productError } = await adminClient
      .from("products")
      .insert({
        store_id: owner.storeId,
        name: `Audit Product ${id}`,
        category: "Tops",
        low_stock_threshold: 2,
      })
      .select("id")
      .single();
    expect(productError).toBeNull();

    const { data: variant, error: variantError } = await adminClient
      .from("product_variants")
      .insert({
        product_id: product!.id,
        size: "M",
        color: "Black",
        sku: `AUDIT-${id}`.toUpperCase(),
        price: 1500,
      })
      .select("id")
      .single();
    expect(variantError).toBeNull();

    const { data: inventory, error: inventoryError } = await adminClient
      .from("inventory")
      .insert({
        variant_id: variant!.id,
        quantity,
      })
      .select("id")
      .single();
    expect(inventoryError).toBeNull();

    return {
      productId: product!.id as string,
      variantId: variant!.id as string,
      inventoryId: inventory!.id as string,
    };
  }

  async function insertActiveDelegation(
    owner: OwnerTenant,
    cashier: CashierProfile,
    scope: "catalog.manage" | "inventory.adjust",
  ): Promise<string> {
    const now = Date.now();
    const { data, error } = await adminClient
      .from("privilege_delegations")
      .insert({
        store_id: owner.storeId,
        granted_to_user_id: cashier.userId,
        granted_by_user_id: owner.userId,
        scope,
        reason: "Owner is away for audit coverage",
        starts_at: new Date(now - 60 * 1000).toISOString(),
        expires_at: new Date(now + 60 * 60 * 1000).toISOString(),
      })
      .select("id")
      .single();

    expect(error).toBeNull();
    expect(data?.id).toBeDefined();
    return data!.id as string;
  }

  test("accepts and rolls back staff invitations only through service-role RPCs", async () => {
    const owner = await createOwnerTenant("invite-owner");
    const invitedEmail = `${uniqueId("invite-cashier")}@paisapos-qa.com`;
    const invitedUserId = await createAuthUser(invitedEmail);

    const { data: invitation, error: invitationError } = await adminClient
      .from("staff_invitations")
      .insert({
        store_id: owner.storeId,
        email: invitedEmail,
        role: "cashier",
        status: "pending",
        invited_by_user_id: owner.userId,
        expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      })
      .select("id")
      .single();
    expect(invitationError).toBeNull();

    const invitedClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: signInError } = await invitedClient.auth.signInWithPassword({
      email: invitedEmail,
      password: testPassword,
    });
    expect(signInError).toBeNull();

    const { error: directAcceptError } = await invitedClient.rpc("accept_staff_invitation", {
      p_invitation_id: invitation!.id,
      p_auth_user_id: invitedUserId,
      p_auth_email: invitedEmail,
      p_actor_name: "Direct Browser Cashier",
    });
    expectRpcDenied(directAcceptError);

    const { error: wrongEmailError } = await adminClient.rpc("accept_staff_invitation", {
      p_invitation_id: invitation!.id,
      p_auth_user_id: invitedUserId,
      p_auth_email: `wrong-${invitedEmail}`,
      p_actor_name: "Wrong Email Cashier",
    });
    expect(wrongEmailError).not.toBeNull();
    expect(wrongEmailError!.message).toContain("staff_invitation_email_mismatch");

    const { data: stillPending } = await adminClient
      .from("staff_invitations")
      .select("status, accepted_by_user_id, accepted_at")
      .eq("id", invitation!.id)
      .single();
    expect(stillPending).toEqual({
      status: "pending",
      accepted_by_user_id: null,
      accepted_at: null,
    });

    const { data: acceptance, error: acceptError } = await adminClient.rpc("accept_staff_invitation", {
      p_invitation_id: invitation!.id,
      p_auth_user_id: invitedUserId,
      p_auth_email: invitedEmail,
      p_actor_name: "Accepted Audit Cashier",
    });
    expect(acceptError).toBeNull();

    const acceptResult = acceptance as JsonRecord;
    expect(acceptResult.profileDisposition).toBe("created");
    expect(acceptResult.invitationId).toBe(invitation!.id);
    expect(acceptResult.storeId).toBe(owner.storeId);

    const { data: acceptedProfile, error: acceptedProfileError } = await adminClient
      .from("users")
      .select("id, name, store_id, role, status, invited_by_user_id")
      .eq("id", invitedUserId)
      .single();
    expect(acceptedProfileError).toBeNull();
    expect(acceptedProfile).toMatchObject({
      id: invitedUserId,
      name: "Accepted Audit Cashier",
      store_id: owner.storeId,
      role: "cashier",
      status: "active",
      invited_by_user_id: owner.userId,
    });

    const { data: acceptEvents, error: acceptEventError } = await adminClient
      .from("activity_events")
      .select("id, action, target_id, actor_email, metadata")
      .eq("store_id", owner.storeId)
      .eq("action", "staff.invite_accepted")
      .eq("target_id", invitedUserId);
    expect(acceptEventError).toBeNull();
    expect(acceptEvents).toHaveLength(1);
    expect((acceptEvents![0].metadata as JsonRecord).invitationId).toBe(invitation!.id);

    const { data: rollback, error: rollbackError } = await adminClient.rpc(
      "rollback_staff_invitation_acceptance",
      {
        p_invitation_id: invitation!.id,
        p_auth_user_id: invitedUserId,
        p_accepted_at: acceptResult.acceptedAt,
        p_profile_disposition: acceptResult.profileDisposition,
        p_previous_profile: acceptResult.previousProfile ?? null,
      },
    );
    expect(rollbackError).toBeNull();
    expect(rollback).toMatchObject({
      ok: true,
      code: "staff_invitation_acceptance_rolled_back",
      invitationId: invitation!.id,
      targetId: invitedUserId,
    });

    const { data: rolledBackInvitation } = await adminClient
      .from("staff_invitations")
      .select("status, accepted_by_user_id, accepted_at")
      .eq("id", invitation!.id)
      .single();
    expect(rolledBackInvitation).toEqual({
      status: "pending",
      accepted_by_user_id: null,
      accepted_at: null,
    });

    const { data: rolledBackProfiles, error: rolledBackProfileError } = await adminClient
      .from("users")
      .select("id")
      .eq("id", invitedUserId);
    expect(rolledBackProfileError).toBeNull();
    expect(rolledBackProfiles).toHaveLength(0);

    const { data: rollbackEvents, error: rollbackEventError } = await adminClient
      .from("activity_events")
      .select("id, action, metadata")
      .eq("store_id", owner.storeId)
      .eq("action", "staff.invite_accept_rolled_back")
      .eq("target_id", invitation!.id);
    expect(rollbackEventError).toBeNull();
    expect(rollbackEvents).toHaveLength(1);
    expect((rollbackEvents![0].metadata as JsonRecord).reason).toBe("auth_update_failed");

    await invitedClient.auth.signOut();
  }, 30000);

  test("grants delegations transactionally with proof consumption and overlap protection", async () => {
    const owner = await createOwnerTenant("grant-owner");
    const cashier = await createCashierProfile(owner, "grant-cashier");
    const proofId = await createStepUpProof(owner);

    const { error: directGrantError } = await owner.client.rpc("grant_privilege_delegation", {
      p_store_id: owner.storeId,
      p_actor_user_id: owner.userId,
      p_target_user_id: cashier.userId,
      p_scope: "inventory.adjust",
      p_duration_hours: 2,
      p_reason: "Browser attempt should be blocked",
      p_step_up_proof_id: proofId,
    });
    expectRpcDenied(directGrantError);

    const { data: grantResult, error: grantError } = await adminClient.rpc("grant_privilege_delegation", {
      p_store_id: owner.storeId,
      p_actor_user_id: owner.userId,
      p_target_user_id: cashier.userId,
      p_scope: "inventory.adjust",
      p_duration_hours: 2,
      p_reason: "Owner is away from shop",
      p_step_up_proof_id: proofId,
    });
    expect(grantError).toBeNull();
    expect(grantResult).toMatchObject({
      ok: true,
      code: "delegation_granted",
      targetId: cashier.userId,
      scope: "inventory.adjust",
    });

    const delegationId = (grantResult as JsonRecord).delegationId as string;
    expect(delegationId).toBeDefined();

    const { data: consumedProof } = await adminClient
      .from("staff_step_up_proofs")
      .select("used_at")
      .eq("id", proofId)
      .single();
    expect(consumedProof?.used_at).not.toBeNull();

    const { data: grantEvents, error: grantEventError } = await adminClient
      .from("activity_events")
      .select("id, action, target_id, metadata")
      .eq("store_id", owner.storeId)
      .eq("action", "delegation.granted")
      .eq("target_id", delegationId);
    expect(grantEventError).toBeNull();
    expect(grantEvents).toHaveLength(1);
    expect((grantEvents![0].metadata as JsonRecord).stepUpProofId).toBe(proofId);

    const secondProofId = await createStepUpProof(owner);
    const { data: overlapResult, error: overlapError } = await adminClient.rpc("grant_privilege_delegation", {
      p_store_id: owner.storeId,
      p_actor_user_id: owner.userId,
      p_target_user_id: cashier.userId,
      p_scope: "inventory.adjust",
      p_duration_hours: 2,
      p_reason: "Overlapping grant should be blocked",
      p_step_up_proof_id: secondProofId,
    });
    expect(overlapError).toBeNull();
    expect(overlapResult).toMatchObject({
      ok: false,
      code: "delegation_already_active",
      delegationId,
    });

    const { data: unusedProof } = await adminClient
      .from("staff_step_up_proofs")
      .select("used_at")
      .eq("id", secondProofId)
      .single();
    expect(unusedProof?.used_at).toBeNull();

    const { count: activeDelegationCount, error: activeCountError } = await adminClient
      .from("privilege_delegations")
      .select("id", { count: "exact", head: true })
      .eq("store_id", owner.storeId)
      .eq("granted_to_user_id", cashier.userId)
      .eq("scope", "inventory.adjust")
      .is("revoked_at", null);
    expect(activeCountError).toBeNull();
    expect(activeDelegationCount).toBe(1);
  }, 30000);

  test("revalidates delegated inventory ownership and couples success with activity logging", async () => {
    const owner = await createOwnerTenant("inventory-owner");
    const otherOwner = await createOwnerTenant("inventory-other-owner");
    const cashier = await createCashierProfile(owner, "inventory-cashier");
    const delegationId = await insertActiveDelegation(owner, cashier, "inventory.adjust");
    const ownInventory = await seedInventory(owner, "own-inventory", 10);
    const otherInventory = await seedInventory(otherOwner, "other-inventory", 8);

    const cashierClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: cashierSignInError } = await cashierClient.auth.signInWithPassword({
      email: cashier.email,
      password: testPassword,
    });
    expect(cashierSignInError).toBeNull();

    const { error: directInventoryRpcError } = await cashierClient.rpc("adjust_inventory_for_delegation", {
      p_store_id: owner.storeId,
      p_actor_user_id: cashier.userId,
      p_delegation_id: delegationId,
      p_variant_id: ownInventory.variantId,
      p_new_stock: 7,
    });
    expectRpcDenied(directInventoryRpcError);

    const { error: crossStoreError } = await adminClient.rpc("adjust_inventory_for_delegation", {
      p_store_id: owner.storeId,
      p_actor_user_id: cashier.userId,
      p_delegation_id: delegationId,
      p_variant_id: otherInventory.variantId,
      p_new_stock: 3,
    });
    expect(crossStoreError).not.toBeNull();
    expect(crossStoreError!.message).toContain("Stock record was not found");

    const { data: untouchedOtherInventory } = await adminClient
      .from("inventory")
      .select("quantity")
      .eq("id", otherInventory.inventoryId)
      .single();
    expect(untouchedOtherInventory?.quantity).toBe(8);

    const { data: adjustedInventoryId, error: adjustError } = await adminClient.rpc(
      "adjust_inventory_for_delegation",
      {
        p_store_id: owner.storeId,
        p_actor_user_id: cashier.userId,
        p_delegation_id: delegationId,
        p_variant_id: ownInventory.variantId,
        p_new_stock: 4,
      },
    );
    expect(adjustError).toBeNull();
    expect(adjustedInventoryId).toBe(ownInventory.inventoryId);

    const { data: adjustedInventory } = await adminClient
      .from("inventory")
      .select("quantity")
      .eq("id", ownInventory.inventoryId)
      .single();
    expect(adjustedInventory?.quantity).toBe(4);

    const { data: inventoryEvents, error: inventoryEventError } = await adminClient
      .from("activity_events")
      .select("id, action, actor_user_id, privilege_source, delegation_id, before_state, after_state")
      .eq("store_id", owner.storeId)
      .eq("action", "inventory.adjusted")
      .eq("delegation_id", delegationId);
    expect(inventoryEventError).toBeNull();
    expect(inventoryEvents).toHaveLength(1);
    expect(inventoryEvents![0]).toMatchObject({
      actor_user_id: cashier.userId,
      privilege_source: "delegation",
      delegation_id: delegationId,
    });
    expect((inventoryEvents![0].before_state as JsonRecord).quantity).toBe(10);
    expect((inventoryEvents![0].after_state as JsonRecord).quantity).toBe(4);

    const { data: revokeResult, error: revokeError } = await adminClient.rpc("revoke_privilege_delegation", {
      p_delegation_id: delegationId,
      p_actor_user_id: owner.userId,
    });
    expect(revokeError).toBeNull();
    expect(revokeResult).toMatchObject({
      ok: true,
      code: "delegation_revoked",
      delegationId,
    });

    const { data: revokedDelegation } = await adminClient
      .from("privilege_delegations")
      .select("revoked_at, revoked_by_user_id")
      .eq("id", delegationId)
      .single();
    expect(revokedDelegation?.revoked_at).not.toBeNull();
    expect(revokedDelegation?.revoked_by_user_id).toBe(owner.userId);

    const { data: revokeEvents, error: revokeEventError } = await adminClient
      .from("activity_events")
      .select("id, action, target_id")
      .eq("store_id", owner.storeId)
      .eq("action", "delegation.revoked")
      .eq("target_id", delegationId);
    expect(revokeEventError).toBeNull();
    expect(revokeEvents).toHaveLength(1);

    const { error: revokedAdjustError } = await adminClient.rpc("adjust_inventory_for_delegation", {
      p_store_id: owner.storeId,
      p_actor_user_id: cashier.userId,
      p_delegation_id: delegationId,
      p_variant_id: ownInventory.variantId,
      p_new_stock: 1,
    });
    expect(revokedAdjustError).not.toBeNull();
    expect(revokedAdjustError!.message).toContain("Active inventory delegation was not found");

    await cashierClient.auth.signOut();
  }, 30000);

  test("suspends staff and revokes active delegations in the same lifecycle RPC", async () => {
    const owner = await createOwnerTenant("suspend-owner");
    const cashier = await createCashierProfile(owner, "suspend-cashier");
    const activeInventoryDelegationId = await insertActiveDelegation(owner, cashier, "inventory.adjust");
    const activeCatalogDelegationId = await insertActiveDelegation(owner, cashier, "catalog.manage");

    const now = Date.now();
    const { data: expiredDelegation, error: expiredDelegationError } = await adminClient
      .from("privilege_delegations")
      .insert({
        store_id: owner.storeId,
        granted_to_user_id: cashier.userId,
        granted_by_user_id: owner.userId,
        scope: "inventory.adjust",
        reason: "Expired coverage record",
        starts_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
        expires_at: new Date(now - 60 * 60 * 1000).toISOString(),
      })
      .select("id")
      .single();
    expect(expiredDelegationError).toBeNull();

    const { data: suspendResult, error: suspendError } = await adminClient.rpc("suspend_staff_user", {
      p_target_user_id: cashier.userId,
      p_actor_user_id: owner.userId,
    });
    expect(suspendError).toBeNull();
    expect(suspendResult).toMatchObject({
      ok: true,
      code: "staff_suspended",
      targetId: cashier.userId,
      revokedDelegationCount: 2,
    });

    const { data: suspendedProfile } = await adminClient
      .from("users")
      .select("status, suspended_by_user_id")
      .eq("id", cashier.userId)
      .single();
    expect(suspendedProfile).toMatchObject({
      status: "suspended",
      suspended_by_user_id: owner.userId,
    });

    const { data: delegationRows, error: delegationRowsError } = await adminClient
      .from("privilege_delegations")
      .select("id, revoked_at, revoked_by_user_id")
      .in("id", [activeInventoryDelegationId, activeCatalogDelegationId, expiredDelegation!.id]);
    expect(delegationRowsError).toBeNull();

    const rowsById = new Map(delegationRows!.map((row) => [row.id as string, row]));
    expect(rowsById.get(activeInventoryDelegationId)?.revoked_at).not.toBeNull();
    expect(rowsById.get(activeInventoryDelegationId)?.revoked_by_user_id).toBe(owner.userId);
    expect(rowsById.get(activeCatalogDelegationId)?.revoked_at).not.toBeNull();
    expect(rowsById.get(activeCatalogDelegationId)?.revoked_by_user_id).toBe(owner.userId);
    expect(rowsById.get(expiredDelegation!.id as string)?.revoked_at).toBeNull();

    const { data: revocationEvents, error: revocationEventsError } = await adminClient
      .from("activity_events")
      .select("id, action, delegation_id")
      .eq("store_id", owner.storeId)
      .eq("action", "delegation.revoked")
      .in("delegation_id", [activeInventoryDelegationId, activeCatalogDelegationId]);
    expect(revocationEventsError).toBeNull();
    expect(revocationEvents).toHaveLength(2);

    const { data: suspensionEvents, error: suspensionEventsError } = await adminClient
      .from("activity_events")
      .select("id, action, target_id, metadata")
      .eq("store_id", owner.storeId)
      .eq("action", "staff.suspended")
      .eq("target_id", cashier.userId);
    expect(suspensionEventsError).toBeNull();
    expect(suspensionEvents).toHaveLength(1);
    expect((suspensionEvents![0].metadata as JsonRecord).revokedDelegationCount).toBe(2);
  }, 30000);
});
