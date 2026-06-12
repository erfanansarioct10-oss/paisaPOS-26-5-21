import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

async function main() {
  // Dynamically import to ensure env variables are loaded first
  const { useAppStore } = await import("../src/lib/store/useAppStore");
  const { supabase } = await import("../src/lib/supabase");

  const password = "SecurityDefinerPass123!";
  const random = Math.random().toString(36).slice(2, 7) + Date.now();
  const email = `test-diag-owner-${random}@paisapos-qa.com`;

  console.log("1. Signing up user:", email);
  const { data: signUp, error: errSignUp } = await supabase.auth.signUp({ email, password });
  if (errSignUp || !signUp.user) {
    throw new Error("Failed to sign up: " + errSignUp?.message);
  }
  const userId = signUp.user.id;
  console.log("Signed up owner ID:", userId);

  console.log("2. Registering store...");
  const { data: storeId, error: errOnboard } = await supabase.rpc("register_store_and_user", {
    p_full_name: `Diag Owner`,
    p_store_name: `Store Diag - ${random}`,
  });
  if (errOnboard || !storeId) {
    throw new Error("Failed store registration: " + errOnboard?.message);
  }
  console.log("Registered store ID:", storeId);

  // Sign in to set the session in the supabase client
  const { error: errSignIn } = await supabase.auth.signInWithPassword({ email, password });
  if (errSignIn) {
    throw new Error("Failed sign in: " + errSignIn.message);
  }

  // Create a product and a variant
  console.log("3. Creating product variant...");
  const { data: productId, error: errProduct } = await supabase.rpc("upsert_product_and_variants", {
    p_product_id: null,
    p_name: "Diag Product",
    p_category: "Ethnic Wear",
    p_low_stock_threshold: 5,
    p_deleted_variant_ids: [],
    p_variants: [
      { size: "M", color: "Red", sku: `SKU-DIAG-M-${random}`.toUpperCase(), price: 1000, stock: 100 }
    ]
  });
  if (errProduct || !productId) {
    throw new Error("Failed to create product: " + errProduct?.message);
  }

  const { data: variants } = await supabase
    .from("product_variants")
    .select("id")
    .eq("product_id", productId);
  const variantId = variants?.[0]?.id;
  if (!variantId) {
    throw new Error("Failed to retrieve variant ID");
  }
  console.log("Created variant ID:", variantId);

  // Initialize store session
  console.log("4. Initializing store session via Zustand...");
  await useAppStore.getState().initializeSession();
  
  // Verify session authentication
  const state = useAppStore.getState();
  console.log("Session authenticated status:", state.sessionStatus);
  console.log("Initial invoices count on dashboard:", state.invoices.length);

  // Let's create 6 checkouts
  console.log("5. Creating 6 checkouts...");
  for (let i = 1; i <= 6; i++) {
    const { error: errCheckout } = await supabase.rpc("create_invoice_and_deduct_stock", {
      p_store_id: storeId,
      p_invoice_number: `INV-DIAG-${i}-${random}`,
      p_customer_name: `Diag Buyer ${i}`,
      p_customer_phone: "9800000000",
      p_total_amount: 1000,
      p_discount_amount: 0,
      p_paid_amount: 1000,
      p_payment_method: "Cash",
      p_items: [
        { variant_id: variantId, quantity: 1, unit_price: 1000, subtotal: 1000 }
      ],
      p_idempotency_key: randomUUID()
    });
    if (errCheckout) {
      throw new Error(`Checkout ${i} failed: ` + errCheckout.message);
    }
  }
  console.log("Created 6 checkouts successfully!");

  // Call fetchStoreData to sync
  console.log("6. Fetching store data (Zustand)...");
  await useAppStore.getState().fetchStoreData();
  console.log("Invoices in dashboard state:", useAppStore.getState().invoices.length);

  // Set tab to history and fetch history data
  console.log("7. Setting tab to history and fetching history...");
  useAppStore.getState().setTab("history");
  await useAppStore.getState().fetchHistoryData();

  const finalState = useAppStore.getState();
  console.log("--- RESULT ---");
  console.log("historyInvoices count:", finalState.historyInvoices.length);
  console.log("historyTotalCount:", finalState.historyTotalCount);
  console.log("historyTotalSales:", finalState.historyTotalSales);
  console.log("historyMethodBreakdown:", finalState.historyMethodBreakdown);
  console.log("errorMsg:", finalState.errorMsg);

  // Clean up
  console.log("8. Cleaning up...");
  const serviceClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || "", process.env.SUPABASE_SERVICE_ROLE_KEY || "");
  await serviceClient.from("stores").delete().eq("id", storeId);
  await serviceClient.auth.admin.deleteUser(userId);
  console.log("Teardown complete!");
}

main().catch(console.error);
