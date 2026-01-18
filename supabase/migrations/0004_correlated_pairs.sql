-- Migration: Add correlated_pairs table for arbitrage opportunity caching
-- This table stores pairs of markets that are correlated and can be arbitraged

create table if not exists correlated_pairs (
  id uuid primary key default gen_random_uuid(),
  market1_id text not null,
  market1_question text not null,
  market1_token_yes text not null,
  market1_yes_price numeric not null,
  market1_no_price numeric not null,
  market2_id text not null,
  market2_question text not null,
  market2_token_yes text not null,
  market2_yes_price numeric not null,
  market2_no_price numeric not null,
  correlation_type text not null check (correlation_type in ('SAME', 'OPPOSITE', 'NONE')),
  reasoning text not null,
  has_liquidity boolean not null default false,
  profit_at_100_shares numeric,
  last_checked timestamptz not null default now(),
  created_at timestamptz not null default now(),
  
  unique (market1_id, market2_id)
);

-- Index for quick lookups of profitable opportunities
create index if not exists idx_correlated_pairs_profit 
  on correlated_pairs (has_liquidity, profit_at_100_shares desc)
  where has_liquidity = true and correlation_type != 'NONE';

-- Index for market lookups
create index if not exists idx_correlated_pairs_market1 on correlated_pairs (market1_id);
create index if not exists idx_correlated_pairs_market2 on correlated_pairs (market2_id);
