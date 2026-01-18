import { NextResponse } from "next/server";
import { polymarket } from "@/services/polymarket-client";
import { arbitrageEngine } from "@/services/arbitrage-engine";
import { normalizeOrderBook } from "@/lib/polymarket-helpers";
import type { MarketOrderBook } from "@/lib/orderbook";

export const dynamic = "force-dynamic";

// Compare exactly 2 markets for arbitrage - called when user selects them
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { market1, market2, correlationType = "SAME" } = body;

    if (!market1?.tokenId || !market2?.tokenId) {
      return NextResponse.json(
        { success: false, error: "Both markets must have token IDs" },
        { status: 400 }
      );
    }

    console.log(`[Compare] Fetching orderbooks for ${market1.question?.slice(0, 40)}... vs ${market2.question?.slice(0, 40)}...`);

    // Fetch orderbooks for both markets
    const [orderbook1Raw, orderbook2Raw] = await Promise.all([
      polymarket.getOrderBookForToken(market1.tokenId),
      polymarket.getOrderBookForToken(market2.tokenId),
    ]);

    if (!orderbook1Raw || !orderbook2Raw) {
      return NextResponse.json({
        success: false,
        error: "Failed to fetch orderbooks",
      });
    }

    // Normalize orderbooks
    const market1OrderBook = normalizeOrderBook(
      orderbook1Raw,
      market1.id,
      market1.question
    ) as MarketOrderBook;

    const market2OrderBook = normalizeOrderBook(
      orderbook2Raw,
      market2.id,
      market2.question
    ) as MarketOrderBook;

    if (!market1OrderBook || !market2OrderBook) {
      return NextResponse.json({
        success: false,
        error: "Failed to normalize orderbooks",
      });
    }

    // Calculate arbitrage
    const opportunity = arbitrageEngine.calculateArbitrage(
      market1OrderBook,
      market2OrderBook,
      correlationType
    );

    return NextResponse.json({
      success: true,
      opportunity,
      market1OrderBook: {
        yesBestBid: market1OrderBook.yes.bids[0]?.price || 0,
        yesBestAsk: market1OrderBook.yes.asks[0]?.price || 0,
        noBestBid: market1OrderBook.no.bids[0]?.price || 0,
        noBestAsk: market1OrderBook.no.asks[0]?.price || 0,
      },
      market2OrderBook: {
        yesBestBid: market2OrderBook.yes.bids[0]?.price || 0,
        yesBestAsk: market2OrderBook.yes.asks[0]?.price || 0,
        noBestBid: market2OrderBook.no.bids[0]?.price || 0,
        noBestAsk: market2OrderBook.no.asks[0]?.price || 0,
      },
    });
  } catch (error) {
    console.error("Compare API Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to compare markets" },
      { status: 500 }
    );
  }
}
