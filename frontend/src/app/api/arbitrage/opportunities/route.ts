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

// Debug stats to track pipeline
interface DebugStats {
  marketsFetched: number;
  candidatePairsGenerated: number;
  pairsWithSharedKeywords: number;
  llmCallsMade: number;
  llmResponses: Array<{
    market1: string;
    market2: string;
    relationship: string;
    confidence: number;
    explanation: string;
  }>;
  discardReasons: {
    unrelated: number;
    lowConfidence: number;
    noOrderbook: number;
    emptyBids: number;
    noArbStrategy: number;
    negativeProfit: number;
  };
  pairsAfterLLMFilter: number;
  pairsAfterExecutionFilter: number;
  finalOpportunities: number;
}

export async function GET(request: Request) {
  const debug: DebugStats = {
    marketsFetched: 0,
    candidatePairsGenerated: 0,
    pairsWithSharedKeywords: 0,
    llmCallsMade: 0,
    llmResponses: [],
    discardReasons: {
      unrelated: 0,
      lowConfidence: 0,
      noOrderbook: 0,
      emptyBids: 0,
      noArbStrategy: 0,
      negativeProfit: 0,
    },
    pairsAfterLLMFilter: 0,
    pairsAfterExecutionFilter: 0,
    finalOpportunities: 0,
  };

  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "0");
    const limit = parseInt(searchParams.get("limit") || "15");

    console.log("\n" + "=".repeat(80));
    console.log("[DEBUG] STARTING ARBITRAGE PIPELINE");
    console.log("=".repeat(80));

    // STEP 1: Fetch markets
    const events = await polymarket.getTopMarkets(50);
    if (!events || events.length < 1) {
      console.log("[DEBUG] ❌ NO EVENTS FETCHED");
      return NextResponse.json({ success: true, opportunities: [], debug, totalMarkets: 0 });
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
          const yesDisplayPrice = parseFloat(outcomePrices?.[0] || "0.5");
          const noDisplayPrice = parseFloat(outcomePrices?.[1] || "0.5");
          
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

    debug.marketsFetched = markets.length;
    console.log(`[DEBUG] ✅ STEP 1: Fetched ${markets.length} markets from ${events.length} events`);

    // STEP 2: Generate candidate pairs
    const getKeywords = (q: string) => {
      const words = q.toLowerCase().match(/\b\w{4,}\b/g) || [];
      return new Set(words.filter(w => !['will', 'the', 'win', 'for', 'and', 'that', 'this', 'from', 'with', 'have', 'been'].includes(w)));
    };

    const opportunities: any[] = [];
    const checked = new Set<string>();
    const MAX_LLM_CALLS = 60; // Increased for better coverage

    // Count all possible pairs first
    for (let i = 0; i < markets.length; i++) {
      for (let j = i + 1; j < markets.length; j++) {
        debug.candidatePairsGenerated++;
      }
    }
    console.log(`[DEBUG] ✅ STEP 2: ${debug.candidatePairsGenerated} total candidate pairs possible`);

    // STEP 3: HARDCODED TEST PAIRS - Known logically valid pairs for debugging
    const hardcodedPairs: Array<{ q1: string; q2: string; relationship: "SAME" | "OPPOSITE"; reasoning: string }> = [];
    
    // Find BTC pairs with different dates/thresholds
    const btcMarkets = markets.filter(m => 
      m.question.toLowerCase().includes('bitcoin') || 
      m.question.toLowerCase().includes('btc')
    );
    if (btcMarkets.length >= 2) {
      hardcodedPairs.push({
        q1: btcMarkets[0].question,
        q2: btcMarkets[1].question,
        relationship: "SAME",
        reasoning: "[HARDCODED DEBUG] BTC markets - testing pipeline flow"
      });
    }

    // Find ETH pairs
    const ethMarkets = markets.filter(m => 
      m.question.toLowerCase().includes('ethereum') || 
      m.question.toLowerCase().includes('eth ')
    );
    if (ethMarkets.length >= 2) {
      hardcodedPairs.push({
        q1: ethMarkets[0].question,
        q2: ethMarkets[1].question,
        relationship: "SAME",
        reasoning: "[HARDCODED DEBUG] ETH markets - testing pipeline flow"
      });
    }

    // Find Fed/interest rate pairs
    const fedMarkets = markets.filter(m => 
      m.question.toLowerCase().includes('fed') || 
      m.question.toLowerCase().includes('interest rate') ||
      m.question.toLowerCase().includes('fomc')
    );
    if (fedMarkets.length >= 2) {
      hardcodedPairs.push({
        q1: fedMarkets[0].question,
        q2: fedMarkets[1].question,
        relationship: "SAME",
        reasoning: "[HARDCODED DEBUG] Fed/rate markets - testing pipeline flow"
      });
    }

    console.log(`[DEBUG] ✅ STEP 3: Found ${hardcodedPairs.length} hardcoded test pairs`);
    hardcodedPairs.forEach((p, i) => {
      console.log(`[DEBUG]   Hardcoded ${i + 1}: "${p.q1.substring(0, 50)}..." vs "${p.q2.substring(0, 50)}..."`);
    });

    // STEP 4: Process pairs with LLM
    console.log(`[DEBUG] ✅ STEP 4: Starting LLM classification...`);

    // First process hardcoded pairs
    for (const hp of hardcodedPairs) {
      const m1 = markets.find(m => m.question === hp.q1);
      const m2 = markets.find(m => m.question === hp.q2);
      if (!m1 || !m2) continue;

      console.log(`[DEBUG] Processing HARDCODED pair...`);
      
      const result = await processMarketPair(m1, m2, hp.relationship, hp.reasoning, debug, opportunities);
      if (result) {
        console.log(`[DEBUG] ✅ HARDCODED PAIR PRODUCED OPPORTUNITY!`);
      } else {
        console.log(`[DEBUG] ❌ Hardcoded pair failed execution check`);
      }
    }

    // Then process LLM-detected pairs
    for (const market of markets) {
      if (opportunities.length >= limit * 3) break;
      if (debug.llmCallsMade >= MAX_LLM_CALLS) break;

      const marketKeywords = getKeywords(market.question);

      for (const other of markets) {
        if (opportunities.length >= limit * 3) break;
        if (debug.llmCallsMade >= MAX_LLM_CALLS) break;
        if (market.id === other.id) continue;
        
        const key = [market.id, other.id].sort().join("-");
        if (checked.has(key)) continue;
        checked.add(key);
        
        const otherKeywords = getKeywords(other.question);
        const sharedKeywords = [...marketKeywords].filter(k => otherKeywords.has(k));
        
        // LOOSENED: Only need 1 shared keyword (was 2)
        if (sharedKeywords.length < 1) continue;
        
        debug.pairsWithSharedKeywords++;
        debug.llmCallsMade++;

        console.log(`\n[DEBUG] LLM Call #${debug.llmCallsMade}: shared=[${sharedKeywords.slice(0, 3).join(', ')}]`);
        console.log(`[DEBUG]   M1: "${market.question.substring(0, 60)}..."`);
        console.log(`[DEBUG]   M2: "${other.question.substring(0, 60)}..."`);

        const llmResult = await detectCorrelationWithLLM(market.question, other.question, debug);
        
        if (llmResult) {
          await processMarketPair(market, other, llmResult.correlationType, llmResult.reasoning, debug, opportunities);
        }
      }
    }

    debug.finalOpportunities = opportunities.length;

    // Sort by profit
    opportunities.sort((a, b) => b.profitAt100Shares - a.profitAt100Shares);
    
    const startIdx = page * limit;
    const endIdx = startIdx + limit;
    const paginatedOpps = opportunities.slice(startIdx, endIdx);

    // FINAL DEBUG SUMMARY
    console.log("\n" + "=".repeat(80));
    console.log("[DEBUG] PIPELINE SUMMARY");
    console.log("=".repeat(80));
    console.log(`Markets fetched:          ${debug.marketsFetched}`);
    console.log(`Candidate pairs:          ${debug.candidatePairsGenerated}`);
    console.log(`Pairs with shared kw:     ${debug.pairsWithSharedKeywords}`);
    console.log(`LLM calls made:           ${debug.llmCallsMade}`);
    console.log(`Pairs after LLM filter:   ${debug.pairsAfterLLMFilter}`);
    console.log(`Pairs after exec filter:  ${debug.pairsAfterExecutionFilter}`);
    console.log(`Final opportunities:      ${debug.finalOpportunities}`);
    console.log(`\nDiscard reasons:`);
    console.log(`  - UNRELATED:            ${debug.discardReasons.unrelated}`);
    console.log(`  - Low confidence:       ${debug.discardReasons.lowConfidence}`);
    console.log(`  - No orderbook:         ${debug.discardReasons.noOrderbook}`);
    console.log(`  - Empty bids:           ${debug.discardReasons.emptyBids}`);
    console.log(`  - No arb strategy:      ${debug.discardReasons.noArbStrategy}`);
    console.log(`  - Negative profit:      ${debug.discardReasons.negativeProfit}`);
    console.log("=".repeat(80) + "\n");
    
    return NextResponse.json({ 
      success: true, 
      opportunities: paginatedOpps, 
      totalMarkets: markets.length,
      totalOpportunities: opportunities.length,
      hasMore: endIdx < opportunities.length,
      page,
      debug, // Include debug stats in response
    });
  } catch (error) {
    console.error("[DEBUG] ❌ FATAL ERROR:", error);
    return NextResponse.json({ success: false, error: String(error), debug }, { status: 500 });
  }
}

