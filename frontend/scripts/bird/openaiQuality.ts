import OpenAI from "openai";
import { loadEnv } from "../_lib/env";
import { normalizeText } from "../_lib/textNormalize";

export type TweetQualityLabel = "opinion" | "discussion" | "analysis" | "news" | "bot" | "promo" | "other";

export type TweetQualityMeta = {
  quality_model: string;
  quality_label: TweetQualityLabel;
  quality_confidence: number;
  quality_keep: boolean;
};

const DEFAULT_MODEL = "gpt-4o-mini";

let cached: OpenAI | null = null;

function client(): OpenAI {
  if (cached) return cached;
  const env = loadEnv();
  if (!env.openaiApiKey) throw new Error("Missing env: OPENAI_API_KEY");
  cached = new OpenAI({ apiKey: env.openaiApiKey });
  return cached;
}

function clip(text: string, maxChars: number): string {
  const t = text.trim();
  if (t.length <= maxChars) return t;
  return t.slice(0, maxChars).trim();
}

function intOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.floor(value);
  if (typeof value === "string" && value.trim().length > 0) {
    const n = Number(value);
    if (Number.isFinite(n)) return Math.floor(n);
  }
  return null;
}

type TweetLike = {
  tweet_id: string;
  author_handle: string | null;
  text: string;
};

type QualityItem = {
  tweet_id: string;
  keep: boolean;
  label: TweetQualityLabel;
  confidence: number;
};

function coerceItem(raw: unknown): QualityItem | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const tweetId = typeof r.tweet_id === "string" ? r.tweet_id : null;
  const keep = typeof r.keep === "boolean" ? r.keep : null;
  const label = typeof r.label === "string" ? (r.label as TweetQualityLabel) : null;
  const confidence = typeof r.confidence === "number" ? r.confidence : null;
  if (!tweetId || keep == null || !label || confidence == null) return null;
  return { tweet_id: tweetId, keep, label, confidence };
}

export async function classifyTweetQuality(args: {
  marketText: string;
  tweets: TweetLike[];
  model?: string;
  maxTweets?: number;
}): Promise<Record<string, TweetQualityMeta>> {
  const requestedModel = (args.model ?? process.env.OPENAI_TWEET_QUALITY_MODEL ?? DEFAULT_MODEL).trim();
  const maxTweets = Math.max(
    1,
    Math.min(60, args.maxTweets ?? intOrNull(process.env.OPENAI_TWEET_QUALITY_MAX_TWEETS) ?? 30),
  );

  const tweets = args.tweets.slice(0, maxTweets);
  if (tweets.length === 0) return {};

  const marketText = clip(normalizeText(args.marketText), 1200);
  const tweetItems = tweets.map((t) => ({
    tweet_id: t.tweet_id,
    author_handle: t.author_handle,
    text: clip(normalizeText(t.text), 700),
  }));

  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      v: { type: "integer", enum: [1] },
      items: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            tweet_id: { type: "string" },
            keep: { type: "boolean" },
            label: {
              type: "string",
              enum: ["opinion", "discussion", "analysis", "news", "bot", "promo", "other"],
            },
            confidence: { type: "number" },
          },
          required: ["tweet_id", "keep", "label", "confidence"],
        },
      },
    },
    required: ["v", "items"],
  } as const;

  const input = [
    "Task: filter X posts for a prediction market demo.",
    "Keep ONLY human opinions/discussion/analysis about the market/question.",
    "Reject bot alerts (whale alerts, automated trade reports), promos/ads, affiliate/referrals, and generic headlines with no reasoning.",
    "",
    "Market:",
    marketText,
    "",
    "Tweets (JSON lines):",
    ...tweetItems.map((t) => JSON.stringify(t)),
  ].join("\n");

  const call = async (model: string) =>
    client().responses.create({
      model,
      temperature: 0,
      max_output_tokens: 800,
      input,
      text: {
        format: {
          type: "json_schema",
          name: "tweet_quality_v1",
          strict: true,
          schema,
        },
      },
    });

  let model = requestedModel;
  let res: Awaited<ReturnType<OpenAI["responses"]["create"]>>;
  try {
    res = await call(model);
  } catch (err) {
    if (requestedModel !== DEFAULT_MODEL) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[openaiQuality] model="${requestedModel}" failed (${msg}); retrying with "${DEFAULT_MODEL}"`);
      model = DEFAULT_MODEL;
      res = await call(DEFAULT_MODEL);
    } else {
      throw err;
    }
  }

  const rawText = typeof (res as unknown as { output_text?: unknown }).output_text === "string" ? (res as unknown as { output_text: string }).output_text : "";
  if (!rawText) return {};

  let parsed: unknown = null;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return {};
  }

  const items = (parsed && typeof parsed === "object" ? (parsed as { items?: unknown }).items : null) as unknown;
  if (!Array.isArray(items)) return {};

  const out: Record<string, TweetQualityMeta> = {};
  for (const raw of items) {
    const item = coerceItem(raw);
    if (!item) continue;
    if (!tweets.some((t) => t.tweet_id === item.tweet_id)) continue;
    out[item.tweet_id] = {
      quality_model: model,
      quality_label: item.label,
      quality_confidence: Math.max(0, Math.min(1, item.confidence)),
      quality_keep: item.keep,
    };
  }

  return out;
}
