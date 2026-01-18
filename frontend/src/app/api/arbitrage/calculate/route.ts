import { NextResponse } from "next/server";
import { polymarket } from "@/services/polymarket-client";
import { arbitrageEngine } from "@/services/arbitrage-engine";
import { normalizeOrderBook } from "@/lib/polymarket-helpers";
import type { MarketOrderBook } from "@/lib/orderbook";

export const dynamic = "force-dynamic";

/**
 * POST /api/arbitrage/calculate
 * Calculate arbitrage between TWO specific markets
 * Body: { market1Id, market2Id, correlationType: "SAME" | "OPPOSITE" }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { market1Id, market2Id, correlationType = "SAME" } = body;

    if (!market1Id || !market2Id) {
      return NextResponse.json(
        { success: false, error: "Both market1Id and market2Id are required" },
        { status: 400 }
      );
    }

    console.log(`[Arbitrage] Calculating for markets ${market1Id} and ${market2Id}`);

    // Fetch orderbooks for both markets
    const [ob1, ob2] = await Promise.all([
      polymarket.getOrderBookForToken(market1Id),
      polymarket.getOrderBookForToken(market2Id),
    ]);

    if (!ob1 || !ob2) {
      return NextResponse.json(
        { success: false, error: "Failed to fetch orderbooks" },
        { status: 500 }
      );
    }

    // Normalize orderbooks
    const market1OrderBook = normalizeOrderBook(ob1, market1Id, "Market 1") as MarketOrderBook | null;
    const market2OrderBook = normalizeOrderBook(ob2, market2Id, "Market 2") as MarketOrderBook | null;

    if (!market1OrderBook || !market2OrderBook) {
      return NextResponse.json(
        { success: false, error: "Failed to normalize orderbooks" },
        { status: 500 }
      );
    }

    // Calculate arbitrage
    const opportunity = arbitrageEngine.calculateArbitrage(
      market1OrderBook,
      market2OrderBook,
      correlationType as "SAME" | "OPPOSITE"
    );

    return NextResponse.json({
      success: true,
      opportunity,
      market1OrderBook: {
        bestBid: market1OrderBook.yes.bids[0]?.price || 0,
        bestAsk: market1OrderBook.yes.asks[0]?.price || 0,
        bidDepth: market1OrderBook.yes.bids.length,
        askDepth: market1OrderBook.yes.asks.length,
      },
      market2OrderBook: {
        bestBid: market2OrderBook.yes.bids[0]?.price || 0,
        bestAsk: market2OrderBook.yes.asks[0]?.price || 0,
        bidDepth: market2OrderBook.yes.bids.length,
        askDepth: market2OrderBook.yes.asks.length,
      },
    });
  } catch (error) {
    console.error("[Arbitrage] Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to calculate arbitrage" },
      { status: 500 }
    );
  }
}
