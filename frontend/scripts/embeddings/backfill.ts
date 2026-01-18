import "../_lib/dotenv";
import { supabaseAdmin } from "../_lib/supabaseAdmin";
import { normalizeText } from "../_lib/textNormalize";
import {
  EMBEDDING_MODEL_VERSION,
  embedTexts,
  toVectorLiteral,
} from "../_lib/openaiEmbeddings";

type MarketRow = {
  condition_id: string;
  question: string;
  description: string | null;
  tags: string[] | null;
  volume_num: number | null;
  is_sports: boolean;
  closed: boolean | null;
  archived: boolean | null;
};

function docText(m: MarketRow): string {
  const desc = m.description?.trim() ?? "";
  const tags = Array.isArray(m.tags) ? m.tags : [];
  return `${m.question}\n${desc}\nTags: ${tags.join(", ")}`;
}

async function fetchAlreadyEmbedded(
  supabase: ReturnType<typeof supabaseAdmin>,
  conditionIds: string[],
): Promise<Set<string>> {
  const chunkSize = 100;
  const already = new Set<string>();

  for (let i = 0; i < conditionIds.length; i += chunkSize) {
    const chunk = conditionIds.slice(i, i + chunkSize);
    const semanticsRes = await supabase
      .from("market_semantics")
      .select("condition_id, model_version")
      .in("condition_id", chunk);

    if (semanticsRes.error) throw semanticsRes.error;

    for (const r of semanticsRes.data ?? []) {
      if (r.model_version === EMBEDDING_MODEL_VERSION) already.add(r.condition_id);
    }
  }

  return already;
}

async function main() {
  const supabase = supabaseAdmin();

  const candidateLimit = Number(process.env.EMBED_CANDIDATE_LIMIT ?? 500);
  const batchSize = Number(process.env.EMBED_BATCH_SIZE ?? 50);
  const includeSports = process.env.INCLUDE_SPORTS === "1";

  if (!Number.isFinite(candidateLimit) || candidateLimit <= 0) {
    throw new Error("EMBED_CANDIDATE_LIMIT must be > 0");
  }
  if (!Number.isFinite(batchSize) || batchSize <= 0 || batchSize > 200) {
    throw new Error("EMBED_BATCH_SIZE must be 1..200");
  }

  let totalUpserted = 0;

  for (;;) {
    const marketsRes = await supabase
      .from("markets")
      .select("condition_id, question, description, tags, volume_num, is_sports, closed, archived")
      .eq("closed", false)
      .eq("archived", false)
      .order("volume_num", { ascending: false, nullsFirst: false })
      .limit(candidateLimit);

    if (marketsRes.error) throw marketsRes.error;
    const all = (marketsRes.data ?? []) as MarketRow[];
    const markets = includeSports ? all : all.filter((m) => m.is_sports !== true);

    const conditionIds = markets.map((m) => m.condition_id);
    if (conditionIds.length === 0) {
      console.log("[embeddings] no candidate markets yet");
      break;
    }

    // Avoid huge `in.(...)` queries that can break on some networks/proxies.
    const already = await fetchAlreadyEmbedded(supabase, conditionIds);

    const toEmbed = markets
      .filter((m) => !already.has(m.condition_id))
      .slice(0, batchSize);

    if (toEmbed.length === 0) {
      console.log(`[embeddings] upserted_total=${totalUpserted} done (model=${EMBEDDING_MODEL_VERSION})`);
      break;
    }

    const inputs = toEmbed.map((m) => normalizeText(docText(m)));
    const vectors = await embedTexts(inputs);

    if (vectors.length !== toEmbed.length) {
      throw new Error(`OpenAI embeddings returned ${vectors.length} vectors for ${toEmbed.length} inputs`);
    }

    const upsertRows = toEmbed.map((m, i) => ({
      condition_id: m.condition_id,
      embedding: toVectorLiteral(vectors[i] ?? []),
      model_version: EMBEDDING_MODEL_VERSION,
    }));

    const write = await supabase
      .from("market_semantics")
      .upsert(upsertRows, { onConflict: "condition_id" });

    if (write.error) throw write.error;
    totalUpserted += upsertRows.length;

    console.log(`[embeddings] upserted_batch=${upsertRows.length} upserted_total=${totalUpserted}`);
  }
}

void main().catch((err) => {
  if (err instanceof Error) {
    console.error(`[embeddings] error: ${err.stack ?? err.message}`);
    const anyErr = err as Error & { cause?: unknown };
    if (anyErr.cause) {
      try {
        console.error(`[embeddings] cause: ${JSON.stringify(anyErr.cause, null, 2)}`);
      } catch {
        console.error("[embeddings] cause: (non-serializable)");
      }
    }
  } else if (err && typeof err === "object") {
    try {
      console.error(`[embeddings] error: ${JSON.stringify(err, null, 2)}`);
    } catch {
      console.error("[embeddings] error: (non-serializable)");
    }
  } else console.error(`[embeddings] error: ${String(err)}`);
  process.exitCode = 1;
});
