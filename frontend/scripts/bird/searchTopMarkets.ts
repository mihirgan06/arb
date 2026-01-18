import "../_lib/dotenv";
import { supabaseAdmin } from "../_lib/supabaseAdmin";
import { runBirdSearchTopMarkets } from "./searchJob";

function readIntFlag(flag: string): number | null {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  const raw = process.argv[idx + 1];
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

async function main() {
  try {
    const supabase = supabaseAdmin();
    const marketsLimit = readIntFlag("--markets") ?? 50;
    const tweetsPerMarket = readIntFlag("--tweets") ?? 50;
    const marketsPerRun = readIntFlag("--markets-per-run") ?? marketsLimit;

    const result = await runBirdSearchTopMarkets(
      supabase,
      { next_index: 0 },
      { marketsLimit, marketsPerRun, tweetsPerMarket },
    );
    console.log(
      `[bird search] markets=${result.markets} processed=${result.marketsProcessed} tweetsUpserted=${result.tweetsUpserted} rateLimited=${result.rateLimited}`,
    );
  } catch (err) {
    if (err && typeof err === "object") {
      const maybe = err as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
      console.error(
        `[bird search] error: ${JSON.stringify(
          { message: maybe.message, details: maybe.details, hint: maybe.hint, code: maybe.code },
          null,
          2,
        )}`,
      );
      process.exit(1);
    }

    console.error(`[bird search] error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

void main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[bird:search] error: ${msg}`);
  process.exitCode = 1;
});
