"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function TopicControls({
  initialQuery,
  initialMaxDistance,
}: {
  initialQuery: string;
  initialMaxDistance: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const [q, setQ] = useState(initialQuery);
  const [d, setD] = useState(initialMaxDistance);

  const includeSports = searchParams.get("includeSports") === "1";

  const urlBase = useMemo(() => {
    const next = new URLSearchParams(searchParams);
    // Remove topic-specific params; re-add on actions.
    next.delete("q");
    next.delete("d");
    return next;
  }, [searchParams]);

  const push = (nextQ: string, nextD: number) => {
    const next = new URLSearchParams(urlBase);
    if (includeSports) next.set("includeSports", "1");
    if (nextQ.trim()) next.set("q", nextQ.trim());
    next.set("d", String(clamp(nextD, 0.25, 0.85)));
    router.replace(`${pathname}?${next.toString()}`);
  };

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          startTransition(() => push(q, d));
        }}
        className="flex flex-col gap-3"
      >
        <div className="flex items-center gap-3">
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs text-zinc-700 dark:border-zinc-800 dark:bg-black/40 dark:text-zinc-200">
            /
          </div>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder='Type a topic… (e.g. "rate cuts", "AI bubble")'
            name="q"
            aria-label="Topic query"
            autoComplete="off"
            className="h-10 flex-1 rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:border-zinc-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-zinc-800 dark:bg-black dark:text-zinc-100 dark:placeholder:text-zinc-600 dark:focus:border-zinc-600 dark:focus-visible:ring-zinc-400 dark:focus-visible:ring-offset-black"
          />
          <button
            type="submit"
            className="h-10 rounded-xl bg-zinc-900 px-3 text-sm font-medium text-white hover:bg-zinc-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Search
          </button>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-zinc-600 dark:text-zinc-400">
            Tighten / loosen matching (cosine distance):{" "}
            <span className="tabular-nums text-zinc-800 dark:text-zinc-200">{d.toFixed(2)}</span>
          </div>
          <input
            type="range"
            min={0.25}
            max={0.85}
            step={0.01}
            value={d}
            name="d"
            aria-label="Cosine distance threshold"
            onChange={(e) => {
              const next = clamp(Number(e.target.value), 0.25, 0.85);
              setD(next);
              startTransition(() => push(q, next));
            }}
            className="w-full sm:w-64"
          />
        </div>
      </form>
    </div>
  );
}
