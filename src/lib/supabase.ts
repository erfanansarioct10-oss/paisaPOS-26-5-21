import { createBrowserClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

const isDummyConfig = (url: string, key: string) => {
  return (
    !url ||
    !key ||
    url.includes("placeholder-url.supabase.co") ||
    url.includes("your-project-id.supabase.co") ||
    key === "placeholder-key" ||
    key === "your-supabase-anon-public-api-key"
  );
};

// Export safe initialization config
export const hasSupabaseConfig = () => {
  return !isDummyConfig(supabaseUrl, supabaseAnonKey);
};

if (!hasSupabaseConfig() && typeof window !== "undefined") {
  console.warn(
    "⚠️ PaisaPOS: Supabase environment variables are missing or default placeholders. Initializing in Pre-seeded Demo Mode."
  );
}

const targetUrl = hasSupabaseConfig() ? supabaseUrl : "https://placeholder-url.supabase.co";
const targetKey = hasSupabaseConfig() ? supabaseAnonKey : "placeholder-key";

// Use createBrowserClient only in the browser to support cookie-based sessions,
// fall back to standard createClient on the server-side/Node.js/tests to avoid environment mismatches.
export const supabase = typeof window !== "undefined"
  ? createBrowserClient(targetUrl, targetKey)
  : createClient(targetUrl, targetKey);
