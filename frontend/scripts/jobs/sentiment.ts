import type { SupabaseClient } from "@supabase/supabase-js";
import {
  EMOTION_BUCKETS,
  GO_EMOTIONS_MODEL_SPEC,
  type EmotionBucket,
  normalizeBuckets,
  scoreEmotions,
} from "../_lib/goEmotions";

export type SentimentCursor = {
  last_run?: string | null;
  window_end?: string | null;
  pending_ids?: string[];
  next_index?: number;
};

type MarketRow = {
  condition_id: string;
  question: string;
  description: string | null;
  category: string | null;
  volume_num: number | null;
  liquidity_num: number | null;
};

type TokenRow = {
  condition_id: string;
  token_id: string;
  mid: number | null;
  spread: number | null;
  updated_at: string;
};

type TweetRow = {
  tweet_id: string;
  text: string;
  created_at: string | null;
  raw_json: Record<string, unknown>;
};

type BucketDist = Record<EmotionBucket, number>;

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function reliabilityScore(args: { volume: number | null; liquidity: number | null; spread: number | null }) {
  const volume = args.volume ?? 0;
  const liquidity = args.liquidity ?? 0;
  const spread = args.spread ?? 0.2;

  const volScore = clamp01(Math.log10(volume + 1) / 6);
  const liqScore = clamp01(Math.log10(liquidity + 1) / 6);
  const sprScore = clamp01(1 - Math.min(spread, 0.2) / 0.2);
  return 0.5 * volScore + 0.3 * liqScore + 0.2 * sprScore;
}

function polarityFromQuestion(question: string): { polarity: -1 | 0 | 1; keyword: string | null } {
  const q = question.toLowerCase();

  const negative = [
    "crash",
    "pop",
    "recession",
    "war",
    "die",
    "bankrupt",
    "default",
    "collapse",
    "fall",
    "lose",
    "resign",
    "impeach",
    "down",
    "ban",
    "fail",
  ];

  for (const k of negative) {
    if (q.includes(k)) return { polarity: -1, keyword: k };
  }

  const positive = [
    "win",
    "pass",
    "approve",
    "growth",
    "rise",
    "rally",
    "succeed",
    "launch",
    "reach",
    "record",
    "recover",
  ];

  for (const k of positive) {
    if (q.includes(k)) return { polarity: 1, keyword: k };
  }

  return { polarity: 0, keyword: null };
}

function moodFromBuckets(dist: BucketDist): number {
  const weights: Record<EmotionBucket, number> = {
    optimism: 1.0,
    joy: 0.9,
    excitement: 0.8,
    curiosity: 0.2,
    trust: 0.6,
    fear: -1.0,
    anger: -0.9,
    disgust: -0.9,
    sadness: -0.8,
    surprise: 0.1,
    confusion: -0.6,
    neutral: 0.0,
  };

  let sum = 0;
  for (const b of EMOTION_BUCKETS) sum += dist[b] * weights[b];
  return sum;
}

function asInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.floor(value);
  if (typeof value === "string" && value.trim().length > 0) {
    const n = Number(value);
    if (Number.isFinite(n)) return Math.floor(n);
  }
  return null;
}

function engagementWeight(raw: Record<string, unknown>): number {
  const likes = asInt(raw.likeCount ?? raw.like_count) ?? 0;
  const rts = asInt(raw.retweetCount ?? raw.retweet_count) ?? 0;
  const replies = asInt(raw.replyCount ?? raw.reply_count) ?? 0;
  const s = likes + 2 * rts + replies;
  return 1 + Math.log(1 + Math.max(0, s));
}

function hasAnyEngagementFields(raw: Record<string, unknown>): boolean {
  return (
    raw.likeCount != null ||
    raw.retweetCount != null ||
    raw.replyCount != null ||
    raw.like_count != null ||
    raw.retweet_count != null ||
    raw.reply_count != null
  );
}

