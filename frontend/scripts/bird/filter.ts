function hasAny(text: string, needles: string[]) {
  return needles.some((n) => text.includes(n));
}

export function shouldKeepTweet(args: { text: string; authorHandle: string | null | undefined }): {
  keep: boolean;
  reason: string;
} {
  const raw = args.text ?? "";
  const text = raw.toLowerCase();
  const author = (args.authorHandle ?? "").toLowerCase();

  if (text.startsWith("rt @")) return { keep: false, reason: "retweet" };
  if (/\b0x[a-f0-9]{6,}\b/i.test(raw)) return { keep: false, reason: "wallet-address" };

  // Hard heuristic: bot handles are almost never "opinions" for our demo.
  // Allow only if they contain clear opinion language.
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
  if (author && hasAny(author, blockedHandles)) return { keep: false, reason: "blocked-handle" };

  if (author && author.includes("bot") && !hasOpinion) return { keep: false, reason: "bot-handle-generic" };
  if (author && author.includes("news") && !hasOpinion) return { keep: false, reason: "news-bot" };

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
  if (hasAny(text, promoKeywords)) return { keep: false, reason: "promo" };

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
  if (hasAny(text, botTemplates)) return { keep: false, reason: "bot-template" };

  // Regex fallbacks for template variants (extra punctuation/emoji/newlines).
  if (/\bbot alert\b/i.test(raw) && !hasOpinion) return { keep: false, reason: "bot-alert-regex" };
  if (/\bwhale\s+detected\b/i.test(raw) && !hasOpinion) return { keep: false, reason: "whale-detected" };
  if (/\bprediction market:\b/i.test(raw) && !hasOpinion) return { keep: false, reason: "prediction-market-template" };

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

  if (author && hasAny(author, botHandleHints) && mentionsPolymarket && !hasOpinion) {
    return { keep: false, reason: "bot-handle" };
  }

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
  if (mentionsPolymarket && hasAny(text, marketActivityCues) && !hasOpinion) {
    return { keep: false, reason: "market-activity" };
  }

  if (text.includes("whale") && !hasOpinion) {
    return { keep: false, reason: "whale-no-opinion" };
  }

  return { keep: true, reason: "ok" };
}
