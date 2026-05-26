import { describe, test, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { loadEnvConfig } from "@next/env";
import { retryOnTransientJwtClockSkew } from "./supabase-test-utils";

// Load environment variables
loadEnvConfig(process.cwd());

const runLiveTests = !!(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
  !process.env.SKIP_LIVE_TESTS
);

describe.runIf(runLiveTests)("PaisaPOS — Multi-Tenant Row Level Security (RLS) Verification", () => {
  let supabaseUrl: string;
  let supabaseAnonKey: string;

  beforeAll(() => {
    supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  });

  test("Enforces strict RLS boundaries between Store A and Store B sessions", async () => {
    const randomA = Math.random().toString(36).slice(2, 7) + Date.now();
    const randomB = Math.random().toString(36).slice(2, 7) + (Date.now() + 1);

    const emailA = `test-rls-a-${randomA}@paisapos-qa.com`;
    const emailB = `test-rls-b-${randomB}@paisapos-qa.com`;
    const password = "SecurityDefinerPass123!";

    const clientA = createClient(supabaseUrl, supabaseAnonKey);
    const clientB = createClient(supabaseUrl, supabaseAnonKey);

    // 1. Sign up both users to create authenticated sessions
    console.log(`[RLS QA] Registering Tenant A: ${emailA}`);
    const { data: signUpA, error: errSignUpA } = await clientA.auth.signUp({
      email: emailA,
      password: password,
    });
    expect(errSignUpA).toBeNull();
    const userIdA = signUpA.user!.id;

    console.log(`[RLS QA] Registering Tenant B: ${emailB}`);
    const { data: signUpB, error: errSignUpB } = await clientB.auth.signUp({
      email: emailB,
      password: password,
    });
    expect(errSignUpB).toBeNull();
    const userIdB = signUpB.user!.id;

    // 2. Onboard Store A and Store B
    console.log("[RLS QA] Calling register_store_and_user for Store A...");
    const { data: storeIdA, error: errOnboardA } = await retryOnTransientJwtClockSkew(() =>
      clientA.rpc("register_store_and_user", {
        p_full_name: `Tenant A Owner`,
        p_store_name: `Store A - ${randomA}`,
      })
    );
    expect(errOnboardA).toBeNull();
    expect(storeIdA).toBeDefined();

    console.log("[RLS QA] Calling register_store_and_user for Store B...");
    const { data: storeIdB, error: errOnboardB } = await retryOnTransientJwtClockSkew(() =>
      clientB.rpc("register_store_and_user", {
        p_full_name: `Tenant B Owner`,
        p_store_name: `Store B - ${randomB}`,
      })
    );
    expect(errOnboardB).toBeNull();
    expect(storeIdB).toBeDefined();

    // 3. User A creates a product and variant
    console.log("[RLS QA] User A inserting product in Store A...");
    const { data: prodA, error: errProdA } = await clientA
      .from("products")
      .insert({
        store_id: storeIdA,
        name: "Store A Exclusive Tee",
        category: "Tops",
        low_stock_threshold: 2,
      })
      .select()
      .single();
    expect(errProdA).toBeNull();

    const { data: varA, error: errVarA } = await clientA
      .from("product_variants")
      .insert({
        product_id: prodA.id,
        size: "M",
        color: "Black",
        sku: `SKU-A-${randomA}`,
        price: 1500.00,
      })
      .select()
      .single();
    expect(errVarA).toBeNull();

    // Seed variant stock for Store A
    const { error: errInvA } = await clientA
      .from("inventory")
      .insert({
        variant_id: varA.id,
        quantity: 10,
      });
    expect(errInvA).toBeNull();

    // 4. User B creates a product
    console.log("[RLS QA] User B inserting product in Store B...");
    const { data: prodB, error: errProdB } = await clientB
      .from("products")
      .insert({
        store_id: storeIdB,
        name: "Store B Jeans",
        category: "Pants",
        low_stock_threshold: 2,
      })
      .select()
      .single();
    expect(errProdB).toBeNull();

    // 5. RLS VERIFICATION: READ ISOLATION
    console.log("[RLS QA] Verifying User B cannot read Store A's products...");
    const { data: bProducts, error: errBProducts } = await clientB
      .from("products")
      .select("*");
    expect(errBProducts).toBeNull();
    // B should ONLY see its own product
    expect(bProducts?.length).toBe(1);
    expect(bProducts?.[0].id).toBe(prodB.id);

    console.log("[RLS QA] Verifying User B cannot read Store A's product directly by ID...");
    const { data: bDirectProd, error: errBDirectProd } = await clientB
      .from("products")
      .select("*")
      .eq("id", prodA.id);
    expect(errBDirectProd).toBeNull();
    expect(bDirectProd?.length).toBe(0);

    // 6. RLS VERIFICATION: WRITE ISOLATION
    console.log("[RLS QA] Verifying User B cannot insert product into Store A...");
    const { error: errBCrossInsert } = await clientB
      .from("products")
      .insert({
        store_id: storeIdA, // Pointing to Store A!
        name: "Hacked Tee",
        category: "Tops",
      });
    
    // The insert should fail, or return empty/error due to RLS check.
    // In Supabase, inserting into a table where row doesn't match policy raises an error or yields 0 rows.
    // If the insert violates RLS check option, it returns error.
    expect(errBCrossInsert).not.toBeNull();

    // 7. RLS VERIFICATION: UPDATE ISOLATION
    console.log("[RLS QA] Verifying User B cannot update Store A's product...");
    const { data: bUpdate, error: errBUpdate } = await clientB
      .from("products")
      .update({ name: "Maliciously Renamed" })
      .eq("id", prodA.id)
      .select();
    expect(errBUpdate).toBeNull();
    expect(bUpdate?.length).toBe(0); // 0 rows updated because it's invisible

    // Verify User A's product remains unchanged
    const { data: checkProdA } = await clientA
      .from("products")
      .select("name")
      .eq("id", prodA.id)
      .single();
    expect(checkProdA?.name).toBe("Store A Exclusive Tee");

    // 8. RLS VERIFICATION: DELETE ISOLATION
    console.log("[RLS QA] Verifying User B cannot delete Store A's product...");
    const { data: bDelete, error: errBDelete } = await clientB
      .from("products")
      .delete()
      .eq("id", prodA.id)
      .select();
    expect(errBDelete).toBeNull();
    expect(bDelete?.length).toBe(0); // 0 rows deleted because it's invisible

    // Verify User A's product still exists
    const { data: checkProdAExists } = await clientA
      .from("products")
      .select("id")
      .eq("id", prodA.id);
    expect(checkProdAExists?.length).toBe(1);

    // 9. RLS VERIFICATION: CHECKOUT RPC ISOLATION
    console.log("[RLS QA] Verifying User B cannot perform checkout for Store A...");
    const { error: errBCrossCheckout } = await clientB.rpc("create_invoice_and_deduct_stock", {
      p_store_id: storeIdA, // Store A ID
      p_invoice_number: "INV-PRE-GENERATED",
      p_customer_name: "John Doe Nepal",
      p_customer_phone: "9851000000",
      p_total_amount: 1500.00,
      p_discount_amount: 0.00,
      p_paid_amount: 1500.00,
      p_payment_method: "Fonepay",
      p_items: [
        {
          variant_id: varA.id,
          quantity: 1,
          unit_price: 1500.00,
          subtotal: 1500.00,
        }
      ],
    });
    expect(errBCrossCheckout).not.toBeNull();
    expect(errBCrossCheckout!.message).toContain("Unauthorized");

    console.log("[RLS QA] Verifying User B cannot checkout Store A's variant in Store B...");
    const { error: errBCrossVarCheckout } = await clientB.rpc("create_invoice_and_deduct_stock", {
      p_store_id: storeIdB, // Store B ID
      p_invoice_number: "INV-PRE-GENERATED",
      p_customer_name: "John Doe Nepal",
      p_customer_phone: "9851000000",
      p_total_amount: 1500.00,
      p_discount_amount: 0.00,
      p_paid_amount: 1500.00,
      p_payment_method: "Fonepay",
      p_items: [
        {
          variant_id: varA.id, // Variant belongs to Store A!
          quantity: 1,
          unit_price: 1500.00,
          subtotal: 1500.00,
        }
      ],
    });
    expect(errBCrossVarCheckout).not.toBeNull();
    expect(errBCrossVarCheckout!.message).toContain("does not belong to your store");

    // 10. RLS VERIFICATION: AUDIT LOG ISOLATION
    console.log("[RLS QA] Verifying User B cannot read Store A's audit logs...");
    const { data: bAuditLogs, error: errBAuditLogs } = await clientB
      .from("audit_logs")
      .select("*")
      .eq("store_id", storeIdA);
    expect(errBAuditLogs).toBeNull();
    expect(bAuditLogs?.length).toBe(0);

    console.log("[RLS QA] Verifying User B cannot insert audit logs for Store A...");
    const { error: errBAuditInsert } = await clientB
      .from("audit_logs")
      .insert({
        store_id: storeIdA, // Store A ID
        operation: "HACK",
        affected_entity: "System",
        result: "SUCCESS",
      });
    expect(errBAuditInsert).not.toBeNull();

    // 11. CLEAN UP
    console.log("[RLS QA] Cleaning up Tenant A records...");
    const { error: errDelStoreA } = await clientA.from("stores").delete().eq("id", storeIdA);
    expect(errDelStoreA).toBeNull();
    const { error: errDelUserA } = await clientA.from("users").delete().eq("id", userIdA);
    expect(errDelUserA).toBeNull();

    console.log("[RLS QA] Cleaning up Tenant B records...");
    const { error: errDelStoreB } = await clientB.from("stores").delete().eq("id", storeIdB);
    expect(errDelStoreB).toBeNull();
    const { error: errDelUserB } = await clientB.from("users").delete().eq("id", userIdB);
    expect(errDelUserB).toBeNull();

    // Logout sessions
    await clientA.auth.signOut();
    await clientB.auth.signOut();
  }, 20000);

  test("Enforces strict Owner vs Cashier privilege boundaries on product catalog", async () => {
    const random = Math.random().toString(36).slice(2, 7) + Date.now();
    const emailOwner = `test-role-owner-${random}@paisapos-qa.com`;
    const emailCashier = `test-role-cashier-${random}@paisapos-qa.com`;
    const password = "SecurityDefinerPass123!";

    const clientOwner = createClient(supabaseUrl, supabaseAnonKey);
    const clientCashier = createClient(supabaseUrl, supabaseAnonKey);

    // 1. Sign up Owner & Onboard
    const { data: signUpOwner } = await clientOwner.auth.signUp({ email: emailOwner, password });
    const ownerId = signUpOwner.user!.id;

    const { data: storeId } = await retryOnTransientJwtClockSkew(() =>
      clientOwner.rpc("register_store_and_user", {
        p_full_name: `Store Owner`,
        p_store_name: `Store - ${random}`,
      })
    );

    // 2. Sign up Cashier
    const { data: signUpCashier } = await clientCashier.auth.signUp({ email: emailCashier, password });
    const cashierId = signUpCashier.user!.id;

    // 3. Since RLS restricts cashier store links manually, use the service_role key to register Cashier
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) {
      console.log("[RLS QA] Skipping Owner vs Cashier integration test (SUPABASE_SERVICE_ROLE_KEY not set)");
      await clientOwner.from("stores").delete().eq("id", storeId);
      await clientOwner.from("users").delete().eq("id", ownerId);
      await clientOwner.auth.signOut();
      await clientCashier.from("users").delete().eq("id", cashierId);
      await clientCashier.auth.signOut();
      return;
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Insert cashier profile with cashier role under Owner's store
    await adminClient.from("users").insert({
      id: cashierId,
      name: `Store Cashier`,
      store_id: storeId,
      role: "cashier",
    });

    // 4. Cashier attempts to call upsert_product_and_variants RPC
    console.log("[RLS QA] Verifying Cashier is blocked from calling upsert_product_and_variants RPC...");
    const { error: errCashierUpsert } = await clientCashier.rpc("upsert_product_and_variants", {
      p_product_id: null,
      p_name: "Cashier Product",
      p_category: "Tops",
      p_low_stock_threshold: 5,
      p_deleted_variant_ids: [],
      p_variants: [
        { size: "Free", color: "Red", sku: `SKU-CASH-${random}`, price: 1000, stock: 5 }
      ],
    });

    expect(errCashierUpsert).not.toBeNull();
    expect(errCashierUpsert!.message).toContain("Only store owners can add or modify products");

    // 5. Cashier can checkout and the invoice is attributed to the cashier from auth.uid()
    const { data: ownerProduct, error: ownerProductError } = await clientOwner
      .from("products")
      .insert({
        store_id: storeId,
        name: "Attribution Tee",
        category: "Tops",
        low_stock_threshold: 2,
      })
      .select()
      .single();
    expect(ownerProductError).toBeNull();

    const { data: ownerVariant, error: ownerVariantError } = await clientOwner
      .from("product_variants")
      .insert({
        product_id: ownerProduct.id,
        size: "M",
        color: "Green",
        sku: `SKU-ATTR-${random}`,
        price: 1200.00,
      })
      .select()
      .single();
    expect(ownerVariantError).toBeNull();

    const { error: ownerInventoryError } = await clientOwner
      .from("inventory")
      .insert({
        variant_id: ownerVariant.id,
        quantity: 3,
      });
    expect(ownerInventoryError).toBeNull();

    const { data: cashierInvoiceId, error: cashierCheckoutError } = await clientCashier.rpc(
      "create_invoice_and_deduct_stock",
      {
        p_store_id: storeId,
        p_invoice_number: "INV-PRE-GENERATED",
        p_customer_name: "Walk-in Customer",
        p_customer_phone: null,
        p_total_amount: 1200.00,
        p_discount_amount: 0.00,
        p_paid_amount: 1200.00,
        p_payment_method: "Cash",
        p_items: [
          {
            variant_id: ownerVariant.id,
            quantity: 1,
            unit_price: 1200.00,
            subtotal: 1200.00,
          },
        ],
      }
    );
    expect(cashierCheckoutError).toBeNull();

    const { data: cashierInvoice, error: cashierInvoiceError } = await clientCashier
      .from("invoices")
      .select("id, sold_by_user_id, sold_by_name, sold_by_role")
      .eq("id", cashierInvoiceId)
      .single();
    expect(cashierInvoiceError).toBeNull();
    expect(cashierInvoice).toMatchObject({
      id: cashierInvoiceId,
      sold_by_user_id: cashierId,
      sold_by_name: "Store Cashier",
      sold_by_role: "cashier",
    });

    const { error: spoofInvoiceError } = await clientCashier
      .from("invoices")
      .insert({
        store_id: storeId,
        invoice_number: `INV-SPOOF-${random}`,
        customer_name: "Spoofed Customer",
        total_amount: 1,
        discount_amount: 0,
        paid_amount: 1,
        payment_method: "Cash",
        sold_by_user_id: ownerId,
        sold_by_name: "Fake Owner",
        sold_by_role: "owner",
      });
    expect(spoofInvoiceError).not.toBeNull();

    // 6. Clean up
    console.log("[RLS QA] Cleaning up role test records...");
    await adminClient.from("stores").delete().eq("id", storeId);
    await adminClient.from("users").delete().eq("id", ownerId);
    await adminClient.from("users").delete().eq("id", cashierId);
    await clientOwner.auth.signOut();
    await clientCashier.auth.signOut();
  });

  test("Protects staff invitations and suspended cashier access", async () => {
    const random = Math.random().toString(36).slice(2, 7) + Date.now();
    const password = "SecurityDefinerPass123!";
    const ownerAEmail = `test-staff-owner-a-${random}@paisapos-qa.com`;
    const ownerBEmail = `test-staff-owner-b-${random}@paisapos-qa.com`;
    const cashierEmail = `test-staff-cashier-${random}@paisapos-qa.com`;
    const invitedEmail = `test-staff-invite-${random}@paisapos-qa.com`;

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) {
      console.log("[RLS QA] Skipping staff invitation RLS test (SUPABASE_SERVICE_ROLE_KEY not set)");
      return;
    }

    const clientOwnerA = createClient(supabaseUrl, supabaseAnonKey);
    const clientOwnerB = createClient(supabaseUrl, supabaseAnonKey);
    const clientCashier = createClient(supabaseUrl, supabaseAnonKey);
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: signUpOwnerA } = await clientOwnerA.auth.signUp({ email: ownerAEmail, password });
    const ownerAId = signUpOwnerA.user!.id;
    const { data: storeAId } = await retryOnTransientJwtClockSkew(() =>
      clientOwnerA.rpc("register_store_and_user", {
        p_full_name: "Staff Owner A",
        p_store_name: `Staff Store A ${random}`,
      })
    );

    const { data: signUpOwnerB } = await clientOwnerB.auth.signUp({ email: ownerBEmail, password });
    const ownerBId = signUpOwnerB.user!.id;
    const { data: storeBId } = await retryOnTransientJwtClockSkew(() =>
      clientOwnerB.rpc("register_store_and_user", {
        p_full_name: "Staff Owner B",
        p_store_name: `Staff Store B ${random}`,
      })
    );

    const { data: signUpCashier } = await clientCashier.auth.signUp({ email: cashierEmail, password });
    const cashierId = signUpCashier.user!.id;
    await adminClient.from("users").insert({
      id: cashierId,
      name: "Staff Cashier",
      store_id: storeAId,
      role: "cashier",
      status: "active",
      invited_by_user_id: ownerAId,
    });

    const { data: product, error: productError } = await clientOwnerA
      .from("products")
      .insert({
        store_id: storeAId,
        name: "Suspension Test Tee",
        category: "Tops",
        low_stock_threshold: 2,
      })
      .select()
      .single();
    expect(productError).toBeNull();

    const { data: variant, error: variantError } = await clientOwnerA
      .from("product_variants")
      .insert({
        product_id: product.id,
        size: "M",
        color: "Black",
        sku: `SKU-STAFF-${random}`,
        price: 900.00,
      })
      .select()
      .single();
    expect(variantError).toBeNull();

    const { error: inventoryError } = await clientOwnerA
      .from("inventory")
      .insert({
        variant_id: variant.id,
        quantity: 2,
      });
    expect(inventoryError).toBeNull();

    const { data: invitation, error: invitationError } = await adminClient
      .from("staff_invitations")
      .insert({
        store_id: storeAId,
        email: invitedEmail,
        role: "cashier",
        status: "pending",
        invited_by_user_id: ownerAId,
        expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      })
      .select()
      .single();
    expect(invitationError).toBeNull();

    const { data: ownerAInvites, error: ownerAInvitesError } = await clientOwnerA
      .from("staff_invitations")
      .select("id, email")
      .eq("id", invitation.id);
    expect(ownerAInvitesError).toBeNull();
    expect(ownerAInvites).toEqual([{ id: invitation.id, email: invitedEmail }]);

    const { data: ownerBInvites, error: ownerBInvitesError } = await clientOwnerB
      .from("staff_invitations")
      .select("id")
      .eq("store_id", storeAId);
    expect(ownerBInvitesError).toBeNull();
    expect(ownerBInvites).toHaveLength(0);

    const { data: cashierInvites, error: cashierInvitesError } = await clientCashier
      .from("staff_invitations")
      .select("id");
    expect(cashierInvitesError).toBeNull();
    expect(cashierInvites).toHaveLength(0);

    const { error: ownerDirectInsertError } = await clientOwnerA
      .from("staff_invitations")
      .insert({
        store_id: storeAId,
        email: `direct-owner-${random}@paisapos-qa.com`,
        invited_by_user_id: ownerAId,
        expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      });
    expect(ownerDirectInsertError).not.toBeNull();

    const { error: cashierDirectInsertError } = await clientCashier
      .from("staff_invitations")
      .insert({
        store_id: storeAId,
        email: `direct-cashier-${random}@paisapos-qa.com`,
        invited_by_user_id: cashierId,
        expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      });
    expect(cashierDirectInsertError).not.toBeNull();

    const delegationExpiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const { data: delegation, error: delegationError } = await adminClient
      .from("privilege_delegations")
      .insert({
        store_id: storeAId,
        granted_to_user_id: cashierId,
        granted_by_user_id: ownerAId,
        scope: "inventory.adjust",
        reason: "Owner away from shop",
        expires_at: delegationExpiresAt,
      })
      .select()
      .single();
    expect(delegationError).toBeNull();

    const { data: ownerADelegations, error: ownerADelegationsError } = await clientOwnerA
      .from("privilege_delegations")
      .select("id, scope")
      .eq("id", delegation.id);
    expect(ownerADelegationsError).toBeNull();
    expect(ownerADelegations).toEqual([{ id: delegation.id, scope: "inventory.adjust" }]);

    const { data: ownerBDelegations, error: ownerBDelegationsError } = await clientOwnerB
      .from("privilege_delegations")
      .select("id")
      .eq("store_id", storeAId);
    expect(ownerBDelegationsError).toBeNull();
    expect(ownerBDelegations).toHaveLength(0);

    const { data: cashierDelegations, error: cashierDelegationsError } = await clientCashier
      .from("privilege_delegations")
      .select("id, scope")
      .eq("id", delegation.id);
    expect(cashierDelegationsError).toBeNull();
    expect(cashierDelegations).toEqual([{ id: delegation.id, scope: "inventory.adjust" }]);

    const { error: cashierDelegationInsertError } = await clientCashier
      .from("privilege_delegations")
      .insert({
        store_id: storeAId,
        granted_to_user_id: cashierId,
        granted_by_user_id: ownerAId,
        scope: "inventory.adjust",
        reason: "Forged grant attempt",
        expires_at: delegationExpiresAt,
      });
    expect(cashierDelegationInsertError).not.toBeNull();

    const { error: cashierStaffManageDelegationError } = await adminClient
      .from("privilege_delegations")
      .insert({
        store_id: storeAId,
        granted_to_user_id: cashierId,
        granted_by_user_id: ownerAId,
        scope: "staff.manage",
        reason: "Forbidden scope attempt",
        expires_at: delegationExpiresAt,
      });
    expect(cashierStaffManageDelegationError).not.toBeNull();

    const { error: ownerDirectDelegationInsertError } = await clientOwnerA
      .from("privilege_delegations")
      .insert({
        store_id: storeAId,
        granted_to_user_id: cashierId,
        granted_by_user_id: ownerAId,
        scope: "inventory.adjust",
        reason: "Browser grant attempt",
        expires_at: delegationExpiresAt,
      });
    expect(ownerDirectDelegationInsertError).not.toBeNull();

    const { error: revokeDelegationError } = await adminClient
      .from("privilege_delegations")
      .update({
        revoked_at: new Date().toISOString(),
        revoked_by_user_id: ownerAId,
      })
      .eq("id", delegation.id);
    expect(revokeDelegationError).toBeNull();

    const { data: cashierRevokedDelegations, error: cashierRevokedDelegationsError } = await clientCashier
      .from("privilege_delegations")
      .select("id")
      .eq("id", delegation.id);
    expect(cashierRevokedDelegationsError).toBeNull();
    expect(cashierRevokedDelegations).toHaveLength(0);

    const { error: suspendError } = await adminClient
      .from("users")
      .update({
        status: "suspended",
        suspended_at: new Date().toISOString(),
        suspended_by_user_id: ownerAId,
      })
      .eq("id", cashierId);
    expect(suspendError).toBeNull();

    const { data: suspendedProducts, error: suspendedProductsError } = await clientCashier
      .from("products")
      .select("id")
      .eq("store_id", storeAId);
    expect(suspendedProductsError).toBeNull();
    expect(suspendedProducts).toHaveLength(0);

    const { error: suspendedCheckoutError } = await clientCashier.rpc("create_invoice_and_deduct_stock", {
      p_store_id: storeAId,
      p_invoice_number: "INV-PRE-GENERATED",
      p_customer_name: "Suspended Customer",
      p_customer_phone: null,
      p_total_amount: 900.00,
      p_discount_amount: 0.00,
      p_paid_amount: 900.00,
      p_payment_method: "Cash",
      p_items: [
        {
          variant_id: variant.id,
          quantity: 1,
          unit_price: 900.00,
          subtotal: 900.00,
        },
      ],
    });
    expect(suspendedCheckoutError).not.toBeNull();
    expect(suspendedCheckoutError!.message).toContain("Unauthorized");

    await adminClient.from("stores").delete().eq("id", storeAId);
    await adminClient.from("stores").delete().eq("id", storeBId);
    await adminClient.from("users").delete().eq("id", ownerAId);
    await adminClient.from("users").delete().eq("id", ownerBId);
    await adminClient.from("users").delete().eq("id", cashierId);
    await clientOwnerA.auth.signOut();
    await clientOwnerB.auth.signOut();
    await clientCashier.auth.signOut();
  });

  test("Protects activity events with owner timeline reads and no direct browser writes", async () => {
    const random = Math.random().toString(36).slice(2, 7) + Date.now();
    const password = "SecurityDefinerPass123!";
    const ownerAEmail = `test-activity-owner-a-${random}@paisapos-qa.com`;
    const ownerBEmail = `test-activity-owner-b-${random}@paisapos-qa.com`;
    const cashierEmail = `test-activity-cashier-${random}@paisapos-qa.com`;

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) {
      console.log("[RLS QA] Skipping activity_events RLS test (SUPABASE_SERVICE_ROLE_KEY not set)");
      return;
    }

    const clientOwnerA = createClient(supabaseUrl, supabaseAnonKey);
    const clientOwnerB = createClient(supabaseUrl, supabaseAnonKey);
    const clientCashier = createClient(supabaseUrl, supabaseAnonKey);
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: signUpOwnerA } = await clientOwnerA.auth.signUp({ email: ownerAEmail, password });
    const ownerAId = signUpOwnerA.user!.id;
    const { data: storeAId } = await retryOnTransientJwtClockSkew(() =>
      clientOwnerA.rpc("register_store_and_user", {
        p_full_name: "Activity Owner A",
        p_store_name: `Activity Store A ${random}`,
      })
    );

    const { data: signUpOwnerB } = await clientOwnerB.auth.signUp({ email: ownerBEmail, password });
    const ownerBId = signUpOwnerB.user!.id;
    const { data: storeBId } = await retryOnTransientJwtClockSkew(() =>
      clientOwnerB.rpc("register_store_and_user", {
        p_full_name: "Activity Owner B",
        p_store_name: `Activity Store B ${random}`,
      })
    );

    const { data: signUpCashier } = await clientCashier.auth.signUp({ email: cashierEmail, password });
    const cashierId = signUpCashier.user!.id;
    await adminClient.from("users").insert({
      id: cashierId,
      name: "Activity Cashier",
      store_id: storeAId,
      role: "cashier",
    });
    await clientCashier.auth.signInWithPassword({ email: cashierEmail, password });

    const ownerEventTime = new Date(Date.now() + 1000).toISOString();
    const cashierEventTime = new Date().toISOString();

    const { data: ownerEvent, error: ownerEventError } = await adminClient
      .from("activity_events")
      .insert({
        store_id: storeAId,
        actor_user_id: ownerAId,
        actor_name: "Activity Owner A",
        actor_email: ownerAEmail,
        actor_role: "owner",
        privilege_source: "owner_role",
        action: "store.updated",
        action_scope: "store.settings",
        target_type: "store",
        target_id: storeAId,
        target_label: "Activity Store A",
        summary: "Owner updated store settings.",
        metadata: { changedFields: ["name"] },
        result: "success",
        occurred_at: ownerEventTime,
      })
      .select()
      .single();
    expect(ownerEventError).toBeNull();

    const { data: cashierEvent, error: cashierEventError } = await adminClient
      .from("activity_events")
      .insert({
        store_id: storeAId,
        actor_user_id: cashierId,
        actor_name: "Activity Cashier",
        actor_email: cashierEmail,
        actor_role: "cashier",
        privilege_source: "cashier_role",
        action: "checkout.created",
        action_scope: "checkout.create",
        target_type: "invoice",
        summary: "Cashier created invoice.",
        metadata: { itemCount: 1 },
        result: "success",
        occurred_at: cashierEventTime,
      })
      .select()
      .single();
    expect(cashierEventError).toBeNull();

    const { data: ownerAEvents, error: ownerAReadError } = await clientOwnerA
      .from("activity_events")
      .select("id, actor_user_id, action")
      .order("occurred_at", { ascending: false });
    expect(ownerAReadError).toBeNull();
    expect(ownerAEvents?.map((event) => event.id).sort()).toEqual(
      [ownerEvent.id, cashierEvent.id].sort()
    );

    const { data: firstActivityPage, error: firstActivityPageError } = await clientOwnerA
      .from("activity_events")
      .select("id, occurred_at")
      .order("occurred_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(1);
    expect(firstActivityPageError).toBeNull();
    expect(firstActivityPage?.[0]?.id).toBe(ownerEvent.id);

    const { data: secondActivityPage, error: secondActivityPageError } = await clientOwnerA
      .from("activity_events")
      .select("id")
      .or(`occurred_at.lt.${firstActivityPage![0].occurred_at},and(occurred_at.eq.${firstActivityPage![0].occurred_at},id.lt.${firstActivityPage![0].id})`)
      .order("occurred_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(1);
    expect(secondActivityPageError).toBeNull();
    expect(secondActivityPage).toEqual([{ id: cashierEvent.id }]);

    const { data: ownerBEvents, error: ownerBReadError } = await clientOwnerB
      .from("activity_events")
      .select("id")
      .eq("store_id", storeAId);
    expect(ownerBReadError).toBeNull();
    expect(ownerBEvents).toHaveLength(0);

    const { data: cashierEvents, error: cashierReadError } = await clientCashier
      .from("activity_events")
      .select("id, actor_user_id");
    expect(cashierReadError).toBeNull();
    expect(cashierEvents).toEqual([{ id: cashierEvent.id, actor_user_id: cashierId }]);

    const { error: ownerInsertError } = await clientOwnerA
      .from("activity_events")
      .insert({
        store_id: storeAId,
        actor_user_id: ownerAId,
        actor_name: "Fake Owner Event",
        actor_role: "owner",
        privilege_source: "owner_role",
        action: "fake.event",
        target_type: "store",
        summary: "Forged browser event.",
        result: "success",
      });
    expect(ownerInsertError).not.toBeNull();

    const { error: cashierInsertError } = await clientCashier
      .from("activity_events")
      .insert({
        store_id: storeAId,
        actor_user_id: cashierId,
        actor_name: "Fake Cashier Event",
        actor_role: "cashier",
        privilege_source: "cashier_role",
        action: "fake.event",
        target_type: "store",
        summary: "Forged browser event.",
        result: "success",
      });
    expect(cashierInsertError).not.toBeNull();

    const { error: adminUpdateError } = await adminClient
      .from("activity_events")
      .update({ summary: "Tampered summary" })
      .eq("id", ownerEvent.id);
    expect(adminUpdateError).not.toBeNull();
    expect(adminUpdateError!.message).toContain("Activity events are immutable");

    await adminClient.from("stores").delete().eq("id", storeAId);
    await adminClient.from("stores").delete().eq("id", storeBId);
    await adminClient.from("users").delete().eq("id", ownerAId);
    await adminClient.from("users").delete().eq("id", ownerBId);
    await adminClient.from("users").delete().eq("id", cashierId);
    await clientOwnerA.auth.signOut();
    await clientOwnerB.auth.signOut();
    await clientCashier.auth.signOut();
  });
});
