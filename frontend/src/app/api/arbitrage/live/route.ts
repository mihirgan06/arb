import { NextResponse } from "next/server";
import { polymarket } from "@/services/polymarket-client";
import { arbitrageEngine } from "@/services/arbitrage-engine";
import { extractTokenIds, normalizeOrderBook } from "@/lib/polymarket-helpers";
import type { MarketOrderBook } from "@/lib/orderbook";

export const dynamic = "force-dynamic";

/**
 * GET /api/arbitrage/live
 * Fetch real-time orderbook and calculate arbitrage for a SPECIFIC pair
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const m1Id = searchParams.get("m1");
    const m2Id = searchParams.get("m2");
    const alignment = searchParams.get("align") || "SAME"; // SAME or OPPOSITE

    if (!m1Id || !m2Id) {
      return NextResponse.json({ success: false, error: "Missing market IDs" }, { status: 400 });
    }

    // Fetch market details to get Token IDs
    // In a real app, we'd cache this or pass token IDs from frontend
    const [market1, market2] = await Promise.all([
      polymarket.getMarket(m1Id),
      polymarket.getMarket(m2Id),
    ]);

    if (!market1 || !market2) {
      return NextResponse.json({ success: false, error: "Markets not found" }, { status: 404 });
    }

    const t1 = extractTokenIds(market1);
    const t2 = extractTokenIds(market2);

    if (!t1.yes || !t2.yes) {
       return NextResponse.json({ success: false, error: "Token IDs not found" }, { status: 404 });
    }

    // Fetch live orderbooks
    const [ob1, ob2] = await Promise.all([
      polymarket.getOrderBookForToken(t1.yes),
      polymarket.getOrderBookForToken(t2.yes),
    ]);

    if (!ob1 || !ob2) {
      return NextResponse.json({ success: false, error: "Orderbooks not available" }, { status: 404 });
    }

    const market1OB = normalizeOrderBook(ob1, market1.id, market1.question) as MarketOrderBook;
    const market2OB = normalizeOrderBook(ob2, market2.id, market2.question) as MarketOrderBook;

    const opportunity = arbitrageEngine.calculateArbitrage(
      market1OB,
      market2OB,
      alignment as "SAME" | "OPPOSITE"
    );

    return NextResponse.json({
      success: true,
      opportunity,
    });

  } catch (error) {
    console.error("[Live Arb] Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch live data" },
      { status: 500 }
    );
  }
}
