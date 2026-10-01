-- RATE-LIMITS-01 — limite de uso por usuário, compartilhado entre todas as
-- instâncias serverless (memória local não serve na Vercel).
--
-- Janela fixa: cada (chave, início da janela) é uma linha; o incremento é um
-- único INSERT … ON CONFLICT DO UPDATE (atômico sob concorrência).
-- Só o servidor (service_role) usa; RLS ligado e sem políticas.
-- Idempotente.

create table if not exists public.rate_limit_counters (
  key          text        not null,
  window_start timestamptz not null,
  hits         integer     not null default 0,
  primary key (key, window_start)
);

alter table public.rate_limit_counters enable row level security;
revoke all on public.rate_limit_counters from anon, authenticated;

create or replace function public.rate_limit_hit(
  p_key            text,
  p_window_seconds integer,
  p_max            integer
) returns table (allowed boolean, hits integer, retry_after integer)
language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare
  v_start timestamptz;
  v_hits  integer;
begin
  if p_key is null or p_window_seconds is null or p_window_seconds <= 0 or p_max is null or p_max <= 0 then
    return query select true, 0, 0;
    return;
  end if;

  v_start := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  insert into public.rate_limit_counters as c (key, window_start, hits)
  values (p_key, v_start, 1)
  on conflict (key, window_start) do update set hits = c.hits + 1
  returning c.hits into v_hits;

  -- Limpeza oportunista de janelas antigas (~1% das chamadas).
  if random() < 0.01 then
    delete from public.rate_limit_counters where window_start < now() - interval '1 day';
  end if;

  return query select
    v_hits <= p_max,
    v_hits,
    greatest(0, ceil(extract(epoch from (v_start + make_interval(secs => p_window_seconds) - now())))::integer);
end;
$$;

revoke execute on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;
