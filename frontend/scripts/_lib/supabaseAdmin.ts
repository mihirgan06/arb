import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "./env";
import { fetchWithRetry } from "./fetchRetry";

export function supabaseAdmin() {
  const env = loadEnv();
  return createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false },
    global: { fetch: fetchWithRetry },
  });
}
