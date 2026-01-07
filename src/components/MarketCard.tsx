type Platform = {
  name: string;
  yesOdds: number;
  noOdds: number;
  volume: string;
};

type Market = {
  id: string;
  question: string;
  category: string;
  platforms: Platform[];
};

export function MarketCard({ market, index }: { market: Market; index: number }) {
  const bestYes = Math.max(...market.platforms.map((p) => p.yesOdds));
  const bestNo = Math.max(...market.platforms.map((p) => p.noOdds));
  const spread = Math.abs(bestYes - Math.min(...market.platforms.map((p) => p.yesOdds)));

  return (
    <article
      className="bg-surface-elevated border border-surface-border rounded-xl p-5 hover:border-zinc-700 transition-colors animate-slide-up"
      style={{ animationDelay: `${index * 100}ms` }}
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <span className="text-[10px] font-mono uppercase tracking-wider text-accent bg-accent/10 px-2 py-1 rounded">
          {market.category}
        </span>
        {spread > 3 && (
          <span className="text-[10px] font-mono uppercase tracking-wider text-positive bg-positive/10 px-2 py-1 rounded">
            {spread}% spread
          </span>
        )}
      </div>

      <h2 className="text-sm font-medium leading-snug mb-5 text-zinc-100">
        {market.question}
      </h2>

      <div className="space-y-3">
        {market.platforms.map((platform) => (
          <div
            key={platform.name}
            className="flex items-center justify-between text-xs"
          >
            <span className="text-zinc-500 w-20 truncate">{platform.name}</span>
            <div className="flex items-center gap-4 font-mono">
              <span
                className={`w-12 text-right ${
                  platform.yesOdds === bestYes ? "text-positive font-medium" : "text-zinc-400"
                }`}
              >
                {platform.yesOdds}¢
              </span>
              <span
                className={`w-12 text-right ${
                  platform.noOdds === bestNo ? "text-negative font-medium" : "text-zinc-400"
                }`}
              >
                {platform.noOdds}¢
              </span>
              <span className="w-16 text-right text-zinc-600">{platform.volume}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 pt-4 border-t border-surface-border flex justify-between items-center text-[10px] font-mono text-zinc-600 uppercase tracking-wider">
        <span>Yes / No / Vol</span>
        <span>Live</span>
      </div>
    </article>
  );
}

