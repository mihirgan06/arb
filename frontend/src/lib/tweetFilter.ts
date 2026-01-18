function hasAny(text: string, needles: string[]) {
  return needles.some((n) => text.includes(n));
}

export function shouldShowTweet(args: { text: string; authorHandle: string | null | undefined }): boolean {
  const raw = args.text ?? "";
  const text = raw.toLowerCase();
  const author = (args.authorHandle ?? "").toLowerCase();

  if (text.startsWith("rt @")) return false;
  if (/\b0x[a-f0-9]{6,}\b/i.test(raw)) return false;

  const opinionCues = [
    " i think ",
    " i believe ",
    " imo",
    " imho",
    " my take",
    " my guess",
    " seems ",
    " likely",
    " unlikely",
    " no way",
    " definitely",
    " probably",
    " i'm ",
    " i’m ",
    " we’re ",
    " we're ",
    " because",
  ];
  const hasOpinion = opinionCues.some((c) => text.includes(c.trim()));

  const blockedHandles = [
    "polyinsider",
    "poly_alert",
    "polyalert",
    "plmrktwtchr",
    "polypoweralerts",
    "polyone_ai",
    "whalemovers",
    "realtimenewshq",
    "0xscarlex",
    "easonpo",
    "bartpredictbot",
  ];
  if (author && hasAny(author, blockedHandles)) return false;

  if (author && author.includes("bot") && !hasOpinion) return false;
  if (author && author.includes("news") && !hasOpinion) return false;

  const promoKeywords = [
    "new players",
    "score your bonus",
    "bonus",
    "promo",
    "promotion",
    "sign up",
    "signup",
    "deposit",
    "referral",
    "use code",
    "limited time",
    "sponsored",
    "#ad",
    "giveaway",
    "airdrop",
    "discount",
    "sale",
    "subscribe",
    "newsletter",
    "link in bio",
    "dm me",
  ];
  if (hasAny(text, promoKeywords)) return false;

  const botTemplates = [
    "whale alert",
    "fresh wallet",
    "new trader",
    "placed their first bet",
    "we will continue to collect relevant news",
    "we provide real-time updates",
    "visit our website",
    "moved ~$",
    "moved $",
    "bought no",
    "sold no",
    "bought yes",
    "sold yes",
    "someone just mass-bought",
    "size just hit the tape",
    "polymarket alert",
    "bot alert",
    "bart bot alert",
    "whale detected",
    "whale order",
    "suspicious polymarket trade",
    "prediction market:",
    "🐋 whale",
    "📊 market:",
  ];
  if (hasAny(text, botTemplates)) return false;

  // Regex fallbacks for template variants (extra punctuation/emoji/newlines).
  if (/\bbot alert\b/i.test(raw) && !hasOpinion) return false;
  if (/\bwhale\s+detected\b/i.test(raw) && !hasOpinion) return false;
  if (/\bprediction market:\b/i.test(raw) && !hasOpinion) return false;

  const botHandleHints = [
    "alert",
    "watcher",
    "wtchr",
    "insider",
    "movers",
    "realtimenews",
    "news",
    "alerts",
    "polywatch",
    "poly_alert",
    "polyinsider",
  ];
  const mentionsPolymarket = text.includes("@polymarket") || text.includes("polymarket");
  if (author && hasAny(author, botHandleHints) && mentionsPolymarket && !hasOpinion) return false;

  const marketActivityCues = [
    "buy ",
    " sell ",
    " sold ",
    " bought ",
    "order",
    "trade",
    "bet ",
    "mass-bought",
    "¢",
    "$",
  ];
  if (mentionsPolymarket && hasAny(text, marketActivityCues) && !hasOpinion) return false;

  if (text.includes("whale") && !hasOpinion) return false;

  return true;
}

export function tweetRelevanceScore(args: { text: string; authorHandle: string | null | undefined }): number {
  const raw = args.text ?? "";
  const text = raw.toLowerCase();
  const author = (args.authorHandle ?? "").toLowerCase();

  const opinionCues = [
    " i think ",
    " i believe ",
    " imo",
    " imho",
    " my take",
    " my guess",
    " seems ",
    " likely",
    " unlikely",
    " no way",
    " definitely",
    " probably",
    " i'm ",
    " i’m ",
    " we’re ",
    " we're ",
    " because",
    " my view",
  ];
  const hasOpinion = opinionCues.some((c) => text.includes(c.trim()));

  let score = 0;
  if (hasOpinion) score += 5;
  if (text.includes(" because ")) score += 1;
  if (text.includes("?")) score += 0.5;
  if (raw.length >= 80) score += 0.5;

  const botHandleHints = ["news", "alert", "alerts", "watcher", "wtchr", "insider", "movers"];
  if (author && hasAny(author, botHandleHints) && !hasOpinion) score -= 3;
  if (author && author.includes("bot") && !hasOpinion) score -= 5;

  return score;
}
