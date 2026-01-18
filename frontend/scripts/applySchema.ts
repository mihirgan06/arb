import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";
import "./_lib/dotenv";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

async function main() {
  const connectionString = requireEnv("SUPABASE_DB_URL");

  const supabaseDir = resolve(process.cwd(), "..", "supabase");
  const sqlFiles = [
    resolve(supabaseDir, "schema.sql"),
    resolve(supabaseDir, "migrations", "0002_job_leases.sql"),
    resolve(supabaseDir, "migrations", "0003_vector_search.sql"),
    resolve(supabaseDir, "migrations", "0004_correlated_pairs.sql"),
  ];

  const pool = new pg.Pool({
    connectionString,
    max: 1,
    ssl: { rejectUnauthorized: false },
  });

  try {
    const client = await pool.connect();
    try {
      for (const filePath of sqlFiles) {
        const sql = await readFile(filePath, "utf8");
        await client.query(sql);
        console.log(`Applied: ${filePath}`);
      }

      // Ensure Supabase PostgREST sees new RPCs immediately.
      try {
        await client.query("notify pgrst, 'reload schema'");
      } catch {
        // ignore
      }
    } finally {
      client.release();
    }
  } catch (err) {
    const code =
      err && typeof err === "object" && "code" in err
        ? String((err as { code?: unknown }).code ?? "")
        : "";
    console.error(`DB apply failed (${code || "unknown"}).`);
    console.error(`- If your host is db.<ref>.supabase.co and you see ENOTFOUND: it may be IPv6-only; use Supabase pooler connection string instead.`);
    console.error(
      `- If you see ETIMEDOUT: your network may block Postgres ports; apply via Supabase SQL editor: supabase/schema.sql then supabase/migrations/0002_job_leases.sql then supabase/migrations/0003_vector_search.sql.`,
    );
    throw err;
  } finally {
    await pool.end();
  }
}

void main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[schema:apply] error: ${msg}`);
  process.exitCode = 1;
});
