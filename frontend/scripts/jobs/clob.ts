import type { SupabaseClient } from "@supabase/supabase-js";
import { pLimit } from "../_lib/pLimit";
import { fetchWithRetry } from "../_lib/fetchRetry";

const CLOB_BASE = "https://clob.polymarket.com";

type ClobToken = {
  token_id: string;
  outcome: string;
  price?: number;
  winner?: boolean;
};

type ClobMarket = {
  condition_id: string;
  tags?: unknown;
  tokens: ClobToken[];
};

export type ClobCursor = {
  last_ts?: string | null;
  backfill_24h?: {
    done?: boolean;
    started_at?: string;
    token_ids?: string[];
    next_index?: number;
  };
};

type MarketRow = { condition_id: string };

function snapTs(intervalSeconds: number): string {
  const nowMs = Date.now();
  const intervalMs = intervalSeconds * 1000;
  const rounded = Math.floor(nowMs / intervalMs) * intervalMs;
  return new Date(rounded).toISOString();
}

function hasSportsTag(tags: unknown): boolean {
  if (!Array.isArray(tags)) return false;
  return tags.some((t) => typeof t === "string" && t.trim().toLowerCase() === "sports");
}

function isBinaryYesNo(tokens: ClobToken[] | null | undefined): boolean {
  if (!Array.isArray(tokens) || tokens.length !== 2) return false;
  const outcomes = tokens.map((t) => t.outcome.trim().toLowerCase());
  if (!outcomes.includes("yes") || !outcomes.includes("no")) return false;
  return tokens.every((t) => typeof t.token_id === "string" && t.token_id.trim().length > 0);
}

type PricesHistoryPoint = { t?: number; p?: number };
type PricesHistoryResponse = { history?: PricesHistoryPoint[] };

function snapEpochSeconds(epochSeconds: number, intervalSeconds: number): number {
  return Math.floor(epochSeconds / intervalSeconds) * intervalSeconds;
}

async function fetchPricesHistory1d(tokenId: string): Promise<PricesHistoryPoint[]> {
  const url = new URL(`${CLOB_BASE}/prices-history`);
  url.searchParams.set("market", tokenId);
  url.searchParams.set("interval", "1d");

  const res = await fetchWithRetry(url);
  if (!res.ok) {
    throw new Error(`CLOB /prices-history failed: ${res.status} ${res.statusText} (${tokenId})`);
  }

  const body = (await res.json()) as PricesHistoryResponse;
  if (!body.history || !Array.isArray(body.history)) return [];
  return body.history;
}

