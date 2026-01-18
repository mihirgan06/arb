/**
 * Helper functions for working with Polymarket API responses
 */

export interface PolymarketMarket {
  id: string;
  question: string;
  description?: string;
  clobTokenIds?: string | string[];  // Can be JSON string or array
  tokenIds?: string[];
  tokens?: Array<{ outcome: string; tokenId?: string; id?: string }>;
  outcomePrices?: string | string[];  // Can be JSON string or array
}

export interface PolymarketEvent {
  id: string;
  slug: string;
  title: string;
  description?: string;
  markets?: PolymarketMarket[];
  tags?: Array<{ label: string }>;
  category?: string;
  volume?: number;
  liquidity?: number;
}

/**
 * Extract token IDs from a Polymarket market
 * Note: clobTokenIds can be a JSON string or an array
 */
export function extractTokenIds(market: PolymarketMarket): {
  yes?: string;
  no?: string;
} {
  const tokenIds: { yes?: string; no?: string } = {};

  // clobTokenIds might be a JSON string like "[\"token1\", \"token2\"]"
  let clobTokens: string[] | undefined;
  
  if (market.clobTokenIds) {
    if (typeof market.clobTokenIds === "string") {
      try {
        clobTokens = JSON.parse(market.clobTokenIds);
      } catch {
        console.warn("[extractTokenIds] Failed to parse clobTokenIds:", market.clobTokenIds);
      }
    } else if (Array.isArray(market.clobTokenIds)) {
      clobTokens = market.clobTokenIds;
    }
  }

  if (clobTokens && Array.isArray(clobTokens) && clobTokens.length >= 2) {
    tokenIds.yes = clobTokens[0];
    tokenIds.no = clobTokens[1];
    return tokenIds;
  }

  // Fallback to tokenIds
  if (market.tokenIds && Array.isArray(market.tokenIds)) {
    tokenIds.yes = market.tokenIds[0];
    tokenIds.no = market.tokenIds[1];
    return tokenIds;
  }

  // Fallback to tokens array
  if (market.tokens && Array.isArray(market.tokens)) {
    market.tokens.forEach((token) => {
      const outcome = (token.outcome || "").toUpperCase();
      if (outcome === "YES") {
        tokenIds.yes = token.tokenId || token.id;
      } else if (outcome === "NO") {
        tokenIds.no = token.tokenId || token.id;
      }
    });
  }

  return tokenIds;
}

/**
 * Normalize Polymarket orderbook response to our format
 */
interface PolymarketBookLevel {
  price?: string | number;
  size?: string | number;
  [key: number]: string | number; // For array format [price, size]
}

interface PolymarketOrderBook {
  yes?: {
    bids?: PolymarketBookLevel[];
    asks?: PolymarketBookLevel[];
  };
  no?: {
    bids?: PolymarketBookLevel[];
    asks?: PolymarketBookLevel[];
  };
  bids?: PolymarketBookLevel[];
  asks?: PolymarketBookLevel[];
}

export function normalizeOrderBook(
  polymarketBook: PolymarketOrderBook | unknown,
  marketId: string,
  label: string
): {
  id: string;
  label: string;
  yes: { bids: Array<{ price: number; size: number }>; asks: Array<{ price: number; size: number }> };
  no: { bids: Array<{ price: number; size: number }>; asks: Array<{ price: number; size: number }> };
} | null {
  try {
    const book = polymarketBook as PolymarketOrderBook;
    
    // Handle different Polymarket orderbook formats
    let yesBids: Array<{ price: number; size: number }> = [];
    let yesAsks: Array<{ price: number; size: number }> = [];
    let noBids: Array<{ price: number; size: number }> = [];
    let noAsks: Array<{ price: number; size: number }> = [];

    // Format 1: { yes: { bids: [...], asks: [...] }, no: { bids: [...], asks: [...] } }
    if (book.yes) {
      yesBids = (book.yes.bids || []).map((b) => ({
        price: typeof b === "object" && !Array.isArray(b) ? parseFloat(String(b.price || b[0] || "0")) : parseFloat(String(b)),
        size: typeof b === "object" && !Array.isArray(b) ? parseFloat(String(b.size || b[1] || "0")) : 1,
      }));
      yesAsks = (book.yes.asks || []).map((a) => ({
        price: typeof a === "object" && !Array.isArray(a) ? parseFloat(String(a.price || a[0] || "0")) : parseFloat(String(a)),
        size: typeof a === "object" && !Array.isArray(a) ? parseFloat(String(a.size || a[1] || "0")) : 1,
      }));
    }

    if (book.no) {
      noBids = (book.no.bids || []).map((b) => ({
        price: typeof b === "object" && !Array.isArray(b) ? parseFloat(String(b.price || b[0] || "0")) : parseFloat(String(b)),
        size: typeof b === "object" && !Array.isArray(b) ? parseFloat(String(b.size || b[1] || "0")) : 1,
      }));
      noAsks = (book.no.asks || []).map((a) => ({
        price: typeof a === "object" && !Array.isArray(a) ? parseFloat(String(a.price || a[0] || "0")) : parseFloat(String(a)),
        size: typeof a === "object" && !Array.isArray(a) ? parseFloat(String(a.size || a[1] || "0")) : 1,
      }));
    }

    // Format 2: Array format [price, size]
    if (Array.isArray(book.bids)) {
      yesBids = book.bids.map((b) => ({
        price: Array.isArray(b) ? parseFloat(String(b[0])) : parseFloat(String((b as PolymarketBookLevel).price || b)),
        size: Array.isArray(b) ? parseFloat(String(b[1])) : parseFloat(String((b as PolymarketBookLevel).size || "1")),
      }));
    }

    if (Array.isArray(book.asks)) {
      yesAsks = book.asks.map((a) => ({
        price: Array.isArray(a) ? parseFloat(String(a[0])) : parseFloat(String((a as PolymarketBookLevel).price || a)),
        size: Array.isArray(a) ? parseFloat(String(a[1])) : parseFloat(String((a as PolymarketBookLevel).size || "1")),
      }));
    }

    // Sort bids descending, asks ascending
    yesBids.sort((a, b) => b.price - a.price);
    yesAsks.sort((a, b) => a.price - b.price);
    noBids.sort((a, b) => b.price - a.price);
    noAsks.sort((a, b) => a.price - b.price);

    return {
      id: marketId,
      label,
      yes: { bids: yesBids, asks: yesAsks },
      no: { bids: noBids, asks: noAsks },
    };
  } catch (error) {
    console.error("[Polymarket Helpers] Error normalizing orderbook:", error);
    return null;
  }
}
