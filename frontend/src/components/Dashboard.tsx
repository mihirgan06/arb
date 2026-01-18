"use client";

import React, { useEffect, useState } from "react";
import { ArrowUpRight, TrendingUp, AlertCircle, RefreshCw, Zap, Search, Filter } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

// Mock data types
type Market = {
  id: string;
  question: string;
  volume: string;
  spread: number;
  polymarketPrice: number;
  kalshiPrice: number;
  category: "Politics" | "Crypto" | "Tech";
};

export function Dashboard() {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulate API fetch
    const fetchMarkets = async () => {
      try {
        await new Promise(r => setTimeout(r, 600)); // Simulate loading
        setMarkets([
          {
            id: "1",
            question: "Donald Trump to win 2024 Election",
            volume: "$52.4M",
            spread: 4.2,
            polymarketPrice: 0.55,
            kalshiPrice: 0.51,
            category: "Politics",
          },
          {
            id: "2",
            question: "Bitcoin > $100k by Q1 2025",
            volume: "$12.1M",
            spread: 2.8,
            polymarketPrice: 0.32,
            kalshiPrice: 0.35,
            category: "Crypto",
          },
          {
            id: "3",
            question: "GPT-5 Released before July 2025",
            volume: "$8.5M",
            spread: 1.5,
            polymarketPrice: 0.60,
            kalshiPrice: 0.59,
            category: "Tech",
          },
        ]);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };

    fetchMarkets();
  }, []);

  return (
    <div className="flex flex-col gap-8 animate-fade-in max-w-[1600px] mx-auto">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 pt-2">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-white">Market Overview</h1>
          <p className="text-sm text-muted-foreground">Real-time arbitrage opportunities across prediction markets.</p>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search markets..."
              className="pl-9 bg-white/5 border-white/5 focus:bg-white/10 transition-all h-9 text-sm"
            />
          </div>
          <Button size="sm" className="bg-primary hover:bg-primary/90 text-primary-foreground font-medium shadow-[0_0_15px_-3px_rgba(249,115,22,0.4)] transition-all">
            <Zap className="h-3.5 w-3.5 mr-2" />
            Live Scan
          </Button>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard
          label="Arbitrage Volume (24h)"
          value="$2,405,910"
          trend="+12.5%"
          trendUp={true}
        />
        <MetricCard
          label="Active Opportunities"
          value="14"
          trend="High Activity"
          trendUp={true}
          highlight
        />
        <MetricCard
          label="Avg. Spread Capture"
          value="3.2%"
          trend="-0.4%"
          trendUp={false}
        />
      </div>

      {/* Main Content Split */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Main Feed */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium text-white">Top Opportunities</h2>
            <Tabs defaultValue="all" className="w-auto">
              <TabsList className="bg-white/5 border border-white/5 h-8 p-0.5">
                <TabsTrigger value="all" className="text-xs px-3 h-7 data-[state=active]:bg-white/10 data-[state=active]:text-white">All</TabsTrigger>
                <TabsTrigger value="politics" className="text-xs px-3 h-7 data-[state=active]:bg-white/10 data-[state=active]:text-white">Politics</TabsTrigger>
                <TabsTrigger value="crypto" className="text-xs px-3 h-7 data-[state=active]:bg-white/10 data-[state=active]:text-white">Crypto</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="grid gap-3">
            {loading ? (
              [1, 2, 3].map(i => <div key={i} className="h-24 bg-white/5 rounded-xl animate-pulse" />)
            ) : (
              markets.map((market) => (
                <ArbitrageCard key={market.id} market={market} />
              ))
            )}
          </div>
        </div>

        {/* Side Panel: Live Ticker */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium text-white flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              Live Activity
            </h2>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-white">
              <Filter className="h-4 w-4" />
            </Button>
          </div>

          <div className="bg-white/[0.02] border border-white/5 rounded-xl overflow-hidden backdrop-blur-sm">
            <div className="p-4 border-b border-white/5">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Recent Signals</span>
            </div>
            <ScrollArea className="h-[400px]">
              <div className="divide-y divide-white/5">
                {[1, 2, 3, 4, 5, 6].map((item) => (
                  <div key={item} className="p-4 hover:bg-white/[0.02] transition-colors cursor-default">
                    <div className="flex justify-between items-start mb-1">
                      <Badge variant="outline" className="text-[10px] border-primary/20 text-primary bg-primary/5 px-1.5 py-0 h-5">
                        SPREAD WIDENED
                      </Badge>
                      <span className="text-[10px] text-muted-foreground font-mono">10:42 PM</span>
                    </div>
                    <p className="text-sm text-foreground/90 leading-snug">
                      Spread on <span className="text-white font-medium">Trump 2024</span> increased to <span className="text-green-500 font-bold">4.5%</span> due to Kalshi price drop.
                    </p>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        </div>
      </div>
    </div>
  );
}

// Minimal Widget Components

function MetricCard({ label, value, trend, trendUp, highlight }: any) {
  return (
    <div className={cn(
      "p-5 rounded-xl border transition-all duration-300 group hover:bg-white/[0.02]",
      highlight ? "bg-white/[0.03] border-white/10" : "bg-transparent border-white/5"
    )}>
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground tracking-wide uppercase">{label}</span>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-white font-geist tracking-tight">{value}</span>
          {trend && (
            <span className={cn(
              "text-xs font-medium flex items-center bg-opacity-10 px-1.5 py-0.5 rounded",
              trendUp ? "text-green-400 bg-green-500/10" : "text-red-400 bg-red-500/10"
            )}>
              {trendUp ? <TrendingUp className="h-3 w-3 mr-1" /> : <AlertCircle className="h-3 w-3 mr-1" />}
              {trend}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

function ArbitrageCard({ market }: { market: Market }) {
  return (
    <div className="group relative overflow-hidden p-5 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/10 transition-all duration-300">

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex gap-4">
          {/* Confidence/Spread score bubble */}
          <div className="h-12 w-12 shrink-0 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/10 flex flex-col items-center justify-center text-primary">
            <span className="text-sm font-bold leading-none">{market.spread.toFixed(1)}%</span>
            <span className="text-[9px] opacity-80 font-medium">ARB</span>
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-medium text-white group-hover:text-primary transition-colors cursor-pointer">
                {market.question}
              </h3>
              <Badge variant="secondary" className="bg-white/5 text-muted-foreground hover:bg-white/10 border-0 h-5 text-[10px]">
                {market.category}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground font-mono">
              Vol: <span className="text-foreground/70">{market.volume}</span> • Updated 2s ago
            </p>
          </div>
        </div>

        {/* Price Actions */}
        <div className="flex items-center gap-6 pl-4 border-l border-white/5 sm:pl-0 sm:border-0">
          <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-right">
            <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">Polymarket</span>
            <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">Kalshi</span>

            <span className="text-sm font-bold text-white font-mono">{Math.round(market.polymarketPrice * 100)}¢</span>
            <span className="text-sm font-bold text-white font-mono">{Math.round(market.kalshiPrice * 100)}¢</span>
          </div>

          <Button variant="outline" size="icon" className="h-9 w-9 rounded-full border-white/10 bg-transparent text-muted-foreground hover:text-white hover:bg-white/5 hover:border-white/20">
            <ArrowUpRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
