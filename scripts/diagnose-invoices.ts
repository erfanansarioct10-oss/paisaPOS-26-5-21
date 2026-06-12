import { createClient } from "@supabase/supabase-js";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

async function main() {
  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  
  // Let's get the list of stores
  const { data: stores } = await adminClient.from("stores").select("*");
  console.log("Stores:", stores);
  
  if (stores && stores.length > 0) {
    const storeId = stores[0].id;
    console.log("Using storeId:", storeId);
    
    // Let's count how many invoices exist for this store
    const { count, error: countError } = await adminClient
      .from("invoices")
      .select("*", { count: "exact", head: true })
      .eq("store_id", storeId);
    console.log("Invoices count:", count, "Error:", countError);
    
    // Let's select the first 10 invoices
    const { data: invoices, error: invError } = await adminClient
      .from("invoices")
      .select("*")
      .eq("store_id", storeId)
      .order("created_at", { ascending: false });
    console.log("Invoices list (last 10):", invoices?.slice(0, 10), "Error:", invError);
    
    // Let's call the rpc
    const { data: summary, error: rpcError } = await adminClient.rpc("get_store_invoice_summary", {
      p_store_id: storeId,
      p_start_date: null,
      p_end_date: null,
      p_payment_method: "All",
      p_search_query: null
    });
    console.log("RPC get_store_invoice_summary output:", summary, "Error:", rpcError);
  } else {
    console.log("No stores found in DB.");
  }
}

main().catch(console.error);
