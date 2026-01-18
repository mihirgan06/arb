import { supabaseServer } from "@/lib/supabaseServer";
import { embedTextToVectorLiteral } from "@/lib/openaiEmbeddingsServer";

export type MarketMatchRow = {
  condition_id: string;
  question: string;
  slug: string | null;
  volume_num: number | null;
  liquidity_num: number | null;
  distance: number;
};

export async function matchMarketsByText(args: {
  query: string;
  matchCount?: number;
  maxDistance?: number;
  includeSports?: boolean;
}): Promise<{ rows: MarketMatchRow[]; error: string | null }> {
  const q = args.query.trim();
  if (!q) return { rows: [], error: null };

  const matchCount = args.matchCount ?? 50;
  const maxDistance = args.maxDistance ?? 0.65;
  const includeSports = args.includeSports ?? false;

  try {
    const supabase = supabaseServer();
    const vec = await embedTextToVectorLiteral(q);

    const res = await supabase.rpc("arb_match_markets", {
      p_query_embedding: vec,
      p_match_count: matchCount,
      p_max_distance: maxDistance,
      p_include_sports: includeSports,
    });

    if (res.error) {
      const msg = res.error.message || "arb_match_markets failed";
      return { rows: [], error: msg };
    }

    const rows = (res.data ?? []) as MarketMatchRow[];
    return { rows, error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { rows: [], error: msg };
  }
}
