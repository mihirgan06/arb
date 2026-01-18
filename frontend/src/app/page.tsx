"use client";

import { useState } from "react";
import { Dashboard } from "@/components/Dashboard";
import { Activity, Command, Globe } from "lucide-react";
import { cn } from "@/lib/utils";

type SentimentTab = "divergence" | "topics" | "trends";
type MainTab = "terminal" | "sentiment";

export default function Home() {
  const [activeTab, setActiveTab] = useState<MainTab>("terminal");
  const [sentimentTab, setSentimentTab] = useState<SentimentTab>("divergence");

  const TabSwitcher = () => (
    <div className="flex items-center">
      <div className="flex items-center border-l border-zinc-800 ml-6 pl-6">
        <button
          onClick={() => setActiveTab("terminal")}
          className={cn(
            "relative px-3 py-1 text-xs font-medium tracking-wide transition-colors",
            activeTab === "terminal"
              ? "text-white"
              : "text-zinc-600 hover:text-zinc-400"
          )}
        >
          <span className="flex items-center gap-1.5">
            <span className={cn(
              "w-1.5 h-1.5 rounded-full transition-colors",
              activeTab === "terminal" ? "bg-emerald-500" : "bg-zinc-700"
            )} />
            Terminal
          </span>
          {activeTab === "terminal" && (
            <span className="absolute bottom-0 left-3 right-3 h-px bg-white" />
          )}
        </button>
        <button
          onClick={() => setActiveTab("sentiment")}
          className={cn(
            "relative px-3 py-1 text-xs font-medium tracking-wide transition-colors",
            activeTab === "sentiment"
              ? "text-white"
              : "text-zinc-600 hover:text-zinc-400"
          )}
        >
          Sentiment
          {activeTab === "sentiment" && (
            <span className="absolute bottom-0 left-3 right-3 h-px bg-white" />
          )}
        </button>
      </div>
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
          <header className="h-12 border-b border-zinc-800 bg-[#050505] flex items-center justify-between px-4 shrink-0">
            <div className="flex items-center gap-6">
              <div className="flex gap-6 text-xs font-sans tracking-wide">
                <div className="flex gap-2">
                  <span className="text-zinc-500 uppercase tracking-widest font-bold">Sentiment Analysis</span>
                </div>
              </div>
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
