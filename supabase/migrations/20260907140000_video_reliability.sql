-- VIDEO-RELIABILITY-IMPLEMENT-01 — Reliability spine (PREPARE-ONLY).
--
-- 1) Idempotency de intenção: generations.generation_intent_id + fingerprint;
-- 2) Correlação de webhook: generations.callback_token (server-side, unguessable);
-- 3) Throttle de poll: generations.next_provider_poll_at;
-- 4) Inbox durável de eventos de webhook + claim/lease ATÔMICO (2 drainers → 1 claim);
-- 5) ACL hardened (service_role only), padrão P7b/P7c.
--
-- Colunas nullable (linhas históricas intactas). Sem DELETE. Sem apply.
-- ⚠ APPLY GATE: chain NÃO aplicada. NÃO aplicar.

-- ── 1) Colunas de reliability em generations ─────────────────────────────────
alter table public.generations add column if not exists generation_intent_id uuid;
alter table public.generations add column if not exists request_fingerprint text;
alter table public.generations add column if not exists callback_token text;
alter table public.generations add column if not exists next_provider_poll_at timestamptz;

-- Idempotency: 1 intenção por usuário. Reuso da MESMA intenção → mesma generation.
create unique index if not exists ux_generations_user_intent
  on public.generations (user_id, generation_intent_id)
  where generation_intent_id is not null;

-- Correlação de webhook: token único e opaco.
create unique index if not exists ux_generations_callback_token
  on public.generations (callback_token)
  where callback_token is not null;

-- Sweep barato: só jobs não-terminais vencidos.
create index if not exists ix_generations_next_poll
  on public.generations (next_provider_poll_at)
  where status in ('pending','submitting','submission_unknown','processing');

-- ── 2) Inbox durável de eventos de webhook ───────────────────────────────────
create table if not exists public.provider_webhook_events (
  id                   uuid primary key default gen_random_uuid(),
  provider             text not null,                 -- 'piapi' | 'atlas'
  provider_event_key   text not null,                 -- atlas: session_id ; piapi: task_id:status
  generation_id        uuid,
  provider_task_id     text,
  terminal_status      text,                          -- 'completed' | 'failed'
  outputs              jsonb,
  error                text,
  claim_state          text not null default 'pending' check (claim_state in ('pending','processing','processed')),
  attempts             int not null default 0,
  received_at          timestamptz not null default now(),
  lease_until          timestamptz,
  processing_started_at timestamptz,
  processed_at         timestamptz,
  next_attempt_at      timestamptz not null default now(),
  last_error           text
);
-- Dedupe de entrega: 1 evento terminal por (provider, event_key).
create unique index if not exists ux_webhook_events_key
  on public.provider_webhook_events (provider, provider_event_key);

alter table public.provider_webhook_events enable row level security; -- sem policies → nega browser
revoke all on table public.provider_webhook_events from public;
do $$
begin
  begin execute 'revoke all on table public.provider_webhook_events from anon'; exception when undefined_object then null; end;
  begin execute 'revoke all on table public.provider_webhook_events from authenticated'; exception when undefined_object then null; end;
end $$;

-- ── 3) CLAIM/LEASE atômico do processor (2 drainers → só 1 pega cada evento) ──
-- Usa FOR UPDATE SKIP LOCKED (sem duas leituras do mesmo row). Retorna os claimados.
create or replace function public.claim_webhook_events(p_limit int default 10, p_lease_seconds int default 120)
returns setof public.provider_webhook_events
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  return query
  update public.provider_webhook_events e
     set claim_state = 'processing',
         attempts = e.attempts + 1,
         processing_started_at = now(),
         lease_until = now() + make_interval(secs => greatest(p_lease_seconds, 5))
   where e.id in (
     select id from public.provider_webhook_events
      where next_attempt_at <= now()
        and (claim_state = 'pending'
             or (claim_state = 'processing' and lease_until is not null and lease_until < now())) -- lease expirado
      order by received_at
      for update skip locked
      limit greatest(p_limit, 1)
   )
   returning e.*;
end;
$$;

create or replace function public.mark_webhook_event_processed(p_id uuid)
returns void language plpgsql security definer set search_path to 'public','pg_temp' as $$
begin
  update public.provider_webhook_events
     set claim_state = 'processed', processed_at = now(), lease_until = null
   where id = p_id;
