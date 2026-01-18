import Link from "next/link";
import { Activity } from "lucide-react";
import { supabaseServer } from "@/lib/supabaseServer";
import { AgeText } from "@/components/AgeText";
import { IncludeSportsToggle } from "@/components/IncludeSportsToggle";
import { matchMarketsByText, type MarketMatchRow } from "@/lib/semanticSearch";
import { MoodGauge } from "@/components/MoodGauge";

export const dynamic = "force-dynamic";

type TrendRow = {
  fetched_at: string;
  source_tab: string;
  headline: string;
};

type SemanticsRow = {
  condition_id: string;
  blended_mood: number | null;
  divergence_adj: number | null;
  computed_at: string | null;
};

type TokenRow = {
  condition_id: string;
  mid: number | null;
  updated_at: string;
};

function formatPct(value: number, digits: number) {
  return `${(value * 100).toFixed(digits)}%`;
}

function parseDistance(value: string | undefined): number {
  const n = value ? Number(value) : NaN;
  if (!Number.isFinite(n)) return 0.65;
  return Math.max(0.05, Math.min(1, n));
}

export default async function TrendsPage({
  searchParams,
}: {
  searchParams?: { headline?: string; d?: string; includeSports?: string } | Promise<{ headline?: string; d?: string; includeSports?: string }>;
}) {
  const sp = await Promise.resolve(searchParams ?? {});
  const includeSports = sp.includeSports === "1";
  let selectedHeadline: string | null = null;
  if (sp.headline) {
    try {
      selectedHeadline = decodeURIComponent(sp.headline);
    } catch {
      selectedHeadline = sp.headline;
    }
  }
  const maxDistance = parseDistance(sp.d);

  const supabase = supabaseServer();
  const trendsRes = await supabase
    .from("x_trends")
    .select("fetched_at, source_tab, headline")
    .order("fetched_at", { ascending: false })
    .limit(30);

  if (trendsRes.error) throw trendsRes.error;
  const allTrends = (trendsRes.data ?? []) as TrendRow[];
  const latestTrendsAt = allTrends[0]?.fetched_at ?? null;
  const trends =
    latestTrendsAt != null ? allTrends.filter((t) => t.fetched_at === latestTrendsAt).slice(0, 18) : [];

  let matches: MarketMatchRow[] = [];
  let matchError: string | null = null;

  if (selectedHeadline) {
    const out = await matchMarketsByText({
      query: selectedHeadline,
      matchCount: 50,
      maxDistance,
      includeSports,
    });
    matches = out.rows;
    matchError = out.error;
  }

  const matchIds = matches.map((m) => m.condition_id);
  const [semRes, tokRes] =
    matchIds.length > 0
      ? await Promise.all([
          supabase
            .from("market_semantics")
            .select("condition_id, blended_mood, divergence_adj, computed_at")
            .in("condition_id", matchIds),
          supabase
            .from("market_tokens")
            .select("condition_id, mid, updated_at")
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

  return (
    <div className="flex flex-col h-full bg-[#000000] text-zinc-300 font-sans selection:bg-blue-900 selection:text-white">
      <header className="h-12 border-b border-zinc-800 bg-[#050505] flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-6">
          <div className="flex gap-6 text-xs font-sans tracking-wide">
            <div className="flex gap-2">
              <span className="text-zinc-500 uppercase tracking-widest font-bold">Trend → Markets</span>
              <span className="text-zinc-100 font-mono">{trends.length}</span>
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
            <h1 className="text-xl font-bold text-zinc-100 mb-2">Real-time Trends</h1>
            <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">
              Pick a trend. We embed the headline (OpenAI) and match markets via pgvector.
            </p>
          </div>

          {trends.length > 0 ? (
            <section className="rounded-lg border border-zinc-800 bg-[#050505] p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 flex items-center gap-2">
                  <Activity className="w-3 h-3 text-blue-500" />
                  X Trends
                </h2>
                <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">
                  Updated <AgeText updatedAt={latestTrendsAt} />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {trends.map((t, idx) => (
                  <Link
                    key={`${t.fetched_at}:${idx}`}
                    href={`/trends?headline=${encodeURIComponent(t.headline)}${includeSports ? "&includeSports=1" : ""}`}
                    className={`rounded-sm border px-3 py-2 text-[10px] font-bold uppercase tracking-widest transition-all ${
                      selectedHeadline === t.headline
                        ? "border-blue-500 bg-blue-500/10 text-blue-400"
                        : "border-zinc-800 bg-zinc-900/50 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"
                    }`}
                    title={t.source_tab}
                  >
                    {t.headline}
                  </Link>
                ))}
              </div>
            </section>
          ) : (
            <div className="rounded-lg border border-dashed border-zinc-800 bg-[#050505] p-12 text-center">
              <p className="text-[10px] uppercase font-bold tracking-widest text-zinc-500">No trends cached yet. Run the bird worker.</p>
            </div>
          )}

          {selectedHeadline ? (
            <section className="mt-8">
              <div className="flex items-end justify-between gap-4 mb-6">
                <div>
                  <div className="text-[10px] uppercase font-bold tracking-widest text-zinc-500 mb-1">Selected Trend</div>
                  <div className="text-lg font-bold text-zinc-100">{selectedHeadline}</div>
                </div>
                <div className="text-right text-[10px] font-mono text-zinc-600">
                  MAX DISTANCE: {maxDistance.toFixed(2)}
                </div>
              </div>

              {matchError ? (
                <div className="rounded-lg border border-zinc-800 bg-red-500/5 p-6 text-sm text-red-400">
                  <p className="font-bold uppercase tracking-widest text-[10px] mb-2">Semantic match unavailable</p>
                  <p>{matchError}</p>
                </div>
              ) : matchesWithPrice.length === 0 ? (
                <div className="rounded-lg border border-zinc-800 bg-[#050505] p-12 text-center">
                  <p className="text-[10px] uppercase font-bold tracking-widest text-zinc-500">No matches under distance {maxDistance.toFixed(2)}</p>
                </div>
              ) : (
                <div className="space-y-3">
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
                        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                          <MoodGauge value={typeof sem?.blended_mood === "number" ? sem.blended_mood : null} />
                          <div className="rounded-sm border border-zinc-800 bg-zinc-900/30 p-3">
                            <div className="text-[10px] uppercase font-bold tracking-widest text-zinc-500 mb-1">Price (Mid)</div>
                            <div className="text-xs font-mono text-zinc-100">
                              {tok?.mid == null ? "—" : formatPct(tok.mid, 1)}
                            </div>
                            <div className="mt-2 text-[10px] uppercase font-bold tracking-widest text-zinc-600">
                              <AgeText updatedAt={tok?.updated_at} />
                            </div>
                          </div>
                          <div className="rounded-sm border border-zinc-800 bg-zinc-900/30 p-3">
                            <div className="text-[10px] uppercase font-bold tracking-widest text-zinc-500 mb-1">Adj Divergence</div>
                            <div className="text-xs font-mono text-zinc-100">
                              {typeof sem?.divergence_adj === "number" ? sem.divergence_adj.toFixed(2) : "—"}
                            </div>
                            <div className="mt-2 text-[10px] uppercase font-bold tracking-widest text-zinc-600">
                              <AgeText updatedAt={sem?.computed_at} />
                            </div>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </section>
          ) : null}
        </div>
      </main>
    </div>
  );
}
