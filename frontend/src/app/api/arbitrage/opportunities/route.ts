import { NextResponse } from "next/server";
import { arbitrageEngine } from "@/services/arbitrage-engine";
import { polymarket } from "@/services/polymarket-client";
import type { MarketOrderBook } from "@/lib/orderbook";
import { extractTokenIds, normalizeOrderBook } from "@/lib/polymarket-helpers";
import OpenAI from "openai";

export const dynamic = "force-dynamic";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "0");
    const limit = parseInt(searchParams.get("limit") || "15");

    // Fetch more markets to have enough candidates for LLM pairing
    const events = await polymarket.getTopMarkets(50);
    if (!events || events.length < 1) {
      return NextResponse.json({ success: true, opportunities: [], totalMarkets: 0 });
    }

    interface MarketInfo { 
      id: string; 
      question: string; 
      tokenYes: string; 
      eventTitle: string;
      yesDisplayPrice: number;
      noDisplayPrice: number;
    }
    const markets: MarketInfo[] = [];

    // Max 3 markets per event to get diversity
    for (const event of events) {
      if (!event.markets) continue;
      let countForEvent = 0;
      for (const market of event.markets) {
        if (countForEvent >= 3) break; // Only 3 per event
        const tokenIds = extractTokenIds(market);
        if (tokenIds.yes) {
          // Parse outcomePrices from Gamma API (what Polymarket displays)
          let outcomePrices = market.outcomePrices;
          if (typeof outcomePrices === 'string') {
            outcomePrices = JSON.parse(outcomePrices);
          }
          const yesDisplayPrice = parseFloat(outcomePrices?.[0] || "0.5");
          const noDisplayPrice = parseFloat(outcomePrices?.[1] || "0.5");
          
          console.log(`[Price Debug] ${market.question}: YES=${yesDisplayPrice}, NO=${noDisplayPrice}, SUM=${(yesDisplayPrice + noDisplayPrice).toFixed(4)}`);
          
          markets.push({
            id: market.id || market.slug,
            question: market.question || event.title,
            tokenYes: tokenIds.yes,
            eventTitle: event.title || "",
            yesDisplayPrice,
            noDisplayPrice,
          });
          countForEvent++;
        }
      }
    }

    console.log(`[API] ${markets.length} markets from ${events.length} events`);

    // Pre-filter: Group markets by topic keywords for smarter pairing
    const getKeywords = (q: string) => {
      const words = q.toLowerCase().match(/\b\w{4,}\b/g) || [];
      return new Set(words.filter(w => !['will', 'the', 'win', 'by', 'for', 'and', 'or'].includes(w)));
    };

    const opportunities: any[] = [];
    const checked = new Set<string>();
    let llmCallCount = 0;
    let pairsChecked = 0;
    const MAX_LLM_CALLS = 40; // Limit LLM calls to save time and money (reduced for speed)

    console.log(`[API] Starting LLM correlation detection with smart pairing...`);

    for (const market of markets) {
      if (opportunities.length >= limit * 2) break;
      if (llmCallCount >= MAX_LLM_CALLS) break;

      const marketKeywords = getKeywords(market.question);

      for (const other of markets) {
        if (opportunities.length >= limit * 2) break;
        if (llmCallCount >= MAX_LLM_CALLS) break;
        if (market.id === other.id) continue;
        const key = [market.id, other.id].sort().join("-");
        if (checked.has(key)) continue;
        checked.add(key);
        
        // Pre-filter: Only check pairs with at least 2 shared keywords
        const otherKeywords = getKeywords(other.question);
        const sharedKeywords = [...marketKeywords].filter(k => otherKeywords.has(k));
        if (sharedKeywords.length < 2) continue;
        
        pairsChecked++;
        llmCallCount++;
        console.log(`[API] LLM Call ${llmCallCount}/${MAX_LLM_CALLS}: Pair ${pairsChecked} (shared: ${sharedKeywords.join(', ')})`);
        const result = await detectCorrelationWithLLM(market.question, other.question);
        if (!result) {
          console.log(`[API] ❌ No correlation`);
          continue;
        }

        console.log(`[API] ✅ FOUND: ${result.reasoning}`);

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
            opportunities.push({ 
              ...opp, 
              market1YesDisplayPrice: market.yesDisplayPrice,
              market1NoDisplayPrice: market.noDisplayPrice,
              market2YesDisplayPrice: other.yesDisplayPrice,
              market2NoDisplayPrice: other.noDisplayPrice,
              correlation: { type: result.correlationType, confidence: 0.8, reasoning: result.reasoning } 
            });
            break;
          }
        } catch { continue; }
      }
    }

    opportunities.sort((a, b) => b.profitAt100Shares - a.profitAt100Shares);
    const startIdx = page * limit;
    const endIdx = startIdx + limit;
    const paginatedOpps = opportunities.slice(startIdx, endIdx);
    
    return NextResponse.json({ 
      success: true, 
      opportunities: paginatedOpps, 
      totalMarkets: markets.length,
      totalOpportunities: opportunities.length,
      hasMore: endIdx < opportunities.length,
      page,
    });
  } catch (error) {
    console.error("[API] Error:", error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

async function detectCorrelationWithLLM(q1: string, q2: string): Promise<{ correlationType: "SAME" | "OPPOSITE"; reasoning: string } | null> {
  try {
    const prompt = `Analyze if these prediction markets are correlated for arbitrage:

Market 1: "${q1}"
Market 2: "${q2}"

VALID correlations:
- Direct causal link (e.g., "Trump wins" → "Vance becomes VP")
- Same event, different thresholds (e.g., "BTC > $100k" + "BTC > $95k")
- Same event, different dates (e.g., "Ceasefire by Jan 31" + "Ceasefire by Mar 31")

INVALID:
- Mutually exclusive (competing nominations/winners)
- Independent events (nomination ≠ election win)

Return JSON:
{"correlated": true/false, "type": "SAME"|"OPPOSITE", "reasoning": "brief explanation"}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      response_format: { type: "json_object" },
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    console.log(`[LLM] "${q1.substring(0, 40)}..." vs "${q2.substring(0, 40)}..." => ${result.correlated ? 'CORRELATED' : 'NOT CORRELATED'}`);
    
    if (result.correlated && result.type && result.reasoning) {
      return {
        correlationType: result.type,
        reasoning: result.reasoning,
      };
    }
    
    return null;
  } catch (error) {
    console.error("[LLM] Correlation detection error:", error);
    return null;
  }
}
