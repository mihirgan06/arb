type Bucket =
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

const BUCKETS: Bucket[] = [
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

export type BucketDist = Record<Bucket, number>;

function pct0(value: number) {
  return `${Math.round(value * 100)}%`;
}

function pct1(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function usd0(value: number) {
  return Math.round(value).toLocaleString();
}

function top3(dist: BucketDist): Array<{ bucket: Bucket; p: number }> {
  return BUCKETS
    .map((b) => ({ bucket: b, p: dist[b] ?? 0 }))
    .sort((a, b) => (b.p !== a.p ? b.p - a.p : a.bucket.localeCompare(b.bucket)))
    .slice(0, 3);
}

function expectationLabel(pYes: number | null): string {
  if (pYes == null || !Number.isFinite(pYes)) return "Market is uncertain";
  if (pYes >= 0.7) return "Market strongly expects YES";
  if (pYes >= 0.55) return "Market slightly expects YES";
  if (pYes <= 0.3) return "Market strongly expects NO";
  if (pYes <= 0.45) return "Market slightly expects NO";
  return "Market is uncertain";
}

function reliabilityLabel(args: { liquidity: number | null; volume24h: number | null; spread: number | null }): "high" | "medium" | "low" {
  const liq = args.liquidity ?? 0;
  const vol = args.volume24h ?? 0;
  const spr = args.spread ?? 1;
  if (liq >= 50_000 && vol >= 100_000 && spr <= 0.03) return "high";
  if (liq >= 10_000 && spr <= 0.06) return "medium";
  return "low";
}

export function buildAiExplanation(args: {
  pYesMid: number | null;
  spread: number | null;
  liquidity: number | null;
  volume24h: number | null;
  emotionsQuestion: BucketDist;
  emotionsX: BucketDist | null;
  emotionsXSampleSize: number | null;
  blendedEmotions: BucketDist;
  alpha: number | null;
}): string[] {
  const pYesPct = args.pYesMid == null ? "n/a" : pct0(args.pYesMid);
  const implied = expectationLabel(args.pYesMid);

  const rel = reliabilityLabel({ liquidity: args.liquidity, volume24h: args.volume24h, spread: args.spread });
  const spreadText = args.spread == null ? "n/a" : pct1(args.spread);
  const liqText = usd0(args.liquidity ?? 0);
  const volText = usd0(args.volume24h ?? 0);

  const qTop = top3(args.emotionsQuestion);
  const qLine = `Question emotion signal (static): ${qTop[0]!.bucket} ${pct0(qTop[0]!.p)}, ${qTop[1]!.bucket} ${pct0(qTop[1]!.p)}, ${qTop[2]!.bucket} ${pct0(qTop[2]!.p)}.`;

  const xN = args.emotionsXSampleSize ?? 0;
  const xLine =
    args.emotionsX && xN > 0
      ? (() => {
          const xTop = top3(args.emotionsX!);
          return `X emotion signal (dynamic): ${xTop[0]!.bucket} ${pct0(xTop[0]!.p)}, ${xTop[1]!.bucket} ${pct0(xTop[1]!.p)}, ${xTop[2]!.bucket} ${pct0(xTop[2]!.p)} (n = ${xN}).`;
        })()
      : "X emotion signal (dynamic): not available yet.";

  const bTop = top3(args.blendedEmotions);
  const alphaText = args.alpha == null ? "0" : args.alpha.toFixed(2);
  const bLine = `Blended Online Sentiment (this view): ${bTop[0]!.bucket} ${pct0(bTop[0]!.p)}, ${bTop[1]!.bucket} ${pct0(bTop[1]!.p)}, ${bTop[2]!.bucket} ${pct0(bTop[2]!.p)} (alpha = ${alphaText}).`;

  return [
    `Market-implied probability: YES = ${pYesPct}. ${implied}.`,
    `Data quality: ${rel} (spread ${spreadText}, liquidity ${liqText}, 24h volume ${volText}).`,
    qLine,
    xLine,
    bLine,
    "Interpretation rule: when probability moves toward 1, the crowd is pricing the event as more likely. The emotion distribution describes how people frame the event (fear vs optimism, etc), not whether it is true.",
  ];
}

