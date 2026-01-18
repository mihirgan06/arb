import type { SupabaseClient } from "@supabase/supabase-js";
import { birdJson } from "../_lib/bird";
import { shouldKeepTweet } from "./filter";

type BirdTrend = {
  id?: string;
  headline?: string;
  category?: string;
  description?: string;
  url?: string;
};

function isPromoted(item: BirdTrend): boolean {
  const id = typeof item.id === "string" ? item.id : "";
  const url = typeof item.url === "string" ? item.url : "";
  return (
    id.includes("promoted_trend_click") ||
    url.includes("promoted_trend_click") ||
    url.includes("pc=true")
  );
}

function headlineFor(item: BirdTrend): string {
  if (typeof item.headline === "string" && item.headline.trim().length > 0) return item.headline.trim();
  if (typeof item.description === "string" && item.description.trim().length > 0) return item.description.trim();
  if (typeof item.id === "string" && item.id.trim().length > 0) return item.id.trim();
  return "Unknown trend";
}

export async function runBirdTrending(supabase: SupabaseClient, args?: { n?: number }): Promise<number> {
  const n = args?.n ?? 20;

  const items = await birdJson<BirdTrend[]>(["--plain", "news", "-n", String(n), "--json"]);
  const fetchedAt = new Date().toISOString();

  const rows = (items ?? [])
    .slice(0, n)
    .map((item) => {
      if (isPromoted(item)) return null;
      const headline = headlineFor(item);
      const keep = shouldKeepTweet({ text: headline, authorHandle: null }).keep;
      if (!keep) return null;
      return {
        fetched_at: fetchedAt,
        source_tab: typeof item.category === "string" && item.category.trim().length > 0 ? item.category.trim() : "news",
        headline,
        raw_json: item as unknown as Record<string, unknown>,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r != null);

  if (rows.length === 0) return 0;

  const write = await supabase.from("x_trends").insert(rows);
  if (write.error) throw write.error;

  return rows.length;
}
