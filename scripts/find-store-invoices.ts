import { createClient } from "@supabase/supabase-js";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

async function main() {
  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  
  // 1. Get all stores
  const { data: stores } = await adminClient.from("stores").select("*");
  console.log("All stores in DB:", stores);
  
  // 2. Get all invoices and group them by store_id
  const { data: invoices, error: invError } = await adminClient
    .from("invoices")
    .select("id, store_id, invoice_number, total_amount, payment_method, created_at");
    
  if (invError) {
    console.error("Error fetching invoices:", invError);
    return;
  }
  
  console.log(`Total invoices in DB: ${invoices.length}`);
  
  const storeGroups: Record<string, typeof invoices> = {};
  for (const inv of invoices) {
    if (!storeGroups[inv.store_id]) {
      storeGroups[inv.store_id] = [];
    }
    storeGroups[inv.store_id].push(inv);
  }
  
  for (const [sId, invList] of Object.entries(storeGroups)) {
    const store = stores?.find(s => s.id === sId);
    console.log(`Store: ${store ? store.name : sId} (ID: ${sId}) has ${invList.length} invoices:`);
    console.log(invList.map(i => `  - ${i.invoice_number}: ${i.total_amount} (${i.payment_method}) at ${i.created_at}`));
  }
}

main().catch(console.error);
