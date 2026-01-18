import { ClobClient } from "@polymarket/clob-client";
import { ethers } from "ethers";

// Environment variables
const API_KEY = process.env.NEXT_PUBLIC_POLYMARKET_API_KEY || "";
const SECRET = process.env.NEXT_PUBLIC_POLYMARKET_SECRET || "";
const PASSPHRASE = process.env.NEXT_PUBLIC_POLYMARKET_PASSPHRASE || "";
const HOST = "https://clob.polymarket.com";

// Constants for Chain ID (Polygon Mainnet)
const CHAIN_ID = 137;

class PolymarketClient {
    private client: ClobClient | null = null;
    private signer: ethers.Wallet | null = null;

    constructor() {
        this.initialize();
    }

    private async initialize() {
        try {
            // Check if API credentials are provided
            if (!API_KEY || !SECRET || !PASSPHRASE) {
                console.warn("[Polymarket] API credentials not fully configured. Some features may be limited.");
                return;
            }

            // Initialize ClobClient with API credentials (L2 authentication)
            // The ClobClient uses these credentials for authenticated requests
            this.client = new ClobClient(
                HOST,
                CHAIN_ID,
                undefined, // No signer for now (using L2 API key auth instead)
                {
                    key: API_KEY,
                    secret: SECRET,
                    passphrase: PASSPHRASE,
                }
            );

            console.log("[Polymarket] ClobClient initialized with API credentials");
        } catch (error) {
            console.error("Failed to initialize Polymarket CLOB client:", error);
        }
    }

    /**
     * Get specific markets by ID/Condition ID
     */
    async getMarket(conditionId: string) {
        if (!this.client) await this.initialize();
        try {
            return await this.client?.getMarket(conditionId);
        } catch (error) {
            console.error("Error fetching market:", error);
            return null;
        }
    }

    /**
     * Get Order Book for a market (Token ID)
     */
    async getOrderBook(tokenId: string) {
        if (!this.client) await this.initialize();
        try {
            return await this.client?.getOrderBook(tokenId);
        } catch (error) {
            console.error("Error fetching orderbook:", error);
            return null;
        }
    }

    /**
     * Get simplified market data for our dashboard
     * This is a helper to normalize data for our UI
     */
    async getMarketDataForDashboard(conditionId: string) {
        // Logic to fetch market + orderbook and combine them
        // Placeholder for now
        return {};
    }

    /**
     * Fetch Top Markets via Gamma API (Market Discovery)
     * 
     * Note: The Gamma API (gamma-api.polymarket.com) is typically public and doesn't require authentication.
     * However, the ClobClient is initialized with API credentials for authenticated operations
     * (like getMarket, getOrderBook, trading operations).
     * 
     * The API keys are being used by the ClobClient for authenticated CLOB endpoints.
     * For real-time orderbook updates, use the PolymarketWebSocket service.
     */
    async getTopMarkets(limit = 20) {
        try {
            // Verify API credentials are configured
            const hasApiCredentials = API_KEY && SECRET && PASSPHRASE;
            
            if (!hasApiCredentials) {
                console.warn("[Polymarket] API credentials not configured - ClobClient will not be available for authenticated operations");
            } else {
                console.log("[Polymarket] Using authenticated ClobClient for orderbook operations");
            }

            // Gamma API endpoint for events, sorted by volume
            // This is a public endpoint, but authenticated CLOB operations use the initialized client
            const response = await fetch(`https://gamma-api.polymarket.com/events?limit=${limit}&active=true&closed=false&order=volume&ascending=false`);
            if (!response.ok) {
                throw new Error(`Gamma API error: ${response.statusText}`);
            }
            const data = await response.json();
            return data;
        } catch (e) {
            console.error("Failed to fetch top markets from Gamma:", e);
            return [];
        }
    }

    /**
     * Get orderbook for a token ID using authenticated ClobClient
     * This uses the API keys for authenticated access
     */
    async getOrderBookForToken(tokenId: string) {
        if (!this.client) await this.initialize();
        if (!this.client) {
            console.error("[Polymarket] ClobClient not initialized");
            return null;
        }
        return await this.getOrderBook(tokenId);
    }
}

// Singleton instance
export const polymarket = new PolymarketClient();
