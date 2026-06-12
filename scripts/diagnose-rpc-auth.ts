import { createClient } from "@supabase/supabase-js";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

async function main() {
  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  
  // 1. Create a test user and store
  const email = `test-rpc-auth-${Date.now()}@paisapos-qa.com`;
  const password = "SecurityDefinerPass123!";
  
  const client = createClient(supabaseUrl, supabaseAnonKey);
  const { data: signUp, error: errSignUp } = await client.auth.signUp({ email, password });
  if (errSignUp || !signUp.user) {
    throw new Error("Failed sign up: " + errSignUp?.message);
  }
  const userId = signUp.user.id;
  
  const { data: storeId, error: errOnboard } = await client.rpc("register_store_and_user", {
    p_full_name: "Auth Tester",
    p_store_name: "Auth Test Store",
  });
  if (errOnboard || !storeId) {
    throw new Error("Failed store registration: " + errOnboard?.message);
  }
  
  // Sign in to establish authenticated session
  const { error: errSignIn } = await client.auth.signInWithPassword({ email, password });
  if (errSignIn) {
    throw new Error("Failed sign in: " + errSignIn.message);
  }
  
  // Create an invoice
  console.log("Creating invoice...");
  const { error: errCheckout } = await client.rpc("create_invoice_and_deduct_stock", {
    p_store_id: storeId,
    p_invoice_number: `INV-AUTH-${Date.now()}`,
    p_customer_name: "Test Customer",
    p_customer_phone: "9800000000",
    p_total_amount: 500,
    p_discount_amount: 0,
    p_paid_amount: 500,
    p_payment_method: "Cash",
    p_items: [], // adhoc/empty items is fine if allowed, wait, let's see
    p_idempotency_key: `idemp-${Date.now()}`
  });
  if (errCheckout) {
    console.warn("Invoice creation failed (might be ok if items constraint matches):", errCheckout.message);
  }

  // Call the RPC as authenticated user using `undefined`
  console.log("\nCalling get_store_invoice_summary as AUTHENTICATED user with undefined...");
  const { data: resAuthUndef, error: errAuthUndef } = await client.rpc("get_store_invoice_summary", {
    p_store_id: storeId,
    p_start_date: undefined,
    p_end_date: undefined,
    p_payment_method: "All",
    p_search_query: undefined
  });
  console.log("Auth Undefined - Result:", resAuthUndef, "Error:", errAuthUndef);

  // Call the RPC as authenticated user using `null`
  console.log("\nCalling get_store_invoice_summary as AUTHENTICATED user with null...");
  const { data: resAuthNull, error: errAuthNull } = await client.rpc("get_store_invoice_summary", {
    p_store_id: storeId,
    p_start_date: null,
    p_end_date: null,
    p_payment_method: "All",
    p_search_query: null
  });
  console.log("Auth Null - Result:", resAuthNull, "Error:", errAuthNull);

  // Clean up
  await adminClient.from("stores").delete().eq("id", storeId);
  await adminClient.auth.admin.deleteUser(userId);
  console.log("\nTeardown done.");
}

main().catch(console.error);
