function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function MoodGauge({ value }: { value: number | null }) {
  const v = typeof value === "number" && Number.isFinite(value) ? clamp(value, -1, 1) : null;
  const pct = v == null ? null : ((v + 1) / 2) * 100;

  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-black/40">
      <div className="flex items-center justify-between">
        <div className="text-xs text-zinc-600 dark:text-zinc-400">Blend score</div>
        <div className="text-xs tabular-nums text-zinc-700 dark:text-zinc-300">
          {v == null ? "—" : v.toFixed(2)}
        </div>
      </div>
      <div className="mt-2 h-2 rounded-full bg-zinc-100 dark:bg-zinc-900">
        <div className="h-2 rounded-full bg-emerald-600" style={{ width: `${pct ?? 0}%` }} />
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-500">
        <span>-1</span>
        <span>0</span>
        <span>+1</span>
      </div>
    </div>
  );
}

