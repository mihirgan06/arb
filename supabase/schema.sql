-- Local-first MVP schema (source of truth: docs/SPEC.md)
-- Safe to re-run (idempotent where possible).

create extension if not exists vector;
create extension if not exists pgcrypto;

create table if not exists markets (
  condition_id text primary key,
  gamma_market_id text unique,
  question text not null,
  description text,
  category text,
  tags text[],
  slug text,
  is_sports boolean not null default false,
  active boolean,
  closed boolean,
  archived boolean,
  end_date_iso timestamptz,
  volume_num numeric,
  liquidity_num numeric,
  outcomes_raw text,
  outcome_prices_raw text,
  clob_token_ids_raw text,
  updated_at timestamptz not null default now(),
  last_gamma_sync_at timestamptz
);

create table if not exists market_tokens (
  token_id text primary key,
  condition_id text not null references markets(condition_id) on delete cascade,
  outcome text not null,
  winner boolean,
  price numeric,
  mid numeric,
  spread numeric,
  updated_at timestamptz not null default now()
);

create table if not exists market_price_samples (
  token_id text not null references market_tokens(token_id) on delete cascade,
  ts timestamptz not null,
  midpoint numeric not null,
  spread numeric,
  primary key (token_id, ts)
);

create index if not exists idx_market_price_samples_token_ts
  on market_price_samples (token_id, ts desc);

create table if not exists x_trends (
  id uuid primary key default gen_random_uuid(),
  fetched_at timestamptz not null,
  source_tab text not null,
  headline text not null,
  raw_json jsonb not null
);

create table if not exists x_tweets (
  tweet_id text primary key,
  fetched_at timestamptz not null,
  condition_id text references markets(condition_id) on delete set null,
  query text not null,
  created_at timestamptz,
  author_handle text,
  text text not null,
  raw_json jsonb not null
);

-- Track per-market fetch attempts, even when zero tweets returned.
-- Source of truth for "Narrative updated" timestamps in UI.
create table if not exists x_market_fetches (
  condition_id text not null references markets(condition_id) on delete cascade,
  fetched_at timestamptz not null,
  query text not null,
  tweet_count int not null default 0,
  primary key (condition_id, fetched_at)
);

create index if not exists idx_x_market_fetches_condition_fetched
  on x_market_fetches (condition_id, fetched_at desc);

create table if not exists market_semantics (
  condition_id text primary key references markets(condition_id) on delete cascade,

  embedding vector(384),
  keyphrases text[],
  entities text[],
  event_polarity smallint,

  emotions_question jsonb,
  emotions_question_model text,
  emotions_question_updated_at timestamptz,

  emotions_x jsonb,
  emotions_x_model text,
  emotions_x_sample_size int,
  emotions_x_updated_at timestamptz,

  blended_emotions jsonb,
  blended_emotions_alpha numeric,

  mood_question numeric,
  mood_x numeric,
  blended_mood numeric,
  divergence numeric,
  divergence_adj numeric,

  model_version text,
  computed_at timestamptz
);

create table if not exists topic_indices (
  id uuid primary key default gen_random_uuid(),
  name text,
  query text not null,
  params jsonb not null default '{}'::jsonb,
  emotions jsonb,
  mood numeric,
  blended_mood numeric,
  market_count int,
  computed_at timestamptz not null default now()
);

create table if not exists sync_state (
  job_name text primary key,
  cursor jsonb not null default '{}'::jsonb,
  last_started_at timestamptz,
  last_succeeded_at timestamptz,
  last_failed_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);

insert into sync_state (job_name, cursor)
values
  ('gamma_open', jsonb_build_object('offset', 0)),
  ('gamma_closed', jsonb_build_object('offset', 0)),
  ('clob_snapshot', jsonb_build_object('last_ts', null)),
  ('sentiment_refresh', jsonb_build_object('last_run', null)),
  ('bird_trending', '{}'::jsonb),
  ('bird_search', jsonb_build_object('next_index', 0))
on conflict (job_name) do nothing;
