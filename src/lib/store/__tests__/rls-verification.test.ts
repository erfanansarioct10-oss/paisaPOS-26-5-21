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

    // 5. Clean up
    console.log("[RLS QA] Cleaning up role test records...");
    await adminClient.from("stores").delete().eq("id", storeId);
    await adminClient.from("users").delete().eq("id", ownerId);
    await adminClient.from("users").delete().eq("id", cashierId);
    await clientOwner.auth.signOut();
    await clientCashier.auth.signOut();
  });
});
