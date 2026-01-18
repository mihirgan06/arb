import "./_lib/dotenv";
import { runJob } from "./_lib/jobRunner";
import { supabaseAdmin } from "./_lib/supabaseAdmin";
import {
  LOCK_BIRD_SEARCH,
  LOCK_BIRD_TRENDING,
  LOCK_CLOB_SNAPSHOT,
  LOCK_GAMMA_CLOSED,
  LOCK_GAMMA_OPEN,
  LOCK_SENTIMENT_REFRESH,
} from "./locks";
import { syncGammaMarkets, type GammaCursor } from "./jobs/gamma";
import { syncClobTop, type ClobCursor } from "./jobs/clob";
import { computeSentiment, type SentimentCursor } from "./jobs/sentiment";
import { runBirdSearchTopMarkets, type BirdSearchCursor } from "./bird/searchJob";
import { runBirdTrending } from "./bird/trendingJob";

type ScheduledJob = {
  name: string;
  intervalMs: number;
  tick: () => Promise<void>;
};

function ms(minutes: number) {
  return minutes * 60_000;
}

async function main() {
  const supabase = supabaseAdmin();
  const enableBird = process.env.ENABLE_BIRD === "1";

  const jobs: ScheduledJob[] = [
    {
      name: "gamma_open",
      intervalMs: ms(10),
      tick: async () => {
        await runJob<GammaCursor>({
          supabase,
          jobName: "gamma_open",
          lockKey: LOCK_GAMMA_OPEN,
          ttlSeconds: 300,
          run: async (cursor) => {
            const result = await syncGammaMarkets(supabase, "gamma_open", cursor);
            console.log(`[gamma_open] fetched=${result.fetched} nextOffset=${result.cursor.offset ?? 0}`);
            return { cursor: result.cursor };
          },
        });
      },
    },
    {
      name: "gamma_closed",
      intervalMs: ms(60),
      tick: async () => {
        await runJob<GammaCursor>({
          supabase,
          jobName: "gamma_closed",
          lockKey: LOCK_GAMMA_CLOSED,
          ttlSeconds: 300,
          run: async (cursor) => {
            const result = await syncGammaMarkets(supabase, "gamma_closed", cursor);
            console.log(
              `[gamma_closed] fetched=${result.fetched} done=${Boolean(result.cursor.done)} offset=${result.cursor.offset ?? 0}`,
            );
            return { cursor: result.cursor };
          },
        });
      },
    },
    {
      name: "clob_snapshot",
      intervalMs: ms(2),
      tick: async () => {
        await runJob<ClobCursor>({
          supabase,
          jobName: "clob_snapshot",
          lockKey: LOCK_CLOB_SNAPSHOT,
          ttlSeconds: 300,
          run: async (cursor) => syncClobTop(supabase, cursor),
        });
        console.log("[clob_snapshot] ok");
      },
    },
    {
      name: "sentiment_refresh",
      intervalMs: ms(5),
      tick: async () => {
        await runJob<SentimentCursor>({
          supabase,
          jobName: "sentiment_refresh",
          lockKey: LOCK_SENTIMENT_REFRESH,
          ttlSeconds: 300,
          run: async (cursor) => computeSentiment(supabase, cursor),
        });
        console.log("[sentiment_refresh] ok");
      },
    },
    ...(enableBird
      ? ([
          {
            name: "bird_trending",
            intervalMs: ms(15),
            tick: async () => {
              await runJob({
                supabase,
                jobName: "bird_trending",
                lockKey: LOCK_BIRD_TRENDING,
                ttlSeconds: 300,
                run: async (cursor) => {
                  const inserted = await runBirdTrending(supabase, { n: 20 });
                  console.log(`[bird_trending] inserted=${inserted}`);
                  return { cursor };
                },
              });
            },
          },
          {
            name: "bird_search",
            intervalMs: ms(15),
            tick: async () => {
              await runJob<BirdSearchCursor>({
                supabase,
                jobName: "bird_search",
                lockKey: LOCK_BIRD_SEARCH,
                ttlSeconds: 900,
                run: async (cursor) => {
	                  const result = await runBirdSearchTopMarkets(supabase, cursor, {
	                    marketsLimit: 50,
	                    marketsPerRun: 5,
	                    tweetsPerMarket: 50,
	                  });
                  console.log(
                    `[bird_search] markets=${result.markets} processed=${result.marketsProcessed} tweetsUpserted=${result.tweetsUpserted} rateLimited=${result.rateLimited}`,
                  );
                  return { cursor: result.cursor };
                },
              });
            },
          },
        ] satisfies ScheduledJob[])
      : []),
  ];

  const timers = new Map<string, NodeJS.Timeout>();

  const tickWithLogging = async (job: ScheduledJob) => {
    try {
      await job.tick();
    } catch (err) {
      if (err && typeof err === "object") {
        const maybe = err as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
        if (maybe.message != null || maybe.details != null || maybe.hint != null || maybe.code != null) {
          console.error(
            `[${job.name}] error: ${JSON.stringify(
              {
                message: maybe.message,
                details: maybe.details,
                hint: maybe.hint,
                code: maybe.code,
              },
              null,
              2,
            )}`,
          );
          return;
        }
      }

      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[${job.name}] error: ${msg}`);
    }
  };

  const runLoop = async (job: ScheduledJob) => {
    const startedAt = Date.now();
    await tickWithLogging(job);

    const elapsedMs = Date.now() - startedAt;
    const delayMs = Math.max(0, job.intervalMs - elapsedMs);
    const t = setTimeout(() => void runLoop(job), delayMs);
    timers.set(job.name, t);
  };

  // Start all jobs immediately; each job self-schedules after it finishes.
  for (const job of jobs) void runLoop(job);

  const shutdown = async () => {
    for (const t of timers.values()) clearTimeout(t);
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

void main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[worker] fatal: ${msg}`);
  process.exitCode = 1;
});
