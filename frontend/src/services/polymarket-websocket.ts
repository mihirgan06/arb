import { ClobClient } from "@polymarket/clob-client";

const API_KEY = process.env.NEXT_PUBLIC_POLYMARKET_API_KEY || "";
const SECRET = process.env.NEXT_PUBLIC_POLYMARKET_SECRET || "";
const PASSPHRASE = process.env.NEXT_PUBLIC_POLYMARKET_PASSPHRASE || "";
const HOST = "https://clob.polymarket.com";
const CHAIN_ID = 137;

// WebSocket endpoint for real-time market data
const WS_ENDPOINT = "wss://ws-subscriptions-clob.polymarket.com/ws/market";

export interface OrderBookUpdate {
  token_id: string;
  bids: Array<{ price: string; size: string }>;
  asks: Array<{ price: string; size: string }>;
  timestamp: number;
}

export interface MarketUpdate {
  type: string;
  payload: OrderBookUpdate | any;
}

type UpdateCallback = (update: MarketUpdate) => void;

export class PolymarketWebSocket {
  private ws: WebSocket | null = null;
  private callbacks: Map<string, Set<UpdateCallback>> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private subscribedMarkets: Set<string> = new Set();
  private clobClient: ClobClient | null = null;

  constructor() {
    this.initializeClobClient();
  }

  private async initializeClobClient() {
    try {
      if (!API_KEY || !SECRET || !PASSPHRASE) {
        console.warn("[Polymarket WS] API credentials not configured");
        return;
      }

      this.clobClient = new ClobClient(
        HOST,
        CHAIN_ID,
        undefined, // No signer for read-only operations
        {
          key: API_KEY,
          secret: SECRET,
          passphrase: PASSPHRASE,
        }
      );

      console.log("[Polymarket WS] ClobClient initialized with API credentials");
    } catch (error) {
      console.error("[Polymarket WS] Failed to initialize ClobClient:", error);
    }
  }

  /**
   * Connect to WebSocket and authenticate if needed
   */
  private connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(WS_ENDPOINT);

        this.ws.onopen = () => {
          console.log("[Polymarket WS] Connected");
          this.reconnectAttempts = 0;
          
          // Re-subscribe to all previously subscribed markets
          this.subscribedMarkets.forEach((marketId) => {
            this.subscribeToMarket(marketId);
          });
          
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            this.handleMessage(data);
          } catch (error) {
            console.error("[Polymarket WS] Failed to parse message:", error);
          }
        };

        this.ws.onerror = (error) => {
          console.error("[Polymarket WS] WebSocket error:", error);
          reject(error);
        };

        this.ws.onclose = () => {
          console.log("[Polymarket WS] Connection closed");
          this.ws = null;
          this.attemptReconnect();
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  private attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error("[Polymarket WS] Max reconnection attempts reached");
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    console.log(`[Polymarket WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    setTimeout(() => {
      this.connect().catch((error) => {
        console.error("[Polymarket WS] Reconnection failed:", error);
      });
    }, delay);
  }

  private handleMessage(data: any) {
    // Handle different message types from Polymarket WebSocket
    if (data.type === "orderbook" || data.type === "book") {
      const update: MarketUpdate = {
        type: "orderbook",
        payload: data,
      };
      this.notifyCallbacks(data.token_id || data.asset_id, update);
    } else if (data.type === "trade" || data.type === "last_trade") {
      const update: MarketUpdate = {
        type: "trade",
        payload: data,
      };
      this.notifyCallbacks(data.token_id || data.asset_id, update);
    } else if (data.type === "price") {
      const update: MarketUpdate = {
        type: "price",
        payload: data,
      };
      this.notifyCallbacks(data.token_id || data.asset_id, update);
    }
  }

  private notifyCallbacks(marketId: string, update: MarketUpdate) {
    const callbacks = this.callbacks.get(marketId);
    if (callbacks) {
      callbacks.forEach((callback) => {
        try {
          callback(update);
        } catch (error) {
          console.error("[Polymarket WS] Callback error:", error);
        }
      });
    }
  }

  /**
   * Subscribe to real-time updates for a specific market (token ID)
   */
  async subscribeToMarket(tokenId: string, callback?: UpdateCallback): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      await this.connect();
    }

    if (callback) {
      if (!this.callbacks.has(tokenId)) {
        this.callbacks.set(tokenId, new Set());
      }
      this.callbacks.get(tokenId)!.add(callback);
    }

    if (!this.subscribedMarkets.has(tokenId)) {
      this.subscribedMarkets.add(tokenId);
      
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        // Subscribe to market channel
        this.ws.send(
          JSON.stringify({
            type: "subscribe",
            channel: "market",
            asset_ids: [tokenId],
          })
        );
        console.log(`[Polymarket WS] Subscribed to market: ${tokenId}`);
      }
    }
  }

  /**
   * Unsubscribe from market updates
   */
  unsubscribeFromMarket(tokenId: string, callback?: UpdateCallback): void {
    if (callback) {
      const callbacks = this.callbacks.get(tokenId);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          this.callbacks.delete(tokenId);
        }
      }
    } else {
      this.callbacks.delete(tokenId);
    }

    if (this.subscribedMarkets.has(tokenId) && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.subscribedMarkets.delete(tokenId);
      this.ws.send(
        JSON.stringify({
          type: "unsubscribe",
          channel: "market",
          asset_ids: [tokenId],
        })
      );
    }
  }

  /**
   * Get initial orderbook snapshot using ClobClient
   */
  async getOrderBookSnapshot(tokenId: string): Promise<any> {
    if (!this.clobClient) {
      await this.initializeClobClient();
    }

    try {
      if (this.clobClient) {
        const orderbook = await this.clobClient.getOrderBook(tokenId);
        return orderbook;
      }
    } catch (error) {
      console.error(`[Polymarket WS] Failed to fetch orderbook for ${tokenId}:`, error);
    }
    return null;
  }

  /**
   * Disconnect WebSocket
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.callbacks.clear();
    this.subscribedMarkets.clear();
  }
}

// Singleton instance
export const polymarketWS = new PolymarketWebSocket();
