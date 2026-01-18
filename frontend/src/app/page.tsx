"use client";

import { useState } from "react";
import { Dashboard } from "@/components/Dashboard";
import { Activity, Command, Globe } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type SentimentTab = "divergence" | "topics" | "trends";

export default function Home() {
  const [activeTab, setActiveTab] = useState<"terminal" | "sentiment">("terminal");
  const [sentimentTab, setSentimentTab] = useState<SentimentTab>("divergence");

  return (
    <div className="flex flex-col h-screen bg-[#000000]">
      {/* Top Tab Switcher */}
      <div className="h-12 border-b border-zinc-800 bg-[#0a0a0a] flex items-center px-4 shrink-0">
        <div className="flex items-center gap-1 bg-zinc-900/80 rounded-lg p-1">
          <button
            onClick={() => setActiveTab("terminal")}
            className={cn(
              "flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-all",
              activeTab === "terminal"
                ? "bg-zinc-800 text-white"
                : "text-zinc-500 hover:text-zinc-300"
            )}
          >
            <span className={cn(
              "w-2 h-2 rounded-full",
              activeTab === "terminal" ? "bg-emerald-500" : "bg-zinc-600"
            )} />
            Terminal
          </button>
          <button
            onClick={() => setActiveTab("sentiment")}
            className={cn(
              "flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-all",
              activeTab === "sentiment"
                ? "bg-zinc-800 text-white"
                : "text-zinc-500 hover:text-zinc-300"
            )}
          >
            Sentiment
          </button>
        </div>
      </div>

      {/* Content Area */}
      {activeTab === "terminal" ? (
        <div className="flex-1 overflow-hidden">
          <Dashboard />
        </div>
      ) : (
        <div className="flex-1 flex overflow-hidden">
          {/* Small Sentiment Sidebar */}
          <div className="w-48 bg-[#050505] border-r border-zinc-800 flex flex-col shrink-0">
            <div className="p-4">
              <div className="text-[10px] uppercase tracking-widest text-zinc-600 font-bold mb-3">
                Analysis
              </div>
              <nav className="space-y-1">
                <button
                  onClick={() => setSentimentTab("divergence")}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all",
                    sentimentTab === "divergence"
                      ? "bg-blue-500/10 text-blue-400"
                      : "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
                  )}
                >
                  <Activity className="w-4 h-4" />
                  Divergence
                </button>
                <button
                  onClick={() => setSentimentTab("topics")}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all",
                    sentimentTab === "topics"
                      ? "bg-blue-500/10 text-blue-400"
                      : "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
                  )}
                >
                  <Command className="w-4 h-4" />
                  Topics
                </button>
                <button
                  onClick={() => setSentimentTab("trends")}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all",
                    sentimentTab === "trends"
                      ? "bg-blue-500/10 text-blue-400"
                      : "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
                  )}
                >
                  <Globe className="w-4 h-4" />
                  Trends
                </button>
              </nav>
            </div>
          </div>

          {/* Sentiment Content */}
          <div className="flex-1 overflow-hidden">
            {sentimentTab === "divergence" && <DivergenceContent />}
            {sentimentTab === "topics" && <TopicsContent />}
            {sentimentTab === "trends" && <TrendsContent />}
          </div>
        </div>
      )}
    </div>
  );
}

// Placeholder components that will fetch and display content
function DivergenceContent() {
  return (
    <iframe 
      src="/divergence" 
      className="w-full h-full border-0"
      title="Divergence"
    />
  );
}

function TopicsContent() {
  return (
    <iframe 
      src="/topics" 
      className="w-full h-full border-0"
      title="Topics"
    />
  );
}

function TrendsContent() {
  return (
    <iframe 
      src="/trends" 
      className="w-full h-full border-0"
      title="Trends"
    />
  );
}
