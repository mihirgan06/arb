import { polymarketService } from "./polymarket";
import { kalshiService } from "./kalshi";
import { discrepancyEngine } from "./discrepancy";
import { newsService } from "./news";
import type { NormalizedMarket, DiscrepancyResult, DashboardEvent, Platform } from "@/lib/types";

export class MarketAggregator {
  /**
   * Fetch and aggregate markets from all platforms
   */
  async fetchAllMarkets(): Promise<NormalizedMarket[]> {
    const [polymarketData, kalshiData] = await Promise.allSettled([
      polymarketService.fetchMarkets(30),
      kalshiService.fetchMarkets(30),
    ]);

    const markets: NormalizedMarket[] = [];

    if (polymarketData.status === "fulfilled") {
      markets.push(...polymarketData.value);
    } else {
      console.error("[Aggregator] Polymarket fetch failed:", polymarketData.reason);
    }

    if (kalshiData.status === "fulfilled") {
      markets.push(...kalshiData.value);
    } else {
      console.error("[Aggregator] Kalshi fetch failed:", kalshiData.reason);
    }

    return markets;
  }

  /**
   * Get dashboard-ready data with discrepancies and news
   */
  async getDashboardData(): Promise<{
    events: DashboardEvent[];
    discrepancies: DiscrepancyResult[];
    stats: {
      totalMarkets: number;
      activeDiscrepancies: number;
      avgSpread: number;
    };
  }> {
    // For demo purposes, use mock data if API calls fail
    let markets = await this.fetchAllMarkets();
    
    if (markets.length === 0) {
      markets = this.getMockMarkets();
    }

    // Detect discrepancies
    const discrepancies = await discrepancyEngine.detectDiscrepancies(markets);

    // Group into dashboard events
    const events = await this.buildDashboardEvents(markets, discrepancies);

    // Calculate stats
    const stats = {
      totalMarkets: markets.length,
      activeDiscrepancies: discrepancies.length,
      avgSpread: discrepancies.length > 0
        ? discrepancies.reduce((sum, d) => sum + d.maxSpread, 0) / discrepancies.length
        : 0,
    };

    return { events, discrepancies, stats };
  }

  /**
   * Build dashboard events from markets and discrepancies
   */
  private async buildDashboardEvents(
    markets: NormalizedMarket[],
    discrepancies: DiscrepancyResult[]
  ): Promise<DashboardEvent[]> {
    // Group markets by question similarity
    const eventMap = new Map<string, NormalizedMarket[]>();
    
    for (const market of markets) {
      const key = this.normalizeQuestion(market.question);
      if (!eventMap.has(key)) {
        eventMap.set(key, []);
      }
      eventMap.get(key)!.push(market);
    }

    const events: DashboardEvent[] = [];

    for (const [key, eventMarkets] of Array.from(eventMap.entries())) {
      if (eventMarkets.length === 0) continue;

      const firstMarket = eventMarkets[0];
      const bestYes = Math.max(...eventMarkets.map((m: NormalizedMarket) => m.yesProbability));
      const bestNo = Math.max(...eventMarkets.map((m: NormalizedMarket) => m.noProbability));

      // Find matching discrepancy
      const discrepancy = discrepancies.find((d) => 
        this.normalizeQuestion(d.eventTitle) === key
      );

      // Get news for this event
      const news = await newsService.searchNews(firstMarket.question);

      events.push({
        id: key,
        slug: key,
        title: firstMarket.question,
        category: firstMarket.category,
        markets: eventMarkets.map((m: NormalizedMarket) => ({
          platform: m.platform as Platform,
          yesProbability: m.yesProbability,
          noProbability: m.noProbability,
          volume: m.volume,
          liquidity: m.liquidity,
          isBestYes: m.yesProbability === bestYes,
          isBestNo: m.noProbability === bestNo,
          lastUpdated: m.lastUpdated.toISOString(),
        })),
        discrepancy: discrepancy ? {
          spread: discrepancy.maxSpread,
          spreadPercent: discrepancy.spreadPercent,
          confidence: discrepancy.confidence,
        } : undefined,
        recentNews: news.slice(0, 2).map((n) => ({
          title: n.title,
          source: n.source,
          url: n.url,
          publishedAt: n.publishedAt.toISOString(),
          relevance: n.relevanceScore,
        })),
      });
    }

    // Sort by whether they have discrepancies, then by volume
    return events.sort((a, b) => {
      if (a.discrepancy && !b.discrepancy) return -1;
      if (!a.discrepancy && b.discrepancy) return 1;
      const aVol = a.markets.reduce((sum, m) => sum + (m.volume || 0), 0);
      const bVol = b.markets.reduce((sum, m) => sum + (m.volume || 0), 0);
      return bVol - aVol;
    });
  }

  /**
   * Normalize question for matching
   */
  private normalizeQuestion(question: string): string {
    return question
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .trim()
      .substring(0, 80);
  }

  /**
   * Get mock markets for demo/development
   */
  private getMockMarkets(): NormalizedMarket[] {
    return [
      {
        externalId: "poly-btc-150k",
        platform: "POLYMARKET",
        question: "Will Bitcoin exceed $150k by end of 2026?",
        category: "Crypto",
        yesProbability: 0.42,
        noProbability: 0.58,
        volume: 2400000,
        liquidity: 890000,
        lastUpdated: new Date(),
      },
      {
        externalId: "kalshi-btc-150k",
        platform: "KALSHI",
        question: "Will Bitcoin exceed $150k by end of 2026?",
        category: "Crypto",
        yesProbability: 0.38,
        noProbability: 0.62,
        volume: 890000,
        liquidity: 320000,
        lastUpdated: new Date(),
      },
      {
        externalId: "poly-fed-q1",
        platform: "POLYMARKET",
        question: "Will the Fed cut rates in Q1 2026?",
        category: "Economics",
        yesProbability: 0.67,
        noProbability: 0.33,
        volume: 5100000,
        liquidity: 1200000,
        lastUpdated: new Date(),
      },
      {
        externalId: "kalshi-fed-q1",
        platform: "KALSHI",
        question: "Will the Fed cut rates in Q1 2026?",
        category: "Economics",
        yesProbability: 0.71,
        noProbability: 0.29,
        volume: 1200000,
        liquidity: 450000,
        lastUpdated: new Date(),
      },
      {
        externalId: "poly-gpt5",
        platform: "POLYMARKET",
        question: "Will GPT-5 be released before July 2026?",
        category: "Tech",
        yesProbability: 0.55,
        noProbability: 0.45,
        volume: 780000,
        liquidity: 290000,
        lastUpdated: new Date(),
      },
      {
        externalId: "kalshi-gpt5",
        platform: "KALSHI",
        question: "Will GPT-5 be released before July 2026?",
        category: "Tech",
        yesProbability: 0.48,
        noProbability: 0.52,
        volume: 320000,
        liquidity: 120000,
        lastUpdated: new Date(),
      },
      {
        externalId: "poly-recession",
        platform: "POLYMARKET",
        question: "Will the US enter a recession in 2026?",
        category: "Economics",
        yesProbability: 0.28,
        noProbability: 0.72,
        volume: 3200000,
        liquidity: 980000,
        lastUpdated: new Date(),
      },
      {
        externalId: "kalshi-recession",
        platform: "KALSHI",
        question: "Will the US enter a recession in 2026?",
        category: "Economics",
        yesProbability: 0.31,
        noProbability: 0.69,
        volume: 1500000,
        liquidity: 520000,
        lastUpdated: new Date(),
      },
    ];
  }
}

export const marketAggregator = new MarketAggregator();

