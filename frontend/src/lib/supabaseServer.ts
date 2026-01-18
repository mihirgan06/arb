import { createClient } from "@supabase/supabase-js";
import { cache } from "react";
import { fetchWithRetry } from "@/lib/fetchRetry";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing env: ${name}`);
  }
  return value;
}

export const supabaseServer = cache(() => {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return createClient(url, anonKey, {
    auth: { persistSession: false },
    global: { fetch: fetchWithRetry },
  });
});
