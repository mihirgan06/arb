import Link from "next/link";
import { supabaseServer } from "@/lib/supabaseServer";
import { AgeText } from "@/components/AgeText";
import { IncludeSportsToggle } from "@/components/IncludeSportsToggle";

export const dynamic = "force-dynamic";

type SemanticsRow = {
  condition_id: string;
  divergence: number | null;
  divergence_adj: number | null;
  blended_mood: number | null;
  mood_x: number | null;
  emotions_x_sample_size: number | null;
  computed_at: string | null;
};

type MarketRow = {
  condition_id: string;
  question: string;
  volume_num: number | null;
  liquidity_num: number | null;
  is_sports: boolean;
};

type TokenRow = {
  condition_id: string;
  token_id: string;
  mid: number | null;
  spread: number | null;
  updated_at: string;
};

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

function formatPct(value: number, digits: number) {
  return `${(value * 100).toFixed(digits)}%`;
}

export default async function DivergencePage({
  searchParams,
}: {
  searchParams?: { includeSports?: string; sort?: string } | Promise<{ includeSports?: string; sort?: string }>;
}) {
  const sp = await Promise.resolve(searchParams ?? {});
  const includeSports = sp.includeSports === "1";
  const sort = sp.sort === "raw" ? "raw" : sp.sort === "movers" ? "movers" : "adj";

  const supabase = supabaseServer();

  const semQuery = supabase
    .from("market_semantics")
    .select("condition_id, divergence, divergence_adj, blended_mood, mood_x, emotions_x_sample_size, computed_at")
    .not("divergence", "is", null)
    .not("divergence_adj", "is", null)
    .gt("emotions_x_sample_size", 0);

  const semRes = await (sort === "raw"
    ? semQuery.order("divergence", { ascending: false, nullsFirst: false })
    : semQuery.order("divergence_adj", { ascending: false, nullsFirst: false })
  ).limit(200);

  if (semRes.error) throw semRes.error;
  const semantics = (semRes.data ?? []) as SemanticsRow[];

  const ids = semantics.map((s) => s.condition_id);
  if (ids.length === 0) {
    return (
      <div className="min-h-screen bg-zinc-50 text-zinc-950 dark:bg-black dark:text-zinc-50">
        <header className="mx-auto w-full max-w-5xl px-6 pt-10 pb-6">
          <Link href="/" className="text-sm text-zinc-600 underline dark:text-zinc-400">
            ← Back to radar
          </Link>
          <div className="mt-4 flex items-center justify-between gap-4">
            <h1 className="text-2xl font-semibold tracking-tight">Divergence Leaderboard</h1>
            <IncludeSportsToggle enabled={includeSports} />
          </div>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">No divergence rows yet.</p>
        </header>
      </div>
    );
  }

  const [marketsRes, tokensRes] = await Promise.all([
    supabase
      .from("markets")
      .select("condition_id, question, volume_num, liquidity_num, is_sports")
      .in("condition_id", ids),
    supabase
      .from("market_tokens")
      .select("condition_id, token_id, mid, spread, updated_at")
      .in("condition_id", ids)
      .ilike("outcome", "yes"),
  ]);

  if (marketsRes.error) throw marketsRes.error;
  if (tokensRes.error) throw tokensRes.error;

  const markets = (marketsRes.data ?? []) as MarketRow[];
  const tokens = (tokensRes.data ?? []) as TokenRow[];

  const marketById = new Map(markets.map((m) => [m.condition_id, m] as const));
  const tokenById = new Map(tokens.map((t) => [t.condition_id, t] as const));

  const rowsBase = semantics
    .map((s) => {
      const m = marketById.get(s.condition_id);
      if (!m) return null;
      if (!includeSports && m.is_sports) return null;
      const t = tokenById.get(s.condition_id) ?? null;
      const reliability = reliabilityScore({
        volume: m.volume_num,
        liquidity: m.liquidity_num,
        spread: t?.spread ?? null,
      });
      return { s, m, t, reliability, move24h: null as number | null };
    })
    .filter((r): r is NonNullable<typeof r> => r != null);

  let rows = rowsBase;

  if (sort === "movers") {
    const tokenIds = rowsBase.map((r) => r.t?.token_id).filter((v): v is string => typeof v === "string" && v.length > 0);
    const sinceDate = new Date();
    sinceDate.setUTCHours(sinceDate.getUTCHours() - 24);
    const since = sinceDate.toISOString();

    const samplesRes =
      tokenIds.length > 0
        ? await supabase
            .from("market_price_samples")
            .select("token_id, ts, midpoint")
            .in("token_id", tokenIds)
            .gte("ts", since)
            .order("ts", { ascending: true })
        : { data: [], error: null };

    if ("error" in samplesRes && samplesRes.error) throw samplesRes.error;

    const firstByToken = new Map<string, number>();
    const lastByToken = new Map<string, number>();
    for (const r of (("data" in samplesRes ? samplesRes.data : []) ?? []) as Array<{ token_id: string; midpoint: number }>) {
      if (!firstByToken.has(r.token_id)) firstByToken.set(r.token_id, Number(r.midpoint));
      lastByToken.set(r.token_id, Number(r.midpoint));
    }

    rows = rowsBase
      .map((r) => {
        const tokenId = r.t?.token_id;
        if (!tokenId) return r;
        const first = firstByToken.get(tokenId);
        const last = lastByToken.get(tokenId);
        if (first == null || last == null || !Number.isFinite(first) || !Number.isFinite(last)) return r;
        return { ...r, move24h: last - first };
      })
      .sort((a, b) => {
        const ma = a.move24h == null ? -1 : Math.abs(a.move24h);
        const mb = b.move24h == null ? -1 : Math.abs(b.move24h);
        if (mb !== ma) return mb - ma;
        const da = a.s.divergence_adj ?? -1;
        const db = b.s.divergence_adj ?? -1;
        return db - da;
      });
  } else if (sort === "raw") {
    rows = rowsBase.slice().sort((a, b) => (b.s.divergence ?? -1) - (a.s.divergence ?? -1));
  } else {
    rows = rowsBase.slice().sort((a, b) => (b.s.divergence_adj ?? -1) - (a.s.divergence_adj ?? -1));
  }

  return (
    <div className="flex flex-col h-full bg-[#000000] text-zinc-300 font-sans selection:bg-blue-900 selection:text-white">
      <header className="h-12 border-b border-zinc-800 bg-[#050505] flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-6">
          <div className="flex gap-6 text-xs font-sans tracking-wide">
            <div className="flex gap-2">
              <span className="text-zinc-500 uppercase tracking-widest font-bold">Divergence Leaderboard</span>
              <span className="text-zinc-100 font-mono">{rows.length}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
            <span>Sort:</span>
            <Link
              className={sort === "adj" ? "text-blue-400" : "hover:text-zinc-300 transition-colors"}
              href={`/divergence?sort=adj${includeSports ? "&includeSports=1" : ""}`}
            >
              Reliability-Adj
            </Link>
            <Link
              className={sort === "raw" ? "text-blue-400" : "hover:text-zinc-300 transition-colors"}
              href={`/divergence?sort=raw${includeSports ? "&includeSports=1" : ""}`}
            >
              Raw
            </Link>
            <Link
              className={sort === "movers" ? "text-blue-400" : "hover:text-zinc-300 transition-colors"}
              href={`/divergence?sort=movers${includeSports ? "&includeSports=1" : ""}`}
            >
              24h Movers
            </Link>
          </div>
          <div className="h-4 w-px bg-zinc-800" />
          <IncludeSportsToggle enabled={includeSports} />
        </div>
      </header>

      <main id="main" className="flex-1 overflow-y-auto p-6 no-scrollbar">
        <div className="max-w-5xl mx-auto space-y-3">
          {rows.map(({ s, m, t, reliability, move24h }) => (
            <Link
              key={m.condition_id}
              href={`/markets/${encodeURIComponent(m.condition_id)}`}
              className="block rounded-lg border border-zinc-800 bg-[#050505] p-5 hover:bg-zinc-900/50 transition-all group"
            >
              <div className="text-sm font-bold text-zinc-100 group-hover:text-blue-400 transition-colors">{m.question}</div>
              <div className="mt-4 grid grid-cols-2 gap-6 text-[10px] uppercase font-bold tracking-widest text-zinc-500 sm:grid-cols-5">
                <div>
                  <div className="mb-1">Divergence</div>
                  <div className="text-xs font-mono text-zinc-100">
                    {typeof s.divergence === "number" ? s.divergence.toFixed(2) : "—"}
                  </div>
                </div>
                <div>
                  <div className="mb-1">Adjusted</div>
                  <div className="text-xs font-mono text-zinc-100">
                    {typeof s.divergence_adj === "number" ? s.divergence_adj.toFixed(2) : "—"}
                  </div>
                </div>
                <div>
                  <div className="mb-1">Price (Mid)</div>
                  <div className="text-xs font-mono text-zinc-100">
                    {t?.mid == null ? "—" : `${(t.mid * 100).toFixed(1)}%`}
                  </div>
                </div>
                <div>
                  <div className="mb-1">24h Move</div>
                  <div className="text-xs font-mono text-zinc-100">
                    {move24h == null ? "—" : formatPct(move24h, 1)}
                  </div>
                </div>
                <div>
                  <div className="mb-1">Reliability</div>
                  <div className="text-xs font-mono text-zinc-100">
                    {(reliability * 100).toFixed(0)}%
                  </div>
                </div>
              </div>
              <div className="mt-4 flex items-center gap-2 text-[10px] uppercase font-bold tracking-widest text-zinc-600">
                <span>Price: <AgeText updatedAt={t?.updated_at} /></span>
                <span className="text-zinc-800">|</span>
                <span>Computed: <AgeText updatedAt={s.computed_at} /></span>
              </div>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
