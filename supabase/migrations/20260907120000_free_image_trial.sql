-- GROWTH-02 — Global One-Free-Image Trial (PREPARE-ONLY).
--
-- Entitlement persistente e GLOBAL por e-mail (não por user_id): cada e-mail pode
-- gerar exatamente 1 imagem grátis no SaaS inteiro (Studio/Flow/qualquer boundary
-- de imagem standalone). NÃO é crédito. Estados: available → claimed → used.
--
-- SEGURANÇA (padrão Billing P7b/P7c hardened):
--   - RLS ON, SEM policies  → anon/authenticated NÃO leem/mutam (só service_role bypassa RLS);
--   - GRANTs de tabela revogados de public/anon/authenticated;
--   - identidade normalizada NO SERVIDOR (lower(trim(email))) dentro das RPCs;
--   - claim ATÔMICO (INSERT ... ON CONFLICT DO UPDATE ... WHERE) — sem SELECT-then-UPDATE;
--   - RPCs SECURITY DEFINER com search_path fixo + relações schema-qualificadas;
--   - EXECUTE default-deny; concedido EXPLICITAMENTE só a service_role.
--
-- ⚠ APPLY GATE: chain 110000→120000→130000→140000→150000→160000→170000→(esta 120000-07)
--    permanece NÃO aplicada. APPLY GATE = NOT APPROVED. NÃO aplicar.

-- ── Tabela do entitlement ─────────────────────────────────────────────────────
create table if not exists public.free_image_trials (
  normalized_email text primary key,
  user_id          uuid,
  generation_id    uuid,
  status           text not null default 'available'
                     check (status in ('available', 'claimed', 'used')),
  claimed_at       timestamptz,
  used_at          timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- RLS ON sem policies → nega anon/authenticated; service_role (server) bypassa.
alter table public.free_image_trials enable row level security;

-- Defense-in-depth: sem grants de tabela para papéis de browser (nem SELECT).
revoke all on table public.free_image_trials from public;
do $$
begin
  begin execute 'revoke all on table public.free_image_trials from anon'; exception when undefined_object then null; end;
  begin execute 'revoke all on table public.free_image_trials from authenticated'; exception when undefined_object then null; end;
end $$;

-- ── CLAIM atômico ─────────────────────────────────────────────────────────────
-- Retorna 'claimed' se conseguiu reservar (available, inexistente, ou claim velho
-- recuperável), senão 'denied'. Recuperação de claim preso: p_stale_minutes
-- (default 60 > GENERATION_TIMEOUT_MINUTES=30) — um claim mais velho que isso é
-- considerado morto e pode ser re-claimado (crash recovery sem cron).
create or replace function public.claim_free_image_trial(
  p_email          text,
  p_user_id        uuid,
  p_generation_id  uuid,
  p_stale_minutes  int default 60
) returns text
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_email  text := lower(trim(coalesce(p_email, '')));
  v_status text;
begin
  if v_email = '' then
    return 'denied';
  end if;

  insert into public.free_image_trials as t
    (normalized_email, user_id, generation_id, status, claimed_at, updated_at)
  values (v_email, p_user_id, p_generation_id, 'claimed', now(), now())
  on conflict (normalized_email) do update
    set status        = 'claimed',
        user_id       = p_user_id,
        generation_id = p_generation_id,
        claimed_at    = now(),
        updated_at    = now()
    where t.status = 'available'
       or (t.status = 'claimed'
           and t.claimed_at is not null
           and t.claimed_at < now() - make_interval(mins => greatest(p_stale_minutes, 1)))
  returning status into v_status;

  if v_status is null then
    return 'denied';          -- já 'used', ou 'claimed' recente (em voo)
  end if;
  return 'claimed';
end;
$$;

-- ── RELEASE (falha/timeout) — só volta a 'available' se ainda 'claimed' p/ esta geração ──
create or replace function public.release_free_image_trial(p_generation_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  update public.free_image_trials
    set status = 'available', generation_id = null, claimed_at = null, updated_at = now()
    where generation_id = p_generation_id and status = 'claimed';
end;
$$;

-- ── MARK USED (sucesso durável) — permanente; só de 'claimed' p/ esta geração ──
create or replace function public.mark_free_image_trial_used(p_generation_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  update public.free_image_trials
    set status = 'used', used_at = now(), updated_at = now()
    where generation_id = p_generation_id and status = 'claimed';
end;
$$;

-- ── ACL das RPCs: default-deny + EXECUTE explícito só p/ service_role ──────────
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.claim_free_image_trial(text,uuid,uuid,int)',
    'public.release_free_image_trial(uuid)',
    'public.mark_free_image_trial_used(uuid)'
  ] loop
    execute format('revoke all on function %s from public', fn);
    begin execute format('revoke all on function %s from anon', fn); exception when undefined_object then null; end;
    begin execute format('revoke all on function %s from authenticated', fn); exception when undefined_object then null; end;
    begin execute format('grant execute on function %s to service_role', fn); exception when undefined_object then null; end;
  end loop;
end $$;

-- ── ROLLBACK CONCEITUAL (NÃO executar aqui) ──────────────────────────────────
--   drop function if exists public.claim_free_image_trial(text,uuid,uuid,int);
--   drop function if exists public.release_free_image_trial(uuid);
--   drop function if exists public.mark_free_image_trial_used(uuid);
--   drop table if exists public.free_image_trials;
