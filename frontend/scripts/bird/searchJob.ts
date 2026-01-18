import type { SupabaseClient } from "@supabase/supabase-js";
import { birdJson } from "../_lib/bird";
import { shouldKeepTweet } from "./filter";
import { buildMarketTweetSearchQuery } from "./query";
import { rankTweetsByMarketRelevance } from "./openaiRelevance";
import { classifyTweetQuality } from "./openaiQuality";

type MarketRow = {
  condition_id: string;
  question: string;
  description: string | null;
  volume_num: number | null;
};

type BirdAuthor = { username?: string; name?: string };
type BirdTweet = {
  id?: string;
  text?: string;
  createdAt?: string;
  author?: BirdAuthor;
  likeCount?: number;
  retweetCount?: number;
  replyCount?: number;
};

function asIsoOrNull(value: unknown): string | null {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function numOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function isRateLimitError(err: unknown) {
  if (!err || typeof err !== "object") return false;
  const msg = (err as { message?: unknown }).message;
  if (typeof msg !== "string") return false;
  return msg.includes("HTTP 429") || msg.toLowerCase().includes("rate limit");
}

async function trimTweetsForMarket(supabase: SupabaseClient, conditionId: string, maxTweets: number) {
  const batch = 500;
  const keep = Math.max(1, Math.min(200, Math.floor(maxTweets)));

  for (;;) {
    const oldRes = await supabase
      .from("x_tweets")
      .select("tweet_id")
      .eq("condition_id", conditionId)
      .order("created_at", { ascending: false, nullsFirst: false })
      .order("tweet_id", { ascending: false })
      .range(keep, keep + batch - 1);

    if (oldRes.error) throw oldRes.error;
    const oldIds = (oldRes.data ?? []).map((r) => r.tweet_id).filter((v): v is string => typeof v === "string" && v.length > 0);
    if (oldIds.length === 0) return;

    const del = await supabase.from("x_tweets").delete().in("tweet_id", oldIds);
    if (del.error) throw del.error;
  }
}

async function fetchTopMarkets(supabase: SupabaseClient, limit: number): Promise<MarketRow[]> {
  const candidateLimit = Math.max(120, limit * 3);
  const res = await supabase
    .from("markets")
    .select("condition_id, question, description, volume_num")
    .eq("closed", false)
    .eq("archived", false)
    .eq("is_sports", false)
    .order("volume_num", { ascending: false, nullsFirst: false })
    .limit(candidateLimit);

  if (res.error) throw res.error;
  const markets = (res.data ?? []) as MarketRow[];
  const conditionIds = markets.map((m) => m.condition_id);
  if (conditionIds.length === 0) return [];

  // Bird is rate-limited; only search markets that have a binary YES token with pricing.
  const tokensRes = await supabase
    .from("market_tokens")
    .select("condition_id")
    .in("condition_id", conditionIds)
    .ilike("outcome", "yes")
    .not("mid", "is", null)
    .limit(candidateLimit);

  if (tokensRes.error) throw tokensRes.error;
  const eligible = new Set(((tokensRes.data ?? []) as Array<{ condition_id: string }>).map((r) => r.condition_id));

  return markets.filter((m) => eligible.has(m.condition_id)).slice(0, limit);
}

export type BirdSearchCursor = { next_index?: number };

export async function runBirdSearchTopMarkets(
  supabase: SupabaseClient,
  cursor: BirdSearchCursor,
  args?: { marketsLimit?: number; marketsPerRun?: number; tweetsPerMarket?: number },
): Promise<{ cursor: BirdSearchCursor; markets: number; marketsProcessed: number; tweetsUpserted: number; rateLimited: boolean }> {
  const now = Date.now();
  const cooldownUntil = (cursor as BirdSearchCursor & { cooldown_until?: string }).cooldown_until;
  if (typeof cooldownUntil === "string") {
    const untilMs = new Date(cooldownUntil).getTime();
    if (Number.isFinite(untilMs) && now < untilMs) {
      return { cursor, markets: 0, marketsProcessed: 0, tweetsUpserted: 0, rateLimited: true };
    }
  }

  const marketsLimit = args?.marketsLimit ?? 50;
  const marketsPerRun = args?.marketsPerRun ?? marketsLimit;
  const tweetsPerMarket = args?.tweetsPerMarket ?? 50;
  const maxTweetsPerMarket = 50;

  const markets = await fetchTopMarkets(supabase, marketsLimit);
  if (markets.length === 0) {
    return { cursor, markets: 0, marketsProcessed: 0, tweetsUpserted: 0, rateLimited: false };
  }
  const fetchedAt = new Date().toISOString();

  const startIndex = Math.max(0, Math.min(markets.length - 1, cursor.next_index ?? 0));
  const runCount = Math.max(1, Math.min(markets.length, marketsPerRun));

  const slice: MarketRow[] = [];
  for (let i = 0; i < runCount; i++) {
    slice.push(markets[(startIndex + i) % markets.length]!);
  }

  let tweetsUpserted = 0;
  let processed = 0;
  let rateLimited = false;

  for (const m of slice) {
    const { query, version: queryVersion } = buildMarketTweetSearchQuery({
      question: m.question,
      description: m.description,
    });

    let tweets: BirdTweet[] = [];
    try {
      tweets = await birdJson<BirdTweet[]>(["--plain", "search", query, "-n", String(tweetsPerMarket), "--json"]);
    } catch (err) {
      if (!isRateLimitError(err)) throw err;
      // Record an attempt even on rate limit (treat as 0 tweets) so UI doesn't look "stuck".
      const attemptWrite = await supabase
        .from("x_market_fetches")
        .upsert(
          [
            {
              condition_id: m.condition_id,
              fetched_at: fetchedAt,
              query,
              tweet_count: 0,
            },
          ],
          { onConflict: "condition_id,fetched_at" },
        );

      // Backwards-compat: allow running before schema upgrade is applied.
      if (attemptWrite.error) {
        const msg = typeof attemptWrite.error.message === "string" ? attemptWrite.error.message : "";
        const code = (attemptWrite.error as unknown as { code?: string }).code;
        const missingTable = code === "42P01" || msg.includes("x_market_fetches");
        if (!missingTable) throw attemptWrite.error;
      }
      rateLimited = true;
    }

    if (rateLimited) break;

    const rows = (tweets ?? [])
      .map((t) => {
        const tweetId = typeof t.id === "string" ? t.id : null;
        const text = typeof t.text === "string" ? t.text : null;
        if (!tweetId || !text) return null;

        return {
          tweet_id: tweetId,
          fetched_at: fetchedAt,
          condition_id: m.condition_id,
          query,
          created_at: asIsoOrNull(t.createdAt),
          author_handle: typeof t.author?.username === "string" ? t.author.username : null,
          text,
          raw_json: t as unknown as Record<string, unknown>,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r != null);

    const heuristicKept = rows.filter((r) => shouldKeepTweet({ text: r.text, authorHandle: r.author_handle }).keep);
    let keptRows = heuristicKept;

    // Optional: OpenAI-assisted relevance ranking (embeddings). Best-effort; fall back to heuristics if missing/invalid key.
    if (process.env.OPENAI_API_KEY && heuristicKept.length > 0) {
      try {
        const marketText =
          m.description && m.description.trim().length > 0 ? `${m.question}\n\n${m.description}` : m.question;

        const ranked = await rankTweetsByMarketRelevance({
          marketText,
          tweets: heuristicKept,
          keep: tweetsPerMarket,
          maxDistance: Number(process.env.OPENAI_TWEET_MAX_DISTANCE ?? 0.45),
          queryVersion,
        });

        keptRows = ranked.kept.map((r) => ({
          ...r,
          raw_json: { ...(r.raw_json ?? {}), arb_filter: ranked.metaById[r.tweet_id] ?? null },
        }));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[bird_search] OpenAI relevance skipped: ${msg}`);
      }
    }

    // Optional: OpenAI tweet quality filter (LLM). Best-effort; helps kill remaining bot/alert spam that slips past heuristics.
    if (process.env.OPENAI_API_KEY && keptRows.length > 0) {
      try {
        const marketText =
          m.description && m.description.trim().length > 0 ? `${m.question}\n\n${m.description}` : m.question;

        const qualityById = await classifyTweetQuality({
          marketText,
          tweets: keptRows.map((t) => ({
            tweet_id: t.tweet_id,
            author_handle: t.author_handle,
            text: t.text,
          })),
        });

        const minConfidence = Math.max(
          0,
          Math.min(1, numOrNull(process.env.OPENAI_TWEET_QUALITY_MIN_CONFIDENCE) ?? 0.65),
        );

        keptRows = keptRows
          .map((r) => {
            const q = qualityById[r.tweet_id] ?? null;
            if (!q) return r;
            const existing = (r.raw_json as unknown as { arb_filter?: unknown })?.arb_filter;
            const base = existing && typeof existing === "object" ? (existing as Record<string, unknown>) : {};
            return {
              ...r,
              raw_json: { ...(r.raw_json ?? {}), arb_filter: { ...base, ...q } },
            };
          })
          .filter((r) => {
            const q = qualityById[r.tweet_id] ?? null;
            if (!q) return true;
            if (!Number.isFinite(q.quality_confidence) || q.quality_confidence < minConfidence) return true;
            return q.quality_keep;
          });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[bird_search] OpenAI quality skipped: ${msg}`);
      }
    }

    // Always record the attempt, even if zero tweets.
    const attemptWrite = await supabase
      .from("x_market_fetches")
      .upsert(
        [
          {
            condition_id: m.condition_id,
            fetched_at: fetchedAt,
            query,
            tweet_count: keptRows.length,
          },
        ],
        { onConflict: "condition_id,fetched_at" },
      );

    // Backwards-compat: allow running before schema upgrade is applied.
    if (attemptWrite.error) {
      const msg = typeof attemptWrite.error.message === "string" ? attemptWrite.error.message : "";
      const code = (attemptWrite.error as unknown as { code?: string }).code;
      const missingTable = code === "42P01" || msg.includes("x_market_fetches");
      if (!missingTable) throw attemptWrite.error;
    }

    if (keptRows.length > 0) {
      const write = await supabase.from("x_tweets").upsert(keptRows, { onConflict: "tweet_id" });
      if (write.error) throw write.error;
      tweetsUpserted += keptRows.length;
    }

    // Enforce deterministic cap from SPEC: store up to MAX_TWEETS_PER_MARKET per market.
    await trimTweetsForMarket(supabase, m.condition_id, maxTweetsPerMarket);

    processed += 1;
    await sleep(800);
  }

  const nextIndex = (startIndex + processed) % markets.length;
  return {
    cursor: {
      next_index: nextIndex,
      ...(rateLimited ? { cooldown_until: new Date(Date.now() + 20 * 60_000).toISOString() } : {}),
    } as BirdSearchCursor,
    markets: markets.length,
    marketsProcessed: processed,
    tweetsUpserted,
    rateLimited,
  };
}
