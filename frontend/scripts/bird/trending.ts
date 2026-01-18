import "../_lib/dotenv";
import { supabaseAdmin } from "../_lib/supabaseAdmin";
import { runBirdTrending } from "./trendingJob";

async function main() {
  try {
    const supabase = supabaseAdmin();
    const inserted = await runBirdTrending(supabase, { n: 20 });
    if (inserted === 0) console.log("[bird trending] no items");
    else console.log(`[bird trending] inserted=${inserted}`);
  } catch (err) {
    if (err && typeof err === "object") {
      const maybe = err as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
      console.error(
        `[bird trending] error: ${JSON.stringify(
          { message: maybe.message, details: maybe.details, hint: maybe.hint, code: maybe.code },
          null,
          2,
        )}`,
      );
      process.exit(1);
    }

    console.error(`[bird trending] error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

void main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[bird:trending] error: ${msg}`);
  process.exitCode = 1;
});
