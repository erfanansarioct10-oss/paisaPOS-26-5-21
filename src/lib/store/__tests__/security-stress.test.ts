import { describe, test, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { loadEnvConfig } from "@next/env";
import {
  retryOnTransientJwtClockSkew,
  upsertCatalogProduct,
  newIdempotencyKey,
} from "./supabase-test-utils";

// Load environment variables
loadEnvConfig(process.cwd());

const runLiveTests = !!(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
  !process.env.SKIP_LIVE_TESTS
);

describe.runIf(runLiveTests)("PaisaPOS — Advanced Security & Concurrency Stress Testing Suite", () => {
  let supabaseUrl: string;
  let supabaseAnonKey: string;
  let serviceRoleKey: string;

  beforeAll(() => {
    supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
    serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  });

  // =========================================================================
  // STRESS TEST 1: CASHIER PRIVILEGE ESCALATION RPC ATTACK
  // =========================================================================
  test("Stress Test 1: Cashier Privilege Escalation RPC Attack (High Concurrency Flood)", async () => {
    const random = Math.random().toString(36).slice(2, 7) + Date.now();
    const emailOwner = `owner-stress-${random}@paisapos-qa.com`;
    const emailCashier = `cashier-stress-${random}@paisapos-qa.com`;
    const password = "SecurityDefinerPass123!";

    const clientOwner = createClient(supabaseUrl, supabaseAnonKey);
    const clientCashier = createClient(supabaseUrl, supabaseAnonKey);

    // 1. Sign up Owner & Onboard Store
    const { data: signUpOwner } = await clientOwner.auth.signUp({ email: emailOwner, password });
    const ownerId = signUpOwner.user!.id;

    const { data: storeId } = await retryOnTransientJwtClockSkew(() =>
      clientOwner.rpc("register_store_and_user", {
        p_full_name: `Stress Store Owner`,
        p_store_name: `Stress Store - ${random}`,
      })
    );

    // 2. Sign up Cashier
    const { data: signUpCashier } = await clientCashier.auth.signUp({ email: emailCashier, password });
    const cashierId = signUpCashier.user!.id;

    // Skip if service role is not defined (requires database bypass settings to map cashier role)
    if (!serviceRoleKey) {
      console.log("[Stress Test] Skipping Cashier Privilege test (SUPABASE_SERVICE_ROLE_KEY missing)");
      await clientOwner.from("stores").delete().eq("id", storeId);
      await clientOwner.from("users").delete().eq("id", ownerId);
      await clientOwner.auth.signOut();
      await clientCashier.auth.signOut();
      return;
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Create cashier profile in the DB under same store, with cashier role
    await adminClient.from("users").insert({
      id: cashierId,
      name: `Stress Cashier`,
      store_id: storeId,
      role: "cashier"
    });

    // 3. Flood database with 15 concurrent RPC calls from Cashier attempting to inject a product
    console.log("[Stress Test] Flooding product upsert RPC from Cashier session...");
    const floodThreshold = 15;
    const promises: Promise<unknown>[] = [];

    for (let i = 0; i < floodThreshold; i++) {
      promises.push(
        clientCashier.rpc("upsert_product_and_variants", {
          p_product_id: null,
          p_name: `Hacked Shirt ${i}`,
          p_category: "Tops",
          p_low_stock_threshold: 5,
          p_deleted_variant_ids: [],
          p_variants: [
            { size: "M", color: "Red", sku: `HACK-SKU-${i}-${random.toUpperCase()}`, price: 100, stock: 10 }
          ]
        })
      );
    }

    const results = await Promise.all(promises);

    // 4. Assert that 100% of concurrent attempts were strictly rejected by the RPC owner role gate
    //    The active-status hardening (migration 20260531022126) changed the message
    //    to include "active" in the owner check.
    results.forEach((res) => {
      expect(res.error).not.toBeNull();
      expect(res.error.message).toContain("Only active store owners can add or modify products");
    });

    // Verify no product was successfully created
    const { data: dbProducts } = await adminClient.from("products").select("*").eq("store_id", storeId);
    expect(dbProducts?.length).toBe(0);

    // 5. Clean up
    console.log("[Stress Test] Cleaning up Cashier Escalation test data...");
    await adminClient.from("stores").delete().eq("id", storeId);
    await adminClient.from("users").delete().eq("id", ownerId);
    await adminClient.from("users").delete().eq("id", cashierId);
    await clientOwner.auth.signOut();
    await clientCashier.auth.signOut();
  });

  // =========================================================================
  // STRESS TEST 2: CHECKOUT PRICE TAMPERING INTEGRITY ATTACK
  // =========================================================================
  test("Stress Test 2: Checkout Price Tampering Integrity Attack", async () => {
    const random = Math.random().toString(36).slice(2, 7) + Date.now();
    const email = `tamper-${random}@paisapos-qa.com`;
    const password = "SecurityDefinerPass123!";

    const client = createClient(supabaseUrl, supabaseAnonKey);

    // 1. Sign up & Onboard
    const { data: signUp } = await client.auth.signUp({ email, password });
    const userId = signUp.user!.id;

    const { data: storeId } = await retryOnTransientJwtClockSkew(() =>
      client.rpc("register_store_and_user", {
        p_full_name: `Tamper Owner`,
        p_store_name: `Tamper Store - ${random}`,
      })
    );

    // 2. Owner creates a valid product variant (priced at Rs. 1500) via RPC
    const { variant } = await upsertCatalogProduct(client, {
      name: "Premium Hoodie",
      category: "Outerwear",
      variants: [
        { size: "L", color: "Navy", sku: `HOOD-NVY-${random.toUpperCase()}`, price: 1500, stock: 10 }
      ],
    });

    // 3. Simulate a compromised client attempting to checkout by modifying the total to Rs. 100 (tampering)
    console.log("[Stress Test] Executing price-tampering checkout attack...");
    const { error: errTamperedCheckout } = await client.rpc("create_invoice_and_deduct_stock", {
      p_store_id: storeId,
      p_invoice_number: "INV-TAMPERED-001",
      p_customer_name: "Hacker Client",
      p_customer_phone: "9800000000",
      p_total_amount: 100, // Client claims total is Rs. 100! (Recalculated subtotal must be Rs. 1500)
      p_discount_amount: 0,
      p_paid_amount: 100,
      p_payment_method: "Cash",
      p_items: [
        {
          variant_id: variant.id,
          quantity: 1,
          unit_price: 100, // Tampered price reported by client
          subtotal: 100
        }
      ],
      p_idempotency_key: newIdempotencyKey(),
    });

    // 4. Assert database transaction aborted the tampered checkout successfully
    expect(errTamperedCheckout).not.toBeNull();
    expect(errTamperedCheckout!.message).toContain("Price tampering detected");

    // Verify stock remains intact (Rs. 1500 item was not checked out, inventory was not deducted)
    const { data: inventoryData } = await client
      .from("inventory")
      .select("quantity")
      .eq("variant_id", variant.id)
      .single();
    expect(inventoryData?.quantity).toBe(10);

    // 5. Clean up
    console.log("[Stress Test] Cleaning up Price Tampering test data...");
    if (serviceRoleKey) {
      const adminClient = createClient(supabaseUrl, serviceRoleKey);
      await adminClient.from("stores").delete().eq("id", storeId);
      await adminClient.from("users").delete().eq("id", userId);
    }
    await client.auth.signOut();
  });

  // =========================================================================
  // STRESS TEST 3: CONCURRENT LOCK SERIALIZATION (DEADLOCK STRESS ATTACK)
  // =========================================================================
  test("Stress Test 3: Concurrent Lock Serialization (Deadlock Stress Attack)", async () => {
    const random = Math.random().toString(36).slice(2, 7) + Date.now();
    const email = `deadlock-${random}@paisapos-qa.com`;
    const password = "SecurityDefinerPass123!";

    const client = createClient(supabaseUrl, supabaseAnonKey);

    // 1. Sign up & Onboard
    const { data: signUp } = await client.auth.signUp({ email, password });
    const userId = signUp.user!.id;

    const { data: storeId } = await retryOnTransientJwtClockSkew(() =>
      client.rpc("register_store_and_user", {
        p_full_name: `Deadlock Owner`,
        p_store_name: `Deadlock Store - ${random}`,
      })
    );

    // 2. Create two variants via the RPC helper
    const { variant: var1 } = await upsertCatalogProduct(client, {
      name: "Deadlock Pants Var1",
      category: "Pants",
      variants: [
        { size: "32", color: "Grey", sku: `PAN-GRY-${random.toUpperCase()}`, price: 1000, stock: 100 }
      ],
    });

    const { variant: var2 } = await upsertCatalogProduct(client, {
      name: "Deadlock Pants Var2",
      category: "Pants",
      variants: [
        { size: "34", color: "Grey", sku: `PAN-GRY-34-${random.toUpperCase()}`, price: 1000, stock: 100 }
      ],
    });

    // 3. Initiate concurrent checkout floods in opposing locks order (deadlock attack)
    //    We test if the backend sorts checkout items deterministically to avoid Postgres deadlocks.
    console.log("[Stress Test] Flooding database with concurrent checkouts to trigger deadlock race conditions...");
    const checkoutThreshold = 10;
    const promises: Promise<unknown>[] = [];

    for (let i = 0; i < checkoutThreshold; i++) {
      // Alternate item lists order: Thread A puts Var1 first, Thread B puts Var2 first.
      // Deterministic sorted lock acquisition on database RPC ensures they serialize cleanly instead of locking.
      const items = i % 2 === 0
        ? [
            { variant_id: var1.id, quantity: 1, unit_price: 1000, subtotal: 1000 },
            { variant_id: var2.id, quantity: 1, unit_price: 1000, subtotal: 1000 }
          ]
        : [
            { variant_id: var2.id, quantity: 1, unit_price: 1000, subtotal: 1000 },
            { variant_id: var1.id, quantity: 1, unit_price: 1000, subtotal: 1000 }
          ];

      promises.push(
        client.rpc("create_invoice_and_deduct_stock", {
          p_store_id: storeId,
          p_invoice_number: `INV-DL-${i}`,
          p_customer_name: `Client ${i}`,
          p_customer_phone: "9800000000",
          p_total_amount: 2000,
          p_discount_amount: 0,
          p_paid_amount: 2000,
          p_payment_method: "Fonepay",
          p_items: items,
          p_idempotency_key: newIdempotencyKey(),
        })
      );
    }

    const results = await Promise.all(promises);

    // 4. Assert all transactions completed cleanly without deadlock abort exceptions (code 40P01)
    results.forEach((res) => {
      if (res.error) {
        expect(res.error.message).not.toContain("deadlock");
      } else {
        expect(res.data).toBeDefined();
      }
    });

    // 5. Clean up
    console.log("[Stress Test] Cleaning up Deadlock test records...");
    if (serviceRoleKey) {
      const adminClient = createClient(supabaseUrl, serviceRoleKey);
      await adminClient.from("stores").delete().eq("id", storeId);
      await adminClient.from("users").delete().eq("id", userId);
    }
    await client.auth.signOut();
  });
});
