"use client";

import React, { useEffect, useState, useCallback } from "react";
import { TrendingUp, RefreshCw, X, Check, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ArbitrageGraph } from "./ArbitrageGraph";

interface Market {
  id: string;
  question: string;
  slug: string;
  outcomePrices: string[] | null;
  volume: number;
  liquidity: number;
  clobTokenIds: string[] | null;
}

interface ArbitrageResult {
  opportunity: any;
  market1OrderBook: any;
  market2OrderBook: any;
}

export function Dashboard() {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMarkets, setSelectedMarkets] = useState<Market[]>([]);
  const [comparing, setComparing] = useState(false);
  const [result, setResult] = useState<ArbitrageResult | null>(null);
  const [correlationType, setCorrelationType] = useState<"SAME" | "OPPOSITE">("SAME");

  // Fetch markets on load
  const fetchMarkets = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/markets?limit=30");
      const data = await res.json();
      if (data.success && data.markets) {
        setMarkets(data.markets);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMarkets();
  }, [fetchMarkets]);

  // Toggle market selection
  const toggleMarket = (market: Market) => {
    if (selectedMarkets.find(m => m.id === market.id)) {
      setSelectedMarkets(selectedMarkets.filter(m => m.id !== market.id));
    } else if (selectedMarkets.length < 2) {
      setSelectedMarkets([...selectedMarkets, market]);
    }
  };

  // Compare 2 selected markets
  const compareMarkets = async () => {
    if (selectedMarkets.length !== 2) return;
    
    setComparing(true);
    setResult(null);
    
    try {
      const res = await fetch("/api/arbitrage/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          market1: {
            id: selectedMarkets[0].id,
            question: selectedMarkets[0].question,
            tokenId: selectedMarkets[0].clobTokenIds?.[0],
          },
          market2: {
            id: selectedMarkets[1].id,
            question: selectedMarkets[1].question,
            tokenId: selectedMarkets[1].clobTokenIds?.[0],
          },
          correlationType,
        }),
      });
      
      const data = await res.json();
      if (data.success) {
        setResult(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setComparing(false);
    }
  };

  const clearSelection = () => {
    setSelectedMarkets([]);
    setResult(null);
  };

  return (
    <div className="flex flex-col gap-6 max-w-[1400px] mx-auto p-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-white">Arbitrage Scanner</h1>
          <p className="text-sm text-zinc-400">Select 2 markets to compare for arbitrage</p>
        </div>
        <Button 
          onClick={fetchMarkets} 
          variant="outline" 
          size="sm"
          className="border-zinc-700 hover:bg-zinc-800"
        >
          <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* Selection Bar */}
      {selectedMarkets.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 space-y-2">
              <p className="text-xs text-zinc-500 uppercase tracking-wider">Selected Markets</p>
              {selectedMarkets.map((m, i) => (
                <div key={m.id} className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">{i + 1}</Badge>
                  <span className="text-sm text-white truncate">{m.question}</span>
                  <Button 
                    size="icon" 
                    variant="ghost" 
                    className="h-5 w-5 text-zinc-500 hover:text-white"
                    onClick={() => toggleMarket(m)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
            
            <div className="flex items-center gap-3">
              {/* Correlation Type Toggle */}
              <div className="flex items-center gap-2 bg-zinc-800 rounded-md p-1">
                <button
                  onClick={() => setCorrelationType("SAME")}
                  className={cn(
                    "px-3 py-1 text-xs rounded transition-all",
                    correlationType === "SAME" 
                      ? "bg-orange-500 text-white" 
                      : "text-zinc-400 hover:text-white"
                  )}
                >
                  Same
                </button>
                <button
                  onClick={() => setCorrelationType("OPPOSITE")}
                  className={cn(
                    "px-3 py-1 text-xs rounded transition-all",
                    correlationType === "OPPOSITE" 
                      ? "bg-orange-500 text-white" 
                      : "text-zinc-400 hover:text-white"
                  )}
                >
                  Opposite
                </button>
              </div>
              
              <Button 
                onClick={compareMarkets}
                disabled={selectedMarkets.length !== 2 || comparing}
                className="bg-orange-500 hover:bg-orange-600"
              >
                {comparing ? "Analyzing..." : "Compare"}
              </Button>
              
              <Button 
                onClick={clearSelection}
                variant="ghost"
                className="text-zinc-400 hover:text-white"
              >
                Clear
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Result Panel */}
      {result && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
          <div className="flex items-center gap-3 mb-4">
            {result.opportunity ? (
              <>
                <div className="h-10 w-10 rounded-full bg-green-500/20 flex items-center justify-center">
                  <TrendingUp className="h-5 w-5 text-green-500" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">Arbitrage Found!</h3>
                  <p className="text-sm text-zinc-400">
                    ${result.opportunity.profitAt100Shares?.toFixed(2)} profit per 100 shares
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="h-10 w-10 rounded-full bg-zinc-700 flex items-center justify-center">
                  <AlertTriangle className="h-5 w-5 text-zinc-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">No Arbitrage</h3>
                  <p className="text-sm text-zinc-400">
                    Prices don't create a profitable opportunity
                  </p>
                </div>
              </>
            )}
          </div>

          {/* Orderbook Prices */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="bg-zinc-800 rounded-lg p-4">
              <p className="text-xs text-zinc-500 mb-2">Market 1: {selectedMarkets[0]?.question?.slice(0, 50)}...</p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-zinc-500">Yes Bid:</span>{" "}
                  <span className="text-green-400 font-mono">${result.market1OrderBook?.yesBestBid?.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-zinc-500">Yes Ask:</span>{" "}
                  <span className="text-red-400 font-mono">${result.market1OrderBook?.yesBestAsk?.toFixed(2)}</span>
                </div>
              </div>
            </div>
            <div className="bg-zinc-800 rounded-lg p-4">
              <p className="text-xs text-zinc-500 mb-2">Market 2: {selectedMarkets[1]?.question?.slice(0, 50)}...</p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-zinc-500">Yes Bid:</span>{" "}
                  <span className="text-green-400 font-mono">${result.market2OrderBook?.yesBestBid?.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-zinc-500">Yes Ask:</span>{" "}
                  <span className="text-red-400 font-mono">${result.market2OrderBook?.yesBestAsk?.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Profit Graph */}
          {result.opportunity && (
            <ArbitrageGraph opportunity={result.opportunity} />
          )}
        </div>
      )}

      {/* Markets Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {loading ? (
          [...Array(6)].map((_, i) => (
            <div key={i} className="h-24 bg-zinc-800 rounded-lg animate-pulse" />
          ))
        ) : (
          markets.map(market => {
            const isSelected = selectedMarkets.some(m => m.id === market.id);
            const yesPrice = market.outcomePrices?.[0] ? parseFloat(market.outcomePrices[0]) : null;
            
            return (
              <div
                key={market.id}
                onClick={() => toggleMarket(market)}
                className={cn(
                  "relative p-4 rounded-lg border cursor-pointer transition-all",
                  isSelected
                    ? "bg-orange-500/10 border-orange-500/50"
                    : "bg-zinc-900 border-zinc-800 hover:border-zinc-700"
                )}
              >
                {isSelected && (
                  <div className="absolute top-2 right-2">
                    <Check className="h-4 w-4 text-orange-500" />
                  </div>
                )}
                
                <h3 className="text-sm font-medium text-white line-clamp-2 mb-2 pr-6">
                  {market.question}
                </h3>
                
                <div className="flex items-center justify-between text-xs">
                  {yesPrice !== null && (
                    <span className="text-zinc-400">
                      Yes: <span className="text-white font-mono">{(yesPrice * 100).toFixed(0)}¢</span>
                    </span>
                  )}
                  <span className="text-zinc-500">
                    Vol: ${(market.volume / 1000000).toFixed(1)}M
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
