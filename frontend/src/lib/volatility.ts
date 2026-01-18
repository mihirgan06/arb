export interface VolatilityInput {
  optionPrice: number;      // Current price of the prediction (YES price)
  forwardPrice?: number;    // Expected settlement value (default: use option price)
  timeToExpiry?: number;    // Time to expiry in years (default: 0.25 = 3 months)
  bidAskSpread?: number;    // Bid-ask spread as decimal (e.g., 0.02 = 2%)
}

export interface VolatilityResult {
  level: "LOW" | "MEDIUM" | "HIGH";
  impliedVol: number;       // σ (sigma) - annualized implied volatility
  impliedVolPercent: number; // σ as percentage
  score: number;            // 0-100 normalized score
  message: string;
}

/**
 * Calculate Implied Volatility using the formula:
 * σ ≈ √(2π / T) × (Option Price / Forward Price)
 * 
 * Where:
 * • σ = Implied volatility (annualized)
 * • T = Time to expiry (in years)
 * • Option Price = Current price of the prediction
 * • Forward Price = Expected settlement value
 * 
 * For binary prediction markets:
 * - Option Price = YES price (probability)
 * - Forward Price = We use the price itself or 0.5 as neutral
 * - Higher σ = more uncertainty / bigger expected moves
 * - Lower σ = more certainty / tighter expected moves
 */
export function calculateVolatility(input: VolatilityInput): VolatilityResult {
  const { 
    optionPrice, 
    forwardPrice = optionPrice > 0.5 ? optionPrice : (1 - optionPrice), // Use distance from certainty
    timeToExpiry = 0.25, // Default 3 months
    bidAskSpread = 0.02,
  } = input;

  // Avoid division by zero
  const safeForward = Math.max(forwardPrice, 0.01);
  const safeTime = Math.max(timeToExpiry, 0.01);
  
  // Core formula: σ ≈ √(2π / T) × (Option Price / Forward Price)
  const sqrtTerm = Math.sqrt((2 * Math.PI) / safeTime);
  
  // For binary markets, we measure uncertainty from the edge
  // A price of 0.5 = maximum uncertainty, 0 or 1 = minimum uncertainty
  const uncertaintyFromPrice = Math.min(optionPrice, 1 - optionPrice);
  
  // Base implied volatility
  let impliedVol = sqrtTerm * (uncertaintyFromPrice / safeForward);
  
  // Adjust for bid-ask spread (wider spread = more uncertainty)
  // Spread contributes additional volatility estimate
  const spreadVolContribution = bidAskSpread * sqrtTerm * 0.5;
  impliedVol += spreadVolContribution;
  
  // Cap at reasonable bounds (0 to 500% annualized)
  impliedVol = Math.min(Math.max(impliedVol, 0), 5);
  
  const impliedVolPercent = Math.round(impliedVol * 100);
  
  // Normalize to 0-100 score
  // 0-50% vol = low, 50-150% = medium, >150% = high
  const score = Math.min(100, Math.round((impliedVol / 2) * 100));
  
  // Classify
  let level: "LOW" | "MEDIUM" | "HIGH";
  let message: string;
  
  if (impliedVolPercent < 50) {
    level = "LOW";
    message = `${impliedVolPercent}% implied vol. Price relatively stable.`;
  } else if (impliedVolPercent < 150) {
    level = "MEDIUM";
    message = `${impliedVolPercent}% implied vol. Moderate price swings expected.`;
  } else {
    level = "HIGH";
    message = `${impliedVolPercent}% implied vol. Large price moves possible.`;
  }
  
  return { 
    level, 
    impliedVol,
    impliedVolPercent,
    score, 
    message 
  };
}

export interface RiskProfileInput {
  profitAmount: number;
  slippagePercent: number;
  slippageLevel: "LOW" | "MEDIUM" | "HIGH";
  impliedVol: number;
  volatilityLevel: "LOW" | "MEDIUM" | "HIGH";
  maxShares: number;
  currentShares: number;
  spread1: number;
  spread2: number;
}

export interface RiskProfile {
  overall: "EXCELLENT" | "GOOD" | "FAIR" | "RISKY";
  color: string;
  emoji: string;
  summary: string;
  details: string[];
  recommendation: string;
  riskScore: number; // 0-10, lower is better
}

/**
 * Calculate comprehensive risk profile based on all factors
 */
