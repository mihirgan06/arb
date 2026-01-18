import OpenAI from "openai";

/**
 * LLM Service for identifying correlated markets for arbitrage
 * 
 * This service uses OpenAI GPT to identify markets that should have
 * correlated outcomes (e.g., "Trump wins" and "JD Vance wins VP").
 */

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const openai = OPENAI_API_KEY
  ? new OpenAI({
      apiKey: OPENAI_API_KEY,
    })
  : null;

export interface MarketCorrelation {
  market1: {
    id: string;
    question: string;
    platform: string;
  };
  market2: {
    id: string;
    question: string;
    platform: string;
  };
  correlationType: "CAUSAL" | "LOGICAL" | "TEMPORAL";
  confidence: number; // 0-1
  reasoning: string;
  expectedOutcomeAlignment: "SAME" | "OPPOSITE";
}

export interface MarketCandidate {
  id: string;
  question: string;
  description?: string;
  platform: "POLYMARKET" | "KALSHI";
  category: string;
}

export class LLMCorrelationService {
  /**
   * Identify correlated markets that could be arbitraged
   * Uses rule-based detection (LLM disabled due to rate limits)
   */
  async findCorrelatedMarkets(
    markets: MarketCandidate[]
  ): Promise<MarketCorrelation[]> {
    // Use rule-based detection only (faster, no rate limits)
    // LLM is disabled because OpenAI rate limits are exhausted
    console.log(`[Correlation] Analyzing ${markets.length} markets for correlations (rule-based)...`);
    const correlations = this.findCorrelatedMarketsRuleBased(markets);
    console.log(`[Correlation] Found ${correlations.length} potential correlations`);
    return correlations.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Use OpenAI GPT to analyze if two markets are correlated
   */
  async analyzeWithLLM(
    market1: MarketCandidate,
    market2: MarketCandidate
  ): Promise<MarketCorrelation | null> {
    if (!openai) {
      return this.detectCorrelation(market1, market2);
    }

    try {
      const prompt = `You are an expert at analyzing prediction market correlations for arbitrage opportunities.

Analyze whether these two prediction markets have correlated outcomes:

Market 1: "${market1.question}"
${market1.description ? `Description: ${market1.description}` : ""}
Category: ${market1.category}
Platform: ${market1.platform}

Market 2: "${market2.question}"
${market2.description ? `Description: ${market2.description}` : ""}
Category: ${market2.category}
Platform: ${market2.platform}

Determine:
1. Are these markets correlated? (If yes, what type: CAUSAL, LOGICAL, or TEMPORAL)
2. What is the confidence level (0-1)?
3. What is the reasoning?
4. If correlated, do they have SAME or OPPOSITE expected outcomes?

Respond in JSON format:
{
  "isCorrelated": boolean,
  "correlationType": "CAUSAL" | "LOGICAL" | "TEMPORAL" | null,
  "confidence": number (0-1),
  "reasoning": string,
  "expectedOutcomeAlignment": "SAME" | "OPPOSITE" | null
}

Only return correlated markets (isCorrelated: true) with confidence > 0.6.`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini", // Using mini for cost efficiency, can upgrade to gpt-4 if needed
        messages: [
          {
            role: "system",
            content:
              "You are an expert financial analyst specializing in prediction markets and arbitrage opportunities. You identify logical, causal, and temporal relationships between markets.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.3, // Lower temperature for more consistent analysis
        response_format: { type: "json_object" },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        return null;
      }

      const analysis = JSON.parse(content);

      if (!analysis.isCorrelated || analysis.confidence < 0.6) {
        return null;
      }

      return {
        market1: {
          id: market1.id,
          question: market1.question,
          platform: market1.platform,
        },
        market2: {
          id: market2.id,
          question: market2.question,
          platform: market2.platform,
        },
        correlationType: analysis.correlationType || "LOGICAL",
        confidence: analysis.confidence || 0.7,
        reasoning: analysis.reasoning || "Markets appear to be correlated.",
        expectedOutcomeAlignment:
          analysis.expectedOutcomeAlignment || "SAME",
      };
    } catch (error) {
      console.error(
        `[LLM] Error analyzing correlation for ${market1.id} and ${market2.id}:`,
        error
      );
      // Fall back to rule-based detection
      return this.detectCorrelation(market1, market2);
    }
  }

  /**
   * Rule-based correlation detection (fallback)
   */
  private findCorrelatedMarketsRuleBased(
    markets: MarketCandidate[]
  ): MarketCorrelation[] {
    const correlations: MarketCorrelation[] = [];

    for (let i = 0; i < markets.length; i++) {
      for (let j = i + 1; j < markets.length; j++) {
        const market1 = markets[i];
        const market2 = markets[j];

        const correlation = this.detectCorrelation(market1, market2);
        if (correlation) {
          correlations.push(correlation);
        }
      }
    }

    return correlations.sort((a, b) => b.confidence - a.confidence);
  }

  private detectCorrelation(
    market1: MarketCandidate,
    market2: MarketCandidate
  ): MarketCorrelation | null {
    const q1 = market1.question.toLowerCase();
    const q2 = market2.question.toLowerCase();

    // Skip if same market
    if (market1.id === market2.id) return null;

    // Trump and Vance (VP is automatic if Trump wins)
    if (
      (q1.includes("trump") && q2.includes("vance")) ||
      (q1.includes("vance") && q2.includes("trump"))
    ) {
      if ((q1.includes("win") || q1.includes("president") || q1.includes("election")) &&
          (q2.includes("win") || q2.includes("president") || q2.includes("vp") || q2.includes("vice"))) {
        return {
          market1: { id: market1.id, question: market1.question, platform: market1.platform },
          market2: { id: market2.id, question: market2.question, platform: market2.platform },
          correlationType: "CAUSAL",
          confidence: 0.95,
          reasoning: "If Trump wins, JD Vance becomes VP automatically. These outcomes are directly linked.",
          expectedOutcomeAlignment: "SAME",
        };
      }
    }

    // Same person/entity in different markets
    const entities = ["trump", "biden", "harris", "desantis", "newsom", "bitcoin", "ethereum", "fed", "powell"];
    for (const entity of entities) {
      if (q1.includes(entity) && q2.includes(entity)) {
        // Check if both are about the same outcome type
        const bothAboutWinning = (q1.includes("win") || q1.includes("winner")) && (q2.includes("win") || q2.includes("winner"));
        const bothAboutPrice = (q1.includes("price") || q1.includes("$")) && (q2.includes("price") || q2.includes("$"));
        
        if (bothAboutWinning || bothAboutPrice) {
          return {
            market1: { id: market1.id, question: market1.question, platform: market1.platform },
            market2: { id: market2.id, question: market2.question, platform: market2.platform },
            correlationType: "LOGICAL",
            confidence: 0.8,
            reasoning: `Both markets involve ${entity} and similar outcome types, suggesting correlation.`,
            expectedOutcomeAlignment: "SAME",
          };
        }
      }
    }

    // Fed/Powell and interest rates
    if ((q1.includes("fed") || q1.includes("powell")) && (q2.includes("rate") || q2.includes("interest"))) {
      return {
        market1: { id: market1.id, question: market1.question, platform: market1.platform },
        market2: { id: market2.id, question: market2.question, platform: market2.platform },
        correlationType: "CAUSAL",
        confidence: 0.75,
        reasoning: "Fed Chair Powell's decisions directly impact interest rates.",
        expectedOutcomeAlignment: "SAME",
      };
    }

    // Bitcoin and MicroStrategy
    if ((q1.includes("bitcoin") && q2.includes("microstrategy")) ||
        (q1.includes("microstrategy") && q2.includes("bitcoin"))) {
      return {
        market1: { id: market1.id, question: market1.question, platform: market1.platform },
        market2: { id: market2.id, question: market2.question, platform: market2.platform },
        correlationType: "CAUSAL",
        confidence: 0.85,
        reasoning: "MicroStrategy holds significant Bitcoin, so their performance is correlated.",
        expectedOutcomeAlignment: "SAME",
      };
    }

    // Presidential elections and party control
    if (
      (q1.includes("president") && q2.includes("senate")) ||
      (q1.includes("senate") && q2.includes("president")) ||
      (q1.includes("president") && q2.includes("house")) ||
      (q1.includes("house") && q2.includes("president"))
    ) {
      return {
        market1: { id: market1.id, question: market1.question, platform: market1.platform },
        market2: { id: market2.id, question: market2.question, platform: market2.platform },
        correlationType: "LOGICAL",
        confidence: 0.7,
        reasoning: "Presidential outcomes often correlate with congressional control.",
        expectedOutcomeAlignment: "SAME",
      };
    }

    // Same date/timeframe markets for same topic
    const datePatterns = /\b(2024|2025|2026|january|february|march|april|may|june|july|august|september|october|november|december|q1|q2|q3|q4)\b/gi;
    const dates1 = q1.match(datePatterns);
    const dates2 = q2.match(datePatterns);
    
    if (dates1 && dates2) {
      const hasSharedDate = dates1.some(d => dates2.some(d2 => d.toLowerCase() === d2.toLowerCase()));
      if (hasSharedDate) {
        // Check for similar topics
        const topics = ["bitcoin", "ethereum", "trump", "election", "fed", "inflation", "gdp", "unemployment"];
        const sharedTopic = topics.find(t => q1.includes(t) && q2.includes(t));
        if (sharedTopic) {
          return {
            market1: { id: market1.id, question: market1.question, platform: market1.platform },
            market2: { id: market2.id, question: market2.question, platform: market2.platform },
            correlationType: "TEMPORAL",
            confidence: 0.65,
            reasoning: `Both markets share ${sharedTopic} topic and similar timeframe.`,
            expectedOutcomeAlignment: "SAME",
          };
        }
      }
    }

    return null;
  }
}

export const llmCorrelationService = new LLMCorrelationService();
