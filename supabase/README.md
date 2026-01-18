```md
# Supabase setup (local-first hackathon)

Goal: one hosted Supabase project + local UI/worker/Bird.

## 1) Create project

- Supabase dashboard → new project
- Grab:
  - Project URL (for `NEXT_PUBLIC_SUPABASE_URL`)
  - anon key (for `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
  - service role key (for worker scripts)

## 2) Apply schema + RPCs (SQL editor)

Run these in the Supabase SQL Editor (in order):

1) `supabase/schema.sql`
2) `supabase/migrations/0002_job_leases.sql`
3) `supabase/migrations/0003_vector_search.sql`

Notes:
- Extensions: `pgcrypto`, `vector` are created in `supabase/schema.sql`.
- Safe to re-run (idempotent where possible).

## 3) Local env

Create `web/.env.local` (do not commit). Minimum:

```bash
# UI
NEXT_PUBLIC_SUPABASE_URL="https://<ref>.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="<anon-key>"

# Worker (writes to DB)
SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"

# Optional (enables embeddings + better tweet filtering)
OPENAI_API_KEY="<openai-api-key>"
OPENAI_TWEET_MAX_DISTANCE="0.45"
OPENAI_TWEET_QUALITY_MODEL="gpt-4o-mini"
OPENAI_TWEET_QUALITY_MAX_TWEETS="30"
OPENAI_TWEET_QUALITY_MIN_CONFIDENCE="0.65"

# Optional: have the worker run Bird on an interval
# ENABLE_BIRD="1"
```

Worker reads `SUPABASE_URL` or falls back to `NEXT_PUBLIC_SUPABASE_URL`.

## 4) Run locally (quick)

```bash
pnpm -C web install

# terminal A (recommended)
pnpm -C web demo

# terminal B (optional but recommended for demo)
pnpm -C web embeddings:backfill

# terminal C (optional; Bird is best-effort + rate-limited)
pnpm -C web bird:trending
pnpm -C web bird:search -- --markets 50 --tweets 50
```

Open: `http://localhost:3000`

## Optional: apply schema via Postgres URL

If your network allows Postgres connections:

```bash
export SUPABASE_DB_URL="postgresql://..."
pnpm -C web schema:apply
```

This applies:
- `supabase/schema.sql`
- `supabase/migrations/0002_job_leases.sql`
- `supabase/migrations/0003_vector_search.sql`

If you see timeouts: your Wi‑Fi may block Postgres ports; use the Supabase SQL Editor instead.
```
