# Arbiter
Execution-aware arbitrage and sentiment analytics for prediction markets.
Arbiter is a trading intelligence layer built on top of Polymarket that helps users reason about real, executable opportunities instead of misleading headline odds. It combines order-book-aware simulations with sentiment context to show where apparent edges survive execution—and where they break.
## What Arbiter Does
Arbiter turns prediction markets into something closer to a real trading terminal.
Core features
Execution-aware arbitrage analysis
Simulates real trades using Polymarket order books
Computes size-adjusted execution prices
Shows where arbitrage breaks due to slippage
Profit vs size trade simulation
Interactive slider to test different contract sizes
Visualizes P&L curves instead of single-point estimates
Slippage & volatility labeling
Clear LOW / MEDIUM / HIGH slippage indicators
Helps users quickly judge trade fragility
Intra-market opportunity discovery
Compares logically related Polymarket markets (subset, implication, etc.)
Avoids fake arbitrage based on midpoint math
Sentiment & narrative context (optional layer)
Primarily uses Polymarket pricing as the belief signal
Adds a lightweight narrative overlay from X (via Bird) as contextual support


## Key Insight
Most prediction market tools treat price as probability and ignore execution. Arbiter explicitly models order-book depth, slippage, and size effects, revealing that many “arbitrage” opportunities disappear once real execution is considered.
This is a feature, not a bug—and Arbiter makes that reality visible.

## Project layout
Frontend
Next.js (App Router)
React
TypeScript
Interactive charts for trade simulation and analytics
Backend / API
Next.js API routes / server actions
TypeScript
Execution simulation logic (order book walking, slippage modeling)
Data & Infrastructure
Polymarket APIs
Gamma API (market discovery & metadata)
CLOB API (order books, bids/asks, spreads)
Supabase (Postgres)
Market metadata
Cached analytics
Optional pgvector support for semantic search
Vercel
Hosting
Serverless functions
Scheduled cron jobs
AI / ML
OpenAI API
Used as a conservative logical relationship classifier
Identifies which market pairs have hard resolution constraints
Prevents false arbitrage from weak semantic similarity
Optional Narrative Layer
Bird CLI (X/Twitter ingestion)
Best-effort, cached narrative context
Not a core dependency; Polymarket remains the primary signal
- `frontend/`: Next.js app (UI + API routes)

## Quick start

```bash
cd frontend
npm install
npm run dev
```

Then open `http://localhost:3000`.
