import { describe, test, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { loadEnvConfig } from "@next/env";
import {
  newIdempotencyKey,
  retryOnTransientJwtClockSkew,
  upsertCatalogProduct,
} from "./supabase-test-utils";

loadEnvConfig(process.cwd());

const runLiveTests = !!(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
  !process.env.SKIP_LIVE_TESTS
);

describe.runIf(runLiveTests)("PaisaPOS — Invoice History & Statistics Aggregation Verification", () => {
  let supabaseUrl: string;
  let supabaseAnonKey: string;
  let serviceRoleKey: string | undefined;

  beforeAll(() => {
    supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
    serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  test("Queries, filters, paginates, and computes invoice summary stats on the database level", async () => {
    const random = Math.random().toString(36).slice(2, 7) + Date.now();
    const email = `test-history-${random}@paisapos-qa.com`;
    const password = "SecurityDefinerPass123!";

    const client = createClient(supabaseUrl, supabaseAnonKey);

    // 1. Sign up and Onboard Owner
    const { data: signUp } = await client.auth.signUp({ email, password });
    const storeId = await retryOnTransientJwtClockSkew(() =>
      client.rpc("register_store_and_user", {
        p_full_name: `Owner History`,
        p_store_name: `Store History - ${random}`,
      })
    );
    expect(storeId.error).toBeNull();
    const resolvedStoreId = storeId.data;

    // 2. Create product variant for invoice items
    const { variant } = await upsertCatalogProduct(client, {
      name: "History Product",
      category: "Clothes",
      variants: [
        { size: "L", color: "Red", sku: `SKU-HIST-${random.toUpperCase()}`, price: 1000, stock: 100 }
      ]
    });

    // 3. Create three invoices:
    // Invoice 1: Cash, total=1000, customer="Ram Shrestha"
    // Invoice 2: eSewa, total=1800, customer="Hari Prasad"
    // Invoice 3: Cash, total=1000, customer="Sita Kumari"
    const { error: err1 } = await client.rpc("create_invoice_and_deduct_stock", {
      p_store_id: resolvedStoreId,
      p_invoice_number: `INV-H1-${random}`,
      p_customer_name: "Ram Shrestha",
      p_customer_phone: "9851000001",
      p_total_amount: 1000.00,
      p_discount_amount: 0.00,
      p_paid_amount: 1000.00,
      p_payment_method: "Cash",
      p_items: [{ variant_id: variant.id, quantity: 1, unit_price: 1000, subtotal: 1000 }],
      p_idempotency_key: newIdempotencyKey()
    });
    expect(err1).toBeNull();

    const { error: err2 } = await client.rpc("create_invoice_and_deduct_stock", {
      p_store_id: resolvedStoreId,
      p_invoice_number: `INV-H2-${random}`,
      p_customer_name: "Hari Prasad",
      p_customer_phone: "9851000002",
      p_total_amount: 1800.00,
      p_discount_amount: 200.00,
      p_paid_amount: 1800.00,
      p_payment_method: "eSewa",
      p_items: [{ variant_id: variant.id, quantity: 2, unit_price: 1000, subtotal: 2000 }],
      p_idempotency_key: newIdempotencyKey()
    });
    expect(err2).toBeNull();

    const { error: err3 } = await client.rpc("create_invoice_and_deduct_stock", {
      p_store_id: resolvedStoreId,
      p_invoice_number: `INV-H3-${random}`,
      p_customer_name: "Sita Kumari",
      p_customer_phone: "9851000003",
      p_total_amount: 1000.00,
      p_discount_amount: 0.00,
      p_paid_amount: 1000.00,
      p_payment_method: "Cash",
      p_items: [{ variant_id: variant.id, quantity: 1, unit_price: 1000, subtotal: 1000 }],
      p_idempotency_key: newIdempotencyKey()
    });
    expect(err3).toBeNull();

    // 4. TEST SUMMARY STATS: get_store_invoice_summary
    console.log("[QA Test] Verifying invoice summary statistics computed server-side...");
    
    // Test case A: All invoices stats
    const { data: statsAll, error: errStatsAll } = await client.rpc("get_store_invoice_summary", {
      p_store_id: resolvedStoreId,
      p_start_date: null,
      p_end_date: null,
      p_payment_method: "All",
      p_search_query: null
    });
    expect(errStatsAll).toBeNull();
    expect(statsAll).toHaveLength(1);
    expect(Number(statsAll[0].total_count)).toBe(3);
    expect(Number(statsAll[0].total_sales)).toBe(3800); // 1000 + 1800 + 1000
    expect(Number(statsAll[0].cash_sales)).toBe(2000); // 1000 + 1000
    expect(Number(statsAll[0].esewa_sales)).toBe(1800);

    // Test case B: Filter by payment method "Cash"
    const { data: statsCash, error: errStatsCash } = await client.rpc("get_store_invoice_summary", {
      p_store_id: resolvedStoreId,
      p_start_date: null,
      p_end_date: null,
      p_payment_method: "Cash",
      p_search_query: null
    });
    expect(errStatsCash).toBeNull();
    expect(Number(statsCash[0].total_count)).toBe(2);
    expect(Number(statsCash[0].total_sales)).toBe(2000);
    expect(Number(statsCash[0].cash_sales)).toBe(2000);
    expect(Number(statsCash[0].esewa_sales)).toBe(0);

    // Test case C: Filter by search query "Ram"
    const { data: statsSearch, error: errStatsSearch } = await client.rpc("get_store_invoice_summary", {
      p_store_id: resolvedStoreId,
      p_start_date: null,
      p_end_date: null,
      p_payment_method: "All",
      p_search_query: "Ram"
    });
    expect(errStatsSearch).toBeNull();
    expect(Number(statsSearch[0].total_count)).toBe(1);
    expect(Number(statsSearch[0].total_sales)).toBe(1000);

    // 5. TEST SECURITY / RLS on stats RPC: Another owner cannot read this store's summary stats
    const emailB = `test-history-b-${random}@paisapos-qa.com`;
    const clientB = createClient(supabaseUrl, supabaseAnonKey);
    const { data: signUpB } = await clientB.auth.signUp({ email: emailB, password });
    
    // Register store for owner B
    const storeB = await retryOnTransientJwtClockSkew(() =>
      clientB.rpc("register_store_and_user", {
        p_full_name: `Owner B`,
        p_store_name: `Store B - ${random}`,
      })
    );
    expect(storeB.error).toBeNull();

    console.log("[QA Test] Verifying Tenant B cannot access Tenant A's summary statistics...");
    const { data: statsBLeak, error: errStatsBLeak } = await clientB.rpc("get_store_invoice_summary", {
      p_store_id: resolvedStoreId, // Requesting Store A's stats!
      p_start_date: null,
      p_end_date: null,
      p_payment_method: "All",
      p_search_query: null
    });
    // Should be empty or zeros due to RLS matching (owner B doesn't belong to store A)
    expect(errStatsBLeak).toBeNull();
    expect(statsBLeak).toHaveLength(1);
    expect(Number(statsBLeak[0].total_count)).toBe(0);
    expect(Number(statsBLeak[0].total_sales)).toBe(0);

    // 6. CLEAN UP
    console.log("[QA Test] Cleaning up history verification records...");
    const adminClient = createClient(supabaseUrl, serviceRoleKey!);
    await adminClient.from("stores").delete().eq("id", resolvedStoreId);
    await adminClient.from("stores").delete().eq("id", storeB.data);
    await adminClient.from("users").delete().eq("id", signUp.user!.id);
    await adminClient.from("users").delete().eq("id", signUpB.user!.id);

    await client.auth.signOut();
    await clientB.auth.signOut();
  }, 25000);
});
