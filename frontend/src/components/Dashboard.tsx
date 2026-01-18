"use client";

import React, { useEffect, useState, useRef } from "react";
import { Info, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
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
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
