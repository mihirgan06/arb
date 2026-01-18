import OpenAI from "openai";
import { loadEnv } from "./env";

export const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 384;
export const EMBEDDING_MODEL_VERSION = `${EMBEDDING_MODEL}@${EMBEDDING_DIMENSIONS}`;

let cached: OpenAI | null = null;

function client(): OpenAI {
  if (cached) return cached;

  const env = loadEnv();
  if (!env.openaiApiKey) {
    throw new Error("Missing env: OPENAI_API_KEY");
  }

  cached = new OpenAI({ apiKey: env.openaiApiKey });
  return cached;
}

export function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.map((n) => (Number.isFinite(n) ? String(n) : "0")).join(",")}]`;
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const res = await client().embeddings.create({
    model: EMBEDDING_MODEL,
    dimensions: EMBEDDING_DIMENSIONS,
    input: texts,
  });

  const byIndex = res.data.slice().sort((a, b) => a.index - b.index);
  return byIndex.map((d) => d.embedding);
}

