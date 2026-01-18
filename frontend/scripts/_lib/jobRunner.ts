import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

type RunJobArgs<TCursor extends object> = {
  supabase: SupabaseClient;
  jobName: string;
  lockKey: number;
  ttlSeconds: number;
  run: (cursor: TCursor) => Promise<{ cursor: TCursor }>;
};

const WORKER_INSTANCE_ID = `${process.pid}:${randomUUID()}`;
const WARNED: Set<string> = new Set();
const IN_PROCESS: Set<string> = new Set();

function ownerId(lockKey: number) {
  return `arb-worker:${WORKER_INSTANCE_ID}:${lockKey}`;
}

export async function runJob<TCursor extends object>({
  supabase,
  jobName,
  lockKey,
  ttlSeconds,
  run,
}: RunJobArgs<TCursor>): Promise<void> {
  // Prevent accidental same-process overlap (ex: future scheduler changes, manual triggers).
  const inProcessKey = `${jobName}:${lockKey}`;
  if (IN_PROCESS.has(inProcessKey)) return;
  IN_PROCESS.add(inProcessKey);

  try {
    const owner = ownerId(lockKey);

    const acquire = await supabase.rpc("arb_acquire_job_lease", {
      p_job_name: jobName,
      p_owner: owner,
      p_ttl_seconds: ttlSeconds,
    });

    if (acquire.error) {
      const msg = typeof acquire.error.message === "string" ? acquire.error.message : "";
      const missing =
        msg.includes("arb_acquire_job_lease") &&
        (msg.includes("schema cache") || msg.includes("Could not find the function"));

      if (missing) {
        const key = "arb_acquire_job_lease";
        if (!WARNED.has(key)) {
          WARNED.add(key);
          console.error(
            `[worker] missing required Supabase RPCs for job leases. Apply supabase/migrations/0002_job_leases.sql (or run \`pnpm -C web schema:apply\`).`,
          );
        }
        return;
      }

      throw acquire.error;
    }

    if (!acquire.data) return;

    const state = await supabase
      .from("sync_state")
      .select("cursor")
      .eq("job_name", jobName)
      .maybeSingle();

    if (state.error) throw state.error;
    const cursor = (state.data?.cursor ?? {}) as TCursor;

    try {
      const result = await run(cursor);

      const finish = await supabase.rpc("arb_finish_job_success", {
        p_job_name: jobName,
        p_owner: owner,
        p_cursor: result.cursor,
      });
      if (finish.error) throw finish.error;
    } catch (err) {
      const msg = err instanceof Error ? err.stack ?? err.message : String(err);
      const fail = await supabase.rpc("arb_finish_job_failure", {
        p_job_name: jobName,
        p_owner: owner,
        p_error: msg,
      });
      if (fail.error) throw fail.error;

      throw err;
    }
  } finally {
    IN_PROCESS.delete(inProcessKey);
  }
}
