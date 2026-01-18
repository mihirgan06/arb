"use client";

import React, { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { 
  Loader2, 
  RefreshCw, 
  ArrowRight,
  TrendingUp,
  Zap,
  LayoutGrid,
  ShieldCheck,
  Target,
  BarChart3,
  MousePointer2,
  ChevronRight,
  ChevronLeft,
  Activity,
  Maximize2,
  Navigation2,
  Radar,
  X
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { calculateVolatility } from "@/lib/volatility";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { ArbitrageOpportunity } from "@/services/arbitrage-engine";

// Dynamically import the Radar Grid
const RadarGrid = dynamic(() => import("./RadarGrid"), { 
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex flex-col items-center justify-center gap-4 opacity-20">
      <div className="relative">
        <Radar className="w-16 h-16 animate-spin text-[#00FF80]" style={{ animationDuration: '3s' }} />
        <div className="absolute inset-0 bg-[#00FF80] blur-2xl opacity-20 rounded-full" />
      </div>
      <p className="font-display tracking-[0.4em] text-[10px] text-[#00FF80]">CALIBRATING_RADAR_ARRAY</p>
    </div>
  )
});

interface Opportunity extends ArbitrageOpportunity {
  correlation?: { type: string; confidence: number; reasoning: string };
}

export function Dashboard() {
  const [opps, setOpps] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Opportunity | null>(null);
  const [shares, setShares] = useState(100);
  const [hasFetched, setHasFetched] = useState(false);
  const [showRightSidebar, setShowRightSidebar] = useState(true);
  const [showLeftSidebar, setShowLeftSidebar] = useState(true);
  const [showChartModal, setShowChartModal] = useState(false);

  const handleSelectOpportunity = (opp: Opportunity) => {
    setSelected(opp);
    setShowLeftSidebar(false);
  };

  const fetchOpportunities = async () => {
    try {
      const r = await fetch(`/api/arbitrage/opportunities?page=0&limit=15`);
      const d = await r.json();
      if (d.success && d.opportunities) {
        setOpps(d.opportunities);
        // Removed auto-selection of first opportunity
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (hasFetched) return;
    fetchOpportunities();
    setHasFetched(true);
  }, [hasFetched]);

  const getProfit = (curve: Opportunity["profitCurve"], targetShares: number) => {
    if (!curve || curve.length === 0) return null;
    return curve.reduce((closest, p) =>
      Math.abs(p.shares - targetShares) < Math.abs(closest.shares - targetShares) ? p : closest
    );
  };

  const currentProfit = selected ? getProfit(selected.profitCurve, shares) : null;
  
  const spread1 = selected ? (selected.market1YesRange?.max || 0) - (selected.market1YesRange?.min || 0) : 0;
  const spread2 = selected ? (selected.market2YesRange?.max || 0) - (selected.market2YesRange?.min || 0) : 0;
  const vol1 = selected ? calculateVolatility({
    optionPrice: selected.market1YesDisplayPrice ?? selected.market1YesRange?.midpoint ?? 0.5,
    bidAskSpread: spread1 || 0.02,
    timeToExpiry: 0.25,
  }) : null;
  const vol2 = selected ? calculateVolatility({
    optionPrice: selected.market2YesDisplayPrice ?? selected.market2YesRange?.midpoint ?? 0.5,
    bidAskSpread: spread2 || 0.02,
    timeToExpiry: 0.25,
  }) : null;
  const maxVol = Math.max(vol1?.impliedVolPercent || 0, vol2?.impliedVolPercent || 0);
  const confidenceScore = Math.max(0, Math.min(100, 100 - maxVol));

  return (
    <div className="h-screen bg-[#020202] text-white overflow-hidden flex font-sans">
      {/* Tactical Glow */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80%] h-[80%] bg-[#00FF80]/5 blur-[160px] rounded-full" />
      </div>

      {/* Modern Compact Left Sidebar */}
      <aside className="w-20 border-r border-white/5 bg-black/40 backdrop-blur-3xl flex flex-col items-center py-10 z-50 shrink-0">
        <div className="w-10 h-10 bg-[#00FF80] rounded-xl flex items-center justify-center shadow-[0_0_30px_rgba(0,255,128,0.3)] mb-12 group cursor-pointer">
          <Zap className="text-black fill-black transition-transform group-hover:scale-110" size={20} />
        </div>
        <nav className="flex flex-col gap-10">
          <SidebarIcon icon={<LayoutGrid size={20} />} active />
          <SidebarIcon icon={<Activity size={20} />} />
          <SidebarIcon icon={<BarChart3 size={20} />} />
          <SidebarIcon icon={<ShieldCheck size={20} />} />
        </nav>
        <div className="mt-auto">
          <SidebarIcon icon={<Maximize2 size={18} />} />
        </div>
      </aside>

      {/* Main Experience Area */}
      <div className="flex-1 flex relative overflow-hidden h-full">
        
        {/* FULL PAGE BACKGROUND: The Tactical Radar */}
        <motion.section 
          animate={{ 
            left: showLeftSidebar ? 340 : 0,
            width: showLeftSidebar ? "calc(100% - 340px)" : "100%"
          }}
          transition={{ type: "spring", damping: 25, stiffness: 200 }}
          className="absolute inset-y-0 right-0 z-10 overflow-hidden"
        >
          <RadarGrid 
            opportunities={opps} 
            onSelect={handleSelectOpportunity} 
            selectedId={selected?.id} 
          />
        </motion.section>

        {/* OVERLAY: Left Feed (Slide-in/out) */}
        <aside className="relative z-40 pointer-events-none flex h-full shrink-0">
          <AnimatePresence mode="wait">
            {showLeftSidebar && (
              <motion.div
                initial={{ x: -400, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -400, opacity: 0 }}
                transition={{ type: "spring", damping: 25, stiffness: 200 }}
                className="w-[340px] h-full bg-black/60 backdrop-blur-3xl border-r border-white/5 p-8 flex flex-col gap-6 pointer-events-auto"
              >
                <header className="mb-6 shrink-0">
                  <h1 className="text-2xl font-display font-bold text-gradient tracking-tight">Signal Radar</h1>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="w-1.5 h-1.5 bg-[#00FF80] rounded-full animate-ping shadow-[0_0_10px_#00FF80]" />
                    <p className="text-[9px] uppercase tracking-widest text-white/40 font-bold">Scanning High Yield Nodes</p>
                  </div>
                </header>

                <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar flex flex-col gap-3">
                  {loading ? (
                    <div className="h-full flex items-center justify-center opacity-20">
                      <Loader2 className="animate-spin w-8 h-8" />
                    </div>
                  ) : (
                    opps.map((o, i) => (
                      <motion.div
                        key={o.id || i}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.05 }}
                        onClick={() => handleSelectOpportunity(o)}
                        className={cn(
                          "p-4 glass rounded-[1.25rem] cursor-pointer group transition-all duration-500 shrink-0",
                          selected === o 
                            ? "bg-[#00FF80]/[0.08] border-[#00FF80]/30 shadow-[0_0_20px_rgba(0,255,128,0.05)]" 
                            : "glass-hover"
                        )}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <h3 className="font-bold text-[11px] leading-snug text-white/70 group-hover:text-white transition-colors line-clamp-2 pr-2 uppercase">
                            {o.market1Question}
                          </h3>
                          <div className="text-right whitespace-nowrap">
                            <div className="text-sm font-display font-bold text-[#00FF80]">
                              +${(o.profitCurve?.[0]?.profit || 0).toFixed(2)}
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    ))
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Toggle Tab */}
          <div className="flex flex-col justify-center ml-[-1px] pointer-events-auto">
            <button
              onClick={() => setShowLeftSidebar(!showLeftSidebar)}
              className="w-8 h-16 glass border-l-0 rounded-r-xl flex items-center justify-center hover:bg-white/5 transition-colors"
            >
              {showLeftSidebar ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
            </button>
          </div>
        </aside>

        {/* OVERLAY: Top Controls */}
        <div className="absolute top-8 left-1/2 -translate-x-1/2 z-30 flex items-center gap-4 pointer-events-none">
          <div className="glass px-6 py-3 rounded-2xl flex items-center gap-4 pointer-events-auto shadow-[0_0_40px_rgba(0,0,0,0.5)] border-[#00FF80]/10">
            <div className="flex items-center gap-2 border-r border-white/10 pr-4">
              <Radar size={16} className="text-[#00FF80]" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-white/60">Tactical Array</span>
            </div>
            <button 
              onClick={() => { setLoading(true); fetchOpportunities(); }}
              className="flex items-center gap-2 hover:text-[#00FF80] transition-colors"
            >
              <RefreshCw size={14} className={cn(loading && "animate-spin")} />
              <span className="text-[10px] font-bold uppercase tracking-widest">Resync Scan</span>
            </button>
          </div>
        </div>

        {/* OVERLAY: Floating Multi-Panel Right Area */}
        <div className="absolute top-0 right-0 z-40 h-full flex flex-row-reverse pointer-events-none overflow-hidden pr-4 py-4 gap-4">
          <AnimatePresence mode="popLayout">
            {/* PANEL 1: PROFIT FORGE (Main Info) */}
            {selected && (
              <motion.div
                key={`forge-${selected.id}`}
                initial={{ x: 500, opacity: 0, scaleX: 0.9 }}
                animate={{ x: 0, opacity: 1, scaleX: 1 }}
                exit={{ x: 500, opacity: 0, scaleX: 0.9 }}
                transition={{ type: "spring", damping: 25, stiffness: 150 }}
                className="w-[420px] h-full p-8 flex flex-col gap-4 pointer-events-auto overflow-y-auto custom-scrollbar relative bg-black/80 backdrop-blur-3xl border border-[#00FF80]/20 rounded-[3rem] shadow-[-20px_0_60px_rgba(0,0,0,0.5)]"
              >
                {/* Encryption Overlay */}
                <motion.div 
                  initial={{ opacity: 1 }}
                  animate={{ opacity: 0 }}
                  transition={{ duration: 0.6 }}
                  className="absolute inset-0 z-[100] pointer-events-none bg-black flex flex-col items-center justify-center p-12 rounded-[3rem]"
                >
                  <div className="w-full h-full border border-[#00FF80]/20 relative overflow-hidden flex flex-col items-center justify-center gap-4 bg-[#00FF80]/5 rounded-[2rem]">
                    <motion.div 
                      animate={{ top: ["-10%", "110%"] }}
                      transition={{ duration: 0.5, repeat: 1 }}
                      className="absolute left-0 right-0 h-1 bg-[#00FF80] shadow-[0_0_20px_#00FF80] z-10"
                    />
                    <div className="text-[#00FF80] font-mono text-[6px] grid grid-cols-12 gap-1 w-full h-full opacity-20 p-4 leading-none overflow-hidden">
                      {Array.from({ length: 120 }).map((_, i) => (
                        <span key={i}>{Math.random() > 0.5 ? "1" : "0"}</span>
                      ))}
                    </div>
                  </div>
                </motion.div>

                <header className="mb-2 flex justify-between items-start shrink-0 relative z-10">
                  <div className="space-y-1">
                    <p className="text-[9px] font-bold text-[#00FF80] uppercase tracking-[0.3em] font-mono opacity-60">
                      NODE: {selected.id?.slice(0, 12)}
                    </p>
                    <h2 className="text-2xl font-display font-black leading-tight tracking-tighter text-white uppercase italic">
                      Profit Forge<span className="text-[#00FF80]">.</span>
                    </h2>
                  </div>
                  <button 
                    onClick={() => { setSelected(null); setShowChartModal(false); }}
                    className="p-2.5 bg-white/5 hover:bg-red-500/20 text-white/40 hover:text-red-500 rounded-2xl transition-all border border-white/5 hover:border-red-500/50"
                  >
                    <X size={20} />
                  </button>
                </header>

                <div className="flex-1 flex flex-col gap-4 relative z-10">
                  {/* Main Profit Card */}
                  <div className="glass rounded-[2.5rem] p-8 relative overflow-hidden bg-[#00FF80]/5 border-[#00FF80]/20 shrink-0">
                    <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-[#00FF80]/60 mb-2 font-mono italic">YIELD_EST</p>
                    <div className="text-6xl font-display font-black text-[#00FF80] tracking-tighter mb-6 drop-shadow-[0_0_20px_rgba(0,255,128,0.3)]">
                      ${currentProfit?.profit.toFixed(2) || "0.00"}
                    </div>
                    <div className="grid grid-cols-2 gap-4 font-mono">
                      <div className="bg-white/5 border border-white/10 p-4 rounded-2xl">
                        <span className="text-[9px] text-white/30 uppercase font-bold tracking-widest block mb-1">CAPITAL</span>
                        <span className="text-base font-bold text-white">${currentProfit?.totalCost.toFixed(2)}</span>
                      </div>
                      <div className="bg-white/5 border border-white/10 p-4 rounded-2xl">
                        <span className="text-[9px] text-white/30 uppercase font-bold tracking-widest block mb-1">ROI</span>
                        <span className="text-base font-bold text-[#00FF80]">+{((currentProfit?.profit || 0) / (currentProfit?.totalCost || 1) * 100).toFixed(1)}%</span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 shrink-0">
                    <div className="glass rounded-3xl p-6 border-white/10 bg-white/5">
                      <p className="text-[9px] text-white/30 uppercase font-bold tracking-widest mb-3 font-mono">SHARES</p>
                      <input 
                        type="number" 
                        value={shares}
                        onChange={e => setShares(Math.max(1, parseInt(e.target.value) || 1))}
                        className="bg-[#00FF80]/10 border border-[#00FF80]/20 rounded-xl px-4 py-2 text-xl font-display font-black w-full focus:outline-none focus:border-[#00FF80]/50 transition-all text-[#00FF80]"
                      />
                    </div>
                    <div className="glass rounded-3xl p-6 flex flex-col items-center justify-center shrink-0 border-white/10 bg-white/5">
                      <p className="text-[9px] text-white/30 uppercase font-bold tracking-widest mb-3 font-mono">CONF</p>
                      <div className="text-xl font-display font-black text-white">{Math.round(confidenceScore)}%</div>
                      <div className="w-full h-1 bg-white/10 rounded-full mt-2 overflow-hidden">
                        <motion.div className="h-full bg-[#00FF80]" animate={{ width: `${confidenceScore}%` }} />
                      </div>
                    </div>
                  </div>

                  <div className="glass rounded-[2rem] p-6 flex flex-col gap-4 shrink-0 border-[#00FF80]/20 bg-black/60">
                    <h3 className="text-[9px] font-black uppercase tracking-[0.3em] text-[#00FF80]/60 flex items-center gap-2 font-mono">
                      <Target size={12} /> STRATEGY
                    </h3>
                    <div className="space-y-4 relative before:absolute before:left-2 before:top-2 before:bottom-2 before:w-[1px] before:bg-[#00FF80]/20">
                      <div className="relative pl-8">
                        <div className="absolute left-0 top-1 w-4 h-4 rounded-full bg-[#00FF80] shadow-[0_0_15px_#00FF80] border-4 border-black" />
                        <p className="text-[14px] font-black text-white uppercase">{selected.executionStrategy.buyOutcome}</p>
                        <p className="text-[9px] text-[#00FF80]/40 font-bold uppercase font-mono">{selected.market1Platform}</p>
                      </div>
                      <div className="relative pl-8">
                        <div className="absolute left-0 top-1 w-4 h-4 rounded-full bg-white/10 border-4 border-black" />
                        <p className="text-[14px] font-black text-white/60 uppercase">{selected.executionStrategy.sellOutcome}</p>
                        <p className="text-[9px] text-white/20 font-bold uppercase font-mono">{selected.market2Platform}</p>
                      </div>
                    </div>
                  </div>

                  {/* MINI CHART (Trigger) */}
                  <motion.div 
                    onClick={() => setShowChartModal(!showChartModal)}
                    className={cn(
                      "glass rounded-[2.5rem] p-6 h-32 overflow-hidden relative shrink-0 border-white/10 cursor-pointer group/chart transition-all duration-500",
                      showChartModal ? "border-[#00FF80] bg-[#00FF80]/10 shadow-[0_0_30px_rgba(0,255,128,0.2)]" : "hover:border-[#00FF80]/40 hover:bg-white/5"
                    )}
                  >
                    <div className="flex justify-between items-center mb-2 relative z-10">
                      <p className="text-[9px] font-black uppercase tracking-[0.4em] text-white/40 font-mono">DELTA_ANALYTICS</p>
                      <Maximize2 size={12} className={cn("transition-colors", showChartModal ? "text-[#00FF80]" : "text-white/20 group-hover/chart:text-[#00FF80]")} />
                    </div>
                    <div className="absolute inset-0 pt-10 px-4 opacity-40 group-hover/chart:opacity-100 transition-opacity">
                      <ResponsiveContainer width="100%" height={100}>
                        <AreaChart data={selected.profitCurve}>
                          <Area type="monotone" dataKey="profit" stroke="#00FF80" strokeWidth={2} fill="#00FF80" fillOpacity={0.1} animationDuration={1000} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </motion.div>
                </div>
              </motion.div>
            )}

            {/* PANEL 2: STRATEGIC DELTA (Expanded Analytics) */}
            {selected && showChartModal && (
              <motion.div
                key={`delta-${selected.id}`}
                initial={{ x: 200, opacity: 0, filter: "blur(10px)" }}
                animate={{ x: 0, opacity: 1, filter: "blur(0px)" }}
                exit={{ x: 200, opacity: 0, filter: "blur(10px)" }}
                transition={{ type: "spring", damping: 30, stiffness: 120 }}
                className="w-[540px] h-full flex flex-col gap-4 pointer-events-auto"
              >
                {/* Main Expanded Chart */}
                <div className="flex-1 glass rounded-[3rem] p-10 bg-[#020202]/90 backdrop-blur-3xl border border-[#00FF80]/30 shadow-2xl flex flex-col">
                  <header className="flex justify-between items-center mb-10">
                    <div className="flex items-center gap-3">
                      <BarChart3 className="text-[#00FF80]" size={20} />
                      <h3 className="text-xl font-display font-black text-white uppercase italic">Strategic_Delta</h3>
                    </div>
                    <span className="text-[9px] font-mono text-[#00FF80]/40 tracking-widest uppercase">Simulation_Active</span>
                  </header>

                  <div className="flex-1 min-h-0 relative">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={selected.profitCurve} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="pG_Exp" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#00FF80" stopOpacity={0.4}/>
                            <stop offset="100%" stopColor="#00FF80" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="shares" hide />
                        <YAxis hide domain={['auto', 'auto']} />
                        <Tooltip 
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              return (
                                <div className="bg-black/90 border border-[#00FF80]/30 p-3 rounded-xl backdrop-blur-xl">
                                  <p className="text-[10px] font-mono text-white/40 uppercase mb-1">Iteration</p>
                                  <p className="text-sm font-black text-[#00FF80]">${payload[0].value.toFixed(2)} @ {payload[0].payload.shares}U</p>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        <Area 
                          type="monotone" 
                          dataKey="profit" 
                          stroke="#00FF80" 
                          strokeWidth={4} 
                          fill="url(#pG_Exp)" 
                          animationDuration={1500} 
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Calculator List Integration */}
                  <div className="h-64 mt-8 pt-8 border-t border-white/5 flex flex-col">
                    <p className="text-[9px] font-black uppercase tracking-[0.4em] text-white/30 mb-4 font-mono">YIELD_PROJECTION_INDEX</p>
                    <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-2">
                      {selected.profitCurve?.map((p, i) => (
                        <div 
                          key={i}
                          onClick={() => setShares(p.shares)}
                          className={cn(
                            "flex items-center justify-between p-4 rounded-2xl border transition-all duration-300 cursor-pointer group/item",
                            shares === p.shares 
                              ? "bg-[#00FF80]/15 border-[#00FF80]/50 shadow-[0_0_20px_rgba(0,255,128,0.1)]"
                              : "bg-white/[0.02] border-white/5 hover:border-[#00FF80]/20 hover:bg-white/5"
                          )}
                        >
                          <div className="flex items-center gap-4">
                            <span className="text-[10px] font-mono text-white/20 group-hover/item:text-[#00FF80]/40 transition-colors">{String(i + 1).padStart(2, '0')}</span>
                            <div className="flex flex-col">
                              <span className="text-[8px] font-mono text-white/30 uppercase tracking-widest">Shares</span>
                              <span className="text-sm font-black text-white">{p.shares}U</span>
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="text-[8px] font-mono text-[#00FF80]/40 uppercase tracking-widest">Exp_Yield</span>
                            <div className="text-sm font-black text-[#00FF80] group-hover/item:scale-105 transition-transform">${p.profit.toFixed(2)}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* STRATEGIC DELTA MODAL (Profit Calculator) */}
        <AnimatePresence>
          {showChartModal && selected && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 pointer-events-none">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowChartModal(false)}
                className="absolute inset-0 bg-black/80 backdrop-blur-md pointer-events-auto"
              />
              <motion.div
                initial={{ scale: 0.9, opacity: 0, x: -50 }}
                animate={{ scale: 1, opacity: 1, x: 0 }}
                exit={{ scale: 0.9, opacity: 0, x: -50 }}
                className="relative w-full max-w-4xl glass rounded-[3rem] border-[#00FF80]/30 p-12 pointer-events-auto shadow-[0_0_100px_rgba(0,255,128,0.2)] bg-[#020202]/90 flex flex-col gap-10"
              >
                <header className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-3 h-3 bg-[#00FF80] rounded-full animate-ping" />
                      <span className="text-[12px] font-black text-[#00FF80] uppercase tracking-[0.5em] font-mono">ANALYTICS_OVERRIDE</span>
                    </div>
                    <h2 className="text-5xl font-display font-black text-white uppercase italic tracking-tighter">
                      Strategic<span className="text-[#00FF80]">_</span>Delta
                    </h2>
                  </div>
                  <button 
                    onClick={() => setShowChartModal(false)}
                    className="p-4 bg-white/5 hover:bg-red-500/20 text-white/40 hover:text-red-500 rounded-3xl transition-all border border-white/10 hover:border-red-500/50"
                  >
                    <X size={32} />
                  </button>
                </header>

                <div className="grid grid-cols-5 gap-8">
                  {/* The Big Chart */}
                  <div className="col-span-3 glass rounded-[2.5rem] p-8 bg-black/40 border-white/5 relative min-h-[400px]">
                    <p className="text-[10px] font-black uppercase tracking-[0.5em] text-[#00FF80]/60 mb-8 font-mono">PROJECTION_MODEL_V2.4</p>
                    <div className="h-[300px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={selected.profitCurve}>
                          <defs>
                            <linearGradient id="pG_Modal" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#00FF80" stopOpacity={0.5}/>
                              <stop offset="100%" stopColor="#00FF80" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <XAxis 
                            dataKey="shares" 
                            stroke="#ffffff20" 
                            fontSize={10} 
                            tickFormatter={(v) => `${v}U`}
                          />
                          <YAxis 
                            stroke="#ffffff20" 
                            fontSize={10} 
                            tickFormatter={(v) => `$${v}`}
                          />
                          <Tooltip 
                            contentStyle={{ 
                              backgroundColor: '#000', 
                              border: '1px solid rgba(0,255,128,0.2)',
                              borderRadius: '12px',
                              fontSize: '10px',
                              fontFamily: 'monospace'
                            }}
                            itemStyle={{ color: '#00FF80' }}
                          />
                          <Area type="monotone" dataKey="profit" stroke="#00FF80" strokeWidth={5} fill="url(#pG_Modal)" animationDuration={2000} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Profit Calculator / List */}
                  <div className="col-span-2 flex flex-col gap-4 overflow-hidden">
                    <div className="glass rounded-[2rem] p-6 bg-black/60 border-[#00FF80]/20 flex flex-col h-full">
                      <p className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40 mb-6 font-mono">YIELD_ITERATIONS</p>
                      <div className="flex-1 overflow-y-auto pr-4 custom-scrollbar space-y-3">
                        {selected.profitCurve?.map((p, i) => (
                          <div 
                            key={i}
                            className={cn(
                              "flex items-center justify-between p-4 rounded-2xl border transition-all duration-300",
                              shares >= p.shares && (i === selected.profitCurve!.length - 1 || shares < selected.profitCurve![i+1].shares)
                                ? "bg-[#00FF80]/10 border-[#00FF80]/40 shadow-[0_0_15px_rgba(0,255,128,0.1)]"
                                : "bg-white/5 border-white/5 opacity-40 hover:opacity-100"
                            )}
                          >
                            <div className="flex flex-col">
                              <span className="text-[9px] font-mono text-white/40 uppercase">Shares</span>
                              <span className="text-sm font-black text-white">{p.shares}</span>
                            </div>
                            <div className="flex flex-col items-end">
                              <span className="text-[9px] font-mono text-[#00FF80]/60 uppercase">Expected</span>
                              <span className="text-sm font-black text-[#00FF80]">${p.profit.toFixed(2)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="mt-6 pt-6 border-t border-white/5">
                        <div className="flex justify-between items-center bg-[#00FF80]/5 p-5 rounded-2xl border border-[#00FF80]/10">
                          <span className="text-[10px] font-black text-white/60 uppercase font-mono">Optimal_Target</span>
                          <span className="text-xl font-black text-[#00FF80] tracking-tighter">
                            ${(selected.profitCurve?.[selected.profitCurve.length - 1]?.profit || 0).toFixed(2)} MAX
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

      </div>

      <style jsx global>{`
        .glass-light {
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.05);
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(0, 255, 128, 0.1);
          border-radius: 10px;
        }
      `}</style>
    </div>
  );
}

function SidebarIcon({ icon, active = false }: { icon: React.ReactNode; active?: boolean }) {
  return (
    <div className={cn(
      "w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-500 cursor-pointer",
      active 
        ? "bg-[#00FF80]/10 text-[#00FF80] border border-[#00FF80]/20 shadow-[0_0_20px_rgba(0,255,128,0.1)]" 
        : "text-white/10 hover:text-white/40 hover:bg-white/5"
    )}>
      {icon}
    </div>
  );
}
