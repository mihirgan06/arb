import { NextResponse } from "next/server";
import { polymarket } from "@/services/polymarket-client";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const tag = searchParams.get("tag") || "Politics";

        // TODO: Use the actual client to search/filter
        // For now, let's just return a success response to verify the route works
        // and potentially fetch a specific hardcoded market if we can.

        // Example: Fetching a known market if we had an ID.
        // const market = await polymarket.getMarket("some-id");

        return NextResponse.json({
            success: true,
            markets: [
                {
                    id: "1",
                    question: "Will Donald Trump win the 2024 Election?",
                    outcomes: ["Yes", "No"],
                    prices: [0.55, 0.45],
                    volume: 1000000
                },
                {
                    id: "2",
                    question: "Will JD Vance be VP?",
                    outcomes: ["Yes", "No"],
                    prices: [0.54, 0.46],
                    volume: 500000
                }
            ]
        });
    } catch (error) {
        console.error("API Error:", error);
        return NextResponse.json(
            { success: false, error: "Failed to fetch markets" },
            { status: 500 }
        );
    }
}
