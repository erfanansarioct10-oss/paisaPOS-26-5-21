import { createClient } from "@supabase/supabase-js";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

async function main() {
  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  
  // Get all users from public.users
  const { data: users, error: userError } = await adminClient.from("users").select("*");
  console.log("Users:", users, "Error:", userError);
  
  // Get all users from auth.users (to find emails)
  const { data: authUsers, error: authError } = await adminClient.auth.admin.listUsers();
  console.log("Auth Users:", authUsers?.users?.map(u => ({ id: u.id, email: u.email })), "Error:", authError);
}

main().catch(console.error);