function openAiQualityKeep(raw: Record<string, unknown>): boolean {
  const arb = (raw as unknown as { arb_filter?: unknown })?.arb_filter;
  if (!arb || typeof arb !== "object") return true;
  const keep = (arb as { quality_keep?: unknown }).quality_keep;
  const conf = (arb as { quality_confidence?: unknown }).quality_confidence;

  if (typeof keep !== "boolean") return true;

  const minConfRaw = process.env.OPENAI_TWEET_QUALITY_MIN_CONFIDENCE;
  const minConf = typeof minConfRaw === "string" ? Number(minConfRaw) : NaN;
  const threshold = Number.isFinite(minConf) ? Math.max(0, Math.min(1, minConf)) : 0.65;

  if (typeof conf === "number" && Number.isFinite(conf) && conf >= threshold) {
    return keep;
  }

  // If we don't have a confidence (or it's low), don't over-filter.
  return true;
}

function blendForExplainer(args: { q: BucketDist; x: BucketDist | null; n: number | null }): { blended: BucketDist; alpha: number } {
  const n = args.n ?? 0;
  const alpha = n <= 0 ? 0 : Math.min(0.65, n / 50);
  const out: Partial<BucketDist> = {};
  for (const b of EMOTION_BUCKETS) {
    const qv = args.q[b] ?? 0;
    const xv = args.x ? args.x[b] ?? 0 : 0;
    out[b] = (1 - alpha) * qv + alpha * xv;
  }
  return { blended: normalizeBuckets(out), alpha };
}

async function selectTweets(supabase: SupabaseClient, conditionId: string, max: number): Promise<TweetRow[]> {
  const res = await supabase
    .from("x_tweets")
    .select("tweet_id, text, created_at, raw_json")
    .eq("condition_id", conditionId)
    .order("created_at", { ascending: false, nullsFirst: false })
    .limit(200);

  if (res.error) throw res.error;
  const rowsAll = (res.data ?? []) as TweetRow[];
  const rows = rowsAll.filter((t) => openAiQualityKeep(t.raw_json ?? {}));
  if (rows.length <= max) return rows;

  const anyEngagement = rows.some((t) => hasAnyEngagementFields(t.raw_json ?? {}));

  if (!anyEngagement) {
    return rows.slice(0, max);
  }

  return rows
    .slice()
    .sort((a, b) => {
      const wa = engagementWeight(a.raw_json ?? {});
      const wb = engagementWeight(b.raw_json ?? {});
      if (wb !== wa) return wb - wa;
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      if (tb !== ta) return tb - ta;
      return a.tweet_id.localeCompare(b.tweet_id);
    })
    .slice(0, max);
}

async function emotionsForTweets(tweets: TweetRow[]): Promise<{ dist: BucketDist | null; n: number }> {
  if (tweets.length === 0) return { dist: null, n: 0 };

  const byId = new Map<string, BucketDist>();
  for (const t of tweets) {
    if (!byId.has(t.tweet_id)) {
      byId.set(t.tweet_id, await scoreEmotions(t.text));
    }
  }

  const bucketSum: Partial<BucketDist> = {};
  for (const b of EMOTION_BUCKETS) bucketSum[b] = 0;

  for (const t of tweets) {
    const e = byId.get(t.tweet_id);
    if (!e) continue;
    const w = engagementWeight(t.raw_json ?? {});
    for (const b of EMOTION_BUCKETS) bucketSum[b] = (bucketSum[b] ?? 0) + e[b] * w;
  }

  return { dist: normalizeBuckets(bucketSum), n: tweets.length };
}

