import { NextResponse } from "next/server";
import OpenAI from "openai";

export const dynamic = "force-dynamic";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type EmotionData = {
  optimism: number;
  joy: number;
  excitement: number;
  curiosity: number;
  trust: number;
  fear: number;
  anger: number;
  disgust: number;
  sadness: number;
  surprise: number;
  confusion: number;
  neutral: number;
};

type MarketData = {
  question: string;
  price: number | null;
  sentiment: number | null;
  divergence: number | null;
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      topic,
      mood,
      emotions,
      marketsCount,
      marketsWithSentiment,
      tweetCount,
      topMarkets,
    } = body as {
      topic: string;
      mood: number | null;
      emotions: EmotionData;
      marketsCount: number;
      marketsWithSentiment: number;
      tweetCount: number;
      topMarkets: MarketData[];
    };

    // Format emotions for the prompt
    const sortedEmotions = Object.entries(emotions)
      .filter(([key]) => key !== "neutral")
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);

    const topEmotionsStr = sortedEmotions
      .map(([emotion, value]) => `${emotion}: ${(value * 100).toFixed(0)}%`)
      .join(", ");

    // Format market data
    const marketSummary = topMarkets
      .slice(0, 5)
      .map((m) => {
        const price = m.price != null ? `${(m.price * 100).toFixed(0)}%` : "N/A";
        const sent = m.sentiment != null ? m.sentiment.toFixed(2) : "N/A";
        return `- "${m.question}" (Price: ${price}, Sentiment: ${sent})`;
      })
      .join("\n");

    const moodDescription =
      mood == null
        ? "unknown"
        : mood > 0.3
        ? "strongly positive"
        : mood > 0.1
        ? "slightly positive"
        : mood < -0.3
        ? "strongly negative"
        : mood < -0.1
        ? "slightly negative"
        : "neutral";

    const prompt = `You are a sentiment analysis expert. Based on the following aggregated data about the topic "${topic}", provide a brief, insightful sentiment summary.

DATA:
- Overall mood score: ${mood?.toFixed(2) ?? "N/A"} (${moodDescription}) - scale is -1 to +1
- Top emotions detected: ${topEmotionsStr}
- Markets analyzed: ${marketsCount} (${marketsWithSentiment} with sentiment data)
- Social media posts scored: ~${tweetCount}

TOP RELATED PREDICTION MARKETS:
${marketSummary || "No market data available"}

INSTRUCTIONS:
1. Write a 2-3 sentence summary of the overall sentiment around "${topic}"
2. Be specific about what the data suggests - mention if people are optimistic, fearful, excited, etc.
3. If there's interesting divergence between market prices and sentiment, mention it
4. Keep it conversational but data-driven
5. Do NOT use bullet points or headers - just flowing prose
6. Do NOT mention the technical details like "mood score" - translate into plain language`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a concise sentiment analyst. Provide brief, insightful summaries without jargon. Never use markdown formatting, bullet points, or headers.",
        },
        { role: "user", content: prompt },
      ],
      max_tokens: 200,
      temperature: 0.7,
    });

    const summary = completion.choices[0]?.message?.content?.trim() || "";

    return NextResponse.json({
      success: true,
      summary,
      moodLabel: moodDescription,
    });
  } catch (error) {
    console.error("[API] Topics summarize error:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
