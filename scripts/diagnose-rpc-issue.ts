import { createClient } from "@supabase/supabase-js";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

async function main() {
  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const client = createClient(supabaseUrl, supabaseAnonKey);

  // 1. Find a store with invoices
  const { data: invoices } = await adminClient.from("invoices").select("store_id").limit(1);
  if (!invoices || invoices.length === 0) {
    console.log("No invoices in database to diagnose.");
    return;
  }
  const storeId = invoices[0].store_id;
  console.log("Found store with invoices:", storeId);

  // 2. Find a user belonging to this store
  const { data: users } = await adminClient.from("users").select("id").eq("store_id", storeId).limit(1);
  if (!users || users.length === 0) {
    console.log("No users found for store:", storeId);
    return;
  }
  const userId = users[0].id;
  console.log("Found user belonging to store:", userId);

  // 3. To simulate authenticated client, let's sign in a test user or just use service role first but pass undefined parameters.
  // Wait, let's sign in! How? We can use adminClient.auth.admin.getUser(userId) to check, and then set the session on client.
  // Actually, we can use adminClient's auth admin to create a login session or we can just use the auth client with a custom JWT.
  // Since we want to test if passing `undefined` parameters throws an error, let's try it using the adminClient first.
  console.log("\n--- Testing get_store_invoice_summary with undefined parameters (representing omitted keys) ---");
  const { data: resOmitted, error: errOmitted } = await adminClient.rpc("get_store_invoice_summary", {
    p_store_id: storeId,
    p_payment_method: "All"
    // p_start_date, p_end_date, p_search_query are omitted (undefined)
  });
  console.log("With Omitted keys - Result:", resOmitted, "Error:", errOmitted);

  console.log("\n--- Testing with explicit undefined ---");
  const { data: resExplicitUndef, error: errExplicitUndef } = await adminClient.rpc("get_store_invoice_summary", {
    p_store_id: storeId,
    p_start_date: undefined,
    p_end_date: undefined,
    p_payment_method: "All",
    p_search_query: undefined
  });
  console.log("With Explicit undefined - Result:", resExplicitUndef, "Error:", errExplicitUndef);

  console.log("\n--- Testing with explicit null ---");
  const { data: resNull, error: errNull } = await adminClient.rpc("get_store_invoice_summary", {
    p_store_id: storeId,
    p_start_date: null,
    p_end_date: null,
    p_payment_method: "All",
    p_search_query: null
  });
  console.log("With Explicit null - Result:", resNull, "Error:", errNull);
}

main().catch(console.error);
