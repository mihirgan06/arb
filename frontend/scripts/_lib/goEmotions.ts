import { AutoModelForSequenceClassification, AutoTokenizer } from "@xenova/transformers";
import { normalizeText, shouldSkipNonEnglish } from "./textNormalize";

// Deterministic V1 runtime: ONNX-exported GoEmotions classifier (runs in Node via onnxruntime).
export const GO_EMOTIONS_MODEL_SPEC = "Cohee/distilbert-base-uncased-go-emotions-onnx";
export const GO_EMOTIONS_MODEL_RUNTIME = "Cohee/distilbert-base-uncased-go-emotions-onnx";

export type EmotionBucket =
  | "optimism"
  | "joy"
  | "excitement"
  | "curiosity"
  | "trust"
  | "fear"
  | "anger"
  | "disgust"
  | "sadness"
  | "surprise"
  | "confusion"
  | "neutral";

export const EMOTION_BUCKETS: EmotionBucket[] = [
  "optimism",
  "joy",
  "excitement",
  "curiosity",
  "trust",
  "fear",
  "anger",
  "disgust",
  "sadness",
  "surprise",
  "confusion",
  "neutral",
];

type BucketDistribution = Record<EmotionBucket, number>;

const LABEL_TO_BUCKET: Record<string, EmotionBucket> = {
  optimism: "optimism",
  joy: "joy",
  relief: "joy",
  excitement: "excitement",
  amusement: "excitement",
  curiosity: "curiosity",
  desire: "curiosity",
  admiration: "trust",
  approval: "trust",
  caring: "trust",
  gratitude: "trust",
  love: "trust",
  pride: "trust",
  fear: "fear",
  nervousness: "fear",
  anger: "anger",
  annoyance: "anger",
  disapproval: "anger",
  disgust: "disgust",
  embarrassment: "disgust",
  sadness: "sadness",
  disappointment: "sadness",
  grief: "sadness",
  remorse: "sadness",
  surprise: "surprise",
  realization: "surprise",
  confusion: "confusion",
  neutral: "neutral",
};

function sigmoid(x: number) {
  return 1 / (1 + Math.exp(-x));
}

function emptyDist(): BucketDistribution {
  return {
    optimism: 0,
    joy: 0,
    excitement: 0,
    curiosity: 0,
    trust: 0,
    fear: 0,
    anger: 0,
    disgust: 0,
    sadness: 0,
    surprise: 0,
    confusion: 0,
    neutral: 1,
  };
}

export function normalizeBuckets(raw: Partial<BucketDistribution>): BucketDistribution {
  const out: BucketDistribution = {
    optimism: raw.optimism ?? 0,
    joy: raw.joy ?? 0,
    excitement: raw.excitement ?? 0,
    curiosity: raw.curiosity ?? 0,
    trust: raw.trust ?? 0,
    fear: raw.fear ?? 0,
    anger: raw.anger ?? 0,
    disgust: raw.disgust ?? 0,
    sadness: raw.sadness ?? 0,
    surprise: raw.surprise ?? 0,
    confusion: raw.confusion ?? 0,
    neutral: raw.neutral ?? 0,
  };

  const s = EMOTION_BUCKETS.reduce((acc, k) => acc + out[k], 0);
  if (!Number.isFinite(s) || s <= 1e-9) return emptyDist();

  for (const k of EMOTION_BUCKETS) out[k] = out[k] / s;
  return out;
}

type ModelBundle = {
  tokenizer: Awaited<ReturnType<typeof AutoTokenizer.from_pretrained>>;
  model: Awaited<ReturnType<typeof AutoModelForSequenceClassification.from_pretrained>>;
};

let cached: Promise<ModelBundle> | null = null;

async function getModel(): Promise<ModelBundle> {
  if (!cached) {
    cached = (async () => {
      try {
        const tokenizer = await AutoTokenizer.from_pretrained(GO_EMOTIONS_MODEL_RUNTIME);
        const model = await AutoModelForSequenceClassification.from_pretrained(GO_EMOTIONS_MODEL_RUNTIME);
        return { tokenizer, model };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(
          `GoEmotions model load failed (${GO_EMOTIONS_MODEL_RUNTIME}). ` +
            `If you're on a restricted network, try a different Wi‑Fi/VPN. ` +
            `Original error: ${msg}`,
        );
      }
    })();
  }
  return cached;
}

function getId2Label(model: ModelBundle["model"]): Record<string, string> {
  const cfg = (model as unknown as { config?: unknown }).config;
  if (cfg && typeof cfg === "object") {
    const id2label = (cfg as { id2label?: unknown }).id2label;
    if (id2label && typeof id2label === "object") {
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(id2label as Record<string, unknown>)) {
        if (typeof v === "string") out[k] = v;
      }
      if (Object.keys(out).length > 0) return out;
    }
  }
  throw new Error("GoEmotions: missing config.id2label");
}

export async function scoreEmotions(input: string): Promise<BucketDistribution> {
  const normalized = normalizeText(input);
  if (shouldSkipNonEnglish(normalized)) return emptyDist();

  const { tokenizer, model } = await getModel();
  const encoded = await tokenizer(normalized, { truncation: true });
  const out = await model(encoded);

  const logits = (out as unknown as { logits?: unknown }).logits;
  if (!logits || typeof logits !== "object") throw new Error("GoEmotions: missing logits");

  const data = (logits as { data?: unknown }).data;
  if (!data || !(data instanceof Float32Array || Array.isArray(data))) {
    throw new Error("GoEmotions: unexpected logits.data");
  }

  const id2label = getId2Label(model);

  const bucketRaw: Partial<BucketDistribution> = {};
  for (const k of EMOTION_BUCKETS) bucketRaw[k] = 0;

  const arr = Array.isArray(data) ? data : Array.from(data);
  for (let i = 0; i < arr.length; i++) {
    const logit = Number(arr[i]);
    const label = id2label[String(i)];
    if (!label) continue;
    const p = sigmoid(logit);
    const bucket = LABEL_TO_BUCKET[label.toLowerCase()];
    if (!bucket) continue;
    bucketRaw[bucket] = (bucketRaw[bucket] ?? 0) + p;
  }

  return normalizeBuckets(bucketRaw);
}
