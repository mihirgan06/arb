import { MarketCard } from "@/components/MarketCard";
import { Header } from "@/components/Header";

// Mock data - replace with real API calls
const markets = [
  {
    id: "1",
    question: "Will Bitcoin exceed $150k by end of 2026?",
    category: "Crypto",
    platforms: [
      { name: "Polymarket", yesOdds: 42, noOdds: 58, volume: "$2.4M" },
      { name: "Kalshi", yesOdds: 39, noOdds: 61, volume: "$890K" },
      { name: "PredictIt", yesOdds: 44, noOdds: 56, volume: "$156K" },
    ],
  },
  {
    id: "2",
    question: "Will the Fed cut rates in Q1 2026?",
    category: "Economics",
    platforms: [
      { name: "Polymarket", yesOdds: 67, noOdds: 33, volume: "$5.1M" },
      { name: "Kalshi", yesOdds: 71, noOdds: 29, volume: "$1.2M" },
      { name: "PredictIt", yesOdds: 65, noOdds: 35, volume: "$430K" },
    ],
  },
  {
    id: "3",
    question: "Will GPT-5 be released before July 2026?",
    category: "Tech",
    platforms: [
      { name: "Polymarket", yesOdds: 55, noOdds: 45, volume: "$780K" },
      { name: "Kalshi", yesOdds: 52, noOdds: 48, volume: "$320K" },
      { name: "Metaculus", yesOdds: 58, noOdds: 42, volume: "N/A" },
    ],
  },
];

export default function Dashboard() {
  return (
    <main className="min-h-screen">
      <Header />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {markets.map((market, index) => (
            <MarketCard key={market.id} market={market} index={index} />
          ))}
        </div>
      </div>
    </main>
  );
}
