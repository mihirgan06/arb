import Link from "next/link";
import { X, Globe, Activity, Shield, Zap, Command } from "lucide-react";
import { supabaseServer } from "@/lib/supabaseServer";
import { AgeText } from "@/components/AgeText";
import { shouldShowTweet, tweetRelevanceScore } from "@/lib/tweetFilter";
import { ExplainPanel } from "@/components/ExplainPanel";
import { buildAiExplanation, type BucketDist } from "@/lib/aiExplanation";
import { MoodGauge } from "@/components/MoodGauge";
import { EmotionBars } from "@/components/EmotionBars";

export const dynamic = "force-dynamic";

type MarketRow = {
  condition_id: string;
  question: string;
  description: string | null;
  slug: string | null;
  volume_num: number | null;
  liquidity_num: number | null;
};

type TokenRow = {
  token_id: string;
  mid: number | null;
  spread: number | null;
  updated_at: string;
};

type OutcomeRow = {
  outcome: string;
};

type SampleRow = {
  ts: string;
  midpoint: number;
};

type TweetRow = {
  tweet_id: string;
  fetched_at: string;
  created_at: string | null;
  author_handle: string | null;
  text: string;
  raw_json: Record<string, unknown>;
};

type SemanticsRow = {
  emotions_question: BucketDist | null;
  emotions_x: BucketDist | null;
  emotions_x_sample_size: number | null;
  blended_emotions: BucketDist | null;
  blended_emotions_alpha: number | null;
  blended_mood: number | null;
  divergence: number | null;
  divergence_adj: number | null;
  computed_at: string | null;
};

type MarketFetchRow = {
  fetched_at: string;
};

const BUCKET_KEYS: Array<keyof BucketDist> = [
  "optimism",
  "joy",
  "excitement",
  "curiosity",
  "trust",
  "fear",
  "anger",
  "disgust",
  "sadness",
  "surprise",
  "confusion",
  "neutral",
];

function coerceDist(value: unknown): BucketDist | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const out = {} as BucketDist;
  for (const k of BUCKET_KEYS) {
    const n = typeof v[k] === "number" ? (v[k] as number) : 0;
    out[k] = Number.isFinite(n) ? n : 0;
  }
  return out;
}

function formatPct(value: number, digits: number) {
  return `${(value * 100).toFixed(digits)}%`;
}

function downsample<T>(items: T[], maxPoints: number) {
  if (items.length <= maxPoints) return items;
  const step = Math.ceil(items.length / maxPoints);
  const out: T[] = [];
  for (let i = 0; i < items.length; i += step) out.push(items[i]!);
  return out;
}