end; $$;

create or replace function public.reschedule_webhook_event(p_id uuid, p_backoff_seconds int, p_error text)
returns void language plpgsql security definer set search_path to 'public','pg_temp' as $$
begin
  update public.provider_webhook_events
     set claim_state = 'pending', lease_until = null,
         next_attempt_at = now() + make_interval(secs => greatest(p_backoff_seconds, 5)),
         last_error = p_error
   where id = p_id;
end; $$;

-- ── 4) CLAIM ATÔMICO DE INTENÇÃO (idempotency de submit / anti double-submit) ──
-- FLUXYRA-PRODUCTION-CLOSE-01 §1/§21 — pertence à reliability; migration unapplied.
-- Uma intenção (p_user_id, p_intent_id) cria NO MÁXIMO uma generation. Concorrência
-- resolvida pelo unique index ux_generations_user_intent via ON CONFLICT DO NOTHING
-- (o 2º writer bloqueia até o commit do 1º, então vê o conflito e devolve a linha
-- existente). O app decide: is_new=false + mesmo fingerprint → resume (sem novo
-- débito/submit); fingerprint diferente → 409. Server é a autoridade do fingerprint.
create or replace function public.claim_generation_intent(
  p_user_id uuid,
  p_intent_id uuid,
  p_fingerprint text,
  p_model_id uuid,
  p_type text,
  p_prompt text,
  p_negative_prompt text,
  p_params jsonb,
  p_credits int,
  p_callback_token text
)
returns table(generation_id uuid, is_new boolean, existing_fingerprint text, existing_status text)
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_id uuid;
begin
  insert into public.generations(
    user_id, model_id, type, prompt, negative_prompt, params, status,
    credits_used, generation_intent_id, request_fingerprint, callback_token
  )
  values(
    p_user_id, p_model_id, p_type, p_prompt, p_negative_prompt, p_params, 'pending',
    p_credits, p_intent_id, p_fingerprint, p_callback_token
  )
  -- Índice único PARCIAL (WHERE generation_intent_id is not null): o ON CONFLICT
  -- precisa repetir o predicado para inferir o arbiter index. p_intent_id é sempre
  -- não-nulo (normalizeIntentId garante UUID), então o predicado sempre vale.
  on conflict (user_id, generation_intent_id) where generation_intent_id is not null do nothing
  returning id into v_id;

  if v_id is not null then
    generation_id := v_id;
    is_new := true;
    existing_fingerprint := p_fingerprint;
    existing_status := 'pending';
    return next;
    return;
  end if;

  -- Conflito: a intenção já existe → devolve a generation existente (o app
  -- classifica resume vs 409 comparando fingerprints).
  select g.id, g.request_fingerprint, g.status
    into generation_id, existing_fingerprint, existing_status
    from public.generations g
   where g.user_id = p_user_id
     and g.generation_intent_id = p_intent_id;
  is_new := false;
  return next;
end;
$$;

-- ── ACL: default-deny + EXECUTE explícito só p/ service_role ──────────────────
do $$
declare fn text;
begin
  foreach fn in array array[
    'public.claim_webhook_events(int,int)',
    'public.mark_webhook_event_processed(uuid)',
    'public.reschedule_webhook_event(uuid,int,text)',
    'public.claim_generation_intent(uuid,uuid,text,uuid,text,text,text,jsonb,int,text)'
  ] loop
    execute format('revoke all on function %s from public', fn);
    begin execute format('revoke all on function %s from anon', fn); exception when undefined_object then null; end;
    begin execute format('revoke all on function %s from authenticated', fn); exception when undefined_object then null; end;
    begin execute format('grant execute on function %s to service_role', fn); exception when undefined_object then null; end;
  end loop;
end $$;

-- ── ROLLBACK CONCEITUAL (NÃO executar) ───────────────────────────────────────
--   drop function if exists public.claim_webhook_events(int,int);
--   drop function if exists public.mark_webhook_event_processed(uuid);
--   drop function if exists public.reschedule_webhook_event(uuid,int,text);
--   drop table if exists public.provider_webhook_events;
--   alter table public.generations drop column if exists generation_intent_id, ... ;
