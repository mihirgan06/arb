export interface SlippageInput {
  tradeSize: number;
  expectedBuyPrice: number;  // Midpoint of bid/ask before trade
  executedBuyPrice: number;  // Price you actually get filled at
  expectedSellPrice: number; // Midpoint of bid/ask before trade
  executedSellPrice: number; // Price you actually get filled at
}

export interface SlippageWarning {
  slippageLevel: "LOW" | "MEDIUM" | "HIGH";
  message: string;
  buySlippagePercent: number;
  sellSlippagePercent: number;
  totalSlippagePercent: number;
}

/**
 * Calculate slippage using the standard formula:
 * Slippage (%) = ((Executed Price − Expected Price) / Expected Price) × 100
 * 
 * For buys: positive slippage = paying more than expected (bad)
 * For sells: positive slippage = receiving less than expected (bad)
 */
export function calculateSlippageWarning(input: SlippageInput): SlippageWarning {
  const { 
    expectedBuyPrice, 
    executedBuyPrice, 
    expectedSellPrice, 
    executedSellPrice 
  } = input;

  // Buy slippage: positive means you paid more than expected
  const buySlippagePercent = expectedBuyPrice > 0 
    ? ((executedBuyPrice - expectedBuyPrice) / expectedBuyPrice) * 100 
    : 0;

  // Sell slippage: positive means you received less than expected
  const sellSlippagePercent = expectedSellPrice > 0 
    ? ((expectedSellPrice - executedSellPrice) / expectedSellPrice) * 100 
    : 0;

  // Total cost of slippage (both directions hurt you)
  const totalSlippagePercent = Math.max(0, buySlippagePercent) + Math.max(0, sellSlippagePercent);

  // Round to 2 decimal places
  const buySlip = Math.round(buySlippagePercent * 100) / 100;
  const sellSlip = Math.round(sellSlippagePercent * 100) / 100;
  const totalSlip = Math.round(totalSlippagePercent * 100) / 100;

  // Determine slippage level based on percentage
  const maxSlip = Math.max(Math.abs(buySlip), Math.abs(sellSlip));
  
  let slippageLevel: "LOW" | "MEDIUM" | "HIGH";
  let message: string;

  if (maxSlip < 0.5) {
    slippageLevel = "LOW";
    message = "Excellent execution. Minimal price impact.";
  } else if (maxSlip < 2) {
    slippageLevel = "MEDIUM";
    if (Math.abs(buySlip - sellSlip) > 1) {
      const worseSide = buySlip > sellSlip ? "buying" : "selling";
      message = `~${totalSlip.toFixed(1)}% slippage, mostly when ${worseSide}.`;
    } else {
      message = `~${totalSlip.toFixed(1)}% slippage. Consider smaller size.`;
    }
  } else {
    slippageLevel = "HIGH";
    if (Math.abs(buySlip - sellSlip) > 1) {
      const worseSide = buySlip > sellSlip ? "buying" : "selling";
      message = `${totalSlip.toFixed(1)}% slippage, especially ${worseSide}. May eliminate profit.`;
    } else {
      message = `${totalSlip.toFixed(1)}% slippage. Profit likely reduced significantly.`;
    }
  }

  return {
    slippageLevel,
    message,
    buySlippagePercent: buySlip,
    sellSlippagePercent: sellSlip,
    totalSlippagePercent: totalSlip,
  };
}

// Legacy function for backward compatibility
export function calculateSlippageFromPrices(input: {
  tradeSize: number;
  bestBuyPrice: number;
  avgBuyExecutionPrice: number;
  bestSellPrice: number;
  avgSellExecutionPrice: number;
}): SlippageWarning {
  return calculateSlippageWarning({
    tradeSize: input.tradeSize,
    expectedBuyPrice: input.bestBuyPrice,
    executedBuyPrice: input.avgBuyExecutionPrice,
    expectedSellPrice: input.bestSellPrice,
    executedSellPrice: input.avgSellExecutionPrice,
  });
}
