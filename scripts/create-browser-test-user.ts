import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const client = createClient(supabaseUrl, supabaseAnonKey);

  const email = "browser-owner@paisapos-test.com";
  const password = "Password123!";

  // Check if user already exists
  const { data: existingUser } = await adminClient.from("users").select("id").eq("name", "Browser Owner").maybeSingle();
  if (existingUser) {
    console.log("User already exists, deleting store to start clean...");
    const { data: profile } = await adminClient.from("users").select("store_id").eq("id", existingUser.id).single();
    if (profile?.store_id) {
      await adminClient.from("stores").delete().eq("id", profile.store_id);
    }
    await adminClient.auth.admin.deleteUser(existingUser.id);
  }

  console.log("1. Signing up user:", email);
  const { data: signUp, error: errSignUp } = await client.auth.signUp({ email, password });
  if (errSignUp || !signUp.user) {
    throw new Error("Failed to sign up: " + errSignUp?.message);
  }
  const userId = signUp.user.id;
  console.log("Signed up owner ID:", userId);

  console.log("2. Registering store...");
  const { data: storeId, error: errOnboard } = await client.rpc("register_store_and_user", {
    p_full_name: `Browser Owner`,
    p_store_name: `Browser Boutique`,
  });
  if (errOnboard || !storeId) {
    throw new Error("Failed store registration: " + errOnboard?.message);
  }
  console.log("Registered store ID:", storeId);

  // Sign in to set session
  const { error: errSignIn } = await client.auth.signInWithPassword({ email, password });
  if (errSignIn) {
    throw new Error("Failed sign in: " + errSignIn.message);
  }

  // Create a product and a variant
  console.log("3. Creating product variant...");
  const { data: productId, error: errProduct } = await client.rpc("upsert_product_and_variants", {
    p_product_id: null,
    p_name: "Ethnic Kurti",
    p_category: "Ethnic Wear",
    p_low_stock_threshold: 5,
    p_deleted_variant_ids: [],
    p_variants: [
      { size: "M", color: "Red", sku: "SKU-KURTI-M", price: 1500, stock: 100 }
    ]
  });
  if (errProduct || !productId) {
    throw new Error("Failed to create product: " + errProduct?.message);
  }

  const { data: variants } = await client
    .from("product_variants")
    .select("id")
    .eq("product_id", productId);
  const variantId = variants?.[0]?.id;
  if (!variantId) {
    throw new Error("Failed to retrieve variant ID");
  }
  console.log("Created variant ID:", variantId);

  // Create 6 checkouts
  console.log("4. Creating 6 checkouts...");
  for (let i = 1; i <= 6; i++) {
    const { error: errCheckout } = await client.rpc("create_invoice_and_deduct_stock", {
      p_store_id: storeId,
      p_invoice_number: `INV-2026-000${i}`,
      p_customer_name: i === 6 ? "Special Customer" : "General Customer",
      p_customer_phone: "9851000000",
      p_total_amount: 1500 * i,
      p_discount_amount: 0,
      p_paid_amount: 1500 * i,
      p_payment_method: i % 2 === 0 ? "Cash" : "Fonepay",
      p_items: [
        { variant_id: variantId, quantity: i, unit_price: 1500, subtotal: 1500 * i }
      ],
      p_idempotency_key: randomUUID()
    });
    if (errCheckout) {
      throw new Error(`Checkout ${i} failed: ` + errCheckout.message);
    }
  }
  console.log("Created 6 checkouts successfully!");
}

main().catch(console.error);
