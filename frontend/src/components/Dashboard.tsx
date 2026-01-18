"use client";

import React, { useEffect, useState, useRef } from "react";
import { 
  RefreshCw, 
  ArrowRight, 
  Activity,
  AlertTriangle,
  Search,
  Maximize2,
  TrendingUp,
  DollarSign,
  BarChart2,
  Shield
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine
} from "recharts";
import type { ArbitrageOpportunity } from "@/services/arbitrage-engine";
import { calculateSlippageWarning } from "@/lib/slippage";
import { calculateVolatility, calculateRiskProfile } from "@/lib/volatility";

interface Opportunity extends ArbitrageOpportunity {
  correlation?: { type: string; confidence: number; reasoning: string };
}

export function Dashboard() {
  const [opps, setOpps] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [selected, setSelected] = useState<Opportunity | null>(null);
  const [shares, setShares] = useState(100);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const hasFetched = useRef(false);

  // Data fetching logic
  const fetchOpportunities = async (pageNum = 0) => {
    const r = await fetch(`/api/arbitrage/opportunities?page=${pageNum}&limit=50`);
    const d = await r.json();
    if (d.success && d.opportunities) {
      if (pageNum === 0) {
        setOpps(d.opportunities);
        if (d.opportunities.length > 0 && !selected) setSelected(d.opportunities[0]);
      } else {
        setOpps(prev => [...prev, ...d.opportunities]);
      }
      setTotalCount(d.totalOpportunities || d.opportunities.length);
      return d.opportunities.length;
    }
    return 0;
  };

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    const init = async () => {
      try { await fetchOpportunities(0); } 
      catch (e) { console.error(e); }
      finally { setLoading(false); }
    };
    init();
  }, []);

  const refresh = async () => {
    setLoading(true);
    try { await fetchOpportunities(0); } 
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const scanMarkets = async () => {
    setScanning(true);
    try {
      const r = await fetch("/api/arbitrage/scraper", { method: "POST" });
      const d = await r.json();
      if (d.success) await fetchOpportunities(0);
    } catch (e) { console.error(e); }
    finally { setScanning(false); }
  };

  // Calculations for selected opportunity
  const currentProfit = selected ? (() => {
    if (!selected.profitCurve?.length) return null;
    return selected.profitCurve.reduce((closest, p) =>
      Math.abs(p.shares - shares) < Math.abs(closest.shares - shares) ? p : closest
    );
  })() : null;

  const riskData = selected ? (() => {
    const spread1 = (selected.market1YesRange?.max || 0) - (selected.market1YesRange?.min || 0);
    const spread2 = (selected.market2YesRange?.max || 0) - (selected.market2YesRange?.min || 0);
    
    const slippage = calculateSlippageWarning({
      tradeSize: shares,
      expectedBuyPrice: selected.market1YesRange?.midpoint || selected.buyPrice,
      executedBuyPrice: selected.buyPrice,
      expectedSellPrice: selected.market2YesRange?.midpoint || selected.sellPrice,
      executedSellPrice: selected.sellPrice,
    });

    const vol = calculateVolatility({
      optionPrice: selected.market1YesDisplayPrice ?? selected.market1YesRange?.midpoint ?? 0.5,
      bidAskSpread: spread1 || 0.02,
      timeToExpiry: 0.25,
    });

    const profile = currentProfit ? calculateRiskProfile({
      profitAmount: currentProfit.profit,
      slippagePercent: slippage.totalSlippagePercent,
      slippageLevel: slippage.slippageLevel,
      impliedVol: vol.impliedVol,
      volatilityLevel: vol.level,
      maxShares: selected.maxProfitableShares,
      currentShares: shares,
      spread1: spread1 || 0.02,
      spread2: spread2 || 0.02,
    }) : null;

    return { slippage, vol, profile };
  })() : null;

  return (
    <div className="flex flex-col h-screen bg-[#000000] text-zinc-300 font-sans selection:bg-blue-900 selection:text-white">
      {/* 1. TOP BAR: Global Stats & Controls */}
      <header className="h-12 border-b border-zinc-800 bg-[#050505] flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 text-zinc-100 font-bold tracking-tight">
            <Activity className="w-4 h-4 text-blue-500" />
            POLY_ARB_TERMINAL
          </div>
          <div className="h-4 w-px bg-zinc-800" />
          <div className="flex gap-6 text-xs font-mono">
            <div className="flex gap-2">
              <span className="text-zinc-500">OPPORTUNITIES</span>
              <span className="text-zinc-100">{totalCount}</span>
            </div>
            <div className="flex gap-2">
              <span className="text-zinc-500">TOTAL_VAL</span>
              <span className="text-emerald-500">${opps.reduce((s, o) => s + (o.profitAt100Shares || 0), 0).toFixed(2)}</span>
            </div>
            <div className="flex gap-2">
              <span className="text-zinc-500">AVG_YIELD</span>
              <span className="text-blue-400">12.4%</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={scanMarkets}
            disabled={scanning}
            className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium uppercase tracking-wide transition-colors disabled:opacity-50"
          >
            {scanning ? "SCANNING..." : "SCAN MARKETS"}
          </button>
          <button 
            onClick={refresh}
            className="p-1.5 hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
          >
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
          </button>
        </div>
      </header>

      {/* 2. MAIN CONTENT: Split View */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* LEFT PANE: Data Grid (60%) */}
        <div className="flex-1 border-r border-zinc-800 flex flex-col min-w-0">
          {/* Table Header */}
          <div className="grid grid-cols-12 gap-2 px-4 py-2 border-b border-zinc-800 bg-[#0a0a0a] text-[10px] font-mono font-medium text-zinc-500 uppercase tracking-wider sticky top-0">
            <div className="col-span-1">ID</div>
            <div className="col-span-5">Market Pair / Logic</div>
            <div className="col-span-2 text-right">Bid/Ask 1</div>
            <div className="col-span-2 text-right">Bid/Ask 2</div>
            <div className="col-span-2 text-right">Profit (100)</div>
          </div>

          {/* Table Body */}
          <div className="overflow-y-auto flex-1 scrollbar-thin scrollbar-track-zinc-950 scrollbar-thumb-zinc-800">
            {opps.map((o, i) => (
              <div
                key={i}
                onClick={() => setSelected(o)}
                className={cn(
                  "grid grid-cols-12 gap-2 px-4 py-3 border-b border-zinc-800/50 cursor-pointer transition-colors hover:bg-zinc-900 group font-mono text-xs",
                  selected === o && "bg-[#0f121a] border-l-2 border-l-blue-500"
                )}
              >
                <div className="col-span-1 text-zinc-600 group-hover:text-zinc-400">
                  {String(i + 1).padStart(2, '0')}
                </div>
                <div className="col-span-5 font-sans min-w-0">
                  <div className="text-zinc-300 truncate mb-0.5">{o.market1Question}</div>
                  <div className="text-zinc-500 truncate text-[10px] flex items-center gap-1.5">
                    <span className="text-blue-500/80 font-bold">BUY {o.executionStrategy.buyOutcome}</span>
                    <ArrowRight className="w-3 h-3 text-zinc-700" />
                    <span className="text-red-500/80 font-bold">SELL {o.executionStrategy.sellOutcome}</span>
                  </div>
                </div>
                <div className="col-span-2 text-right text-zinc-400">
                  ${o.buyPrice.toFixed(3)}
                </div>
                <div className="col-span-2 text-right text-zinc-400">
                  ${o.sellPrice.toFixed(3)}
                </div>
                <div className={cn(
                  "col-span-2 text-right font-medium",
                  (o.profitAt100Shares || 0) > 0 ? "text-emerald-500" : "text-zinc-500"
                )}>
                  ${(o.profitAt100Shares || 0).toFixed(2)}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT PANE: Analysis (40%) */}
        {selected ? (
          <div className="w-[450px] bg-[#050505] flex flex-col shrink-0 border-l border-zinc-800">
            {/* Header */}
            <div className="px-5 py-4 border-b border-zinc-800">
              <h2 className="text-sm font-bold text-zinc-100 uppercase tracking-widest flex items-center gap-2">
                <Maximize2 className="w-3 h-3 text-blue-500" />
                Execution Analysis
              </h2>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              
              {/* 1. Execution Block */}
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs uppercase tracking-wide text-zinc-500 mb-1">
                  <span>Order Routing</span>
                  <span className="font-mono text-zinc-300">QTY: {shares}</span>
                </div>
                
                <div className="p-3 bg-zinc-900/50 border border-zinc-800 rounded-sm space-y-3 font-mono text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-blue-400 font-bold">BUY LEG</span>
                    <span className="text-zinc-100">${selected.buyPrice.toFixed(4)}</span>
                  </div>
                  <div className="text-zinc-500 truncate pb-2 border-b border-zinc-800 border-dashed">
                    {selected.market1Question}
                  </div>
                  
                  <div className="flex justify-between items-center pt-1">
                    <span className="text-red-400 font-bold">SELL LEG</span>
                    <span className="text-zinc-100">${selected.sellPrice.toFixed(4)}</span>
                  </div>
                  <div className="text-zinc-500 truncate">
                    {selected.market2Question}
                  </div>
                </div>
              </div>

              {/* 2. Profit Curve (Recharts) */}
              <div className="h-[200px] w-full bg-zinc-900/20 border border-zinc-800 rounded-sm p-3 relative">
                <div className="absolute top-3 left-3 text-[10px] uppercase text-zinc-500 font-bold">Profit / Size Curve</div>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={selected.profitCurve}>
                    <defs>
                      <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <XAxis 
                      dataKey="shares" 
                      stroke="#333" 
                      fontSize={10} 
                      tickLine={false} 
                      axisLine={false}
                      tickFormatter={v => `${v/1000}k`} 
                    />
                    <YAxis 
                      stroke="#333" 
                      fontSize={10} 
                      tickLine={false} 
                      axisLine={false}
                      tickFormatter={v => `$${v}`}
                      width={30}
                    />
                    <Tooltip 
                      contentStyle={{ background: '#000', border: '1px solid #333', fontSize: '12px' }}
                      itemStyle={{ color: '#fff' }}
                    />
                    <Area 
                      type="step" 
                      dataKey="profit" 
                      stroke="#10b981" 
                      strokeWidth={1} 
                      fill="url(#chartGrad)" 
                    />
                    <ReferenceLine x={shares} stroke="#3b82f6" strokeDasharray="3 3" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* 3. Controls */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] uppercase text-zinc-500 font-bold block mb-1">Position Size</label>
                  <input 
                    type="number" 
                    value={shares}
                    onChange={e => setShares(Number(e.target.value))}
                    className="w-full bg-zinc-900 border border-zinc-800 text-zinc-100 font-mono text-sm px-3 py-2 focus:border-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase text-zinc-500 font-bold block mb-1">Est. Net Profit</label>
                  <div className={cn(
                    "w-full bg-zinc-900 border border-zinc-800 font-mono text-sm px-3 py-2 flex items-center",
                    (currentProfit?.profit || 0) > 0 ? "text-emerald-500" : "text-red-500"
                  )}>
                    <DollarSign className="w-3 h-3 mr-1" />
                    {currentProfit?.profit.toFixed(2) || "0.00"}
                  </div>
                </div>
              </div>

              {/* 4. Risk Matrix Table */}
              <div>
                <h3 className="text-[10px] uppercase text-zinc-500 font-bold mb-2 flex items-center gap-2">
                  <Shield className="w-3 h-3" /> Risk Assessment Matrix
                </h3>
                <div className="border border-zinc-800 text-xs">
                  <div className="grid grid-cols-2 p-2 border-b border-zinc-800 bg-zinc-900/50">
                    <span className="text-zinc-500">FACTOR</span>
                    <span className="text-zinc-500 text-right">RATING</span>
                  </div>
                  
                  {riskData?.profile?.details.map((detail, i) => {
                    const [rating, ...rest] = detail.split(' ');
                    const label = rest.join(' ');
                    const isGood = detail.startsWith('✓');
                    const isWarn = detail.startsWith('⚠') || detail.startsWith('✗');
                    
                    return (
                      <div key={i} className="grid grid-cols-2 p-2 border-b border-zinc-800 last:border-0 font-mono">
                        <span className="text-zinc-300">{label.split(':')[0]}</span>
                        <span className={cn("text-right", isGood ? "text-emerald-500" : isWarn ? "text-red-500" : "text-yellow-500")}>
                          {detail.split(':')[1] || rating}
                        </span>
                      </div>
                    );
                  })}
                  
                  <div className="grid grid-cols-2 p-2 bg-zinc-900/30 border-t border-zinc-800 font-bold">
                    <span className="text-zinc-100">OVERALL SCORE</span>
                    <span className={cn("text-right", 
                      riskData?.profile?.overall === "EXCELLENT" ? "text-emerald-500" :
                      riskData?.profile?.overall === "RISKY" ? "text-red-500" : "text-yellow-500"
                    )}>
                      {riskData?.profile?.overall}
                    </span>
                  </div>
                </div>
              </div>

              {/* 5. Correlation Note */}
              {selected.correlation && (
                <div className="text-xs text-zinc-500 border border-zinc-800 p-3 bg-zinc-900/30 font-mono">
                  <span className="text-blue-500 font-bold mr-2">LOGIC:</span>
                  {selected.correlation.reasoning}
                </div>
              )}

            </div>
          </div>
        ) : (
          <div className="w-[450px] bg-[#050505] border-l border-zinc-800 flex items-center justify-center text-zinc-700 text-xs uppercase tracking-widest">
            Select a pair to analyze
          </div>
        )}
      </div>
    </div>
  );
}
