"use client";

import { useState } from "react";

export function ExplainPanel({ title, lines }: { title: string; lines: string[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold tracking-tight">{title}</div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500 dark:border-zinc-800 dark:bg-black/40 dark:text-zinc-200 dark:hover:bg-black/60 dark:focus-visible:outline-zinc-400"
        >
          {open ? "Hide" : "Explain"}
        </button>
      </div>

      {open ? (
        <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-6 text-zinc-800 dark:text-zinc-200">
          {lines.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ol>
      ) : (
        <div className="mt-3 text-xs text-zinc-600 dark:text-zinc-400">Deterministic template (no LLM).</div>
      )}
    </div>
  );
}