export async function syncClobTop(
  supabase: SupabaseClient,
  cursor: ClobCursor,
): Promise<{ cursor: ClobCursor }> {
  const candidateLimit = 120;
  const topTrackedMarkets = 50;
  const snapshotIntervalSeconds = 120;
  const backfillTokensPerTick = 10;

  const tracked = await supabase
    .from("markets")
    .select("condition_id")
    .eq("closed", false)
    .eq("archived", false)
    .eq("is_sports", false)
    .order("volume_num", { ascending: false, nullsFirst: false })
    .limit(candidateLimit);

  if (tracked.error) throw tracked.error;
  const conditionIds = ((tracked.data ?? []) as MarketRow[]).map((r) => r.condition_id);
  if (conditionIds.length === 0) {
    return { cursor };
  }

  const limitFetch = pLimit(6);

  const markets = await Promise.all(
    conditionIds.map((conditionId) =>
      limitFetch(async () => {
        const res = await fetchWithRetry(`${CLOB_BASE}/markets/${conditionId}`);
        if (!res.ok) {
          throw new Error(
            `CLOB getMarket failed: ${res.status} ${res.statusText} (${conditionId})`,
          );
        }
        return (await res.json()) as ClobMarket;
      }),
    ),
  );

  const updatedAt = new Date().toISOString();

  // CLOB tags are the only reliable sports signal for some futures markets (Gamma can omit sports metadata).
  const sportsConditionIds = markets
    .filter((m) => hasSportsTag(m.tags))
    .map((m) => m.condition_id)
    .filter((v): v is string => typeof v === "string" && v.length > 0);

  if (sportsConditionIds.length > 0) {
    const markSports = await supabase
      .from("markets")
      .update({ is_sports: true, updated_at: updatedAt })
      .in("condition_id", sportsConditionIds);
    if (markSports.error) throw markSports.error;
  }

  const eligibleMarkets = markets
    .filter((m) => !hasSportsTag(m.tags))
    .filter((m) => isBinaryYesNo(m.tokens))
    .slice(0, topTrackedMarkets);

  const tokenRows = eligibleMarkets.flatMap((m) =>
    (m.tokens ?? []).map((t) => ({
      token_id: t.token_id,
      condition_id: m.condition_id,
      outcome: t.outcome,
      winner: t.winner ?? null,
      price: typeof t.price === "number" ? t.price : null,
    })),
  );

  if (tokenRows.length === 0) {
    return { cursor };
  }

  const yesTokens = tokenRows
    .filter((t) => t.outcome.toLowerCase() === "yes")
    .map((t) => t.token_id);

  if (yesTokens.length === 0) {
    return { cursor };
  }

  let nextCursor: ClobCursor = cursor;

  // One-time backfill so sparklines have history on day 1.
  if (nextCursor.backfill_24h?.done !== true) {
    const startedAt = nextCursor.backfill_24h?.started_at ?? new Date().toISOString();
    const tokenIds = nextCursor.backfill_24h?.token_ids ?? yesTokens;
    const nextIndex = Math.max(0, nextCursor.backfill_24h?.next_index ?? 0);
    const chunk = tokenIds.slice(nextIndex, nextIndex + backfillTokensPerTick);

    const nowSec = Math.floor(Date.now() / 1000);
    const sinceSec = nowSec - 24 * 60 * 60;

    const limitHistory = pLimit(4);
    const histories = await Promise.all(
      chunk.map((tokenId) =>
        limitHistory(async () => {
          const points = await fetchPricesHistory1d(tokenId);
          return { tokenId, points };
        }),
      ),
    );

    const rows: { token_id: string; ts: string; midpoint: number; spread: number | null }[] = [];
    for (const { tokenId, points } of histories) {
      const byTs = new Map<number, number>();
      for (const pt of points) {
        if (typeof pt.t !== "number" || typeof pt.p !== "number") continue;
        if (pt.t < sinceSec) continue;
        const snapped = snapEpochSeconds(pt.t, snapshotIntervalSeconds);
        byTs.set(snapped, pt.p);
      }
      for (const [tsSec, midpoint] of byTs.entries()) {
        rows.push({
          token_id: tokenId,
          ts: new Date(tsSec * 1000).toISOString(),
          midpoint,
          spread: null,
        });
      }
    }

    // Batch writes to stay under HTTP payload limits.
    const batchSize = 1000;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      const write = await supabase
        .from("market_price_samples")
        .upsert(batch, { onConflict: "token_id,ts", ignoreDuplicates: true });
      if (write.error) throw write.error;
    }

    const newNextIndex = nextIndex + chunk.length;
    const done = newNextIndex >= tokenIds.length;

    nextCursor = {
      ...nextCursor,
      backfill_24h: done
        ? { done: true, started_at: startedAt }
        : { done: false, started_at: startedAt, token_ids: tokenIds, next_index: newNextIndex },
    };
  }

  const spreadRes = await fetchWithRetry(`${CLOB_BASE}/spreads`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(yesTokens.map((token_id) => ({ token_id }))),
  });

  if (!spreadRes.ok) {
    throw new Error(`CLOB /spreads failed: ${spreadRes.status} ${spreadRes.statusText}`);
  }

  const spreads = (await spreadRes.json()) as Record<string, string>;

  const limitMid = pLimit(10);
  const mids = await Promise.all(
    yesTokens.map((tokenId) =>
      limitMid(async () => {
        const res = await fetchWithRetry(`${CLOB_BASE}/midpoint?token_id=${tokenId}`);
        if (!res.ok) {
          throw new Error(
            `CLOB /midpoint failed: ${res.status} ${res.statusText} (${tokenId})`,
          );
        }
        const body = (await res.json()) as { mid?: string };
        const mid = body.mid ? Number(body.mid) : null;
        return { tokenId, mid };
      }),
    ),
  );

  const midByToken = new Map(mids.map((m) => [m.tokenId, m.mid] as const));

  const upsertTokens = tokenRows.map((t) => ({
    ...t,
    mid: midByToken.get(t.token_id) ?? null,
    spread: spreads[t.token_id] != null ? Number(spreads[t.token_id]) : null,
    updated_at: updatedAt,
  }));

  const tokenWrite = await supabase
    .from("market_tokens")
    .upsert(upsertTokens, { onConflict: "token_id" });

  if (tokenWrite.error) throw tokenWrite.error;

  const ts = snapTs(snapshotIntervalSeconds);
  const sampleRows = yesTokens
    .map((tokenId) => {
      const midpoint = midByToken.get(tokenId);
      if (midpoint == null) return null;
      return {
        token_id: tokenId,
        ts,
        midpoint,
        spread: spreads[tokenId] != null ? Number(spreads[tokenId]) : null,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r != null);

  if (sampleRows.length > 0) {
    const sampleWrite = await supabase
      .from("market_price_samples")
      .upsert(sampleRows, { onConflict: "token_id,ts", ignoreDuplicates: true });
    if (sampleWrite.error) throw sampleWrite.error;
  }

  return { cursor: { ...nextCursor, last_ts: ts } };
}