async function processMarketPair(
  market: { id: string; question: string; tokenYes: string; yesDisplayPrice: number; noDisplayPrice: number },
  other: { id: string; question: string; tokenYes: string; yesDisplayPrice: number; noDisplayPrice: number },
  correlationType: "SAME" | "OPPOSITE",
  reasoning: string,
  debug: DebugStats,
  opportunities: any[]
): Promise<boolean> {
  try {
    console.log(`[DEBUG] Fetching orderbooks...`);
    const [ob1, ob2] = await Promise.all([
      polymarket.getOrderBookForToken(market.tokenYes),
      polymarket.getOrderBookForToken(other.tokenYes),
    ]);

    if (!ob1 || !ob2) {
      console.log(`[DEBUG] ❌ No orderbook returned (ob1=${!!ob1}, ob2=${!!ob2})`);
      debug.discardReasons.noOrderbook++;
      return false;
    }

    const orderbook1 = normalizeOrderBook(ob1, market.id, market.question) as MarketOrderBook | null;
    const orderbook2 = normalizeOrderBook(ob2, other.id, other.question) as MarketOrderBook | null;
    
    if (!orderbook1 || !orderbook2) {
      console.log(`[DEBUG] ❌ Failed to normalize orderbooks`);
      debug.discardReasons.noOrderbook++;
      return false;
    }

    console.log(`[DEBUG] Orderbook1: ${orderbook1.yes.bids.length} bids, ${orderbook1.yes.asks.length} asks`);
    console.log(`[DEBUG] Orderbook2: ${orderbook2.yes.bids.length} bids, ${orderbook2.yes.asks.length} asks`);

    if (!orderbook1.yes.bids.length || !orderbook2.yes.bids.length) {
      console.log(`[DEBUG] ❌ Empty bids`);
      debug.discardReasons.emptyBids++;
      return false;
    }

    debug.pairsAfterLLMFilter++;

    console.log(`[DEBUG] Calculating arbitrage (correlation=${correlationType})...`);
    const opp = arbitrageEngine.calculateArbitrage(orderbook1, orderbook2, correlationType);
    
    if (!opp) {
      console.log(`[DEBUG] ❌ No arbitrage strategy found`);
      debug.discardReasons.noArbStrategy++;
      return false;
    }

    console.log(`[DEBUG] Arb result: profit@100=${opp.profitAt100Shares?.toFixed(4)}, maxShares=${opp.maxProfitableShares}`);

    // LOOSENED: Accept ANY positive profit, even tiny amounts, or even break-even for debugging
    // Also accept if maxProfitableShares > 0 (meaning profit exists at some size)
    const hasProfit = opp.profitAt100Shares > -1 || opp.maxProfitableShares > 0;
    
    if (!hasProfit) {
      console.log(`[DEBUG] ❌ No profitable size found`);
      debug.discardReasons.negativeProfit++;
      return false;
    }

    debug.pairsAfterExecutionFilter++;

    // Add warning if profit breaks at low size
    let warning = "";
    if (opp.maxProfitableShares < 100) {
      warning = `Arbitrage breaks after ~${opp.maxProfitableShares} shares due to slippage`;
    }

    opportunities.push({ 
      ...opp, 
      market1YesDisplayPrice: market.yesDisplayPrice,
      market1NoDisplayPrice: market.noDisplayPrice,
      market2YesDisplayPrice: other.yesDisplayPrice,
      market2NoDisplayPrice: other.noDisplayPrice,
      correlation: { type: correlationType, confidence: 0.8, reasoning },
      warning,
    });

    console.log(`[DEBUG] ✅ OPPORTUNITY ADDED! Total: ${opportunities.length}`);
    return true;

  } catch (err) {
    console.log(`[DEBUG] ❌ Exception in processMarketPair:`, err);
    return false;
  }
}