export function calculateRiskProfile(input: RiskProfileInput): RiskProfile {
  const {
    profitAmount,
    slippagePercent,
    slippageLevel,
    impliedVol,
    volatilityLevel,
    maxShares,
    currentShares,
    spread1,
    spread2,
  } = input;

  const details: string[] = [];
  let riskScore = 0;

  // 1. Profit margin (most important)
  const profitPerShare = currentShares > 0 ? profitAmount / currentShares : 0;
  if (profitPerShare > 0.05) {
    details.push(`✓ Strong margin: ${(profitPerShare * 100).toFixed(1)}¢/share`);
  } else if (profitPerShare > 0.02) {
    details.push(`◐ Decent margin: ${(profitPerShare * 100).toFixed(1)}¢/share`);
    riskScore += 1;
  } else if (profitPerShare > 0) {
    details.push(`⚠ Thin margin: ${(profitPerShare * 100).toFixed(1)}¢/share`);
    riskScore += 2;
  } else {
    details.push(`✗ No profit at this size`);
    riskScore += 4;
  }

  // 2. Slippage impact
  if (slippageLevel === "LOW") {
    details.push(`✓ Low slippage: ${slippagePercent.toFixed(1)}%`);
  } else if (slippageLevel === "MEDIUM") {
    details.push(`◐ Moderate slippage: ${slippagePercent.toFixed(1)}%`);
    riskScore += 1;
  } else {
    details.push(`✗ High slippage: ${slippagePercent.toFixed(1)}%`);
    riskScore += 3;
  }

  // 3. Implied volatility
  const volPercent = Math.round(impliedVol * 100);
  if (volatilityLevel === "LOW") {
    details.push(`✓ Low volatility: ${volPercent}% IV`);
  } else if (volatilityLevel === "MEDIUM") {
    details.push(`◐ Moderate volatility: ${volPercent}% IV`);
    riskScore += 1;
  } else {
    details.push(`⚠ High volatility: ${volPercent}% IV`);
    riskScore += 2;
  }

  // 4. Position size vs max
  const sizeRatio = maxShares > 0 ? currentShares / maxShares : 1;
  if (sizeRatio < 0.3) {
    details.push(`✓ Size well within limits (${Math.round(sizeRatio * 100)}% of max)`);
  } else if (sizeRatio < 0.7) {
    details.push(`◐ Moderate size (${Math.round(sizeRatio * 100)}% of max)`);
    riskScore += 1;
  } else {
    details.push(`⚠ Near max size (${Math.round(sizeRatio * 100)}% of max)`);
    riskScore += 2;
  }

  // 5. Spread quality
  const avgSpread = (spread1 + spread2) / 2;
  const spreadPercent = avgSpread * 100;
  if (avgSpread < 0.02) {
    details.push(`✓ Tight spreads: ${spreadPercent.toFixed(1)}%`);
  } else if (avgSpread < 0.05) {
    details.push(`◐ Normal spreads: ${spreadPercent.toFixed(1)}%`);
    riskScore += 1;
  } else {
    details.push(`⚠ Wide spreads: ${spreadPercent.toFixed(1)}%`);
    riskScore += 2;
  }

  // Calculate overall rating
  let overall: RiskProfile["overall"];
  let color: string;
  let emoji: string;
  let summary: string;
  let recommendation: string;

  if (riskScore <= 2) {
    overall = "EXCELLENT";
    color = "emerald";
    emoji = "🟢";
    summary = "Strong setup with favorable conditions across all metrics";
    recommendation = "Good opportunity. Size according to your risk tolerance.";
  } else if (riskScore <= 5) {
    overall = "GOOD";
    color = "blue";
    emoji = "🔵";
    summary = "Solid opportunity with acceptable risk levels";
    recommendation = "Reasonable trade. Consider staying within suggested size.";
  } else if (riskScore <= 8) {
    overall = "FAIR";
    color = "yellow";
    emoji = "🟡";
    summary = "Mixed signals - some risk factors present";
    recommendation = "Use smaller size or wait for better entry conditions.";
  } else {
    overall = "RISKY";
    color = "red";
    emoji = "🔴";
    summary = "Multiple risk factors detected - proceed with caution";
    recommendation = "High risk. Consider skipping or using minimal size.";
  }

  return {
    overall,
    color,
    emoji,
    summary,
    details,
    recommendation,
    riskScore,
  };
}
