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
  Shield,
  Info,
  X
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Label
} from "recharts";
import { motion, AnimatePresence } from "framer-motion";
import type { ArbitrageOpportunity } from "@/services/arbitrage-engine";
import { calculateSlippageWarning } from "@/lib/slippage";
import { calculateVolatility, calculateRiskProfile } from "@/lib/volatility";

interface Opportunity extends ArbitrageOpportunity {
  correlation?: { type: string; confidence: number; reasoning: string };
}

const FORMULAS = {
  profit: {
    title: "Net Profit Calculation",
    math: "P_net = (P_sell × S) - (P_buy × S) - F",
    desc: "The absolute profit realized after executing both legs of the arbitrage strategy, accounting for position size and fees.",
    vars: [
      { sym: "P_net", desc: "Net Profit ($)" },
      { sym: "P_sell", desc: "Sell Price per Share" },
      { sym: "P_buy", desc: "Buy Price per Share" },
      { sym: "S", desc: "Position Size (Shares)" },
      { sym: "F", desc: "Estimated Network Fees" }
    ]
  },
  slippage: {
    title: "Slippage Impact Model",
    math: "S_% = ((P_exec - P_mid) / P_mid) × 100",
    desc: "Quantifies the price degradation caused by limited liquidity in the order book. Higher slippage means worse execution prices.",
    vars: [
      { sym: "S_%", desc: "Slippage Percentage" },
      { sym: "P_exec", desc: "Execution Price (VWAP)" },
      { sym: "P_mid", desc: "Mid-Market Price" }
    ]
  },
  volatility: {
    title: "Implied Volatility Proxy",
    math: "σ ≈ √(2π / T) × (P_opt / P_fwd)",
    desc: "Estimates market uncertainty derived from the option price relative to its time to expiry. High volatility implies higher risk.",
    vars: [
      { sym: "σ", desc: "Implied Volatility" },
      { sym: "T", desc: "Time to Expiry (Years)" },
      { sym: "P_opt", desc: "Current Option Price" },
      { sym: "P_fwd", desc: "Forward Price" }
    ]
  },
  risk: {
    title: "Composite Risk Score",
    math: "R = f(P, S_%, σ, Δ)",
    desc: "A multi-factor risk assessment algorithm that weighs profit potential against execution slippage, volatility, and spread width.",
    vars: [
      { sym: "R", desc: "Risk Rating (Likely / Risky)" },
      { sym: "P", desc: "Profit Potential" },
      { sym: "S_%", desc: "Slippage Impact" },
      { sym: "σ", desc: "Market Volatility" },
      { sym: "Δ", desc: "Bid-Ask Spread" }
    ]
  },
  spread: {
    title: "Bid-Ask Spread",
    math: "Δ = P_ask - P_bid",
    desc: "The difference between the lowest asking price and the highest bidding price. Tighter spreads indicate more liquid markets.",
    vars: [
      { sym: "Δ", desc: "Spread Width" },
      { sym: "P_ask", desc: "Best Ask Price" },
      { sym: "P_bid", desc: "Best Bid Price" }
    ]
  }
};

type FormulaKey = keyof typeof FORMULAS;

interface DashboardProps {
  tabSwitcher?: React.ReactNode;
}

