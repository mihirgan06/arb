"use client";

import { useEffect, useState } from "react";

type TickStore = {
  nowMs: number;
  refreshMs: number;
  subs: Set<() => void>;
  timer: ReturnType<typeof setInterval> | null;
};

const STORES = new Map<number, TickStore>();

function getStore(refreshMs: number): TickStore {
  const existing = STORES.get(refreshMs);
  if (existing) return existing;

  const store: TickStore = {
    nowMs: Date.now(),
    refreshMs,
    subs: new Set(),
    timer: null,
  };
  STORES.set(refreshMs, store);
  return store;
}

function subscribe(store: TickStore, cb: () => void) {
  store.subs.add(cb);
  if (!store.timer) {
    store.timer = setInterval(() => {
      store.nowMs = Date.now();
      store.subs.forEach((fn) => fn());
    }, store.refreshMs);
  }
  return () => {
    store.subs.delete(cb);
    if (store.subs.size === 0 && store.timer) {
      clearInterval(store.timer);
      store.timer = null;
    }
  };
}

function formatAge(updatedAt: string | null | undefined, nowMs: number) {
  if (!updatedAt) return "n/a";
  const ms = nowMs - new Date(updatedAt).getTime();
  if (!Number.isFinite(ms)) return "n/a";
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  if (minutes < 1) return "<1m ago";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

export function AgeText({
  updatedAt,
  initialText = "…",
  refreshMs = 60_000,
}: {
  updatedAt: string | null | undefined;
  initialText?: string;
  refreshMs?: number;
}) {
  const [text, setText] = useState<string>(initialText);

  useEffect(() => {
    const store = getStore(refreshMs);
    const tick = () => setText(formatAge(updatedAt, store.nowMs));
    tick();
    return subscribe(store, tick);
  }, [updatedAt, refreshMs]);

  return <span suppressHydrationWarning>{text}</span>;
}