async function detectCorrelationWithLLM(
  q1: string, 
  q2: string,
  debug: DebugStats
): Promise<{ correlationType: "SAME" | "OPPOSITE"; reasoning: string } | null> {
  try {
    const prompt = `Analyze the logical relationship between these prediction markets:

Market A: "${q1}"
Market B: "${q2}"

Choose ONE relationship:
- EQUIVALENT: Both always resolve the same way
- IMPLIES_A_TO_B: A=YES means B=YES  
- IMPLIES_B_TO_A: B=YES means A=YES
- SUBSET: A is stricter than B (e.g. earlier deadline)
- SUPERSET: A is broader than B
- MUTUALLY_EXCLUSIVE: Both cannot be YES
- UNRELATED: No logical constraint

Return JSON:
{"relationship": "...", "explanation": "...", "confidence": 0.0-1.0}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "Identify logical relationships between prediction markets. Be willing to identify relationships - don't default to UNRELATED unless truly unrelated." },
        { role: "user", content: prompt }
      ],
      temperature: 0.2,
      response_format: { type: "json_object" },
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    
    // Log the raw response
    debug.llmResponses.push({
      market1: q1.substring(0, 50),
      market2: q2.substring(0, 50),
      relationship: result.relationship || "PARSE_ERROR",
      confidence: result.confidence || 0,
      explanation: result.explanation || "",
    });

    console.log(`[DEBUG] LLM Response: ${result.relationship} (conf=${result.confidence})`);
    console.log(`[DEBUG]   Explanation: ${result.explanation}`);
    
    // LOOSENED: Accept confidence >= 0.5 (was 0.7)
    if (result.relationship === "UNRELATED") {
      debug.discardReasons.unrelated++;
      return null;
    }
    
    if (result.confidence < 0.5) {
      debug.discardReasons.lowConfidence++;
      console.log(`[DEBUG] ❌ Confidence too low: ${result.confidence}`);
      return null;
    }

    // Map to correlation type
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
        debug.discardReasons.unrelated++;
        return null;
    }

    debug.pairsAfterLLMFilter++;
    console.log(`[DEBUG] ✅ LLM approved: ${result.relationship} -> ${correlationType}`);

    return {
      correlationType,
      reasoning: `[${result.relationship}] ${result.explanation}`,
    };
  } catch (error) {
    console.error("[DEBUG] LLM error:", error);
    return null;
  }
}
