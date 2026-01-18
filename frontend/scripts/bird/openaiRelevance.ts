import { normalizeText } from "../_lib/textNormalize";
import { EMBEDDING_MODEL_VERSION, embedTexts } from "../_lib/openaiEmbeddings";

type TweetLike = {
  tweet_id: string;
  text: string;
  author_handle: string | null;
  raw_json: Record<string, unknown>;
};

export type TweetRelevanceMeta = {
  v: 1;
  model_version: string;
  cosine_distance: number;
  has_opinion_cue: boolean;
  engagement_weight: number;
  query_version: string;
};

const OPINION_CUES = [
  "i think",
  "i believe",
  "imo",
  "imho",
  "my take",
  "my guess",
  "seems",
  "likely",
  "unlikely",
  "no way",
  "definitely",
  "probably",
  "i'm",
  "i’m",
  "we’re",
  "we're",
  "because",
];

function clipForEmbedding(text: string, maxChars: number) {
  const t = text.trim();
  if (t.length <= maxChars) return t;
  return t.slice(0, maxChars).trim();
}

function hasOpinionCue(text: string): boolean {
  const t = text.toLowerCase();
  return OPINION_CUES.some((c) => t.includes(c));
}

function numOrZero(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function engagementWeight(raw: Record<string, unknown>): number {
  const likes = numOrZero(raw.likeCount);
  const rts = numOrZero(raw.retweetCount);
  const replies = numOrZero(raw.replyCount);
  return 1 + Math.log(1 + likes + 2 * rts + replies);
}

function cosineDistance(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n <= 0) return 1;

  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  if (!Number.isFinite(denom) || denom <= 1e-12) return 1;
  const sim = dot / denom;
  const dist = 1 - sim;
  if (!Number.isFinite(dist)) return 1;
  return Math.max(0, Math.min(2, dist));
}

export async function rankTweetsByMarketRelevance<TTweet extends TweetLike>(args: {
  marketText: string;
  tweets: TTweet[];
  keep: number;
  maxDistance: number;
  queryVersion: string;
}): Promise<{ kept: TTweet[]; metaById: Record<string, TweetRelevanceMeta> }> {
  if (args.tweets.length === 0) return { kept: [], metaById: {} };

  const marketInput = normalizeText(clipForEmbedding(args.marketText, 1200));
  const tweetInputs = args.tweets.map((t) => normalizeText(clipForEmbedding(t.text, 700)));

  const vectors = await embedTexts([marketInput, ...tweetInputs]);
  const marketVec = vectors[0] ?? null;
  if (!marketVec) throw new Error("OpenAI embeddings missing market vector");

  const scored = args.tweets.map((t, idx) => {
    const vec = vectors[idx + 1] ?? [];
    const dist = cosineDistance(marketVec, vec);
    const opinion = hasOpinionCue(t.text);
    const w = engagementWeight(t.raw_json ?? {});
    return { t, dist, opinion, w };
  });

  const byDist = scored.slice().sort((a, b) => a.dist - b.dist || b.w - a.w || a.t.tweet_id.localeCompare(b.t.tweet_id));

  const within = byDist.filter((s) => s.dist <= args.maxDistance);
  const pool = within.length >= Math.min(args.keep, 5) ? within : byDist;

  pool.sort(
    (a, b) =>
      Number(b.opinion) - Number(a.opinion) ||
      a.dist - b.dist ||
      b.w - a.w ||
      a.t.tweet_id.localeCompare(b.t.tweet_id),
  );

  const keptScored = pool.slice(0, Math.min(args.keep, pool.length));
  const kept = keptScored.map((s) => s.t);

  const metaById: Record<string, TweetRelevanceMeta> = {};
  for (const s of keptScored) {
    metaById[s.t.tweet_id] = {
      v: 1,
      model_version: EMBEDDING_MODEL_VERSION,
      cosine_distance: s.dist,
      has_opinion_cue: s.opinion,
      engagement_weight: s.w,
      query_version: args.queryVersion,
    };
  }

  return { kept, metaById };
}
