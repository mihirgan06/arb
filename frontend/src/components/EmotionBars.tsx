import type { BucketDist } from "@/lib/aiExplanation";

const LABELS: Record<keyof BucketDist, string> = {
  optimism: "Optimism",
  joy: "Joy",
  excitement: "Excitement",
  curiosity: "Curiosity",
  trust: "Trust",
  fear: "Fear",
  anger: "Anger",
  disgust: "Disgust",
  sadness: "Sadness",
  surprise: "Surprise",
  confusion: "Confusion",
  neutral: "Neutral",
};

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

export function EmotionBars({ dist, topK = 5 }: { dist: BucketDist; topK?: number }) {
  const top = (Object.entries(dist) as Array<[keyof BucketDist, number]>)
    .map(([k, v]) => [k, Number(v)] as const)
    .filter(([, v]) => Number.isFinite(v))
    .sort((a, b) => b[1] - a[1])
    .slice(0, Math.max(1, Math.min(12, topK)));

  return (
    <div className="space-y-2">
      {top.map(([k, v]) => (
        <div key={String(k)} className="flex items-center gap-3">
          <div className="w-24 shrink-0 text-xs text-zinc-600 dark:text-zinc-400">{LABELS[k]}</div>
          <div className="h-2 flex-1 rounded-full bg-zinc-100 dark:bg-zinc-900">
            <div
              className="h-2 rounded-full bg-zinc-900 dark:bg-zinc-100"
              style={{ width: `${(clamp01(v) * 100).toFixed(1)}%` }}
            />
          </div>
          <div className="w-12 shrink-0 text-right text-xs tabular-nums text-zinc-700 dark:text-zinc-300">
            {(clamp01(v) * 100).toFixed(0)}%
          </div>
        </div>
      ))}
    </div>
  );
}

