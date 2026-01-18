import "server-only";
import OpenAI from "openai";
import { normalizeText } from "@/lib/textNormalize";

export const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 384;
export const EMBEDDING_MODEL_VERSION = `${EMBEDDING_MODEL}@${EMBEDDING_DIMENSIONS}`;

let cached: OpenAI | null = null;

function openai(): OpenAI {
  if (cached) return cached;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing env: OPENAI_API_KEY");
  cached = new OpenAI({ apiKey });
  return cached;
}

function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.map((n) => (Number.isFinite(n) ? String(n) : "0")).join(",")}]`;
}

export async function embedTextToVectorLiteral(text: string): Promise<string> {
  const input = normalizeText(text);

  const res = await openai().embeddings.create({
    model: EMBEDDING_MODEL,
    dimensions: EMBEDDING_DIMENSIONS,
    input,
  });

  const embedding = res.data?.[0]?.embedding ?? null;
  if (!embedding || embedding.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `OpenAI embeddings returned ${embedding ? embedding.length : 0} dims (expected ${EMBEDDING_DIMENSIONS})`,
    );
  }

  return toVectorLiteral(embedding);
}

