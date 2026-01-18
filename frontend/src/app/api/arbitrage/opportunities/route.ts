import { NextResponse } from "next/server";
import { arbitrageEngine } from "@/services/arbitrage-engine";
import { polymarket } from "@/services/polymarket-client";
import type { MarketOrderBook } from "@/lib/orderbook";
import { extractTokenIds, normalizeOrderBook } from "@/lib/polymarket-helpers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "5");

    const events = await polymarket.getTopMarkets(20);
    if (!events || events.length < 1) {
      return NextResponse.json({ success: true, opportunities: [], totalMarkets: 0 });
    }

    interface MarketInfo { id: string; question: string; tokenYes: string; eventTitle: string; }
    const markets: MarketInfo[] = [];

    // Max 3 markets per event to get diversity
    for (const event of events) {
      if (!event.markets) continue;
      let countForEvent = 0;
      for (const market of event.markets) {
        if (countForEvent >= 3) break; // Only 3 per event
        const tokenIds = extractTokenIds(market);
        if (tokenIds.yes) {
          markets.push({
            id: market.id || market.slug,
            question: market.question || event.title,
            tokenYes: tokenIds.yes,
            eventTitle: event.title || "",
          });
          countForEvent++;
        }
      }
    }

    console.log(`[API] ${markets.length} markets from ${events.length} events`);

    const opportunities: any[] = [];
    const checked = new Set<string>();

    for (const market of markets) {
      if (opportunities.length >= limit) break;

      for (const other of markets) {
        if (market.id === other.id) continue;
        const key = [market.id, other.id].sort().join("-");
        if (checked.has(key)) continue;
        checked.add(key);
        
        const result = detectCorrelation(market.question.toLowerCase(), other.question.toLowerCase(), market.eventTitle, other.eventTitle);
        if (!result) continue;

        console.log(`[API] Correlation: ${result.reasoning}`);

        try {
          const [ob1, ob2] = await Promise.all([
            polymarket.getOrderBookForToken(market.tokenYes),
            polymarket.getOrderBookForToken(other.tokenYes),
          ]);

          if (!ob1 || !ob2) continue;
          const orderbook1 = normalizeOrderBook(ob1, market.id, market.question) as MarketOrderBook | null;
          const orderbook2 = normalizeOrderBook(ob2, other.id, other.question) as MarketOrderBook | null;
          if (!orderbook1 || !orderbook2) continue;
          if (!orderbook1.yes.bids.length || !orderbook2.yes.bids.length) continue;

          const opp = arbitrageEngine.calculateArbitrage(orderbook1, orderbook2, result.correlationType);
          if (opp && opp.profitAt100Shares > 0) {
            opportunities.push({ ...opp, correlation: { type: result.correlationType, confidence: 0.8, reasoning: result.reasoning } });
            break;
          }
        } catch { continue; }
      }
    }

    opportunities.sort((a, b) => b.profitAt100Shares - a.profitAt100Shares);
    return NextResponse.json({ success: true, opportunities: opportunities.slice(0, limit), totalMarkets: markets.length });
  } catch (error) {
    console.error("[API] Error:", error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

function detectCorrelation(q1: string, q2: string, event1: string, event2: string): { correlationType: "SAME" | "OPPOSITE"; reasoning: string } | null {
  // Skip same-event win questions (mutually exclusive)
  if (/will .+ win/i.test(q1) && /will .+ win/i.test(q2) && event1 === event2) return null;

  // Fed rate correlations
  if (/fed|bps|interest rate/i.test(q1) && /fed|bps|interest rate/i.test(q2)) {
    const dec1 = /decrease/i.test(q1), dec2 = /decrease/i.test(q2);
    const nc1 = /no change/i.test(q1), nc2 = /no change/i.test(q2);
    if ((dec1 && nc2) || (nc1 && dec2)) return { correlationType: "OPPOSITE", reasoning: "Fed: decrease vs no-change" };
    if (dec1 && dec2 && q1 !== q2) return { correlationType: "SAME", reasoning: "Fed: related decreases" };
  }

  // Same topic, different dates
  const dp = /by (january|february|march|april|may|june|july|august|september|october|november|december) (\d+)/i;
  if (dp.test(q1) && dp.test(q2)) {
    const t1 = q1.replace(dp, "").replace(/\d{4}\??/, "").trim();
    const t2 = q2.replace(dp, "").replace(/\d{4}\??/, "").trim();
    if (similarity(t1, t2) > 0.5) return { correlationType: "SAME", reasoning: "Same topic, different dates" };
  }

  // Similar questions
  if (similarity(q1, q2) > 0.5) return { correlationType: "SAME", reasoning: "Similar questions" };
  return null;
}

function similarity(a: string, b: string): number {
  const w1 = new Set(a.match(/\w{3,}/g) || []);
  const w2 = new Set(b.match(/\w{3,}/g) || []);
  const inter = [...w1].filter(w => w2.has(w)).length;
  const union = new Set([...w1, ...w2]).size;
  return union > 0 ? inter / union : 0;
}