export async function computeSentiment(
  supabase: SupabaseClient,
  cursor: SentimentCursor,
): Promise<{ cursor: SentimentCursor }> {
  const trackedLimit = 50;
  const candidateLimit = 120;
  const marketsPerRun = 2;
  const maxTweetsPerMarket = 20;

  const now = new Date().toISOString();
  const windowStart = cursor.last_run ?? null;

  let pending = Array.isArray(cursor.pending_ids) ? cursor.pending_ids : null;
  let nextIndex = Math.max(0, cursor.next_index ?? 0);
  let windowEnd = cursor.window_end ?? null;

  if (!pending || nextIndex >= pending.length) {
    windowEnd = now;

    const marketsRes = await supabase
      .from("markets")
      .select("condition_id, question, description, category, volume_num, liquidity_num")
      .eq("closed", false)
      .eq("archived", false)
      .eq("is_sports", false)
      .order("volume_num", { ascending: false, nullsFirst: false })
      .limit(candidateLimit);

    if (marketsRes.error) throw marketsRes.error;
    const marketsAll = (marketsRes.data ?? []) as MarketRow[];

    const idsAll = marketsAll.map((m) => m.condition_id);
    const tokenAvail =
      idsAll.length > 0
        ? await supabase
            .from("market_tokens")
            .select("condition_id")
            .in("condition_id", idsAll)
            .ilike("outcome", "yes")
            .not("mid", "is", null)
            .limit(candidateLimit)
        : { data: [], error: null };

    if ("error" in tokenAvail && tokenAvail.error) throw tokenAvail.error;
    const eligible = new Set(((tokenAvail as { data: unknown[] }).data ?? []) as Array<{ condition_id: string }>);
    const eligibleIds = new Set(
      Array.from(eligible.values())
        .map((r) => r.condition_id)
        .filter((v) => typeof v === "string" && v.length > 0),
    );

    const markets = marketsAll.filter((m) => eligibleIds.has(m.condition_id)).slice(0, trackedLimit);

    if (!windowStart) {
      pending = markets.map((m) => m.condition_id);
    } else {
      const ids = markets.map((m) => m.condition_id);

      const tokenChanges = await supabase
        .from("market_tokens")
        .select("condition_id, updated_at")
        .in("condition_id", ids)
        .ilike("outcome", "yes")
        .gte("updated_at", windowStart)
        .limit(500);
      if (tokenChanges.error) throw tokenChanges.error;

      const tweetChanges = await supabase
        .from("x_tweets")
        .select("condition_id, fetched_at")
        .in("condition_id", ids)
        .gte("fetched_at", windowStart)
        .limit(500);
      if (tweetChanges.error) throw tweetChanges.error;
      const changedByTweets = new Set(
        ((tweetChanges.data ?? []) as { condition_id: string | null }[])
          .map((r) => r.condition_id)
          .filter((v): v is string => typeof v === "string" && v.length > 0),
      );

      const changedByTokens = new Set(
        ((tokenChanges.data ?? []) as { condition_id: string }[]).map((r) => r.condition_id),
      );

      const changed = new Set<string>([...changedByTokens, ...changedByTweets]);
      pending = markets
        .filter((m) => changed.has(m.condition_id))
        .sort((a, b) => {
          const va = a.volume_num ?? -1;
          const vb = b.volume_num ?? -1;
          if (vb !== va) return vb - va;
          return a.condition_id.localeCompare(b.condition_id);
        })
        .map((m) => m.condition_id);
    }

    pending = pending ?? [];
    nextIndex = 0;
  }

  if (!pending || pending.length === 0) {
    return { cursor: { last_run: windowEnd ?? now, window_end: null, pending_ids: [], next_index: 0 } };
  }

  const slice = pending.slice(nextIndex, nextIndex + marketsPerRun);
  console.log(`[sentiment_refresh] pending=${pending.length} nextIndex=${nextIndex} processing=${slice.length}`);

  const marketsRes = await supabase
    .from("markets")
    .select("condition_id, question, description, category, volume_num, liquidity_num")
    .in("condition_id", slice);
  if (marketsRes.error) throw marketsRes.error;
  const markets = (marketsRes.data ?? []) as MarketRow[];
  const marketById = new Map(markets.map((m) => [m.condition_id, m] as const));

  const tokensRes = await supabase
    .from("market_tokens")
    .select("condition_id, token_id, mid, spread, updated_at")
    .in("condition_id", slice)
    .ilike("outcome", "yes");
  if (tokensRes.error) throw tokensRes.error;
  const tokens = (tokensRes.data ?? []) as TokenRow[];
  const tokenByMarket = new Map(tokens.map((t) => [t.condition_id, t] as const));

  const computedAt = now;
  const rowsToUpsert: Record<string, unknown>[] = [];

  for (const conditionId of slice) {
    const market = marketById.get(conditionId);
    if (!market) continue;

    const token = tokenByMarket.get(conditionId) ?? null;

    const questionText =
      market.description && market.description.trim().length > 0
        ? `${market.question}\n\n${market.description}`
        : market.question;

    const emotionsQuestion = await scoreEmotions(questionText);

    const tweets = await selectTweets(supabase, conditionId, maxTweetsPerMarket);
    const x = await emotionsForTweets(tweets);

    const moodQuestion = moodFromBuckets(emotionsQuestion);
    const moodX = x.dist ? moodFromBuckets(x.dist) : null;

    const { polarity, keyword } = polarityFromQuestion(market.question);
    const reliability = reliabilityScore({ volume: market.volume_num, liquidity: market.liquidity_num, spread: token?.spread ?? null });

    const pYes = token?.mid ?? null;

    const marketMood =
      pYes == null
        ? null
        : polarity === -1
          ? 1 - 2 * pYes
          : polarity === 1
            ? 2 * pYes - 1
            : null;

    let blendedMood: number | null = null;
    if (marketMood != null) {
      if (!x.dist || x.n <= 0 || moodX == null) {
        blendedMood = marketMood;
      } else {
        const wMarket = 0.5 + 0.2 * reliability;
        const wX = 1 - wMarket;
        blendedMood = wMarket * marketMood + wX * moodX;
      }
    }

    const divergence =
      marketMood != null && moodX != null && x.n > 0 ? Math.abs(marketMood - moodX) : null;
    const divergenceAdj = divergence != null ? divergence * reliability : null;

    const expl = blendForExplainer({ q: emotionsQuestion, x: x.dist, n: x.n });

    rowsToUpsert.push({
      condition_id: conditionId,
      keyphrases: keyword ? [keyword] : null,
      event_polarity: polarity,

      emotions_question: emotionsQuestion as unknown as Record<string, unknown>,
      emotions_question_model: GO_EMOTIONS_MODEL_SPEC,
      emotions_question_updated_at: computedAt,

      emotions_x: x.dist ? (x.dist as unknown as Record<string, unknown>) : null,
      emotions_x_model: GO_EMOTIONS_MODEL_SPEC,
      emotions_x_sample_size: x.n,
      emotions_x_updated_at: computedAt,

      blended_emotions: expl.blended as unknown as Record<string, unknown>,
      blended_emotions_alpha: expl.alpha,

      mood_question: moodQuestion,
      mood_x: moodX,
      blended_mood: blendedMood,
      divergence,
      divergence_adj: divergenceAdj,

      computed_at: computedAt,
    });
  }

  if (rowsToUpsert.length > 0) {
    const write = await supabase.from("market_semantics").upsert(rowsToUpsert, { onConflict: "condition_id" });
    if (write.error) throw write.error;
  }

  const newNext = nextIndex + slice.length;
  const done = newNext >= pending.length;

  console.log(`[sentiment_refresh] upserted=${rowsToUpsert.length} done=${done}`);

  return {
    cursor: done
      ? { last_run: windowEnd ?? now, window_end: null, pending_ids: [], next_index: 0 }
      : { last_run: windowStart, window_end: windowEnd, pending_ids: pending, next_index: newNext },
  };
}
