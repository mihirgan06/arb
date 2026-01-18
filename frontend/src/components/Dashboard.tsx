"use client";

import React, { useEffect, useState, useRef } from "react";
import { Info, Loader2, RefreshCw, Sparkles, AlertTriangle, Activity, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { calculateSlippageWarning } from "@/lib/slippage";
import { calculateVolatility, calculateRiskProfile } from "@/lib/volatility";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { ArbitrageOpportunity } from "@/services/arbitrage-engine";

interface Opportunity extends ArbitrageOpportunity {
  correlation?: { type: string; confidence: number; reasoning: string };
}

export function Dashboard() {
  const [opps, setOpps] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [findingMore, setFindingMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selected, setSelected] = useState<Opportunity | null>(null);
  const [showWhy, setShowWhy] = useState(false);
  const [shares, setShares] = useState(100);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const hasFetched = useRef(false);

  const fetchOpportunities = async (pageNum = 0) => {
    const r = await fetch(`/api/arbitrage/opportunities?page=${pageNum}&limit=15`);
    const d = await r.json();
    if (d.success && d.opportunities) {
      if (pageNum === 0) {
        setOpps(d.opportunities);
        if (d.opportunities.length > 0) setSelected(d.opportunities[0]);
      } else {
        setOpps(prev => [...prev, ...d.opportunities]);
      }
      setHasMore(d.hasMore || false);
      setTotalCount(d.totalOpportunities || d.opportunities.length);
      setPage(pageNum);
      return d.opportunities.length;
    }
    return 0;
  };

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    
    const init = async () => {
      try {
        await fetchOpportunities(0);
      } catch (e) { 
        console.error(e); 
      }
      finally { setLoading(false); }
    };
    init();
  }, []);

  const refresh = async () => {
    setLoading(true);
    setPage(0);
    try {
      await fetchOpportunities(0);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      await fetchOpportunities(page + 1);
    } catch (e) { console.error(e); }
    finally { setLoadingMore(false); }
  };

  const findMoreWithAI = async () => {
    setFindingMore(true);
    try {
      const r = await fetch("/api/arbitrage/scraper", { method: "POST" });
      const d = await r.json();
      if (d.success) {
        // Refresh from page 0 to get new opportunities
        await fetchOpportunities(0);
      }
    } catch (e) { console.error(e); }
    finally { setFindingMore(false); }
  };

  const getProfit = (curve: Opportunity["profitCurve"], targetShares: number) => {
    if (!curve || curve.length === 0) return null;
    return curve.reduce((closest, p) =>
      Math.abs(p.shares - targetShares) < Math.abs(closest.shares - targetShares) ? p : closest
    );
  };

  const currentProfit = selected ? getProfit(selected.profitCurve, shares) : null;

  // Calculate bid-ask spreads
  const spread1 = selected ? (selected.market1YesRange?.max || 0) - (selected.market1YesRange?.min || 0) : 0;
  const spread2 = selected ? (selected.market2YesRange?.max || 0) - (selected.market2YesRange?.min || 0) : 0;

  // Calculate slippage using proper formula:
  // Slippage (%) = ((Executed Price − Expected Price) / Expected Price) × 100
  const slippageWarning = selected ? calculateSlippageWarning({
    tradeSize: shares,
    expectedBuyPrice: selected.market1YesRange?.midpoint || selected.buyPrice,
    executedBuyPrice: selected.buyPrice,
    expectedSellPrice: selected.market2YesRange?.midpoint || selected.sellPrice,
    executedSellPrice: selected.sellPrice,
  }) : null;

  // Calculate implied volatility using proper formula:
  // σ ≈ √(2π / T) × (Option Price / Forward Price)
  const volatility1 = selected ? calculateVolatility({
    optionPrice: selected.market1YesDisplayPrice ?? selected.market1YesRange?.midpoint ?? 0.5,
    bidAskSpread: spread1 || 0.02,
    timeToExpiry: 0.25, // Assume 3 months average
  }) : null;

  const volatility2 = selected ? calculateVolatility({
    optionPrice: selected.market2YesDisplayPrice ?? selected.market2YesRange?.midpoint ?? 0.5,
    bidAskSpread: spread2 || 0.02,
    timeToExpiry: 0.25,
  }) : null;

  // Combined volatility (take the higher one - conservative)
  const combinedVolatility = volatility1 && volatility2 ? {
    level: volatility1.impliedVol >= volatility2.impliedVol ? volatility1.level : volatility2.level,
    impliedVol: Math.max(volatility1.impliedVol, volatility2.impliedVol),
    impliedVolPercent: Math.max(volatility1.impliedVolPercent, volatility2.impliedVolPercent),
    score: Math.max(volatility1.score, volatility2.score),
    message: volatility1.impliedVol >= volatility2.impliedVol ? volatility1.message : volatility2.message,
  } : null;

  // Calculate comprehensive risk profile
  const riskProfile = selected && currentProfit && slippageWarning && combinedVolatility ? calculateRiskProfile({
    profitAmount: currentProfit.profit,
    slippagePercent: slippageWarning.totalSlippagePercent,
    slippageLevel: slippageWarning.slippageLevel,
    impliedVol: combinedVolatility.impliedVol,
    volatilityLevel: combinedVolatility.level,
    maxShares: selected.maxProfitableShares,
    currentShares: shares,
    spread1: spread1 || 0.02,
    spread2: spread2 || 0.02,
  }) : null;

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Polymarket Arbitrage</h1>
          <div className="flex gap-2">
            <button onClick={refresh} disabled={loading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm disabled:opacity-50">
              <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} /> Refresh
            </button>
          </div>
        </div>


        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
          </div>
        ) : opps.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-zinc-500 mb-4">No opportunities in cache</p>
            <button onClick={findMoreWithAI} disabled={findingMore}
              className="px-6 py-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium disabled:opacity-50">
              {findingMore ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Finding opportunities...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4" /> Find Opportunities with AI
                </span>
              )}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* LEFT: List */}
            <div className="space-y-3">
              <p className="text-sm text-zinc-500">{opps.length} opportunities found</p>
              <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-2">
                {opps.map((o, i) => (
                  <div key={i} onClick={() => { setSelected(o); setShowWhy(false); setShares(100); }}
                    className={cn(
                      "p-4 rounded-xl cursor-pointer border transition-all",
                      selected === o ? "bg-emerald-500/10 border-emerald-500/40" : "bg-zinc-900 border-zinc-800 hover:border-zinc-600"
                    )}>
                    <div className="space-y-3 text-sm">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-emerald-400 text-xs font-semibold">BUY {o.executionStrategy.buyOutcome}</span>
                        </div>
                        <p className="text-white mb-1">{o.market1Question}</p>
                        <div className="flex gap-3 text-xs">
                          <span className="text-zinc-500">YES: ${(o.market1YesDisplayPrice ?? o.market1YesRange.midpoint).toFixed(4)}</span>
                          <span className="text-zinc-500">NO: ${(o.market1NoDisplayPrice ?? o.market1NoRange.midpoint).toFixed(4)}</span>
                        </div>
                      </div>
                      <div className="text-zinc-600 text-center">↓</div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-red-400 text-xs font-semibold">SELL {o.executionStrategy.sellOutcome}</span>
                        </div>
                        <p className="text-zinc-300 mb-1">{o.market2Question}</p>
                        <div className="flex gap-3 text-xs">
                          <span className="text-zinc-500">YES: ${(o.market2YesDisplayPrice ?? o.market2YesRange.midpoint).toFixed(4)}</span>
                          <span className="text-zinc-500">NO: ${(o.market2NoDisplayPrice ?? o.market2NoRange.midpoint).toFixed(4)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              
              {/* Load More / Find More Buttons */}
              <div className="space-y-2 mt-3">
                {hasMore && (
                  <button
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="w-full px-4 py-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loadingMore ? (
                      <span className="flex items-center justify-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Loading more...
                      </span>
                    ) : (
                      `Load More (${opps.length}/${totalCount})`
                    )}
                  </button>
                )}
                <button
                  onClick={findMoreWithAI}
                  disabled={findingMore}
                  className="w-full px-4 py-3 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-400 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {findingMore ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Finding new opportunities with AI...
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      <Sparkles className="w-4 h-4" />
                      Find More with AI
                    </span>
                  )}
                </button>
              </div>
            </div>

            {/* RIGHT: Detail */}
            {selected && (
              <div className="space-y-4">
                {/* Calculator */}
                <div className="p-5 rounded-xl bg-zinc-900 border border-zinc-800">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="font-semibold">Profit Calculator</h2>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-zinc-500">Shares:</span>
                      <input type="number" value={shares}
                        onChange={e => setShares(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-24 px-3 py-1 rounded bg-zinc-800 border border-zinc-700 text-white font-mono" />
                    </div>
                  </div>

                  {currentProfit && (
                    <>
                      <div className="grid grid-cols-3 gap-3 mb-4">
                        <div className="p-3 rounded-lg bg-zinc-800">
                          <div className="text-xs text-zinc-500">Cost</div>
                          <div className="text-lg font-mono">${currentProfit.totalCost.toFixed(2)}</div>
                        </div>
                        <div className="p-3 rounded-lg bg-zinc-800">
                          <div className="text-xs text-zinc-500">Revenue</div>
                          <div className="text-lg font-mono">${currentProfit.totalRevenue.toFixed(2)}</div>
                        </div>
                        <div className="p-3 rounded-lg bg-emerald-500/10">
                          <div className="text-xs text-zinc-500">Profit</div>
                          <div className={cn("text-xl font-mono font-bold", currentProfit.profit > 0 ? "text-emerald-400" : "text-red-400")}>
                            ${currentProfit.profit.toFixed(2)}
                          </div>
                        </div>
                      </div>
                      
                      {/* Slippage & Volatility Indicators */}
                      <div className="grid grid-cols-2 gap-3 mb-4">
                        {/* Slippage */}
                        <div className={cn(
                          "p-3 rounded-lg border",
                          slippageWarning?.slippageLevel === "LOW" 
                            ? "bg-emerald-500/10 border-emerald-500/30"
                            : slippageWarning?.slippageLevel === "MEDIUM"
                            ? "bg-yellow-500/10 border-yellow-500/30"
                            : "bg-red-500/10 border-red-500/30"
                        )}>
                          <div className="flex items-center gap-2 mb-1">
                            <AlertTriangle className={cn(
                              "w-4 h-4",
                              slippageWarning?.slippageLevel === "LOW" ? "text-emerald-400"
                              : slippageWarning?.slippageLevel === "MEDIUM" ? "text-yellow-400"
                              : "text-red-400"
                            )} />
                            <span className="text-xs text-zinc-400">Slippage</span>
                          </div>
                          <div className={cn(
                            "text-lg font-semibold",
                            slippageWarning?.slippageLevel === "LOW" ? "text-emerald-400"
                            : slippageWarning?.slippageLevel === "MEDIUM" ? "text-yellow-400"
                            : "text-red-400"
                          )}>
                            {slippageWarning?.totalSlippagePercent.toFixed(1) || "0"}%
                          </div>
                          <div className="text-xs text-zinc-500 mt-1">
                            Buy: {slippageWarning?.buySlippagePercent.toFixed(1) || 0}% / Sell: {slippageWarning?.sellSlippagePercent.toFixed(1) || 0}%
                          </div>
                        </div>

                        {/* Implied Volatility */}
                        <div className={cn(
                          "p-3 rounded-lg border",
                          combinedVolatility?.level === "LOW" 
                            ? "bg-emerald-500/10 border-emerald-500/30"
                            : combinedVolatility?.level === "MEDIUM"
                            ? "bg-yellow-500/10 border-yellow-500/30"
                            : "bg-red-500/10 border-red-500/30"
                        )}>
                          <div className="flex items-center gap-2 mb-1">
                            <Activity className={cn(
                              "w-4 h-4",
                              combinedVolatility?.level === "LOW" ? "text-emerald-400"
                              : combinedVolatility?.level === "MEDIUM" ? "text-yellow-400"
                              : "text-red-400"
                            )} />
                            <span className="text-xs text-zinc-400">Implied Vol (σ)</span>
                          </div>
                          <div className={cn(
                            "text-lg font-semibold",
                            combinedVolatility?.level === "LOW" ? "text-emerald-400"
                            : combinedVolatility?.level === "MEDIUM" ? "text-yellow-400"
                            : "text-red-400"
                          )}>
                            {combinedVolatility?.impliedVolPercent || 0}%
                          </div>
                          <div className="text-xs text-zinc-500 mt-1">
                            {combinedVolatility?.level || "LOW"} uncertainty
                          </div>
                        </div>
                      </div>
                    </>
                  )}

                  <div className="h-52">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={selected.profitCurve}>
                        <defs>
                          <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#10b981" stopOpacity={0.3}/>
                            <stop offset="100%" stopColor="#10b981" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="shares" stroke="#52525b" fontSize={10} tickFormatter={v=>`${(v/1000).toFixed(0)}k`}/>
                        <YAxis stroke="#52525b" fontSize={10} tickFormatter={v=>`$${v}`} width={45}/>
                        <Tooltip contentStyle={{background:"#18181b",border:"1px solid #3f3f46",borderRadius:6,fontSize:12}}
                          labelFormatter={v=>`${Number(v).toLocaleString()} shares`}
                          formatter={(v:number)=>[`$${v.toFixed(2)}`,"Profit"]}/>
                        <Area type="monotone" dataKey="profit" stroke="#10b981" strokeWidth={2} fill="url(#g)"/>
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="text-xs text-zinc-600 mt-2">Max: {selected.maxProfitableShares.toLocaleString()} shares</p>
                </div>

                {/* Prices */}
                <div className="p-5 rounded-xl bg-zinc-900 border border-zinc-800">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="font-semibold">Orderbook</h2>
                    {selected.correlation && (
                      <button onClick={() => setShowWhy(!showWhy)}
                        className={cn("p-1.5 rounded", showWhy ? "bg-emerald-500/20 text-emerald-400" : "bg-zinc-800 text-zinc-500")}>
                        <Info className="w-4 h-4"/>
                      </button>
                    )}
                  </div>
                  {showWhy && selected.correlation && (
                    <div className="mb-4 p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20 text-sm text-zinc-400">
                      {selected.correlation.reasoning}
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-emerald-400 text-xs mb-1">BUY @ ${selected.buyPrice.toFixed(4)}</p>
                      <p className="text-zinc-300 line-clamp-2">{selected.market1Question}</p>
                    </div>
                    <div>
                      <p className="text-red-400 text-xs mb-1">SELL @ ${selected.sellPrice.toFixed(4)}</p>
                      <p className="text-zinc-300 line-clamp-2">{selected.market2Question}</p>
                    </div>
                  </div>
                </div>

                {/* Risk Profile Card */}
                {riskProfile && (
                  <div className={cn(
                    "p-5 rounded-xl border",
                    riskProfile.color === "emerald" ? "bg-emerald-500/5 border-emerald-500/30" :
                    riskProfile.color === "blue" ? "bg-blue-500/5 border-blue-500/30" :
                    riskProfile.color === "yellow" ? "bg-yellow-500/5 border-yellow-500/30" :
                    "bg-red-500/5 border-red-500/30"
                  )}>
                    <div className="flex items-center gap-3 mb-3">
                      <Shield className={cn(
                        "w-5 h-5",
                        riskProfile.color === "emerald" ? "text-emerald-400" :
                        riskProfile.color === "blue" ? "text-blue-400" :
                        riskProfile.color === "yellow" ? "text-yellow-400" :
                        "text-red-400"
                      )} />
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">Risk Profile:</span>
                        <span className={cn(
                          "px-2 py-0.5 rounded text-sm font-bold",
                          riskProfile.color === "emerald" ? "bg-emerald-500/20 text-emerald-400" :
                          riskProfile.color === "blue" ? "bg-blue-500/20 text-blue-400" :
                          riskProfile.color === "yellow" ? "bg-yellow-500/20 text-yellow-400" :
                          "bg-red-500/20 text-red-400"
                        )}>
                          {riskProfile.emoji} {riskProfile.overall}
                        </span>
                      </div>
                    </div>

                    <p className={cn(
                      "text-sm mb-3",
                      riskProfile.color === "emerald" ? "text-emerald-300" :
                      riskProfile.color === "blue" ? "text-blue-300" :
                      riskProfile.color === "yellow" ? "text-yellow-300" :
                      "text-red-300"
                    )}>
                      {riskProfile.summary}
                    </p>

                    <div className="space-y-1 mb-4">
                      {riskProfile.details.map((detail, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs text-zinc-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
                          {detail}
                        </div>
                      ))}
                    </div>

                    <div className={cn(
                      "p-3 rounded-lg text-sm",
                      riskProfile.color === "emerald" ? "bg-emerald-500/10" :
                      riskProfile.color === "blue" ? "bg-blue-500/10" :
                      riskProfile.color === "yellow" ? "bg-yellow-500/10" :
                      "bg-red-500/10"
                    )}>
                      <span className="text-zinc-500">💡 </span>
                      <span className="text-zinc-300">{riskProfile.recommendation}</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
