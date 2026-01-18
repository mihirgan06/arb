import { NextResponse } from "next/server";
import { arbitrageEngine } from "@/services/arbitrage-engine";
import { polymarket } from "@/services/polymarket-client";
import type { MarketOrderBook } from "@/lib/orderbook";
import { extractTokenIds, normalizeOrderBook } from "@/lib/polymarket-helpers";
import { supabase, upsertCorrelation, type CachedCorrelation } from "@/lib/supabase";
import OpenAI from "openai";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minute timeout for background scraping

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Background scraper - runs continuously to find and cache correlations
export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const maxCalls = parseInt(searchParams.get("maxCalls") || "50");
    
    console.log(`[Scraper] Starting background scrape with max ${maxCalls} LLM calls...`);

    const events = await polymarket.getTopMarkets(50);
    if (!events || events.length < 1) {
      return NextResponse.json({ success: true, message: "No events found", newCorrelations: 0 });
    }

    interface MarketInfo { 
      id: string; 
      question: string; 
      tokenYes: string; 
      eventTitle: string;
      yesPrice: number;
      noPrice: number;
    }
    const markets: MarketInfo[] = [];

    for (const event of events) {
      if (!event.markets) continue;
      let countForEvent = 0;
      for (const market of event.markets) {
        if (countForEvent >= 3) break;
        const tokenIds = extractTokenIds(market);
        if (tokenIds.yes) {
          let outcomePrices = market.outcomePrices;
          if (typeof outcomePrices === 'string') {
            outcomePrices = JSON.parse(outcomePrices);
          }
          markets.push({
            id: market.id || market.slug,
            question: market.question || event.title,
            tokenYes: tokenIds.yes,
            eventTitle: event.title || "",
            yesPrice: parseFloat(outcomePrices?.[0] || "0.5"),
            noPrice: parseFloat(outcomePrices?.[1] || "0.5"),
          });
          countForEvent++;
        }
      }
    }

    console.log(`[Scraper] ${markets.length} markets loaded`);

    // Get existing pairs from Supabase to avoid rechecking
    const { data: existingPairs } = await supabase
      .from('correlated_pairs')
      .select('market1_id, market2_id');
    
    const existingKeys = new Set(
      (existingPairs || []).map(p => [p.market1_id, p.market2_id].sort().join('-'))
    );

    const getKeywords = (q: string) => {
      const words = q.toLowerCase().match(/\b\w{4,}\b/g) || [];
      return new Set(words.filter(w => !['will', 'the', 'win', 'by', 'for', 'and'].includes(w)));
    };

    let llmCalls = 0;
    let newCorrelations = 0;
    const results: string[] = [];

    for (const market of markets) {
      if (llmCalls >= maxCalls) break;
      const marketKeywords = getKeywords(market.question);

      for (const other of markets) {
        if (llmCalls >= maxCalls) break;
        if (market.id === other.id) continue;
        
        const key = [market.id, other.id].sort().join("-");
        if (existingKeys.has(key)) continue; // Skip already checked pairs
        
        const otherKeywords = getKeywords(other.question);
        const sharedKeywords = [...marketKeywords].filter(k => otherKeywords.has(k));
        if (sharedKeywords.length < 2) continue;

        llmCalls++;
        console.log(`[Scraper] LLM Call ${llmCalls}/${maxCalls}: ${sharedKeywords.join(', ')}`);
        
        const correlation = await detectCorrelationWithLLM(market.question, other.question);
        
        if (correlation) {
          // Try to fetch orderbooks and calculate profit
          let hasLiquidity = false;
          let profitAt100 = null;

          try {
            const [ob1, ob2] = await Promise.all([
              polymarket.getOrderBookForToken(market.tokenYes),
              polymarket.getOrderBookForToken(other.tokenYes),
            ]);

            if (ob1 && ob2) {
              const orderbook1 = normalizeOrderBook(ob1, market.id, market.question) as MarketOrderBook | null;
              const orderbook2 = normalizeOrderBook(ob2, other.id, other.question) as MarketOrderBook | null;
              
              if (orderbook1 && orderbook2 && orderbook1.yes.bids.length && orderbook2.yes.bids.length) {
                hasLiquidity = true;
                const opp = arbitrageEngine.calculateArbitrage(orderbook1, orderbook2, correlation.type);
                if (opp) {
                  profitAt100 = opp.profitAt100Shares;
                }
              }
            }
          } catch (e) {
            console.log(`[Scraper] Orderbook fetch failed for pair`);
          }

          // Save to Supabase regardless of liquidity (so we don't recheck)
          const cached: CachedCorrelation = {
            market1_id: market.id,
            market1_question: market.question,
            market1_token_yes: market.tokenYes,
            market1_yes_price: market.yesPrice,
            market1_no_price: market.noPrice,
            market2_id: other.id,
            market2_question: other.question,
            market2_token_yes: other.tokenYes,
            market2_yes_price: other.yesPrice,
            market2_no_price: other.noPrice,
            correlation_type: correlation.type,
            reasoning: correlation.reasoning,
            has_liquidity: hasLiquidity,
            profit_at_100_shares: profitAt100,
            last_checked: new Date().toISOString(),
          };

          await upsertCorrelation(cached);
          newCorrelations++;
          results.push(`✅ ${market.question.substring(0, 40)}... + ${other.question.substring(0, 40)}... (liquidity: ${hasLiquidity}, profit: $${profitAt100?.toFixed(2) || 'N/A'})`);
        }

        existingKeys.add(key); // Mark as checked
      }
    }

    console.log(`[Scraper] Complete. ${llmCalls} LLM calls, ${newCorrelations} new correlations found`);

    return NextResponse.json({ 
      success: true, 
      llmCalls,
      newCorrelations,
      results,
    });
  } catch (error) {
    console.error("[Scraper] Error:", error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

async function detectCorrelationWithLLM(q1: string, q2: string): Promise<{ type: "SAME" | "OPPOSITE"; reasoning: string } | null> {
  try {
    const prompt = `Analyze if these prediction markets are correlated for arbitrage:

Market 1: "${q1}"
Market 2: "${q2}"

VALID correlations (return correlated=true):
- Direct causal link (e.g., "Trump wins" → "Vance becomes VP")
- Same event, different thresholds (e.g., "BTC > $100k" + "BTC > $95k")
- Same event, different dates (e.g., "Ceasefire by Jan 31" + "Ceasefire by Mar 31")

INVALID - DO NOT correlate (return correlated=false):
- Mutually exclusive (competing nominations/winners for same position)
- Independent events (winning nomination ≠ winning election)
- Different entities in same category (different teams, different people)

Return JSON:
{"correlated": true/false, "type": "SAME"|"OPPOSITE", "reasoning": "brief explanation"}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      response_format: { type: "json_object" },
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    
    if (result.correlated && result.type && result.reasoning) {
      return { type: result.type, reasoning: result.reasoning };
    }
    
    return null;
  } catch (error) {
    console.error("[Scraper] LLM error:", error);
    return null;
  }
}
