"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function IncludeSportsToggle({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <label className="inline-flex cursor-pointer select-none items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300">
      <input
        type="checkbox"
        checked={enabled}
        onChange={(e) => {
          const next = new URLSearchParams(searchParams);
          if (e.target.checked) next.set("includeSports", "1");
          else next.delete("includeSports");
          router.replace(`${pathname}?${next.toString()}`);
        }}
        className="h-4 w-4 rounded border-zinc-300 bg-white text-zinc-900 accent-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-zinc-700 dark:bg-black dark:accent-zinc-100 dark:focus-visible:ring-zinc-400 dark:focus-visible:ring-offset-black"
      />
      Include sports
    </label>
  );
}