export function Dashboard({ tabSwitcher }: DashboardProps) {
  const [opps, setOpps] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [selected, setSelected] = useState<Opportunity | null>(null);
  const [shares, setShares] = useState(100);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [activeFormula, setActiveFormula] = useState<FormulaKey | null>(null);
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

  const InfoButton = ({ type }: { type: FormulaKey }) => (
    <button 
      onClick={(e) => { e.stopPropagation(); setActiveFormula(type); }}
      className="ml-1.5 p-0.5 rounded-full hover:bg-white/10 transition-colors inline-flex items-center justify-center"
    >
      <Info className="w-3 h-3 text-zinc-600 hover:text-blue-400 transition-colors" />
    </button>
  );

  const getFormulaKeyForLabel = (label: string): FormulaKey | null => {
    if (label.includes("Slippage")) return "slippage";
    if (label.includes("Vol")) return "volatility";
    if (label.includes("Spread")) return "spread";
    if (label.includes("Profit")) return "profit";
    return null;
  };

  return (
    <div className="flex flex-col h-full bg-[#000000] text-zinc-300 font-sans selection:bg-blue-900 selection:text-white">
      {/* 1. TOP BAR: Global Stats & Controls */}
      <header className="h-12 border-b border-zinc-800 bg-[#050505] flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center">
          <div className="flex gap-6 text-xs font-sans tracking-wide">
            <div className="flex gap-2">
              <span className="text-zinc-500 uppercase tracking-widest font-bold">Arbitrage Opportunities</span>
              <span className="text-zinc-100 font-mono">{totalCount}</span>
            </div>
          </div>
          {tabSwitcher}
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={scanMarkets}
            disabled={scanning}
            className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold uppercase tracking-widest transition-colors disabled:opacity-50 rounded-sm"
          >
            {scanning ? "SCANNING..." : "SCAN MARKETS"}
          </button>
          <button 
            onClick={refresh}
            className="p-1.5 hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors rounded-full"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
          </button>
        </div>
      </header>

      {/* 2. MAIN CONTENT: Split View */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* LEFT PANE: Data Grid (60%) */}
        <div className="flex-1 border-r border-zinc-800 flex flex-col min-w-0">
          {/* Table Header */}
          <div className="grid grid-cols-12 gap-2 px-4 py-2 border-b border-zinc-800 bg-[#0a0a0a] text-[10px] font-sans font-medium text-zinc-500 uppercase tracking-wider sticky top-0">
            <div className="col-span-1">ID</div>
            <div className="col-span-5">Market Pair</div>
            <div className="col-span-2 text-right">Buy Price</div>
            <div className="col-span-2 text-right">Sell Price</div>
            <div className="col-span-2 text-right">Profit</div>
          </div>

          {/* Table Body */}
          <div className="overflow-y-auto flex-1 no-scrollbar">
            {opps.map((o, i) => (
              <div
                key={i}
                onClick={() => setSelected(o)}
                className={cn(
                  "grid grid-cols-12 gap-2 px-4 py-3 border-b border-zinc-800/50 cursor-pointer transition-colors hover:bg-zinc-900 group font-sans text-xs",
                  selected === o && "bg-[#0f121a] border-l-2 border-l-blue-500"
                )}
              >
                <div className="col-span-1 text-zinc-600 group-hover:text-zinc-400 font-mono">
                  {String(i + 1).padStart(2, '0')}
                </div>
                <div className="col-span-5 font-sans min-w-0 flex flex-col gap-1">
                  <div className="text-zinc-300 truncate text-[11px] leading-tight" title={o.market1Question}>
                    {o.market1Question}
                  </div>
                  <div className="text-zinc-400 truncate text-[11px] leading-tight" title={o.market2Question}>
                    {o.market2Question}
                  </div>
                  <div className="text-zinc-500 truncate text-[10px] flex items-center gap-1.5 mt-0.5">
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
          <div className="w-[550px] bg-[#050505] flex flex-col shrink-0 border-l border-zinc-800">
            {/* Header */}
            <div className="px-6 py-4 border-b border-zinc-800">
              <h2 className="text-sm font-bold text-zinc-100 uppercase tracking-widest flex items-center gap-2">
                <Maximize2 className="w-3 h-3 text-blue-500" />
                Execution Analysis
              </h2>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-8 no-scrollbar">
              
              {/* 1. Profit Curve (Recharts) - Moved to top & Bigger */}
              <div className="h-[280px] w-full bg-zinc-900/20 border border-zinc-800 rounded-lg p-4 relative group">
                <div className="absolute top-4 left-4 text-[10px] uppercase text-zinc-500 font-bold tracking-wider z-10">Profit / Size Curve</div>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={selected.profitCurve}>
                    <defs>
                      <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <XAxis 
                      dataKey="shares" 
                      stroke="#444" 
                      fontSize={10} 
                      tickLine={false} 
                      axisLine={false}
                      tickFormatter={v => `${v}`} 
                      dy={10}
                      height={40}
                    >
                      <Label value="POSITION SIZE (SHARES)" offset={0} position="insideBottom" fill="#52525b" fontSize={9} fontWeight={600} />
                    </XAxis>
                    <YAxis 
                      stroke="#444" 
                      fontSize={10} 
                      tickLine={false} 
                      axisLine={false}
                      tickFormatter={v => `$${v}`}
                      width={30}
                    />
                    <Tooltip 
                      contentStyle={{ background: '#09090b', border: '1px solid #27272a', borderRadius: '4px', fontSize: '12px', boxShadow: '0 4px 20px rgba(0,0,0,0.5)' }}
                      itemStyle={{ color: '#e4e4e7' }}
                      cursor={{ stroke: '#3b82f6', strokeWidth: 1, strokeDasharray: '4 4' }}
                      formatter={(value) => [`$${(value as number)?.toFixed(2) ?? '0.00'}`, "Profit"]}
                      labelFormatter={(label) => `Size: ${label} shares`}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="profit" 
                      stroke="#10b981" 
                      strokeWidth={2} 
                      fill="url(#chartGrad)" 
                      animationDuration={1000}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* 2. Controls & Execution Logic */}
              <div className="grid grid-cols-1 gap-6">
                
                {/* Inputs */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] uppercase text-zinc-500 font-bold block mb-2">Position Size</label>
                    <div className="relative">
                      <input 
                        type="number" 
                        value={shares}
                        onChange={e => setShares(Number(e.target.value))}
                        className="w-full bg-zinc-900/50 border border-zinc-800 text-zinc-100 font-mono text-sm px-3 py-2.5 rounded hover:border-zinc-700 focus:border-blue-500 outline-none transition-colors"
                      />
                      <span className="absolute right-3 top-2.5 text-xs text-zinc-600 font-mono">SHARES</span>
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] uppercase text-zinc-500 font-bold mb-2 flex items-center">
                      Est. Net Profit
                      <InfoButton type="profit" />
                    </label>
                    <div className={cn(
                      "w-full bg-zinc-900/50 border border-zinc-800 font-mono text-sm px-3 py-2.5 rounded flex items-center justify-between",
                      (currentProfit?.profit || 0) > 0 ? "text-emerald-400 border-emerald-500/20 bg-emerald-500/5" : "text-red-400"
                    )}>
                      <span className="flex items-center"><DollarSign className="w-3 h-3 mr-1" />{currentProfit?.profit.toFixed(2) || "0.00"}</span>
                      <span className="text-[10px] bg-emerald-500/20 px-1.5 py-0.5 rounded text-emerald-300">
                         {currentProfit ? ((currentProfit.profit / currentProfit.totalCost) * 100).toFixed(1) : 0}%
                      </span>
                    </div>
                  </div>
                </div>

                {/* Routing Visualization */}
                <div>
                   <label className="text-[10px] uppercase text-zinc-500 font-bold block mb-2">Order Routing</label>
                   <div className="bg-zinc-900/30 rounded-lg p-1 space-y-1">
                      <div className="flex items-center p-3 bg-zinc-900/50 rounded border border-zinc-800/50">
                        <div className="w-16 text-[10px] font-bold text-blue-400">BUY LEG</div>
                        <div className="flex-1 px-3 text-xs text-zinc-300 truncate font-medium">{selected.market1Question}</div>
                        <div className="font-mono text-xs text-zinc-400">${selected.buyPrice.toFixed(3)}</div>
                      </div>
                      <div className="flex items-center p-3 bg-zinc-900/50 rounded border border-zinc-800/50">
                        <div className="w-16 text-[10px] font-bold text-red-400">SELL LEG</div>
                        <div className="flex-1 px-3 text-xs text-zinc-300 truncate font-medium">{selected.market2Question}</div>
                        <div className="font-mono text-xs text-zinc-400">${selected.sellPrice.toFixed(3)}</div>
                      </div>
                   </div>
                </div>

              </div>

              {/* 4. Risk Matrix Table */}
              <div>
                <h3 className="text-[10px] uppercase text-zinc-500 font-bold mb-3 flex items-center gap-2">
                  <Shield className="w-3 h-3" /> Risk Assessment Matrix
                  <InfoButton type="risk" />
                </h3>
                <div className="border border-zinc-800 rounded-lg overflow-hidden text-xs">
                  <div className="grid grid-cols-2 p-2.5 border-b border-zinc-800 bg-zinc-900/50">
                    <span className="text-zinc-500 font-medium">FACTOR</span>
                    <span className="text-zinc-500 text-right font-medium">RATING</span>
                  </div>
                  
                  {riskData?.profile?.details.map((detail, i) => {
                    const [rating, ...rest] = detail.split(' ');
                    const label = rest.join(' ');
                    const isGood = detail.startsWith('✓');
                    const isWarn = detail.startsWith('⚠') || detail.startsWith('✗');
                    const formulaKey = getFormulaKeyForLabel(label);
                    
                    return (
                      <div key={i} className="grid grid-cols-2 p-2.5 border-b border-zinc-800 last:border-0 hover:bg-zinc-900/30 transition-colors group/row relative">
                        <span className="text-zinc-300 flex items-center">
                          {label.split(':')[0]}
                          {formulaKey && <InfoButton type={formulaKey} />}
                        </span>
                        <span className={cn("text-right font-sans font-medium", isGood ? "text-emerald-400" : isWarn ? "text-red-400" : "text-yellow-400")}>
                          {detail.split(':')[1] || rating}
                        </span>
                      </div>
                    );
                  })}
                  
                  <div className="grid grid-cols-2 p-3 bg-zinc-900/30 border-t border-zinc-800 font-bold">
                    <span className="text-zinc-100 flex items-center">
                      OVERALL SCORE
                      <InfoButton type="risk" />
                    </span>
                    <span className={cn("text-right tracking-wider", 
                      riskData?.profile?.overall === "EXCELLENT" ? "text-emerald-400" :
                      riskData?.profile?.overall === "RISKY" ? "text-red-400" : "text-yellow-400"
                    )}>
                      {riskData?.profile?.overall}
                    </span>
                  </div>
                </div>
              </div>

              {/* 5. Correlation Note */}
              {selected.correlation && (
                <div className="text-xs text-zinc-400/80 border border-zinc-800/50 p-4 rounded-lg bg-blue-500/5 leading-relaxed">
                  <span className="text-blue-400 font-bold mr-2 uppercase tracking-wide text-[10px]">Logic</span>
                  {selected.correlation.reasoning}
                </div>
              )}

            </div>
          </div>
        ) : (
          <div className="w-[550px] bg-[#050505] border-l border-zinc-800 flex items-center justify-center text-zinc-700 text-xs uppercase tracking-widest flex-col gap-4">
             <div className="w-16 h-16 rounded-full border border-zinc-800 flex items-center justify-center">
                <Search className="w-6 h-6 text-zinc-800" />
             </div>
             <span>Select a pair to analyze</span>
          </div>
        )}
      </div>

      {/* MATH MODAL */}
      <AnimatePresence>
        {activeFormula && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
            onClick={() => setActiveFormula(null)}
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-2xl bg-[#0a0a0a] border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="p-8">
                <div className="flex justify-between items-start mb-8">
                  <div>
                    <h2 className="text-2xl font-bold text-white tracking-tight mb-2">
                      {FORMULAS[activeFormula].title}
                    </h2>
                    <p className="text-zinc-500 text-sm max-w-lg leading-relaxed">
                      {FORMULAS[activeFormula].desc}
                    </p>
                  </div>
                  <button 
                    onClick={() => setActiveFormula(null)}
                    className="p-2 rounded-full hover:bg-white/10 transition-colors"
                  >
                    <X className="w-5 h-5 text-zinc-500" />
                  </button>
                </div>

                <div className="mb-10 p-8 bg-zinc-900/50 rounded-xl border border-zinc-800 flex justify-center">
                  <code className="text-3xl font-serif italic text-blue-400 tracking-wide">
                    {FORMULAS[activeFormula].math}
                  </code>
                </div>

                <div>
                  <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-4">Variables</h3>
                  <div className="grid gap-3">
                    {FORMULAS[activeFormula].vars.map((v, i) => (
                      <div key={i} className="flex items-center gap-4 p-3 rounded-lg hover:bg-zinc-900/30 transition-colors">
                        <div className="w-16 font-serif italic text-zinc-300 text-right font-medium">{v.sym}</div>
                        <div className="h-px w-4 bg-zinc-800" />
                        <div className="text-zinc-500 text-sm">{v.desc}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="px-8 py-4 bg-zinc-900/30 border-t border-zinc-800 text-[10px] text-zinc-600 font-mono text-center uppercase tracking-widest">
                Arbitrage Engine • Mathematical Model v1.0
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
