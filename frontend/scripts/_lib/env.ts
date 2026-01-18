export type Env = {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  openaiApiKey: string | null;
};

export function loadEnv(): Env {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) throw new Error("Missing env: SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)");

  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseServiceRoleKey) throw new Error("Missing env: SUPABASE_SERVICE_ROLE_KEY");

  const openaiApiKey = process.env.OPENAI_API_KEY ?? null;

  return { supabaseUrl, supabaseServiceRoleKey, openaiApiKey };
}
