import type { OrderBookLevel, MarketOrderBook } from "@/lib/orderbook";

/**
 * Arbitrage Engine
 * 
 * Calculates arbitrage profit in DOLLARS based on actual bid/ask prices
 * from the orderbook. Shows profit distribution for different share quantities.
 */

export interface PriceRange {
  min: number;
  max: number;
  bestBid: number;
  bestAsk: number;
  midpoint: number;
  spread: number;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
}

export interface ProfitPoint {
  shares: number;
  buyPrice: number;       // Avg price per share to buy
  sellPrice: number;      // Avg price per share to sell
  totalCost: number;      // Total $ to buy
  totalRevenue: number;   // Total $ from selling
  profit: number;         // Net profit in $
  profitPerShare: number; // Profit per share in $
}

export interface ArbitrageOpportunity {
  market1Id: string;
  market1Question: string;
  market2Id: string;
  market2Question: string;
  
  // Real orderbook data
  market1YesRange: PriceRange;
  market1NoRange: PriceRange;
  market2YesRange: PriceRange;
  market2NoRange: PriceRange;
  
  // Best execution prices (top of book)
  buyPrice: number;       // Best ask to buy at
  sellPrice: number;      // Best bid to sell at
  
  // Profit distribution at different share quantities
  profitCurve: ProfitPoint[];
  
  // Summary stats
  maxProfitableShares: number;  // Max shares before profit turns negative
  profitAt100Shares: number;    // Profit if you trade 100 shares
  profitAt1000Shares: number;   // Profit if you trade 1000 shares
  avgProfitPerShare: number;    // Average profit per share
  
  // Execution details
  executionStrategy: {
    buyMarket: string;
    buyOutcome: "YES" | "NO";
    buyPrice: number;
    sellMarket: string;
    sellOutcome: "YES" | "NO";
    sellPrice: number;
  };
  
  // Risk metrics
  slippageRisk: number;
  confidence: number;
  
  timestamp: Date;
}

export class ArbitrageEngine {
  /**
   * Calculate arbitrage opportunity between two correlated markets
   * Returns actual dollar profit based on real bid/ask prices
   */
  calculateArbitrage(
    market1: MarketOrderBook,
    market2: MarketOrderBook,
    correlationType: "SAME" | "OPPOSITE"
  ): ArbitrageOpportunity | null {
    // Extract price ranges from orderbooks
    const market1YesRange = this.extractPriceRange(market1.yes);
    const market1NoRange = this.extractPriceRange(market1.no);
    const market2YesRange = this.extractPriceRange(market2.yes);
    const market2NoRange = this.extractPriceRange(market2.no);

    // Find best arbitrage strategy
    const strategies = this.findArbitrageStrategies(
      market1,
      market2,
      market1YesRange,
      market1NoRange,
      market2YesRange,
      market2NoRange,
      correlationType
    );

    if (strategies.length === 0) {
      return null;
    }

    // Pick the best strategy (highest profit at 100 shares)
    const best = strategies.reduce((a, b) => 
      a.profitAt100 > b.profitAt100 ? a : b
    );

    if (best.profitAt100 <= 0) {
      return null;
    }

    // Generate profit curve for different share quantities
    const profitCurve = this.generateProfitCurve(
      best.buyRange,
      best.sellRange,
      best.maxShares
    );

    return {
      market1Id: market1.id,
      market1Question: market1.label,
      market2Id: market2.id,
      market2Question: market2.label,
      market1YesRange,
      market1NoRange,
      market2YesRange,
      market2NoRange,
      buyPrice: best.buyPrice,
      sellPrice: best.sellPrice,
      profitCurve,
      maxProfitableShares: best.maxShares,
      profitAt100Shares: best.profitAt100,
      profitAt1000Shares: best.profitAt1000,
      avgProfitPerShare: best.sellPrice - best.buyPrice,
      executionStrategy: {
        buyMarket: best.buyMarket,
        buyOutcome: best.buyOutcome,
        buyPrice: best.buyPrice,
        sellMarket: best.sellMarket,
        sellOutcome: best.sellOutcome,
        sellPrice: best.sellPrice,
      },
      slippageRisk: this.calculateSlippageRisk(best.buyRange, best.sellRange),
      confidence: this.calculateConfidence(best, market1, market2),
      timestamp: new Date(),
    };
  }

  private extractPriceRange(outcomeBook: {
    bids: OrderBookLevel[];
    asks: OrderBookLevel[];
  }): PriceRange {
    const bids = [...outcomeBook.bids].sort((a, b) => b.price - a.price);
    const asks = [...outcomeBook.asks].sort((a, b) => a.price - b.price);

    const bestBid = bids.length > 0 ? bids[0].price : 0;
    const bestAsk = asks.length > 0 ? asks[0].price : 1;
    const spread = bestAsk - bestBid;
    const midpoint = (bestBid + bestAsk) / 2;

    return {
      min: bestBid,
      max: bestAsk,
      bestBid,
      bestAsk,
      midpoint,
      spread,
      bids,
      asks,
    };
  }

