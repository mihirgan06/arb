-- Job lease helpers for local worker (no direct Postgres needed).
-- Apply in Supabase SQL editor.

-- We store the lease inside sync_state.cursor under:
-- cursor.lease.owner (text) and cursor.lease.expires_at (timestamptz)

create or replace function public.arb_acquire_job_lease(
  p_job_name text,
  p_owner text,
  p_ttl_seconds int
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_expires timestamptz := v_now + make_interval(secs => p_ttl_seconds);
  v_updated int;
begin
  if p_ttl_seconds is null or p_ttl_seconds <= 0 then
    raise exception 'ttl_seconds must be > 0';
  end if;

  update sync_state
  set
    cursor = jsonb_set(
      coalesce(cursor, '{}'::jsonb),
      '{lease}',
      jsonb_build_object('owner', p_owner, 'expires_at', v_expires),
      true
    ),
    last_started_at = v_now,
    updated_at = v_now
  where job_name = p_job_name
    and (
      (cursor #>> '{lease,expires_at}') is null
      or ((cursor #>> '{lease,expires_at}')::timestamptz < v_now)
      or (cursor #>> '{lease,owner}') = p_owner
    );

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

create or replace function public.arb_finish_job_success(
  p_job_name text,
  p_owner text,
  p_cursor jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update sync_state
  set
    cursor = coalesce(p_cursor, '{}'::jsonb) - 'lease',
    last_succeeded_at = now(),
    last_error = null,
    updated_at = now()
  where job_name = p_job_name
    and (cursor #>> '{lease,owner}') = p_owner;
end;
$$;

create or replace function public.arb_finish_job_failure(
  p_job_name text,
  p_owner text,
  p_error text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update sync_state
  set
    last_failed_at = now(),
    last_error = left(coalesce(p_error, ''), 10000),
    updated_at = now(),
    cursor = (cursor - 'lease')
  where job_name = p_job_name
    and (cursor #>> '{lease,owner}') = p_owner;
end;
$$;

grant execute on function public.arb_acquire_job_lease(text, text, int) to anon, authenticated;
grant execute on function public.arb_finish_job_success(text, text, jsonb) to anon, authenticated;
grant execute on function public.arb_finish_job_failure(text, text, text) to anon, authenticated;

-- Ensure Supabase PostgREST schema cache includes these RPCs immediately.
notify pgrst, 'reload schema';
