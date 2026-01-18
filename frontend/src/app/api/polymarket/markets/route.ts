import { NextResponse } from "next/server";
import { polymarket } from "@/services/polymarket-client";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const limit = parseInt(searchParams.get("limit") || "10");

        // Fetch real markets from Gamma API via our service
        const events = await polymarket.getTopMarkets(limit);

        // Transform Gamma Data to our Dashboard 'Market' shape
        // Gamma returns 'events' which contain 'markets'. We usually want the main market of the event.
        const mappedMarkets = events.map((event: any) => {
            // Usually the first market is the main binary (e.g. Winner)
            const market = event.markets?.[0];
            if (!market) return null;

            // Calculate a rough internal spread if we have bid/ask
            // Gamma API might not return full orderbook, but often returns "bestBid" / "bestAsk" or similar stats.
            // If not available, we use 0 for now until we query CLOB.
            // Looking at standard Gamma response, it has 'volume', 'group', 'question'.

            // For the mock replacement, we'll map what we can.
            // We use the 'outcomePrices' to guess the price.
            // outcomePrices is often ["0.55", "0.45"]

            const yesPrice = parseFloat(market.outcomePrices?.[0] || "0");
            const noPrice = parseFloat(market.outcomePrices?.[1] || "0"); // Or 1-yesPrice

            // Internal Spread (Simulated for display if not provided)
            // Real spread requires bestBid/bestAsk which might be in `market.clobTokenIds` -> CLOB lookup.
            // For listing, we'll just set it to a placeholder or calculated from Yes/No sum deviation if meaningful? 
            // Actually, let's just use 0 or "N/A" if we don't have deep book data yet. 
            // OR, we can just display the spread as "0.0%" for now to start clean.

            return {
                id: market.id || "unknown",
                question: event.title || "Unknown Market",
                volume: `$${(event.volume / 1000000).toFixed(1)}M`, // Rough formatting
                spread: 0, // Placeholder until we fetch Book
                polymarketPrice: yesPrice,
                kalshiPrice: 0, // No Kalshi data yet
                category: event.tags?.[0]?.label || "General",
            };
        }).filter((m: any) => m !== null);

        return NextResponse.json({
            success: true,
            markets: mappedMarkets
        });
    } catch (error) {
        console.error("API Error:", error);
        return NextResponse.json(
            { success: false, error: "Failed to fetch markets" },
            { status: 500 }
        );
    }
}
