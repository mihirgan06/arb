import type { BinaryOutcome, TradeSide } from "./orderbook";

export interface PayoffSummary {
    side: TradeSide;
    outcome: BinaryOutcome;
    size: number;
    price: number;
    maxGain: number;
    maxLoss: number;
    capitalAtRisk: number;
    breakevenPrice: number;
    resolutionPnLYes: number;
    resolutionPnLNo: number;
}

export function calculatePayoff(params: {
    side: TradeSide;
    outcome: BinaryOutcome;
    size: number;
    price: number;
}): PayoffSummary {
    const { side, outcome, size, price } = params;

    const normalizedPrice = Math.max(0, Math.min(1, price));

    let maxGain = 0;
    let maxLoss = 0;
    let capitalAtRisk = 0;
    let resolutionPnLYes = 0;
    let resolutionPnLNo = 0;

    const costPerContract = normalizedPrice;

    const payoffPerContractIfYes = outcome === "YES" ? 1 : 0;
    const payoffPerContractIfNo = outcome === "NO" ? 1 : 0;

    if (side === "BUY") {
        const totalCost = size * costPerContract;
        capitalAtRisk = totalCost;

        const pnlIfYes =
            size * payoffPerContractIfYes - totalCost;
        const pnlIfNo =
            size * payoffPerContractIfNo - totalCost;

        maxGain = Math.max(pnlIfYes, pnlIfNo);
        maxLoss = Math.min(pnlIfYes, pnlIfNo);

        resolutionPnLYes = pnlIfYes;
        resolutionPnLNo = pnlIfNo;
    } else {
        const maxLiabilityPerContract = 1 - costPerContract;
        capitalAtRisk = size * maxLiabilityPerContract;

        const pnlIfYes =
            size * (costPerContract - payoffPerContractIfYes);
        const pnlIfNo =
            size * (costPerContract - payoffPerContractIfNo);

        maxGain = Math.max(pnlIfYes, pnlIfNo);
        maxLoss = Math.min(pnlIfYes, pnlIfNo);

        resolutionPnLYes = pnlIfYes;
        resolutionPnLNo = pnlIfNo;
    }

    const breakevenPrice =
        outcome === "YES" ? normalizedPrice : 1 - normalizedPrice;

    return {
        side,
        outcome,
        size,
        price: normalizedPrice,
        maxGain,
        maxLoss,
        capitalAtRisk,
        breakevenPrice,
        resolutionPnLYes,
        resolutionPnLNo,
    };
}

export interface MtmScenario {
    id: string;
    label: string;
    description: string;
    prices: number[];
    pnls: number[];
}

export function generateMtmScenarios(params: {
    side: TradeSide;
    outcome: BinaryOutcome;
    size: number;
    entryPrice: number;
}): MtmScenario[] {
    const { side, outcome, size, entryPrice } = params;

    const basePrice = Math.max(0.05, Math.min(0.95, entryPrice));

    const goodPath = [basePrice, basePrice + 0.1, basePrice + 0.2, basePrice + 0.25, 1].map(
        (p) => Math.max(0, Math.min(1, p))
    );

    const badPath = [basePrice, basePrice - 0.1, basePrice - 0.2, basePrice - 0.25, 0].map(
        (p) => Math.max(0, Math.min(1, p))
    );

    const noisyPath = [
        basePrice,
        basePrice + 0.08,
        basePrice - 0.12,
        basePrice + 0.05,
        basePrice,
    ].map((p) => Math.max(0, Math.min(1, p)));

    function pathPnL(path: number[]): number[] {
        return path.map((mark) => {
            const impliedPrice = outcome === "YES" ? mark : 1 - mark;
            if (side === "BUY") {
                return size * (impliedPrice - entryPrice);
            }
            return size * (entryPrice - impliedPrice);
        });
    }

    return [
        {
            id: "early-good",
            label: "Early good news",
            description: "Price moves in your favor early and then stabilizes.",
            prices: goodPath,
            pnls: pathPnL(goodPath),
        },
        {
            id: "early-bad",
            label: "Early bad news",
            description: "Price moves against you early and stays weak.",
            prices: badPath,
            pnls: pathPnL(badPath),
        },
        {
            id: "noisy-middle",
            label: "Noisy middle",
            description: "Price oscillates before resolution with no clear trend.",
            prices: noisyPath,
            pnls: pathPnL(noisyPath),
        },
    ];
}
