import { describe, test, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { loadEnvConfig } from "@next/env";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

// Load environment variables
loadEnvConfig(process.cwd());

const runLiveTests = !!(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
  !process.env.SKIP_LIVE_TESTS
);

describe.runIf(runLiveTests)("PaisaPOS — Phase 1 Production Hardening Verification", () => {
  let supabaseUrl: string;
  let supabaseAnonKey: string;
  let serviceRoleKey: string | undefined;

  beforeAll(() => {
    supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
    serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  // =========================================================================
  // 1. PRIVILEGE ESCALATION TRIGGER & STORE HIJACK PROTECTION
  // =========================================================================
  test("Privilege Escalation & Store Hijack: blocks Cashiers from changing role and store metadata", async () => {
    const random = Math.random().toString(36).slice(2, 7) + Date.now();
    const emailOwner = `test-hardened-owner-${random}@paisapos-qa.com`;
    const emailCashier = `test-hardened-cashier-${random}@paisapos-qa.com`;
    const password = "SecurityDefinerPass123!";

    const clientOwner = createClient(supabaseUrl, supabaseAnonKey);
    const clientCashier = createClient(supabaseUrl, supabaseAnonKey);

    // 1. Sign up Owner & Onboard
    const { data: signUpOwner } = await clientOwner.auth.signUp({ email: emailOwner, password });
    const ownerId = signUpOwner.user!.id;

    const { data: storeId } = await clientOwner.rpc("register_store_and_user", {
      p_full_name: `Store Owner`,
      p_store_name: `Store - ${random}`,
    });

    // 2. Sign up Cashier
    const { data: signUpCashier } = await clientCashier.auth.signUp({ email: emailCashier, password });
    const cashierId = signUpCashier.user!.id;

    expect(serviceRoleKey).toBeDefined();
    const adminClient = createClient(supabaseUrl, serviceRoleKey!);

    // Insert cashier profile with cashier role under Owner's store
    await adminClient.from("users").insert({
      id: cashierId,
      name: `Store Cashier`,
      store_id: storeId,
      role: "cashier",
    });

    // Login Cashier session
    const { error: errSignInCashier } = await clientCashier.auth.signInWithPassword({
      email: emailCashier,
      password: password,
    });
    expect(errSignInCashier).toBeNull();

    // TEST A: Cashier self-promotes to owner (Trigger Enforcement)
    console.log("[QA Test] Verifying Cashier role promotion is strictly blocked by DB trigger...");
    const { error: errPromotion } = await clientCashier
      .from("users")
      .update({ role: "owner" })
      .eq("id", cashierId);

    // Should raise trigger error
    expect(errPromotion).not.toBeNull();
    expect(errPromotion!.message).toContain("Only store owners can change user roles");

    // TEST B: Cashier hijacks store metadata (RLS Policy Enforcement)
    console.log("[QA Test] Verifying Cashier store metadata updates are blocked by RLS policies...");
    const { data: storeUpdateResult, error: errStoreUpdate } = await clientCashier
      .from("stores")
      .update({ name: "Hacked Store Name" })
      .eq("id", storeId)
      .select();

    expect(errStoreUpdate).toBeNull();
    expect(storeUpdateResult?.length).toBe(0); // Invisible/no rows updated due to RLS

    // Verify store name remained original
    const { data: checkStore } = await clientOwner.from("stores").select("name").eq("id", storeId).single();
    expect(checkStore?.name).toBe(`Store - ${random}`);

    // Clean up
    console.log("[QA Test] Cleaning up accounts...");
    await adminClient.from("stores").delete().eq("id", storeId);
    await adminClient.from("users").delete().eq("id", ownerId);
    await adminClient.from("users").delete().eq("id", cashierId);

    await clientOwner.auth.signOut();
    await clientCashier.auth.signOut();
  }, 20000);

  // =========================================================================
  // 2. MULTI-TENANT INVOICE SECLUSION
  // =========================================================================
  test("Multi-Tenant Invoice Seclusion: blocks Tenant B from querying Tenant A's invoices", async () => {
    const randomA = Math.random().toString(36).slice(2, 7) + Date.now();
    const randomB = Math.random().toString(36).slice(2, 7) + (Date.now() + 1);

    const emailA = `test-sec-a-${randomA}@paisapos-qa.com`;
    const emailB = `test-sec-b-${randomB}@paisapos-qa.com`;
    const password = "SecurityDefinerPass123!";

    const clientA = createClient(supabaseUrl, supabaseAnonKey);
    const clientB = createClient(supabaseUrl, supabaseAnonKey);

    // Sign up & Onboard Tenant A
    const { data: signUpA } = await clientA.auth.signUp({ email: emailA, password });
    const storeIdA = await clientA.rpc("register_store_and_user", {
      p_full_name: `Owner A`,
      p_store_name: `Store A - ${randomA}`,
    });

    // Create a product variant in Store A for billing
    const { data: prodA } = await clientA
      .from("products")
      .insert({ store_id: storeIdA.data, name: "Product A", category: "Tops" })
      .select()
      .single();

    const { data: varA } = await clientA
      .from("product_variants")
      .insert({ product_id: prodA.id, store_id: storeIdA.data, size: "Free", color: "Red", sku: `SKU-A-${randomA}`, price: 1000 })
      .select()
      .single();

    await clientA.from("inventory").insert({ variant_id: varA.id, quantity: 100 });

    // Checkout an invoice in Store A
    const { data: invoiceIdA, error: checkoutErr } = await clientA.rpc("create_invoice_and_deduct_stock", {
      p_store_id: storeIdA.data,
      p_invoice_number: `INV-A-${randomA}`,
      p_customer_name: "Customer A",
      p_customer_phone: null,
      p_total_amount: 1000.00,
      p_discount_amount: 0.00,
      p_paid_amount: 1000.00,
      p_payment_method: "Cash",
      p_items: [{ variant_id: varA.id, quantity: 1, unit_price: 1000, subtotal: 1000 }]
    });
    expect(checkoutErr).toBeNull();
    expect(invoiceIdA).toBeDefined();

    // Sign up & Onboard Tenant B
    const { data: signUpB } = await clientB.auth.signUp({ email: emailB, password });
    const storeIdB = await clientB.rpc("register_store_and_user", {
      p_full_name: `Owner B`,
      p_store_name: `Store B - ${randomB}`,
    });

    // TEST C: Tenant B queries Tenant A's invoices
    console.log("[QA Test] Verifying Tenant B is blocked from reading Tenant A's invoices by RLS...");
    const { data: invoicesB, error: errInvoicesB } = await clientB
      .from("invoices")
      .select("*")
      .eq("id", invoiceIdA);

    expect(errInvoicesB).toBeNull();
    expect(invoicesB?.length).toBe(0); // Invisible/no rows returned due to RLS

    // TEST D: Tenant B queries Tenant A's invoice items
    console.log("[QA Test] Verifying Tenant B is blocked from reading Tenant A's invoice line items...");
    const { data: invoiceItemsB, error: errInvoiceItemsB } = await clientB
      .from("invoice_items")
      .select("*")
      .eq("invoice_id", invoiceIdA);

    expect(errInvoiceItemsB).toBeNull();
    expect(invoiceItemsB?.length).toBe(0); // Invisible/no rows returned due to RLS

    // Clean up
    console.log("[QA Test] Cleaning up multi-tenant records...");
    const adminClient = createClient(supabaseUrl, serviceRoleKey!);
    await adminClient.from("stores").delete().eq("id", storeIdA.data);
    await adminClient.from("stores").delete().eq("id", storeIdB.data);
    await adminClient.from("users").delete().eq("id", signUpA.user!.id);
    await adminClient.from("users").delete().eq("id", signUpB.user!.id);

    await clientA.auth.signOut();
    await clientB.auth.signOut();
  }, 20000);

  // =========================================================================
  // 3. INVOICE INTEGRITY CONSTRAINT HARDENING
  // =========================================================================
  test("Invoice Constraints: enforces discount_amount <= total_amount check constraint in DB", async () => {
    const random = Math.random().toString(36).slice(2, 7) + Date.now();
    const email = `test-constraints-${random}@paisapos-qa.com`;
    const password = "SecurityDefinerPass123!";

    const client = createClient(supabaseUrl, supabaseAnonKey);

    // Sign up & Onboard Owner
    const { data: signUp } = await client.auth.signUp({ email, password });
    const storeId = await client.rpc("register_store_and_user", {
      p_full_name: `Owner Constraints`,
      p_store_name: `Store Constraints - ${random}`,
    });

    const { data: prod } = await client
      .from("products")
      .insert({ store_id: storeId.data, name: "Product C", category: "Tops" })
      .select()
      .single();

    const { data: variant } = await client
      .from("product_variants")
      .insert({ product_id: prod.id, store_id: storeId.data, size: "M", color: "Red", sku: `SKU-C-${random}`, price: 1000 })
      .select()
      .single();

    await client.from("inventory").insert({ variant_id: variant.id, quantity: 10 });

    // TEST E: Excess Discount Amount (discount_amount > total_amount)
    console.log("[QA Test] Verifying discount_amount <= total_amount is enforced at DB level...");
    const { error: errExcessDiscount } = await client.rpc("create_invoice_and_deduct_stock", {
      p_store_id: storeId.data,
      p_invoice_number: `INV-C1-${random}`,
      p_customer_name: "Customer C",
      p_customer_phone: null,
      p_total_amount: 500.00, // Total
      p_discount_amount: 600.00, // Discount exceeds Total!
      p_paid_amount: 500.00,
      p_payment_method: "Cash",
      p_items: [{ variant_id: variant.id, quantity: 1, unit_price: 1000, subtotal: 1000 }]
    });

    expect(errExcessDiscount).not.toBeNull();
    expect(errExcessDiscount!.message).toContain("check_discount_amount");

    // TEST F: Excess Paid Amount (paid_amount > total_amount)
    console.log("[QA Test] Verifying paid_amount <= total_amount boundary is enforced at DB level...");
    const { error: errExcessPaid } = await client.rpc("create_invoice_and_deduct_stock", {
      p_store_id: storeId.data,
      p_invoice_number: `INV-C2-${random}`,
      p_customer_name: "Customer C",
      p_customer_phone: null,
      p_total_amount: 500.00, // Total
      p_discount_amount: 100.00,
      p_paid_amount: 600.00, // Paid exceeds Total!
      p_payment_method: "Cash",
      p_items: [{ variant_id: variant.id, quantity: 1, unit_price: 600, subtotal: 600 }]
    });

    expect(errExcessPaid).not.toBeNull();
    expect(errExcessPaid!.message).toContain("check_paid_amount");

    // Clean up
    console.log("[QA Test] Cleaning up constraints records...");
    const adminClient = createClient(supabaseUrl, serviceRoleKey!);
    await adminClient.from("stores").delete().eq("id", storeId.data);
    await adminClient.from("users").delete().eq("id", signUp.user!.id);
    await client.auth.signOut();
  }, 20000);

  // =========================================================================
  // 4. BATCH IMPORT CHUNK-ATOMIC TRANSACTION ROLLBACK SAFETY
  // =========================================================================
  test("Batch Import: processes chunks of 100 items atomically and rolls back completely on chunk failure", async () => {
    const random = Math.random().toString(36).slice(2, 7) + Date.now();
    const email = `test-bulk-rollback-${random}@paisapos-qa.com`;
    const password = "SecurityDefinerPass123!";

    const client = createClient(supabaseUrl, supabaseAnonKey);

    // Sign up & Onboard Owner
    const { data: signUp } = await client.auth.signUp({ email, password });
    const storeId = await client.rpc("register_store_and_user", {
      p_full_name: `Owner Bulk`,
      p_store_name: `Store Bulk - ${random}`,
    });

    // Prepare a mock batch payload with two products:
    // Product 1: Valid SKU & Price
    // Product 2: Negative Price (violates price >= 0 check constraint)
    const bulkPayload = [
      {
        name: "Valid Product A",
        category: "Tops",
        lowStockThreshold: 5,
        variants: [{ size: "M", color: "Black", sku: `SKU-VALID-A-${random}`, price: 1200, stock: 10 }]
      },
      {
        name: "Invalid Product B",
        category: "Outerwear",
        lowStockThreshold: 5,
        variants: [{ size: "L", color: "Black", sku: `SKU-INVALID-B-${random}`, price: -3500.00, stock: 5 }] // FAIL CHECK CONSTRAINT!
      }
    ];

    console.log("[QA Test] Verifying chunk-atomic rollback: single database transaction for the batch...");
    // Call bulk import RPC
    const { error: errImport } = await client.rpc("bulk_upsert_products_and_variants", {
      p_products: bulkPayload
    });

    expect(errImport).not.toBeNull();
    expect(errImport!.message).toContain("check");

    // Atomic Rollback Verification:
    // Validate that Product 1 ("Valid Product A") was NOT created in the database because the entire chunk rolled back!
    const { data: checkProd } = await client
      .from("products")
      .select("*")
      .eq("store_id", storeId.data)
      .eq("name", "Valid Product A");

    expect(checkProd?.length).toBe(0); // Successfully rolled back completely! 0% stock/product leakage!

    // Clean up
    console.log("[QA Test] Cleaning up bulk records...");
    const adminClient = createClient(supabaseUrl, serviceRoleKey!);
    await adminClient.from("stores").delete().eq("id", storeId.data);
    await adminClient.from("users").delete().eq("id", signUp.user!.id);
    await client.auth.signOut();
  }, 20000);
});

// =========================================================================
// 5. MIDDLEWARE VERIFICATION EXPANSION (ABUSE SIMULATION / RATE LIMIT STRESS)
// =========================================================================
describe("PaisaPOS — Middleware Verification & Abuse Simulation Suite", () => {
  test("Middleware Abuse Simulation: floods request pipeline with >30 rapid requests, verifies 429 status code and active runtime rate limiting", async () => {
    console.log("[QA Test] Flooding middleware request pipeline with 35 rapid requests...");

    const requestsCount = 35;
    const fetchPromises = [];
    const clientIp = `198.51.100.${Math.floor(Math.random() * 255)}`; // Unique mock IP for this run

    for (let i = 0; i < requestsCount; i++) {
      // Mock NextRequest representing incoming request
      const req = new NextRequest(new URL("http://localhost:3000/dashboard"), {
        headers: {
          "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0",
          "x-forwarded-for": clientIp,
          "host": "localhost:3000",
        },
      });

      // Directly invoke Next.js middleware bridge proxy
      fetchPromises.push(
        proxy(req).then(async (res) => {
          return {
            status: res.status,
            limit: res.headers.get("X-RateLimit-Limit"),
            remaining: res.headers.get("X-RateLimit-Remaining"),
            retryAfter: res.headers.get("Retry-After"),
          };
        })
      );
    }

    const results = await Promise.all(fetchPromises);

    let allowedCount = 0;
    let blockedCount = 0;
    let containsRetryAfter = false;

    results.forEach((res) => {
      if (res.status === 429) {
        blockedCount++;
        if (res.retryAfter) {
          containsRetryAfter = true;
        }
      } else if (res.status === 200 || res.status === 307 || res.status === 302) {
        allowedCount++;
      }
    });

    console.log(`[QA Test] Middleware Abuse Simulation Report:`);
    console.log(`  - Total flood requests: ${requestsCount}`);
    console.log(`  - Allowed (OK/Redirect): ${allowedCount}`);
    console.log(`  - Blocked (429 Too Many Requests): ${blockedCount}`);

    // Expect that at most 30 requests are allowed (global IP threshold is 30)
    expect(allowedCount).toBeLessThanOrEqual(30);
    expect(blockedCount).toBeGreaterThan(0);
    expect(containsRetryAfter).toBe(true);
  });

  test("IP Spoof Test: prioritizes x-real-ip over client-supplied x-forwarded-for to prevent spoofing bypass", async () => {
    const { getTrustedClientIp } = await import("@/lib/network");
    const req = new NextRequest(new URL("http://localhost:3000/dashboard"), {
      headers: {
        "x-forwarded-for": "attacker-spoofed-ip",
        "x-real-ip": "real-proxy-ip",
      },
    });

    const resolvedIp = await getTrustedClientIp(req);
    expect(resolvedIp).toBe("real-proxy-ip");
  });

  test("Header Absence Test: falls back to unknown when both x-real-ip and x-forwarded-for are absent", async () => {
    const { getTrustedClientIp } = await import("@/lib/network");
    const req = new NextRequest(new URL("http://localhost:3000/dashboard"), {
      headers: {},
    });

    const resolvedIp = await getTrustedClientIp(req);
    expect(resolvedIp).toBe("unknown");
  });

  test("Password Reset Limiter Test: allows at most 3 reset requests and throws 429/error on the 4th request", async () => {
    const { passwordResetLimiter } = await import("@/lib/rate-limiter");
    const uniqueIp = `192.0.2.${Math.floor(Math.random() * 255)}`;
    const key = `reset_password:${uniqueIp}`;

    // 1st request
    const res1 = await passwordResetLimiter.check(key);
    expect(res1.success).toBe(true);

    // 2nd request
    const res2 = await passwordResetLimiter.check(key);
    expect(res2.success).toBe(true);

    // 3rd request
    const res3 = await passwordResetLimiter.check(key);
    expect(res3.success).toBe(true);

    // 4th request
    const res4 = await passwordResetLimiter.check(key);
    expect(res4.success).toBe(false);
    expect(res4.remaining).toBe(0);
  });
});
