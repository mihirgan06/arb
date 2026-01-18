import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchWithRetry } from "../_lib/fetchRetry";

const GAMMA_BASE = "https://gamma-api.polymarket.com";

type GammaMarket = {
  conditionId?: string;
  id?: string | number;
  question?: string;
  description?: string;
  category?: string;
  tags?: unknown;
  slug?: string;
  active?: boolean;
  closed?: boolean;
  archived?: boolean;
  endDateIso?: string;
  endDate?: string;
  volumeNum?: number;
  volume?: number;
  liquidityNum?: number;
  liquidity?: number;
  outcomes?: unknown;
  outcomePrices?: unknown;
  clobTokenIds?: unknown;
  sportsMarketType?: unknown;
  gameId?: unknown;
  teamAID?: unknown;
  teamBID?: unknown;
};

function isSportsMarket(market: GammaMarket): boolean {
  if (typeof market.category === "string" && market.category.toLowerCase() === "sports") {
    return true;
  }

  const sportsFields = [
    "sportsMarketType",
    "gameId",
    "teamAID",
    "teamBID",
  ] as const;

  return sportsFields.some((field) => market[field] != null);
}

function asJsonText(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

export type GammaCursor = {
  offset?: number;
  done?: boolean;
};

export async function syncGammaMarkets(
  supabase: SupabaseClient,
  job: "gamma_open" | "gamma_closed",
  cursor: GammaCursor,
): Promise<{ cursor: GammaCursor; fetched: number }> {
  const limit = 200;
  const offset = Math.max(0, cursor.offset ?? 0);

  if (job === "gamma_closed" && cursor.done) {
    return { cursor, fetched: 0 };
  }

  const url = new URL(`${GAMMA_BASE}/markets`);
  url.searchParams.set("closed", job === "gamma_closed" ? "true" : "false");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("offset", String(offset));

  const res = await fetchWithRetry(url);
  if (!res.ok) {
    throw new Error(`Gamma /markets failed: ${res.status} ${res.statusText}`);
  }

  const markets = (await res.json()) as GammaMarket[];
  if (!Array.isArray(markets)) {
    throw new Error("Gamma /markets returned non-array");
  }

  if (markets.length === 0) {
    const nextCursor =
      job === "gamma_open"
        ? { offset: 0 }
        : { offset, done: true };
    return { cursor: nextCursor, fetched: 0 };
  }

  const rows = markets
    .map((m) => {
      const conditionId = m.conditionId;
      const question = m.question;
      if (!conditionId || !question) return null;

      const endDateIso =
        typeof m.endDateIso === "string"
          ? m.endDateIso
          : typeof m.endDate === "string"
            ? m.endDate
            : null;

      return {
        conditionId,
        gammaMarketId: m.id != null ? String(m.id) : null,
        question,
        description: typeof m.description === "string" ? m.description : null,
        category: typeof m.category === "string" ? m.category : null,
        tags: Array.isArray(m.tags) ? (m.tags as string[]) : null,
        slug: typeof m.slug === "string" ? m.slug : null,
        isSports: isSportsMarket(m),
        active: typeof m.active === "boolean" ? m.active : null,
        closed: typeof m.closed === "boolean" ? m.closed : null,
        archived: typeof m.archived === "boolean" ? m.archived : null,
        endDateIso,
        volumeNum:
          typeof m.volumeNum === "number"
            ? m.volumeNum
            : typeof m.volume === "number"
              ? m.volume
              : null,
        liquidityNum:
          typeof m.liquidityNum === "number"
            ? m.liquidityNum
            : typeof m.liquidity === "number"
              ? m.liquidity
              : null,
        outcomesRaw: asJsonText(m.outcomes),
        outcomePricesRaw: asJsonText(m.outcomePrices),
        clobTokenIdsRaw: asJsonText(m.clobTokenIds),
      };
    })
    .filter((r): r is NonNullable<typeof r> => r != null);

  if (rows.length === 0) {
    throw new Error("Gamma /markets returned rows without conditionId/question");
  }

  // Preserve a previously-detected is_sports=true (e.g. from CLOB tags), since Gamma
  // can omit sports metadata for some futures markets.
  const existing = await supabase
    .from("markets")
    .select("condition_id, is_sports")
    .in(
      "condition_id",
      rows.map((r) => r.conditionId),
    );
  if (existing.error) throw existing.error;
  const existingIsSports = new Map(
    (existing.data ?? []).map((r) => [r.condition_id, r.is_sports === true] as const),
  );

  // Use Supabase upsert (HTTP) to avoid direct DB access.
  const upsertRows = rows.map((r) => ({
    condition_id: r.conditionId,
    gamma_market_id: r.gammaMarketId,
    question: r.question,
    description: r.description,
    category: r.category,
    tags: r.tags,
    slug: r.slug,
    is_sports: (existingIsSports.get(r.conditionId) ?? false) || r.isSports,
    active: r.active,
    closed: r.closed,
    archived: r.archived,
    end_date_iso: r.endDateIso,
    volume_num: r.volumeNum,
    liquidity_num: r.liquidityNum,
    outcomes_raw: r.outcomesRaw,
    outcome_prices_raw: r.outcomePricesRaw,
    clob_token_ids_raw: r.clobTokenIdsRaw,
    updated_at: new Date().toISOString(),
    last_gamma_sync_at: new Date().toISOString(),
  }));

  const write = await supabase
    .from("markets")
    .upsert(upsertRows, { onConflict: "condition_id" });

  if (write.error) throw write.error;

  const nextCursor =
    job === "gamma_open"
      ? markets.length < limit
        ? { offset: 0 }
        : { offset: offset + limit }
      : markets.length < limit
        ? { offset, done: true }
        : { offset: offset + limit, done: false };

  return { cursor: nextCursor, fetched: markets.length };
}
