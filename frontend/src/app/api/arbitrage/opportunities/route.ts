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
    const prompt = `You are a logic validator for a prediction-market arbitrage tool.

Your task is to classify the EXACT logical relationship between two prediction market questions.

CRITICAL RULES:
- Do NOT use correlation, likelihood, or intuition.
- Only consider whether there is a HARD logical constraint at resolution.
- Assume markets resolve strictly based on their wording.
- If there is any uncertainty, choose UNRELATED.
- Be conservative: false positives are worse than false negatives.

You may ONLY choose one of the following relationship labels:

1. EQUIVALENT
   - Both markets always resolve the same way.

2. IMPLIES_A_TO_B
   - If Market A resolves YES, Market B MUST resolve YES.

3. IMPLIES_B_TO_A
   - If Market B resolves YES, Market A MUST resolve YES.

4. SUBSET
   - One market is strictly a subset of the other (e.g., shorter time horizon, stricter condition).

5. SUPERSET
   - One market strictly contains the other.

6. MUTUALLY_EXCLUSIVE
   - Both markets cannot resolve YES at the same time.

7. UNRELATED
   - No guaranteed logical constraint exists.

Market A:
"${q1}"

Market B:
"${q2}"

Return your response ONLY as valid JSON with the following fields:
{
  "relationship": "<ONE_LABEL_FROM_ABOVE>",
  "explanation": "<1–2 sentence explanation of the logical reasoning>",
  "confidence": <number between 0 and 1>
}

If you are unsure or the relationship depends on unstated assumptions, choose UNRELATED.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are a strict logic validator. Only identify HARD logical constraints between prediction markets. Never use correlation, probability, or intuition. Be conservative - when in doubt, return UNRELATED."
        },
        { role: "user", content: prompt }
      ],
      temperature: 0.1, // Very low for consistent logical analysis
      response_format: { type: "json_object" },
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    
    console.log(`[LLM] "${q1.substring(0, 40)}..." vs "${q2.substring(0, 40)}..." => ${result.relationship} (${result.confidence})`);
    
    // Only accept relationships with high confidence that enable arbitrage
    if (result.relationship === "UNRELATED" || result.confidence < 0.7) {
      return null;
    }

    // Map logical relationships to arbitrage correlation types
    let correlationType: "SAME" | "OPPOSITE";
    switch (result.relationship) {
      case "EQUIVALENT":
      case "IMPLIES_A_TO_B":
      case "IMPLIES_B_TO_A":
      case "SUBSET":
      case "SUPERSET":
        correlationType = "SAME";
        break;
      case "MUTUALLY_EXCLUSIVE":
        correlationType = "OPPOSITE";
        break;
      default:
        return null;
    }

    return {
      correlationType,
      reasoning: `[${result.relationship}] ${result.explanation}`,
    };
  } catch (error) {
    console.error("[LLM] Correlation detection error:", error);
    return null;
  }
}
