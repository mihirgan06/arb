export interface SlippageInput {
  tradeSize: number;
  bestBuyPrice: number;
  avgBuyExecutionPrice: number;
  bestSellPrice: number;
  avgSellExecutionPrice: number;
}

export interface SlippageWarning {
  slippageLevel: "LOW" | "MEDIUM" | "HIGH";
  message: string;
  buySlippageCents: number;
  sellSlippageCents: number;
}

export function calculateSlippageWarning(input: SlippageInput): SlippageWarning {
  const { bestBuyPrice, avgBuyExecutionPrice, bestSellPrice, avgSellExecutionPrice } = input;

  // Calculate slippage in cents (prices are in dollars, so multiply by 100)
  const buySlippageCents = (avgBuyExecutionPrice - bestBuyPrice) * 100;
  const sellSlippageCents = (bestSellPrice - avgSellExecutionPrice) * 100;

  // Round to 2 decimal places
  const buySlip = Math.round(buySlippageCents * 100) / 100;
  const sellSlip = Math.round(sellSlippageCents * 100) / 100;

  // Determine slippage level
  const maxSlip = Math.max(buySlip, sellSlip);
  const slippageDiff = Math.abs(buySlip - sellSlip);
  const isAsymmetric = slippageDiff > 1; // More than 1¢ difference

  let slippageLevel: "LOW" | "MEDIUM" | "HIGH";
  let message: string;

  if (maxSlip < 0.5) {
    slippageLevel = "LOW";
    message = "Price impact is minimal at this size.";
  } else if (maxSlip <= 2) {
    slippageLevel = "MEDIUM";
    if (isAsymmetric) {
      const worseSide = buySlip > sellSlip ? "buying" : "selling";
      message = `Moderate price impact, especially when ${worseSide}. Consider smaller size.`;
    } else {
      message = "Moderate price impact at this size. Consider trading smaller.";
    }
  } else {
    slippageLevel = "HIGH";
    if (isAsymmetric) {
      const worseSide = buySlip > sellSlip ? "buying" : "selling";
      message = `Significant price impact when ${worseSide}. This may reduce or eliminate profit.`;
    } else {
      message = "Significant price impact at this size. Profit may be reduced or eliminated.";
    }
  }

  return {
    slippageLevel,
    message,
    buySlippageCents: buySlip,
    sellSlippageCents: sellSlip,
  };
}
