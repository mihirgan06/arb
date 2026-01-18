import Link from "next/link";
import { Command, Activity } from "lucide-react";
import { supabaseServer } from "@/lib/supabaseServer";
import { IncludeSportsToggle } from "@/components/IncludeSportsToggle";
import { TopicControls } from "@/components/TopicControls";
import { matchMarketsByText } from "@/lib/semanticSearch";
import { MoodGauge } from "@/components/MoodGauge";
import { EmotionBars } from "@/components/EmotionBars";
import { TopicAISummary } from "@/components/TopicAISummary";

export const dynamic = "force-dynamic";

type SemanticsRow = {
  condition_id: string;
  blended_mood: number | null;
  blended_emotions: Record<string, unknown> | null;
  emotions_x_sample_size: number | null;
  divergence_adj: number | null;
};

type TokenRow = {
  condition_id: string;
  mid: number | null;
  spread: number | null;
};

type BucketDist = {
  optimism: number;
  joy: number;
  excitement: number;
  curiosity: number;
  trust: number;
  fear: number;
  anger: number;
  disgust: number;
  sadness: number;
  surprise: number;
  confusion: number;
  neutral: number;
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

function coerceDist(value: Record<string, unknown> | null | undefined): BucketDist | null {
  if (!value) return null;
  const out = {} as BucketDist;
  for (const k of BUCKET_KEYS) {
    const n = typeof value[k] === "number" ? (value[k] as number) : 0;
    out[k] = Number.isFinite(n) ? n : 0;
  }
  return out;
}

function normalize(dist: BucketDist): BucketDist {
  let s = 0;
  for (const k of BUCKET_KEYS) s += dist[k];
  if (!Number.isFinite(s) || s <= 1e-9) {
    const out = {} as BucketDist;
    for (const k of BUCKET_KEYS) out[k] = 0;
    out.neutral = 1;
    return out;
  }
  const out = {} as BucketDist;
  for (const k of BUCKET_KEYS) out[k] = dist[k] / s;
  return out;
}

function parseDistance(value: string | undefined): number {
  const n = value ? Number(value) : NaN;
  if (!Number.isFinite(n)) return 0.65;
  return Math.max(0.25, Math.min(0.85, n));
}

function formatPct(value: number, digits: number) {
  return `${(value * 100).toFixed(digits)}%`;
}

export default async function TopicsPage({
  searchParams,
}: {
  searchParams?: { q?: string; d?: string; includeSports?: string } | Promise<{ q?: string; d?: string; includeSports?: string }>;
}) {
  const sp = await Promise.resolve(searchParams ?? {});
  const includeSports = sp.includeSports === "1";
  let q = "";
  if (sp.q) {
    try {
      q = decodeURIComponent(sp.q);
    } catch {
      q = sp.q;
    }
  }
  const maxDistance = parseDistance(sp.d);

  const { rows: matches, error: matchError } = await matchMarketsByText({
    query: q,
    matchCount: 50,
    maxDistance,
    includeSports,
  });

  const supabase = supabaseServer();
  const matchIds = matches.map((m) => m.condition_id);

  const [semRes, tokRes] =
    matchIds.length > 0
      ? await Promise.all([
          supabase
            .from("market_semantics")
            .select("condition_id, blended_mood, blended_emotions, emotions_x_sample_size, divergence_adj")
            .in("condition_id", matchIds),
          supabase
            .from("market_tokens")
            .select("condition_id, mid, spread")
            .in("condition_id", matchIds)
            .ilike("outcome", "yes"),
        ])
      : [{ data: [], error: null }, { data: [], error: null }];

  if ("error" in semRes && semRes.error) throw semRes.error;
  if ("error" in tokRes && tokRes.error) throw tokRes.error;

  const semMap = new Map<string, SemanticsRow>();
  for (const r of ((semRes as { data: unknown[] }).data ?? []) as SemanticsRow[]) semMap.set(r.condition_id, r);

  const tokMap = new Map<string, TokenRow>();
  for (const r of ((tokRes as { data: unknown[] }).data ?? []) as TokenRow[]) tokMap.set(r.condition_id, r);

  const matchesWithPrice = matches.filter((m) => (tokMap.get(m.condition_id)?.mid ?? null) != null);

  let topicWeight = 0;
  let topicMoodSum = 0;
  let tweetTotal = 0;
  let marketsWithMood = 0;

  const emotionSum: BucketDist = {
    optimism: 0,
    joy: 0,
    excitement: 0,
    curiosity: 0,
    trust: 0,
    fear: 0,
    anger: 0,
    disgust: 0,
    sadness: 0,
    surprise: 0,
    confusion: 0,
    neutral: 0,
  };

  for (const m of matchesWithPrice) {
    const sem = semMap.get(m.condition_id) ?? null;
    const tok = tokMap.get(m.condition_id) ?? null;
    const rel = reliabilityScore({
      volume: m.volume_num,
      liquidity: m.liquidity_num,
      spread: tok?.spread ?? null,
    });

    if (sem?.emotions_x_sample_size != null) tweetTotal += Math.max(0, sem.emotions_x_sample_size);

    if (typeof sem?.blended_mood === "number") {
      topicMoodSum += sem.blended_mood * rel;
      topicWeight += rel;
      marketsWithMood += 1;
    }

    const dist = coerceDist(sem?.blended_emotions);
    if (dist) {
      for (const k of BUCKET_KEYS) emotionSum[k] += dist[k] * rel;
    }
  }

  const topicMood = topicWeight > 1e-9 ? topicMoodSum / topicWeight : null;
  const topicEmotions = normalize(emotionSum);

  return (
    <div className="flex flex-col h-full bg-[#000000] text-zinc-300 font-sans selection:bg-blue-900 selection:text-white">
      <header className="h-12 border-b border-zinc-800 bg-[#050505] flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-6">
          <div className="flex gap-6 text-xs font-sans tracking-wide">
            <div className="flex gap-2">
              <span className="text-zinc-500 uppercase tracking-widest font-bold">Topic Analysis</span>
              <span className="text-zinc-100 font-mono">{matchesWithPrice.length}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <IncludeSportsToggle enabled={includeSports} />
        </div>
      </header>

      <main id="main" className="flex-1 overflow-y-auto p-6 no-scrollbar">
        <div className="max-w-5xl mx-auto">
          <div className="mb-8">
            <h1 className="text-xl font-bold text-zinc-100 mb-2">Custom Topic Builder</h1>
            <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">
              Type a topic. We semantically match markets, then aggregate blended sentiment + emotions.
            </p>
          </div>

          <TopicControls initialQuery={q} initialMaxDistance={maxDistance} />

          {!q.trim() ? (
            <div className="mt-8 rounded-lg border border-zinc-800 bg-[#050505] p-12 flex flex-col items-center justify-center text-center">
              <div className="w-12 h-12 rounded-full border border-zinc-800 flex items-center justify-center mb-4">
                <Command className="w-5 h-5 text-zinc-700" />
              </div>
              <p className="text-[10px] uppercase font-bold tracking-widest text-zinc-500 mb-4">No topic selected</p>
              <div className="flex flex-wrap justify-center gap-2">
                {["rate cuts", "AI bubble", "WW3", "Taylor Swift"].map((suggestion) => (
                  <Link
                    key={suggestion}
                    href={`/topics?q=${encodeURIComponent(suggestion)}`}
                    className="px-3 py-1.5 rounded-sm border border-zinc-800 bg-zinc-900/50 text-[10px] font-bold uppercase tracking-widest text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
                  >
                    {suggestion}
                  </Link>
                ))}
              </div>
            </div>
          ) : matchError ? (
            <div className="mt-8 rounded-lg border border-zinc-800 bg-red-500/5 p-6 text-sm text-red-400">
              <p className="font-bold uppercase tracking-widest text-[10px] mb-2">Topic search unavailable</p>
              <p>{matchError}</p>
            </div>
          ) : matchesWithPrice.length === 0 ? (
            <div className="mt-8 rounded-lg border border-zinc-800 bg-[#050505] p-12 text-center">
              <p className="text-[10px] uppercase font-bold tracking-widest text-zinc-500">No matches found for "{q}"</p>
            </div>
          ) : (
            <div className="mt-8 space-y-6">
              {/* AI Summary - Top of results */}
              <TopicAISummary
                topic={q}
                mood={topicMood}
                emotions={topicEmotions}
                marketsCount={matchesWithPrice.length}
                marketsWithSentiment={marketsWithMood}
                tweetCount={tweetTotal}
                topMarkets={matchesWithPrice.slice(0, 5).map((m) => {
                  const sem = semMap.get(m.condition_id);
                  const tok = tokMap.get(m.condition_id);
                  return {
                    question: m.question,
                    price: tok?.mid ?? null,
                    sentiment: sem?.blended_mood ?? null,
                    divergence: sem?.divergence_adj ?? null,
                  };
                })}
              />

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <MoodGauge value={typeof topicMood === "number" ? topicMood : null} />
                <div className="rounded-lg border border-zinc-800 bg-[#050505] p-5">
                  <div className="text-[10px] uppercase font-bold tracking-widest text-zinc-500 mb-4 flex items-center gap-2">
                    <Activity className="w-3 h-3 text-blue-500" />
                    Coverage
                  </div>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase font-bold tracking-widest text-zinc-600">Markets Matched</span>
                      <span className="text-xs font-mono text-zinc-100">{matchesWithPrice.length}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase font-bold tracking-widest text-zinc-600">With Sentiment</span>
                      <span className="text-xs font-mono text-zinc-100">{marketsWithMood}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase font-bold tracking-widest text-zinc-600">Tweets Scored</span>
                      <span className="text-xs font-mono text-zinc-100">~{tweetTotal}</span>
                    </div>
                    <div className="pt-2 border-t border-zinc-800/50 flex items-center justify-between">
                      <span className="text-[10px] uppercase font-bold tracking-widest text-zinc-600">Threshold</span>
                      <span className="text-xs font-mono text-zinc-100">{maxDistance.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-zinc-800 bg-[#050505] p-5">
                <div className="text-[10px] uppercase font-bold tracking-widest text-zinc-500 mb-4">Topic Emotions Aggregate</div>
                <EmotionBars dist={topicEmotions} />
              </div>

              <div className="space-y-3">
                <div className="text-[10px] uppercase font-bold tracking-widest text-zinc-500 mb-2">Matched Markets</div>
                {matchesWithPrice.map((m) => {
                  const sem = semMap.get(m.condition_id) ?? null;
                  const tok = tokMap.get(m.condition_id) ?? null;
                  return (
                    <Link
                      key={m.condition_id}
                      href={`/markets/${encodeURIComponent(m.condition_id)}`}
                      className="block rounded-lg border border-zinc-800 bg-[#050505] p-5 hover:bg-zinc-900/50 transition-all group"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="text-sm font-bold text-zinc-100 group-hover:text-blue-400 transition-colors">{m.question}</div>
                        <div className="text-[10px] font-mono text-zinc-600">
                          dist {Number(m.distance).toFixed(3)}
                        </div>
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-6 text-[10px] uppercase font-bold tracking-widest text-zinc-500 sm:grid-cols-4">
                        <div>
                          <div className="mb-1">Price (Mid)</div>
                          <div className="text-xs font-mono text-zinc-100">
                            {tok?.mid == null ? "—" : formatPct(tok.mid, 1)}
                          </div>
                        </div>
                        <div>
                          <div className="mb-1">Sentiment</div>
                          <div className="text-xs font-mono text-zinc-100">
                            {typeof sem?.blended_mood === "number" ? sem.blended_mood.toFixed(2) : "—"}
                          </div>
                        </div>
                        <div>
                          <div className="mb-1">Adj Divergence</div>
                          <div className="text-xs font-mono text-zinc-100">
                            {typeof sem?.divergence_adj === "number" ? sem.divergence_adj.toFixed(2) : "—"}
                          </div>
                        </div>
                        <div>
                          <div className="mb-1">Sample Size</div>
                          <div className="text-xs font-mono text-zinc-100">
                            {sem?.emotions_x_sample_size ?? 0}
                          </div>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
