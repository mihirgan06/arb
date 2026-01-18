import { NextResponse } from "next/server";
import { arbitrageEngine } from "@/services/arbitrage-engine";
import { polymarket } from "@/services/polymarket-client";
import type { MarketOrderBook } from "@/lib/orderbook";
import { normalizeOrderBook } from "@/lib/polymarket-helpers";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "0");
    const limit = parseInt(searchParams.get("limit") || "15");
    const skipCache = searchParams.get("skipCache") === "true";

    // Step 1: Try to load from Supabase cache (instant!)
    if (!skipCache) {
      console.log("[API] Checking Supabase cache...");
      const { data: cachedPairs, error } = await supabase
        .from('correlated_pairs')
        .select('*')
        .eq('has_liquidity', true)
        .neq('correlation_type', 'NONE')
        .gt('profit_at_100_shares', 0)
        .order('profit_at_100_shares', { ascending: false })
        .range(page * limit, (page + 1) * limit - 1);

      if (!error && cachedPairs && cachedPairs.length > 0) {
        console.log(`[API] Found ${cachedPairs.length} cached opportunities`);
        
        // Convert cached data to full opportunities by fetching fresh orderbooks
        const opportunities = await Promise.all(
          cachedPairs.map(async (cached) => {
            try {
              const [ob1, ob2] = await Promise.all([
                polymarket.getOrderBookForToken(cached.market1_token_yes),
                polymarket.getOrderBookForToken(cached.market2_token_yes),
              ]);

              if (!ob1 || !ob2) return null;

              const orderbook1 = normalizeOrderBook(ob1, cached.market1_id, cached.market1_question) as MarketOrderBook | null;
              const orderbook2 = normalizeOrderBook(ob2, cached.market2_id, cached.market2_question) as MarketOrderBook | null;

              if (!orderbook1 || !orderbook2) return null;
              if (!orderbook1.yes.bids.length || !orderbook2.yes.bids.length) return null;

              const opp = arbitrageEngine.calculateArbitrage(orderbook1, orderbook2, cached.correlation_type as "SAME" | "OPPOSITE");
              if (!opp || opp.profitAt100Shares <= 0) return null;

              return {
                ...opp,
                market1YesDisplayPrice: cached.market1_yes_price,
                market1NoDisplayPrice: cached.market1_no_price,
                market2YesDisplayPrice: cached.market2_yes_price,
                market2NoDisplayPrice: cached.market2_no_price,
                correlation: {
                  type: cached.correlation_type,
                  confidence: 0.9,
                  reasoning: cached.reasoning,
                },
              };
            } catch (e) {
              console.log(`[API] Failed to refresh orderbook for cached pair`);
              return null;
            }
          })
        );

        const validOpps = opportunities.filter(o => o !== null);
        
        // Get total count
        const { count } = await supabase
          .from('correlated_pairs')
          .select('*', { count: 'exact', head: true })
          .eq('has_liquidity', true)
          .neq('correlation_type', 'NONE')
          .gt('profit_at_100_shares', 0);

        return NextResponse.json({
          success: true,
          opportunities: validOpps,
          totalOpportunities: count || validOpps.length,
          hasMore: (page + 1) * limit < (count || 0),
          page,
          fromCache: true,
        });
      }
    }

    // Step 2: No cache - return empty and let frontend trigger scraper
    console.log("[API] No cached data found. Frontend should trigger /api/arbitrage/scraper");
    
    return NextResponse.json({
      success: true,
      opportunities: [],
      totalOpportunities: 0,
      hasMore: false,
      page,
      fromCache: false,
      message: "No cached opportunities. Run the scraper to find new ones.",
    });

  } catch (error) {
    console.error("[API] Error:", error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