function Sparkline({ points }: { points: number[] }) {
  if (points.length < 2) return null;
  const w = 160;
  const h = 44;

  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;

  const d = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * (w - 2) + 1;
      const y = (1 - (p - min) / span) * (h - 2) + 1;
      return `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.9" />
    </svg>
  );
}

export default async function MarketPage({
  params,
}: {
  params: { conditionId: string } | Promise<{ conditionId: string }>;
}) {
  const resolved = await Promise.resolve(params);
  let conditionId = resolved.conditionId;
  try {
    conditionId = decodeURIComponent(conditionId);
  } catch {
    // Keep raw value (avoid 500 on malformed URLs).
  }
  const supabase = supabaseServer();

  const marketPromise = supabase
    .from("markets")
    .select("condition_id, question, description, slug, volume_num, liquidity_num")
    .eq("condition_id", conditionId)
    .maybeSingle();

  const tokenPromise = supabase
    .from("market_tokens")
    .select("token_id, mid, spread, updated_at")
    .eq("condition_id", conditionId)
    .ilike("outcome", "yes")
    .maybeSingle();

  const outcomesPromise = supabase
    .from("market_tokens")
    .select("outcome")
    .eq("condition_id", conditionId)
    .limit(10);

  const tweetsPromise = supabase
    .from("x_tweets")
    .select("tweet_id, fetched_at, created_at, author_handle, text, raw_json")
    .eq("condition_id", conditionId)
    .order("created_at", { ascending: false, nullsFirst: false })
    .limit(30);

  const semanticsPromise = supabase
    .from("market_semantics")
    .select(
      "emotions_question, emotions_x, emotions_x_sample_size, blended_emotions, blended_emotions_alpha, blended_mood, divergence, divergence_adj, computed_at",
    )
    .eq("condition_id", conditionId)
    .maybeSingle();

  const fetchAttemptPromise = supabase
    .from("x_market_fetches")
    .select("fetched_at")
    .eq("condition_id", conditionId)
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const [marketRes, tokenRes, tweetsRes, fetchAttemptRes, semanticsRes, outcomesRes] = await Promise.all([
    marketPromise,
    tokenPromise,
    tweetsPromise,
    fetchAttemptPromise,
    semanticsPromise,
    outcomesPromise,
  ]);

  if (marketRes.error) throw marketRes.error;
  const market = marketRes.data as MarketRow | null;

  if (!market) {
    return (
      <div className="min-h-screen bg-zinc-50 p-8 text-zinc-950 dark:bg-black dark:text-zinc-50">
        <Link href="/" className="text-sm text-zinc-600 underline dark:text-zinc-400">
          ← Back
        </Link>
        <h1 className="mt-6 text-xl font-semibold">Market not found</h1>
      </div>
    );
  }

  if (tokenRes.error) throw tokenRes.error;
  const token = tokenRes.data as TokenRow | null;

  if (outcomesRes.error) throw outcomesRes.error;
  const outcomes = (outcomesRes.data ?? []) as OutcomeRow[];
  const outcomeSet = new Set(outcomes.map((o) => o.outcome.trim().toLowerCase()).filter((v) => v.length > 0));
  const isBinaryYesNo = outcomeSet.size === 2 && outcomeSet.has("yes") && outcomeSet.has("no");

  if (tweetsRes.error) throw tweetsRes.error;
  const tweetsAll = (tweetsRes.data ?? []) as TweetRow[];
  // Backwards-compat: if table isn't present yet, treat as missing and fall back to x_tweets.
  const fetchAttempt = fetchAttemptRes.error ? null : (fetchAttemptRes.data as MarketFetchRow | null);

  const narrativeUpdatedAt = fetchAttempt?.fetched_at ?? tweetsAll[0]?.fetched_at ?? null;

  function openAiCosineDistance(tweet: TweetRow): number | null {
    const arb = (tweet.raw_json as unknown as { arb_filter?: unknown })?.arb_filter;
    if (!arb || typeof arb !== "object") return null;
    const dist = (arb as { cosine_distance?: unknown }).cosine_distance;
    return typeof dist === "number" && Number.isFinite(dist) ? dist : null;
  }

  function openAiOpinionCue(tweet: TweetRow): boolean | null {
    const arb = (tweet.raw_json as unknown as { arb_filter?: unknown })?.arb_filter;
    if (!arb || typeof arb !== "object") return null;
    const v = (arb as { has_opinion_cue?: unknown }).has_opinion_cue;
    return typeof v === "boolean" ? v : null;
  }

  function openAiQualityKeep(tweet: TweetRow): boolean {
    const arb = (tweet.raw_json as unknown as { arb_filter?: unknown })?.arb_filter;
    if (!arb || typeof arb !== "object") return true;

    const keep = (arb as { quality_keep?: unknown }).quality_keep;
    const conf = (arb as { quality_confidence?: unknown }).quality_confidence;
    if (typeof keep !== "boolean") return true;

    const minConfRaw = process.env.OPENAI_TWEET_QUALITY_MIN_CONFIDENCE;
    const minConf = typeof minConfRaw === "string" ? Number(minConfRaw) : NaN;
    const threshold = Number.isFinite(minConf) ? Math.max(0, Math.min(1, minConf)) : 0.65;

    if (typeof conf === "number" && Number.isFinite(conf) && conf >= threshold) return keep;
    return true;
  }

  const tweets = tweetsAll
    .filter((t) => shouldShowTweet({ text: t.text, authorHandle: t.author_handle }) && openAiQualityKeep(t))
    .sort(
      (a, b) => {
        const ao = openAiOpinionCue(a) ?? false;
        const bo = openAiOpinionCue(b) ?? false;
        if (bo !== ao) return Number(bo) - Number(ao);

        const ad = openAiCosineDistance(a) ?? Number.POSITIVE_INFINITY;
        const bd = openAiCosineDistance(b) ?? Number.POSITIVE_INFINITY;
        if (bd !== ad) return ad - bd;

        const as = tweetRelevanceScore({ text: a.text, authorHandle: a.author_handle });
        const bs = tweetRelevanceScore({ text: b.text, authorHandle: b.author_handle });
        if (bs !== as) return bs - as;

        const at = a.created_at ? new Date(a.created_at).getTime() : 0;
        const bt = b.created_at ? new Date(b.created_at).getTime() : 0;
        if (bt !== at) return bt - at;

        return a.tweet_id.localeCompare(b.tweet_id);
      },
    )
    .slice(0, 5);

  if (semanticsRes.error) throw semanticsRes.error;
  const semantics = (semanticsRes.data ?? null) as SemanticsRow | null;

  const emotionsQuestion = coerceDist(semantics?.emotions_question) ?? null;
  const emotionsX = coerceDist(semantics?.emotions_x) ?? null;
  const blended = coerceDist(semantics?.blended_emotions) ?? null;
  const alpha = typeof semantics?.blended_emotions_alpha === "number" ? semantics.blended_emotions_alpha : null;
  const sampleSize = typeof semantics?.emotions_x_sample_size === "number" ? semantics.emotions_x_sample_size : null;

  const explainerLines =
    emotionsQuestion && blended
      ? buildAiExplanation({
          pYesMid: token?.mid ?? null,
          spread: token?.spread ?? null,
          liquidity: market.liquidity_num ?? null,
          volume24h: market.volume_num ?? null,
          emotionsQuestion,
          emotionsX,
          emotionsXSampleSize: sampleSize,
          blendedEmotions: blended,
          alpha,
        })
      : null;

  const sinceDate = new Date();
  sinceDate.setUTCHours(sinceDate.getUTCHours() - 24);
  const since = sinceDate.toISOString();

  const samplesRes =
    token?.token_id != null
      ? await supabase
          .from("market_price_samples")
          .select("ts, midpoint")
          .eq("token_id", token.token_id)
          .gte("ts", since)
          .order("ts", { ascending: true })
      : { data: [], error: null };

  if ("error" in samplesRes && samplesRes.error) throw samplesRes.error;
  const samples = ("data" in samplesRes ? (samplesRes.data ?? []) : []) as SampleRow[];

  const chartPoints = downsample(
    samples.map((s) => s.midpoint),
    60,
  );

  return (
    <div className="flex flex-col h-full bg-[#000000] text-zinc-300 font-sans selection:bg-blue-900 selection:text-white">
      <header className="h-12 border-b border-zinc-800 bg-[#050505] flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-6">
          <Link href="/" className="p-1.5 hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors rounded-full">
            <X className="w-4 h-4" />
          </Link>
          <div className="flex gap-6 text-xs font-sans tracking-wide">
            <div className="flex gap-2">
              <span className="text-zinc-500 uppercase tracking-widest font-bold">Market Detail</span>
              <span className="text-zinc-100 font-mono truncate max-w-[300px]">{market.question}</span>
            </div>
          </div>
        </div>
      </header>

      <main id="main" className="flex-1 overflow-y-auto p-6 no-scrollbar">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-zinc-100 mb-4">{market.question}</h1>
            {market.description ? (
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-400">
                {market.description}
              </p>
            ) : null}
            <div className="mt-4 flex items-center gap-4 text-[10px] uppercase font-bold tracking-widest text-zinc-600">
              <span className="flex items-center gap-1.5">
                <Globe className="w-3 h-3 text-blue-500" />
                Condition ID: {conditionId}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-zinc-800 bg-[#050505] p-5">
              <div className="text-[10px] uppercase font-bold tracking-widest text-zinc-500 mb-4">Price (Mid, YES)</div>
              <div className="text-3xl font-mono text-zinc-100 mb-6">
                {token?.mid == null ? "—" : formatPct(token.mid, 1)}
              </div>

              {token?.mid == null ? (
                <div className="rounded-sm border border-dashed border-zinc-800 bg-zinc-900/30 p-4 text-xs text-zinc-500">
                  {outcomes.length === 0 ? (
                    <>Price not synced yet. Run the worker and wait for `clob_snapshot`.</>
                  ) : isBinaryYesNo ? (
                    <>Price not available yet (YES mid missing). Wait for next worker tick.</>
                  ) : (
                    <>Unsupported in MVP (multi-outcome). This build supports only binary YES/NO markets.</>
                  )}
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="rounded-sm border border-zinc-800 bg-zinc-900/30 p-3">
                      <div className="text-[10px] uppercase font-bold tracking-widest text-zinc-500 mb-1">Spread</div>
                      <div className="text-xs font-mono text-zinc-100">
                        {token?.spread == null ? "—" : formatPct(token.spread, 1)}
                      </div>
                    </div>
                    <div className="rounded-sm border border-zinc-800 bg-zinc-900/30 p-3">
                      <div className="text-[10px] uppercase font-bold tracking-widest text-zinc-500 mb-1">Range</div>
                      <div className="text-[10px] font-mono text-zinc-100">
                        {token?.spread == null
                          ? "—"
                          : `${formatPct(token.mid - token.spread / 2, 1)} – ${formatPct(token.mid + token.spread / 2, 1)}`}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-4 border-t border-zinc-800/50">
                    <div className="text-[10px] uppercase font-bold tracking-widest text-zinc-600 flex items-center gap-2">
                      <Activity className="w-3 h-3 text-emerald-500" />
                      Updated <AgeText updatedAt={token?.updated_at} />
                    </div>
                    <div className="flex flex-col items-end">
                      <div className="text-[10px] uppercase font-bold tracking-widest text-zinc-600 mb-1">24h History</div>
                      <Sparkline points={chartPoints} />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-lg border border-zinc-800 bg-[#050505] p-5">
              <div className="text-[10px] uppercase font-bold tracking-widest text-zinc-500 mb-4 flex items-center gap-2">
                <Shield className="w-3 h-3 text-blue-500" />
                Market Stats
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold tracking-widest text-zinc-600">Volume</span>
                  <span className="text-xs font-mono text-zinc-100">${market.volume_num?.toLocaleString() ?? "—"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold tracking-widest text-zinc-600">Liquidity</span>
                  <span className="text-xs font-mono text-zinc-100">${market.liquidity_num?.toLocaleString() ?? "—"}</span>
                </div>
              </div>
            </div>
          </div>

          {semantics?.computed_at ? (
            <div className="mt-4 rounded-lg border border-zinc-800 bg-[#050505] p-5">
              <div className="flex items-center justify-between mb-6">
                <div className="text-[10px] uppercase font-bold tracking-widest text-zinc-500 flex items-center gap-2">
                  <Zap className="w-3 h-3 text-blue-500" />
                  Blended Online Sentiment
                </div>
                <div className="text-[10px] uppercase font-bold tracking-widest text-zinc-600">
                  Computed <AgeText updatedAt={semantics.computed_at} />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-3 mb-8">
                <MoodGauge value={typeof semantics.blended_mood === "number" ? semantics.blended_mood : null} />
                <div className="rounded-sm border border-zinc-800 bg-zinc-900/30 p-4">
                  <div className="text-[10px] uppercase font-bold tracking-widest text-zinc-500 mb-1">Divergence</div>
                  <div className="text-lg font-mono text-zinc-100">
                    {typeof semantics.divergence === "number" ? semantics.divergence.toFixed(2) : "—"}
                  </div>
                </div>
                <div className="rounded-sm border border-zinc-800 bg-zinc-900/30 p-4">
                  <div className="text-[10px] uppercase font-bold tracking-widest text-zinc-500 mb-1">X Sample Size</div>
                  <div className="text-lg font-mono text-zinc-100">{sampleSize ?? 0}</div>
                </div>
              </div>

              {blended ? (
                <div>
                  <div className="text-[10px] uppercase font-bold tracking-widest text-zinc-500 mb-4">Top Emotions (Blended)</div>
                  <EmotionBars dist={blended} />
                </div>
              ) : null}
            </div>
          ) : null}

          {explainerLines ? (
            <div className="mt-4">
              <ExplainPanel title="AI Narrative Analysis" lines={explainerLines} />
            </div>
          ) : (
            <div className="mt-4 rounded-lg border border-dashed border-zinc-800 bg-[#050505] p-12 text-center">
              <p className="text-[10px] uppercase font-bold tracking-widest text-zinc-500">Sentiment analysis pending worker execution.</p>
            </div>
          )}

          <div className="mt-4 rounded-lg border border-zinc-800 bg-[#050505] p-5">
            <div className="flex items-center justify-between mb-6">
              <div className="text-[10px] uppercase font-bold tracking-widest text-zinc-500 flex items-center gap-2">
                <Command className="w-3 h-3 text-blue-500" />
                Live Narrative Feed
              </div>
              <div className="text-[10px] uppercase font-bold tracking-widest text-zinc-600">
                Sync: <AgeText updatedAt={narrativeUpdatedAt} />
              </div>
            </div>
            {tweets.length > 0 ? (
              <div className="space-y-3">
                {tweets.map((t) => (
                  <div key={t.tweet_id} className="rounded-sm border border-zinc-800/50 bg-zinc-900/20 p-4 transition-colors hover:bg-zinc-900/40">
                    <div className="text-[10px] font-bold text-blue-400 mb-2 uppercase tracking-widest flex items-center gap-2">
                      <span className="opacity-50">@</span>{t.author_handle ?? "unknown"}
                      <span className="text-zinc-800">|</span>
                      <span className="text-zinc-600">{t.created_at ? new Date(t.created_at).toLocaleString() : "n/a"}</span>
                    </div>
                    <div className="text-sm leading-relaxed text-zinc-300">{t.text}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <p className="text-[10px] uppercase font-bold tracking-widest text-zinc-600">No narrative data available for this market.</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
