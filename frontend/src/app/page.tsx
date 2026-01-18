"use client";

import { useState } from "react";
import { Dashboard } from "@/components/Dashboard";
import { Activity, Command, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { RefreshCw } from "lucide-react";

type SentimentTab = "divergence" | "topics" | "trends";
type MainTab = "terminal" | "sentiment";

export default function Home() {
  const [activeTab, setActiveTab] = useState<MainTab>("terminal");
  const [sentimentTab, setSentimentTab] = useState<SentimentTab>("divergence");

  const TabSwitcher = () => (
    <div className="flex items-center gap-1">
      <button
        onClick={() => setActiveTab("terminal")}
        className={cn(
          "px-2.5 py-1 text-[11px] font-medium rounded transition-colors",
          activeTab === "terminal"
            ? "bg-white/10 text-white"
            : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
        )}
      >
        Terminal
      </button>
      <button
        onClick={() => setActiveTab("sentiment")}
        className={cn(
          "px-2.5 py-1 text-[11px] font-medium rounded transition-colors",
          activeTab === "sentiment"
            ? "bg-white/10 text-white"
            : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
        )}
      >
        Sentiment
      </button>
    </div>
  );

  return (
    <div className="flex flex-col h-screen bg-[#000000]">
      {activeTab === "terminal" ? (
        <div className="flex-1 overflow-hidden">
          <Dashboard tabSwitcher={<TabSwitcher />} />
        </div>
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Sentiment Header */}
          <header className="h-11 border-b border-zinc-800/50 bg-[#0a0a0a] flex items-center justify-between px-4 shrink-0">
            <div className="flex items-center gap-6">
              {/* Logo */}
              <div className="flex items-center gap-2.5">
                <div className="h-6 w-6 rounded-md bg-white/10 flex items-center justify-center">
                  <Command className="h-3.5 w-3.5 text-white/80" />
                </div>
                <span className="text-sm font-semibold text-white/90 tracking-tight">Arbiter</span>
              </div>
              
              {/* Divider */}
              <div className="h-4 w-px bg-zinc-800" />
              
              {/* Tab Switcher */}
              <TabSwitcher />
            </div>
          </header>
          
          <div className="flex-1 flex overflow-hidden">
            {/* Small Sentiment Sidebar */}
            <div className="w-44 bg-[#050505] border-r border-zinc-800 flex flex-col shrink-0">
              <div className="p-3">
                <nav className="space-y-0.5">
                  <button
                    onClick={() => setSentimentTab("divergence")}
                    className={cn(
                      "w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-xs font-medium transition-all",
                      sentimentTab === "divergence"
                        ? "bg-white/5 text-white"
                        : "text-zinc-600 hover:bg-white/5 hover:text-zinc-400"
                    )}
                  >
                    <Activity className="w-3.5 h-3.5" />
                    Divergence
                  </button>
                  <button
                    onClick={() => setSentimentTab("topics")}
                    className={cn(
                      "w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-xs font-medium transition-all",
                      sentimentTab === "topics"
                        ? "bg-white/5 text-white"
                        : "text-zinc-600 hover:bg-white/5 hover:text-zinc-400"
                    )}
                  >
                    <Command className="w-3.5 h-3.5" />
                    Topics
                  </button>
                  <button
                    onClick={() => setSentimentTab("trends")}
                    className={cn(
                      "w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-xs font-medium transition-all",
                      sentimentTab === "trends"
                        ? "bg-white/5 text-white"
                        : "text-zinc-600 hover:bg-white/5 hover:text-zinc-400"
                    )}
                  >
                    <Globe className="w-3.5 h-3.5" />
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
