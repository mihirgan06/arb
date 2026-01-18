"use client";

import { useEffect, useState } from "react";
import { Sparkles, Loader2, TrendingUp, TrendingDown, Minus } from "lucide-react";

type EmotionData = {
  optimism: number;
  joy: number;
  excitement: number;
  curiosity: number;
  trust: number;
  fear: number;
  anger: number;
  disgust: number;
  sadness: number;
  surprise: number;
  confusion: number;
  neutral: number;
};

type MarketData = {
  question: string;
  price: number | null;
  sentiment: number | null;
  divergence: number | null;
};

interface TopicAISummaryProps {
  topic: string;
  mood: number | null;
  emotions: EmotionData;
  marketsCount: number;
  marketsWithSentiment: number;
  tweetCount: number;
  topMarkets: MarketData[];
}

export function TopicAISummary({
  topic,
  mood,
  emotions,
  marketsCount,
  marketsWithSentiment,
  tweetCount,
  topMarkets,
}: TopicAISummaryProps) {
  const [summary, setSummary] = useState<string | null>(null);
  const [moodLabel, setMoodLabel] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSummary = async () => {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch("/api/topics/summarize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            topic,
            mood,
            emotions,
            marketsCount,
            marketsWithSentiment,
            tweetCount,
            topMarkets,
          }),
        });

        const data = await res.json();
        if (data.success) {
          setSummary(data.summary);
          setMoodLabel(data.moodLabel);
        } else {
          setError(data.error || "Failed to generate summary");
        }
      } catch (e) {
        setError("Failed to connect to AI service");
      } finally {
        setLoading(false);
      }
    };

    if (topic && marketsCount > 0) {
      fetchSummary();
    }
  }, [topic, mood, emotions, marketsCount, marketsWithSentiment, tweetCount, topMarkets]);

  const getMoodIcon = () => {
    if (mood == null) return <Minus className="w-5 h-5 text-zinc-500" />;
    if (mood > 0.1) return <TrendingUp className="w-5 h-5 text-emerald-500" />;
    if (mood < -0.1) return <TrendingDown className="w-5 h-5 text-red-500" />;
    return <Minus className="w-5 h-5 text-zinc-500" />;
  };

  const getMoodColor = () => {
    if (mood == null) return "from-zinc-500/20 to-zinc-600/10 border-zinc-700/50";
    if (mood > 0.3) return "from-emerald-500/20 to-emerald-600/10 border-emerald-500/30";
    if (mood > 0.1) return "from-emerald-500/10 to-emerald-600/5 border-emerald-500/20";
    if (mood < -0.3) return "from-red-500/20 to-red-600/10 border-red-500/30";
    if (mood < -0.1) return "from-red-500/10 to-red-600/5 border-red-500/20";
    return "from-zinc-500/10 to-zinc-600/5 border-zinc-700/30";
  };

  const getSentimentLabel = () => {
    if (mood == null) return "Unknown";
    if (mood > 0.3) return "Very Bullish";
    if (mood > 0.1) return "Bullish";
    if (mood < -0.3) return "Very Bearish";
    if (mood < -0.1) return "Bearish";
    return "Neutral";
  };

  if (!topic || marketsCount === 0) return null;

  return (
    <div
      className={`rounded-xl border bg-gradient-to-br ${getMoodColor()} p-6 relative overflow-hidden`}
    >
      {/* Background glow effect */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-white/5 to-transparent rounded-full blur-2xl" />

      {/* Header */}
      <div className="flex items-center justify-between mb-4 relative">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-white/5 backdrop-blur">
            <Sparkles className="w-4 h-4 text-blue-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">AI Sentiment Analysis</h3>
            <p className="text-[10px] text-zinc-500 uppercase tracking-widest">
              Powered by GPT-4
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {getMoodIcon()}
          <span
            className={`text-xs font-bold uppercase tracking-wider ${
              mood == null
                ? "text-zinc-500"
                : mood > 0.1
                ? "text-emerald-400"
                : mood < -0.1
                ? "text-red-400"
                : "text-zinc-400"
            }`}
          >
            {getSentimentLabel()}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="relative">
        {loading ? (
          <div className="flex items-center gap-3 py-4">
            <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
            <span className="text-sm text-zinc-400">Analyzing sentiment data...</span>
          </div>
        ) : error ? (
          <div className="text-sm text-red-400 py-2">{error}</div>
        ) : (
          <p className="text-sm text-zinc-200 leading-relaxed">{summary}</p>
        )}
      </div>

      {/* Footer stats */}
      <div className="mt-4 pt-4 border-t border-white/5 flex items-center gap-4 text-[10px] uppercase tracking-widest text-zinc-600">
        <span>{marketsCount} markets</span>
        <span className="text-zinc-800">•</span>
        <span>{tweetCount} posts analyzed</span>
      </div>
    </div>
  );
}
