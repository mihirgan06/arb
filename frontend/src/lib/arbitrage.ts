import type { MarketOrderBook, ExecutionSummary, TradeSide, BinaryOutcome } from "./orderbook";

export interface ArbitrageAnalysis {
    referenceSpread: number | null;
    executionSpread: number | null;
    maxSizeWithEdge: number | null;
}

export function analyzeExecutionArbitrage(params: {
    midA: number | null;
    midB: number | null;
    executeA: (size: number) => number | null;
    executeB: (size: number) => number | null;
    maxTestSize: number;
    step: number;
}): ArbitrageAnalysis {
    const { midA, midB, executeA, executeB, maxTestSize, step } = params;

    let referenceSpread: number | null = null;

    if (midA != null && midB != null) {
        referenceSpread = midB - midA;
    }

    let executionSpread: number | null = null;
    let maxSizeWithEdge: number | null = null;

    let size = step;
    while (size <= maxTestSize + 1e-9) {
        const priceA = executeA(size);
        const priceB = executeB(size);

        if (priceA == null || priceB == null) {
            break;
        }

        const spread = priceB - priceA;
        if (executionSpread == null) {
            executionSpread = spread;
        }

        if (spread > 0) {
            maxSizeWithEdge = size;
        } else {
            break;
        }

        size += step;
    }

    return {
        referenceSpread,
        executionSpread,
        maxSizeWithEdge,
    };
}
