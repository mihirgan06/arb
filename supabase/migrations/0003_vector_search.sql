-- RPC helper for pgvector similarity search (topic builder + trend map).
-- Apply in Supabase SQL editor.

create or replace function public.arb_match_markets(
  p_query_embedding vector(384),
  p_match_count int default 50,
  p_max_distance float8 default 0.65,
  p_include_sports boolean default false
)
returns table (
  condition_id text,
  question text,
  slug text,
  volume_num numeric,
  liquidity_num numeric,
  distance float8
)
language sql
stable
security definer
set search_path = public
as $$
  select
    m.condition_id,
    m.question,
    m.slug,
    m.volume_num,
    m.liquidity_num,
    (ms.embedding <=> p_query_embedding) as distance
  from market_semantics ms
  join markets m on m.condition_id = ms.condition_id
  where ms.embedding is not null
    and m.archived is distinct from true
    and m.closed is distinct from true
    and (p_include_sports or m.is_sports = false)
    and (ms.embedding <=> p_query_embedding) <= p_max_distance
  order by ms.embedding <=> p_query_embedding asc
  limit greatest(1, least(coalesce(p_match_count, 50), 200));
$$;

grant execute on function public.arb_match_markets(vector(384), int, float8, boolean) to anon, authenticated;

-- Ensure Supabase PostgREST schema cache includes this RPC immediately.
notify pgrst, 'reload schema';
