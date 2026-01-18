const STOPWORDS = new Set([
  "a",
  "about",
  "after",
  "all",
  "an",
  "and",
  "any",
  "are",
  "as",
  "at",
  "be",
  "before",
  "by",
  "can",
  "could",
  "did",
  "do",
  "does",
  "for",
  "from",
  "had",
  "has",
  "have",
  "how",
  "if",
  "in",
  "into",
  "is",
  "it",
  "its",
  "just",
  "may",
  "might",
  "more",
  "most",
  "no",
  "not",
  "of",
  "on",
  "or",
  "our",
  "should",
  "so",
  "than",
  "that",
  "the",
  "their",
  "then",
  "there",
  "these",
  "this",
  "to",
  "up",
  "us",
  "was",
  "were",
  "what",
  "when",
  "where",
  "which",
  "who",
  "why",
  "will",
  "with",
  "would",
  "yes",
]);

function clip(s: string, max: number) {
  const t = s.trim();
  if (t.length <= max) return t;
  return t.slice(0, max).trim();
}

function extractYears(text: string): string[] {
  const years = text.match(/\b(19|20)\d{2}\b/g);
  if (!years) return [];
  const uniq = new Set<string>();
  for (const y of years) uniq.add(y);
  return Array.from(uniq).slice(0, 2);
}

function extractEntityPhrase(question: string): string | null {
  const raw = question.replace(/[“”]/g, '"').trim();

  const candidates: string[] = [];
  const rx = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\b/g;
  for (const m of raw.matchAll(rx)) {
    const phrase = m[1]?.trim();
    if (!phrase) continue;
    if (phrase.startsWith("Will ")) continue;
    if (phrase.startsWith("No ")) continue;
    if (phrase.startsWith("Yes ")) continue;
    candidates.push(phrase);
  }

  candidates.sort((a, b) => b.length - a.length);
  const best = candidates[0];
  if (best && best.length >= 6) return best;

  // Fallback: pick a single capitalized token that's not just the question lead-in.
  const tokens = raw.split(/\s+/g);
  for (const t of tokens) {
    const cleaned = t.replace(/[^\p{L}\p{N}]/gu, "");
    if (!cleaned) continue;
    if (cleaned === "Will" || cleaned === "No" || cleaned === "Yes") continue;
    if (/^[A-Z][A-Za-z]{2,}$/.test(cleaned)) return cleaned;
  }

  return null;
}

function tokenizeKeywords(text: string, max: number): string[] {
  const words = text
    .toLowerCase()
    .replace(/[’']/g, "")
    .split(/[^a-z0-9]+/g)
    .map((w) => w.trim())
    .filter(Boolean)
    .filter((w) => w.length >= 3 || /^\d{4}$/.test(w))
    .filter((w) => !STOPWORDS.has(w));

  const uniq: string[] = [];
  const seen = new Set<string>();
  for (const w of words) {
    if (seen.has(w)) continue;
    seen.add(w);
    uniq.push(w);
    if (uniq.length >= max) break;
  }
  return uniq;
}

export function buildMarketTweetSearchQuery(args: {
  question: string;
  description?: string | null;
}): { query: string; version: string } {
  const question = args.question.trim();
  const desc = (args.description ?? "").trim();

  const entity = extractEntityPhrase(question);
  const years = extractYears(question);
  const keywords = tokenizeKeywords(`${question} ${desc}`, 8);

  const parts: string[] = [];
  if (entity) parts.push(`"${clip(entity, 60)}"`);
  for (const y of years) parts.push(y);
  if (keywords.length > 0) parts.push(keywords.join(" "));

  // Reduce spam by default; keep it short.
  // Note: X query operators are best-effort; Bird uses internal endpoints and can change.
  const mods = ["-filter:retweets", "-filter:links", "lang:en"];

  const base = parts.length > 0 ? parts.join(" ") : question;
  const query = clip(`${base} ${mods.join(" ")}`, 240);
  return { query, version: "fuzzy-v1" };
}

