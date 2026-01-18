import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Simple endpoint to fetch top markets from Polymarket
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "20");

    // Fetch from Polymarket Gamma API (public, no auth needed)
    const response = await fetch(
      `https://gamma-api.polymarket.com/markets?limit=${limit}&active=true&closed=false`,
      { cache: "no-store" }
    );

    if (!response.ok) {
      throw new Error(`Gamma API error: ${response.statusText}`);
    }

    const markets = await response.json();

    // Simplify the response - just what we need for display
    const simplified = markets.map((m: any) => ({
      id: m.id,
      question: m.question,
      slug: m.slug,
      outcomePrices: m.outcomePrices ? JSON.parse(m.outcomePrices) : null,
      volume: parseFloat(m.volume) || 0,
      liquidity: parseFloat(m.liquidity) || 0,
      clobTokenIds: m.clobTokenIds ? JSON.parse(m.clobTokenIds) : null,
    }));

    return NextResponse.json({
      success: true,
      markets: simplified,
    });
  } catch (error) {
    console.error("Markets API Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch markets" },
      { status: 500 }
    );
  }
}