  private findArbitrageStrategies(
    market1: MarketOrderBook,
    market2: MarketOrderBook,
    m1Yes: PriceRange,
    m1No: PriceRange,
    m2Yes: PriceRange,
    m2No: PriceRange,
    correlationType: "SAME" | "OPPOSITE"
  ): Array<{
    buyRange: PriceRange;
    sellRange: PriceRange;
    buyMarket: string;
    buyOutcome: "YES" | "NO";
    sellMarket: string;
    sellOutcome: "YES" | "NO";
    buyPrice: number;
    sellPrice: number;
    maxShares: number;
    profitAt100: number;
    profitAt1000: number;
  }> {
    const strategies: Array<{
      buyRange: PriceRange;
      sellRange: PriceRange;
      buyMarket: string;
      buyOutcome: "YES" | "NO";
      sellMarket: string;
      sellOutcome: "YES" | "NO";
      buyPrice: number;
      sellPrice: number;
      maxShares: number;
      profitAt100: number;
      profitAt1000: number;
    }> = [];

    // For SAME correlation: YES correlates with YES, NO correlates with NO
    if (correlationType === "SAME") {
      // Strategy 1: Buy YES in M1, Sell YES in M2
      if (m2Yes.bestBid > m1Yes.bestAsk) {
        const result = this.calculateProfit(m1Yes, m2Yes, 100);
        const result1000 = this.calculateProfit(m1Yes, m2Yes, 1000);
        strategies.push({
          buyRange: m1Yes,
          sellRange: m2Yes,
          buyMarket: market1.id,
          buyOutcome: "YES",
          sellMarket: market2.id,
          sellOutcome: "YES",
          buyPrice: m1Yes.bestAsk,
          sellPrice: m2Yes.bestBid,
          maxShares: this.findMaxProfitableShares(m1Yes, m2Yes),
          profitAt100: result.profit,
          profitAt1000: result1000.profit,
        });
      }
      
      // Strategy 2: Buy YES in M2, Sell YES in M1
      if (m1Yes.bestBid > m2Yes.bestAsk) {
        const result = this.calculateProfit(m2Yes, m1Yes, 100);
        const result1000 = this.calculateProfit(m2Yes, m1Yes, 1000);
        strategies.push({
          buyRange: m2Yes,
          sellRange: m1Yes,
          buyMarket: market2.id,
          buyOutcome: "YES",
          sellMarket: market1.id,
          sellOutcome: "YES",
          buyPrice: m2Yes.bestAsk,
          sellPrice: m1Yes.bestBid,
          maxShares: this.findMaxProfitableShares(m2Yes, m1Yes),
          profitAt100: result.profit,
          profitAt1000: result1000.profit,
        });
      }

      // Strategy 3: Buy NO in M1, Sell NO in M2
      if (m2No.bestBid > m1No.bestAsk) {
        const result = this.calculateProfit(m1No, m2No, 100);
        const result1000 = this.calculateProfit(m1No, m2No, 1000);
        strategies.push({
          buyRange: m1No,
          sellRange: m2No,
          buyMarket: market1.id,
          buyOutcome: "NO",
          sellMarket: market2.id,
          sellOutcome: "NO",
          buyPrice: m1No.bestAsk,
          sellPrice: m2No.bestBid,
          maxShares: this.findMaxProfitableShares(m1No, m2No),
          profitAt100: result.profit,
          profitAt1000: result1000.profit,
        });
      }

      // Strategy 4: Buy NO in M2, Sell NO in M1
      if (m1No.bestBid > m2No.bestAsk) {
        const result = this.calculateProfit(m2No, m1No, 100);
        const result1000 = this.calculateProfit(m2No, m1No, 1000);
        strategies.push({
          buyRange: m2No,
          sellRange: m1No,
          buyMarket: market2.id,
          buyOutcome: "NO",
          sellMarket: market1.id,
          sellOutcome: "NO",
          buyPrice: m2No.bestAsk,
          sellPrice: m1No.bestBid,
          maxShares: this.findMaxProfitableShares(m2No, m1No),
          profitAt100: result.profit,
          profitAt1000: result1000.profit,
        });
      }
    }

    // For OPPOSITE correlation: YES correlates with NO
    if (correlationType === "OPPOSITE") {
      // Strategy 1: Buy YES in M1, Sell NO in M2
      if (m2No.bestBid > m1Yes.bestAsk) {
        const result = this.calculateProfit(m1Yes, m2No, 100);
        const result1000 = this.calculateProfit(m1Yes, m2No, 1000);
        strategies.push({
          buyRange: m1Yes,
          sellRange: m2No,
          buyMarket: market1.id,
          buyOutcome: "YES",
          sellMarket: market2.id,
          sellOutcome: "NO",
          buyPrice: m1Yes.bestAsk,
          sellPrice: m2No.bestBid,
          maxShares: this.findMaxProfitableShares(m1Yes, m2No),
          profitAt100: result.profit,
          profitAt1000: result1000.profit,
        });
      }

      // Strategy 2: Buy NO in M1, Sell YES in M2
      if (m2Yes.bestBid > m1No.bestAsk) {
        const result = this.calculateProfit(m1No, m2Yes, 100);
        const result1000 = this.calculateProfit(m1No, m2Yes, 1000);
        strategies.push({
          buyRange: m1No,
          sellRange: m2Yes,
          buyMarket: market1.id,
          buyOutcome: "NO",
          sellMarket: market2.id,
          sellOutcome: "YES",
          buyPrice: m1No.bestAsk,
          sellPrice: m2Yes.bestBid,
          maxShares: this.findMaxProfitableShares(m1No, m2Yes),
          profitAt100: result.profit,
          profitAt1000: result1000.profit,
        });
      }
    }

    return strategies;
  }

