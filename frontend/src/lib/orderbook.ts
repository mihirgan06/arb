export type TradeSide = "BUY" | "SELL";

export type BinaryOutcome = "YES" | "NO";

export interface OrderBookLevel {
    price: number;
    size: number;
}

export interface OutcomeOrderBook {
    bids: OrderBookLevel[];
    asks: OrderBookLevel[];
}

export interface MarketOrderBook {
    id: string;
    label: string;
    description?: string;
    horizon?: string;
    yes: OutcomeOrderBook;
    no: OutcomeOrderBook;
}

export interface ExecutionLevelUsage {
    price: number;
    size: number;
}

export interface TopOfBook {
    bestBid: number | null;
    bestAsk: number | null;
    spread: number | null;
    midpoint: number | null;
}

export interface ExecutionSummary extends TopOfBook {
    side: TradeSide;
    outcome: BinaryOutcome;
    requestedSize: number;
    filledSize: number;
    averagePrice: number | null;
    slippagePct: number | null;
    levelsUsed: ExecutionLevelUsage[];
}

function getOutcomeBook(orderBook: MarketOrderBook, outcome: BinaryOutcome): OutcomeOrderBook {
    return outcome === "YES" ? orderBook.yes : orderBook.no;
}

export function getTopOfBook(orderBook: MarketOrderBook, outcome: BinaryOutcome): TopOfBook {
    const book = getOutcomeBook(orderBook, outcome);

    const bestBid = book.bids.length > 0 ? book.bids[0].price : null;
    const bestAsk = book.asks.length > 0 ? book.asks[0].price : null;

    if (bestBid == null || bestAsk == null) {
        return {
            bestBid,
            bestAsk,
            spread: null,
            midpoint: null,
        };
    }

    const spread = bestAsk - bestBid;
    const midpoint = (bestBid + bestAsk) / 2;

    return {
        bestBid,
        bestAsk,
        spread,
        midpoint,
    };
}

function sortBids(levels: OrderBookLevel[]): OrderBookLevel[] {
    return [...levels].sort((a, b) => b.price - a.price);
}

function sortAsks(levels: OrderBookLevel[]): OrderBookLevel[] {
    return [...levels].sort((a, b) => a.price - b.price);
}

interface WalkResult {
    filledSize: number;
    averagePrice: number | null;
    levelsUsed: ExecutionLevelUsage[];
}

function walkLevels(levels: OrderBookLevel[], size: number): WalkResult {
    if (size <= 0) {
        return {
            filledSize: 0,
            averagePrice: null,
            levelsUsed: [],
        };
    }

    let remaining = size;
    let filled = 0;
    let notional = 0;
    const used: ExecutionLevelUsage[] = [];

    for (const level of levels) {
        if (remaining <= 0) break;
        if (level.size <= 0) continue;

        const take = Math.min(remaining, level.size);
        filled += take;
        remaining -= take;
        notional += take * level.price;
        used.push({
            price: level.price,
            size: take,
        });
    }

    if (filled === 0) {
        return {
            filledSize: 0,
            averagePrice: null,
            levelsUsed: [],
        };
    }

    return {
        filledSize: filled,
        averagePrice: notional / filled,
        levelsUsed: used,
    };
}

export function simulateExecution(params: {
    orderBook: MarketOrderBook;
    outcome: BinaryOutcome;
    side: TradeSide;
    size: number;
}): ExecutionSummary {
    const { orderBook, outcome, side, size } = params;
    const top = getTopOfBook(orderBook, outcome);
    const book = getOutcomeBook(orderBook, outcome);

    const sortedLevels =
        side === "BUY" ? sortAsks(book.asks) : sortBids(book.bids);

    const walk = walkLevels(sortedLevels, size);

    let slippagePct: number | null = null;

    if (walk.averagePrice != null) {
        if (side === "BUY" && top.bestAsk != null && top.bestAsk > 0) {
            slippagePct = (walk.averagePrice - top.bestAsk) / top.bestAsk;
        } else if (side === "SELL" && top.bestBid != null && top.bestBid > 0) {
            slippagePct = (top.bestBid - walk.averagePrice) / top.bestBid;
        }
    }

    return {
        side,
        outcome,
        requestedSize: size,
        filledSize: walk.filledSize,
        averagePrice: walk.averagePrice,
        slippagePct,
        levelsUsed: walk.levelsUsed,
        bestBid: top.bestBid,
        bestAsk: top.bestAsk,
        spread: top.spread,
        midpoint: top.midpoint,
    };
}
