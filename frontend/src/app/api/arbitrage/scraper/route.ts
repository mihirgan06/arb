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
    const mode = searchParams.get("mode") || "batch"; // "batch" = one big prompt, "pairwise" = old way
    const maxEvents = parseInt(searchParams.get("maxEvents") || "100");
    const maxCalls = parseInt(searchParams.get("maxCalls") || "50");
    const targetArbs = parseInt(searchParams.get("targetArbs") || "0");
    
    console.log(`[Scraper] Starting ${mode} scrape with ${maxEvents} events...`);

    const events = await polymarket.getTopMarkets(maxEvents);
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

    // BATCH MODE: Send all questions to LLM at once
    if (mode === "batch") {
      return await batchFindCorrelations(markets, supabase);
    }
    
    // Otherwise fall through to pairwise mode...

    // Get existing pairs from Supabase to avoid rechecking
    const { data: existingPairs } = await supabase
      .from('correlated_pairs')
      .select('market1_id, market2_id');
    
    const existingKeys = new Set(
      (existingPairs || []).map(p => [p.market1_id, p.market2_id].sort().join('-'))
    );

    // Topic detection - group markets by what they're about
    const getTopic = (q: string): string | null => {
      const qLower = q.toLowerCase();
      if (/bitcoin|btc|\$\d+k/.test(qLower)) return 'bitcoin';
      if (/ceasefire/.test(qLower) && /russia|ukraine/.test(qLower)) return 'ukraine-ceasefire';
      if (/ceasefire/.test(qLower) && /israel|iran/.test(qLower)) return 'israel-iran';
      if (/fed\s|interest rate|bps/.test(qLower)) return 'fed-rates';
      if (/strike/.test(qLower) && /iran/.test(qLower)) return 'iran-strike';
      if (/microstrategy/.test(qLower)) return 'microstrategy';
      if (/el salvador/.test(qLower) && /btc|bitcoin/.test(qLower)) return 'el-salvador-btc';
      if (/super bowl/.test(qLower)) return 'superbowl';
      if (/presidential|nomination/.test(qLower) && /2028/.test(qLower)) return '2028-election';
      if (/invade|invasion/.test(qLower) && /venezuela/.test(qLower)) return 'venezuela';
      if (/gta\s*vi|gta\s*6/.test(qLower)) return 'gta6';
      return null;
    };

    const getKeywords = (q: string) => {
      const words = q.toLowerCase().match(/\b\w{4,}\b/g) || [];
      return new Set(words.filter(w => !['will', 'the', 'win', 'for', 'and', 'that', 'this', 'what', 'when', 'before', 'after'].includes(w)));
    };

    // Check if two questions are about the same topic with different date/threshold
    const isSameTopicPair = (q1: string, q2: string): boolean => {
      const topic1 = getTopic(q1);
      const topic2 = getTopic(q2);
      
      // Must be same topic and topic must be detected
      if (!topic1 || !topic2 || topic1 !== topic2) return false;
      
      // Skip super bowl and election (mutually exclusive candidates/teams)
      if (topic1 === 'superbowl' || topic1 === '2028-election') return false;
      
      return true;
    };

    let llmCalls = 0;
    let newCorrelations = 0;
    let profitableArbs = 0;
    const results: string[] = [];

    for (const market of markets) {
      if (llmCalls >= maxCalls) break;
      if (targetArbs > 0 && profitableArbs >= targetArbs) {
        console.log(`[Scraper] 🎯 Target reached! Found ${profitableArbs} profitable arbitrage opportunities`);
        break;
      }
      const marketKeywords = getKeywords(market.question);

      for (const other of markets) {
        if (llmCalls >= maxCalls) break;
        if (targetArbs > 0 && profitableArbs >= targetArbs) break;
        if (market.id === other.id) continue;
        
        const key = [market.id, other.id].sort().join("-");
        if (existingKeys.has(key)) continue; // Skip already checked pairs
        
        // ONLY compare markets that are about the SAME topic
        const sameTopicPair = isSameTopicPair(market.question, other.question);
        if (!sameTopicPair) continue;
        
        const topic = getTopic(market.question);
        console.log(`[Scraper] 🎯 Same topic pair (${topic}):`)

        llmCalls++;
        const shortQ1 = market.question.substring(0, 50);
        const shortQ2 = other.question.substring(0, 50);
        console.log(`[Scraper] LLM Call ${llmCalls}/${maxCalls}: topic=${topic}`);
        console.log(`  Q1: ${shortQ1}...`);
        console.log(`  Q2: ${shortQ2}...`);
        
        const correlation = await detectCorrelationWithLLM(market.question, other.question);
        
        // Save ALL pairs to Supabase (including rejected ones) so we don't recheck
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
          correlation_type: correlation?.type || 'NONE',
          reasoning: correlation?.reasoning || 'LLM rejected - not correlated',
          has_liquidity: false,
          profit_at_100_shares: null,
          last_checked: new Date().toISOString(),
        };

        if (correlation) {
          // Try to fetch orderbooks and calculate profit
          try {
            const [ob1, ob2] = await Promise.all([
              polymarket.getOrderBookForToken(market.tokenYes),
              polymarket.getOrderBookForToken(other.tokenYes),
            ]);

            if (ob1 && ob2) {
              const orderbook1 = normalizeOrderBook(ob1, market.id, market.question) as MarketOrderBook | null;
              const orderbook2 = normalizeOrderBook(ob2, other.id, other.question) as MarketOrderBook | null;
              
              if (orderbook1 && orderbook2 && orderbook1.yes.bids.length && orderbook2.yes.bids.length) {
                cached.has_liquidity = true;
                const opp = arbitrageEngine.calculateArbitrage(orderbook1, orderbook2, correlation.type);
                if (opp) {
                  cached.profit_at_100_shares = opp.profitAt100Shares;
                }
              }
            }
          } catch (e) {
            console.log(`  ⚠️  Orderbook fetch failed`);
          }

          newCorrelations++;
          const profitStr = cached.profit_at_100_shares ? `$${cached.profit_at_100_shares.toFixed(2)}` : 'N/A';
          console.log(`  ✅ CORRELATED (${correlation.type}) - liquidity: ${cached.has_liquidity}, profit: ${profitStr}`);
          console.log(`     Reason: ${correlation.reasoning}`);
          results.push(`✅ ${shortQ1}... + ${shortQ2}... (${correlation.type}, profit: ${profitStr})`);
          
          // Track profitable arbitrage opportunities
          if (cached.has_liquidity && cached.profit_at_100_shares && cached.profit_at_100_shares > 0) {
            profitableArbs++;
            console.log(`  💰 PROFITABLE ARBITRAGE #${profitableArbs} FOUND!`);
          }
        } else {
          console.log(`  ❌ REJECTED - not correlated`);
        }

        await upsertCorrelation(cached);
        existingKeys.add(key); // Mark as checked
      }
    }

    console.log(`[Scraper] Complete. ${llmCalls} LLM calls, ${newCorrelations} correlations, ${profitableArbs} profitable arbs`);

    return NextResponse.json({ 
      success: true, 
      llmCalls,
      newCorrelations,
      profitableArbs,
      results,
    });
  } catch (error) {
    console.error("[Scraper] Error:", error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

// BATCH MODE: Send all questions at once, ask LLM to find ALL correlated pairs
async function batchFindCorrelations(markets: Array<{id: string; question: string; tokenYes: string; yesPrice: number; noPrice: number}>, supabaseClient: typeof supabase) {
  // Process in batches of 60 markets max (to avoid token limits)
  const BATCH_SIZE = 60;
  const batches: typeof markets[] = [];
  for (let i = 0; i < markets.length; i += BATCH_SIZE) {
    batches.push(markets.slice(i, i + BATCH_SIZE));
  }
  
  console.log(`[Batch] Processing ${markets.length} markets in ${batches.length} batches of ~${BATCH_SIZE}`);
  
  let totalPairs = 0;
  let totalProfitable = 0;
  const allResults: string[] = [];

  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    const batchMarkets = batches[batchIdx];
    console.log(`\n[Batch ${batchIdx + 1}/${batches.length}] Processing ${batchMarkets.length} markets...`);
    
    const questionList = batchMarkets.map((m, i) => `${i + 1}. "${m.question}"`).join('\n');
  
    const prompt = `You are an arbitrage detector. Below are ${batchMarkets.length} prediction market questions.

Find ALL pairs that are correlated for arbitrage:

VALID correlations:
- Same event, different thresholds (BTC > $100k + BTC > $95k)
- Same event, different dates (Ceasefire by Jan + Ceasefire by Mar)
- Opposite outcomes (Fed cuts rates vs No change in Fed rates)

INVALID - skip these:
- Mutually exclusive (different teams/candidates for same position)
- Unrelated events sharing keywords

MARKETS:
${questionList}

Return JSON: {"pairs": [{"market1_idx": 1, "market2_idx": 5, "type": "SAME"|"OPPOSITE", "reasoning": "brief"}, ...]}
Only confident correlations. Max 20 pairs.`;

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
        response_format: { type: "json_object" },
        max_tokens: 2000,
      });

      const result = JSON.parse(response.choices[0].message.content || "{\"pairs\":[]}");
      const pairs = result.pairs || [];
      
      console.log(`[Batch ${batchIdx + 1}] LLM found ${pairs.length} pairs`);

      for (const pair of pairs) {
        const m1 = batchMarkets[pair.market1_idx - 1];
        const m2 = batchMarkets[pair.market2_idx - 1];
        
        if (!m1 || !m2) continue;

        console.log(`  Checking: ${m1.question.substring(0, 35)}... + ${m2.question.substring(0, 35)}...`);

        let hasLiquidity = false;
        let profitAt100: number | null = null;

        try {
          const [ob1, ob2] = await Promise.all([
            polymarket.getOrderBookForToken(m1.tokenYes),
            polymarket.getOrderBookForToken(m2.tokenYes),
          ]);

          if (ob1 && ob2) {
            const orderbook1 = normalizeOrderBook(ob1, m1.id, m1.question) as MarketOrderBook | null;
            const orderbook2 = normalizeOrderBook(ob2, m2.id, m2.question) as MarketOrderBook | null;
            
            if (orderbook1 && orderbook2 && orderbook1.yes.bids.length && orderbook2.yes.bids.length) {
              hasLiquidity = true;
              const opp = arbitrageEngine.calculateArbitrage(orderbook1, orderbook2, pair.type as "SAME" | "OPPOSITE");
              if (opp) profitAt100 = opp.profitAt100Shares;
            }
          }
        } catch (e) {
          console.log(`    ⚠️ Orderbook failed`);
        }

        const cached: CachedCorrelation = {
          market1_id: m1.id,
          market1_question: m1.question,
          market1_token_yes: m1.tokenYes,
          market1_yes_price: m1.yesPrice,
          market1_no_price: m1.noPrice,
          market2_id: m2.id,
          market2_question: m2.question,
          market2_token_yes: m2.tokenYes,
          market2_yes_price: m2.yesPrice,
          market2_no_price: m2.noPrice,
          correlation_type: pair.type as "SAME" | "OPPOSITE",
          reasoning: pair.reasoning || "LLM detected correlation",
          has_liquidity: hasLiquidity,
          profit_at_100_shares: profitAt100,
          last_checked: new Date().toISOString(),
        };

        await upsertCorrelation(cached);
        totalPairs++;

        if (hasLiquidity && profitAt100 && profitAt100 > 0) {
          totalProfitable++;
          console.log(`    💰 $${profitAt100.toFixed(2)}/100 shares`);
          allResults.push(`💰 $${profitAt100.toFixed(2)} - ${m1.question.substring(0, 25)}... vs ${m2.question.substring(0, 25)}...`);
        }
      }
    } catch (error) {
      console.error(`[Batch ${batchIdx + 1}] Error:`, error);
    }
  }

  console.log(`\n[Batch] COMPLETE: ${batches.length} batches, ${totalPairs} pairs, ${totalProfitable} profitable`);

  return NextResponse.json({
    success: true,
    mode: "batch",
    llmCalls: batches.length,
    totalMarkets: markets.length,
    pairsFound: totalPairs,
    profitableArbs: totalProfitable,
    results: allResults,
  });
}

interface LLMResult {
  correlated: boolean;
  type?: "SAME" | "OPPOSITE";
  reasoning: string;
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

    const result: LLMResult = JSON.parse(response.choices[0].message.content || "{}");
    
    if (result.correlated && result.type && result.reasoning) {
      return { type: result.type, reasoning: result.reasoning };
    }
    
    // Log rejection reason
    if (result.reasoning) {
      console.log(`     Rejection: ${result.reasoning}`);
    }
    
    return null;
  } catch (error) {
    console.error("[Scraper] LLM error:", error);
    return null;
  }
}