  /**
   * Calculate actual profit for a given number of shares
   * Walks through the orderbook to get real execution prices
   */
  calculateProfit(
    buyRange: PriceRange,
    sellRange: PriceRange,
    shares: number
  ): ProfitPoint {
    // Simulate buying: walk through asks (lowest first)
    let remainingBuy = shares;
    let totalCost = 0;
    for (const ask of buyRange.asks) {
      if (remainingBuy <= 0) break;
      const fillSize = Math.min(remainingBuy, ask.size);
      totalCost += fillSize * ask.price;
      remainingBuy -= fillSize;
    }
    
    // If we couldn't fill all shares, use worst price for remainder
    if (remainingBuy > 0) {
      const worstAsk = buyRange.asks.length > 0 
        ? buyRange.asks[buyRange.asks.length - 1].price 
        : 1;
      totalCost += remainingBuy * worstAsk;
    }

    // Simulate selling: walk through bids (highest first)
    let remainingSell = shares;
    let totalRevenue = 0;
    for (const bid of sellRange.bids) {
      if (remainingSell <= 0) break;
      const fillSize = Math.min(remainingSell, bid.size);
      totalRevenue += fillSize * bid.price;
      remainingSell -= fillSize;
    }
    
    // If we couldn't sell all shares, use worst price for remainder
    if (remainingSell > 0) {
      const worstBid = sellRange.bids.length > 0 
        ? sellRange.bids[sellRange.bids.length - 1].price 
        : 0;
      totalRevenue += remainingSell * worstBid;
    }

    const profit = totalRevenue - totalCost;
    const buyPrice = totalCost / shares;
    const sellPrice = totalRevenue / shares;
    const profitPerShare = profit / shares;

    return {
      shares,
      buyPrice,
      sellPrice,
      totalCost,
      totalRevenue,
      profit,
      profitPerShare,
    };
  }

  /**
   * Find maximum shares that can still be traded profitably
   */
  private findMaxProfitableShares(
    buyRange: PriceRange,
    sellRange: PriceRange
  ): number {
    // Binary search for max profitable size
    let low = 1;
    let high = 100000;
    let maxProfitable = 0;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const result = this.calculateProfit(buyRange, sellRange, mid);
      
      if (result.profit > 0) {
        maxProfitable = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    return maxProfitable;
  }

  /**
   * Generate profit curve for graphing
   */
  private generateProfitCurve(
    buyRange: PriceRange,
    sellRange: PriceRange,
    maxShares: number
  ): ProfitPoint[] {
    const curve: ProfitPoint[] = [];
    const steps = 20;
    const stepSize = Math.max(1, Math.floor(maxShares / steps));

    for (let shares = stepSize; shares <= maxShares; shares += stepSize) {
      curve.push(this.calculateProfit(buyRange, sellRange, shares));
    }

    // Always include specific quantities
    for (const shares of [10, 50, 100, 500, 1000]) {
      if (shares <= maxShares && !curve.find(p => p.shares === shares)) {
        curve.push(this.calculateProfit(buyRange, sellRange, shares));
      }
    }

    return curve.sort((a, b) => a.shares - b.shares);
  }

  private calculateSlippageRisk(
    buyRange: PriceRange,
    sellRange: PriceRange
  ): number {
    // Compare top of book to average across depth
    const avgBuyPrice = buyRange.asks.reduce((sum, a) => sum + a.price, 0) / 
      Math.max(buyRange.asks.length, 1);
    const avgSellPrice = sellRange.bids.reduce((sum, b) => sum + b.price, 0) / 
      Math.max(sellRange.bids.length, 1);
    
    const buySlippage = avgBuyPrice - buyRange.bestAsk;
    const sellSlippage = sellRange.bestBid - avgSellPrice;
    
    return Math.round((buySlippage + sellSlippage) * 10000) / 100; // As percentage
  }

  private calculateConfidence(
    strategy: { maxShares: number; profitAt100: number },
    market1: MarketOrderBook,
    market2: MarketOrderBook
  ): number {
    // Based on liquidity and profit
    const liquidityScore = Math.min(strategy.maxShares / 1000, 1);
    const profitScore = Math.min(strategy.profitAt100 / 10, 1);
    
    const depth1 = market1.yes.bids.length + market1.yes.asks.length;
    const depth2 = market2.yes.bids.length + market2.yes.asks.length;
    const depthScore = Math.min((depth1 + depth2) / 20, 1);
    
    return Math.round((liquidityScore * 0.4 + profitScore * 0.3 + depthScore * 0.3) * 100) / 100;
  }
}

export const arbitrageEngine = new ArbitrageEngine();
