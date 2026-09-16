-- P7b — Billing Atomicity + Logical Idempotency (PREPARE-ONLY).
--
-- Torna cada operação financeira ALL-OR-NOTHING e IDEMPOTENTE POR OBJETO DE
-- NEGÓCIO, via RPCs Postgres (uma função = uma transação). NÃO altera preços,
-- multiplicadores, política de rollover, buckets, nem histórico financeiro.
--
-- O QUE FAZ:
--   1. credit_transactions.external_id (text, nullable) — id LÓGICO namespacado do
--      objeto Stripe: 'stripe:invoice:<id>' · 'stripe:checkout:<id>'.
--   2. UNIQUE parcial em external_id (WHERE not null) → 1 grant lógico por fatura/
--      sessão (nulls NUNCA colidem → gerações/refunds antigos não são afetados).
--   3. UNIQUE parcial em related_job_id WHERE reason='refund' → 1 refund por geração.
--   4. RPCs atômicos: debit_credits, refund_generation_credits,
--      grant_subscription_credits, grant_topup_credits. Cada um faz balance+ledger
--      (+purchase) numa ÚNICA transação; duplicata lógica → sem mutação de saldo.
--
-- ⚠ DEPLOYMENT COUPLING = REQUERIDO: o código do app passa a chamar estas RPCs
--   (sem fallback para a lógica legada). Portanto CÓDIGO + ESTA MIGRATION devem ser
--   implantados/aplicados JUNTOS. Sem a migration aplicada, débito/refund/grants
--   FALHAM (fail-closed) — nunca caem numa via não-atômica.
--
-- ⚠ APPLY GATE (NÃO aplicar em isolamento): as migrations 20260903110000,
--   20260903120000, 20260906130000, 20260906140000 (Audio) e 20260906150000
--   (Video catalog) continuam NÃO aplicadas. O migrador aplica toda a cadeia
--   pendente em ordem de timestamp. APPLY GATE = NOT APPROVED.
--
-- INVARIANTES: NÃO DELETE histórico; NÃO ajusta saldos; NÃO altera as 5 migrations
--   preparadas; idempotente (reexecução não duplica); fail-loud em pré-condições.

-- ── Pré-condições FAIL-LOUD (nunca mutar histórico p/ forçar a migration) ──────
do $$
declare
  v_dup_refunds int;
begin
  select count(*) into v_dup_refunds from (
    select related_job_id from public.credit_transactions
    where reason = 'refund' and related_job_id is not null
    group by related_job_id having count(*) > 1
  ) d;
  if v_dup_refunds > 0 then
    raise exception 'P7b PRECONDITION FAIL: % gerações com refund DUPLICADO — resolver o histórico ANTES de criar o índice único (não deduplicar automaticamente)', v_dup_refunds;
  end if;
end $$;

-- ── 1) external_id (id lógico do objeto Stripe) ───────────────────────────────
alter table public.credit_transactions
  add column if not exists external_id text;

-- ── 2/3) UNIQUE parciais (idempotência lógica DB-enforced) ────────────────────
create unique index if not exists credit_transactions_external_id_uidx
  on public.credit_transactions (external_id)
  where external_id is not null;

create unique index if not exists credit_transactions_refund_job_uidx
  on public.credit_transactions (related_job_id)
  where reason = 'refund' and related_job_id is not null;

-- ── 4a) DÉBITO atômico (decremento condicional + ledger numa transação) ───────
create or replace function public.debit_credits(
  p_user_id uuid,
  p_amount  integer,
  p_job_id  uuid
) returns text
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_new integer;
begin
  if p_amount is null or p_amount <= 0 then
    return 'NOOP';
  end if;
  -- Decremento SÓ se houver saldo suficiente (trava atômica na própria row).
  update public.profiles
     set credits_balance = credits_balance - p_amount
   where id = p_user_id and credits_balance >= p_amount
  returning credits_balance into v_new;

  if v_new is null then
    -- ou perfil inexistente, ou saldo insuficiente.
    if not exists (select 1 from public.profiles where id = p_user_id) then
      raise exception 'profile % not found', p_user_id;
    end if;
    return 'INSUFFICIENT';
  end if;

  insert into public.credit_transactions (user_id, amount, reason, related_job_id)
  values (p_user_id, -p_amount, 'generation', p_job_id);

  return 'APPLIED:' || v_new;
end;
$$;

-- ── 4b) REFUND atômico + idempotente por geração ──────────────────────────────
-- Valor = do débito ORIGINAL no ledger (autoritativo); fallback só se não achar.
create or replace function public.refund_generation_credits(
  p_user_id         uuid,
  p_job_id          uuid,
  p_fallback_amount integer default null
) returns text
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_amount integer;
  v_new    integer;
begin
  select abs(amount) into v_amount
  from public.credit_transactions
  where related_job_id = p_job_id and reason = 'generation'
  order by created_at asc
  limit 1;

  if v_amount is null then
    v_amount := p_fallback_amount;
  end if;
  if v_amount is null or v_amount <= 0 then
    return 'NOOP';
  end if;

  -- Claim do refund (UNIQUE parcial). Duplicata → ALREADY_APPLIED, sem mutação.
  begin
    insert into public.credit_transactions (user_id, amount, reason, related_job_id)
    values (p_user_id, v_amount, 'refund', p_job_id);
  exception when unique_violation then
    return 'ALREADY_APPLIED';
  end;

  -- Incremento ATÔMICO (nunca lê-e-escreve absoluto → sem lost update).
  update public.profiles
     set credits_balance = credits_balance + v_amount
   where id = p_user_id
  returning credits_balance into v_new;

  if v_new is null then
    raise exception 'profile % not found', p_user_id;
  end if;

  return 'APPLIED:' || v_new;
end;
$$;

-- ── 4c) GRANT de subscription atômico + idempotente por fatura ────────────────
create or replace function public.grant_subscription_credits(
  p_user_id     uuid,
  p_credits     integer,
  p_plan        text,
  p_external_id text
) returns text
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_new integer;
begin
  if p_credits is null or p_credits <= 0 or p_external_id is null then
    return 'NOOP';
  end if;

  -- Claim lógico da fatura (UNIQUE parcial em external_id). Duplicata → no-op.
  begin
    insert into public.credit_transactions (user_id, amount, reason, external_id)
    values (p_user_id, p_credits, 'subscription', p_external_id);
  exception when unique_violation then
    return 'ALREADY_APPLIED';
  end;

  update public.profiles
     set credits_balance     = credits_balance + p_credits,
         plan                = coalesce(p_plan, plan),
         plan_credits_monthly = p_credits
   where id = p_user_id
  returning credits_balance into v_new;

  if v_new is null then
    raise exception 'profile % not found', p_user_id;
  end if;

  return 'APPLIED:' || v_new;
end;
$$;

-- ── 4d) GRANT de top-up atômico + idempotente por sessão ──────────────────────
create or replace function public.grant_topup_credits(
  p_user_id      uuid,
  p_credits      integer,
  p_amount_cents integer,
  p_session_id   text
) returns text
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_new integer;
begin
  if p_credits is null or p_credits <= 0 or p_session_id is null then
    return 'NOOP';
  end if;

  -- Claim da sessão (credit_purchases.stripe_session_id UNIQUE). Duplicata → no-op.
  begin
    insert into public.credit_purchases (user_id, stripe_session_id, credits, amount_cents, status)
    values (p_user_id, p_session_id, p_credits, coalesce(p_amount_cents, 0), 'completed');
  exception when unique_violation then
    return 'ALREADY_APPLIED';
  end;

  insert into public.credit_transactions (user_id, amount, reason, external_id)
  values (p_user_id, p_credits, 'topup', 'stripe:checkout:' || p_session_id);

  update public.profiles
     set credits_balance = credits_balance + p_credits
   where id = p_user_id
  returning credits_balance into v_new;

  if v_new is null then
    raise exception 'profile % not found', p_user_id;
  end if;

  return 'APPLIED:' || v_new;
end;
$$;

-- ── PRIVILÉGIOS (P7b-SECURITY) — HARDENING OBRIGATÓRIO ────────────────────────
-- ⚠ Sem isto, as 4 funções financeiras herdariam o DEFAULT ACL do schema public
-- deste projeto, que concede EXECUTE a anon E authenticated (confirmado via
-- pg_default_acl). Como são SECURITY DEFINER (rodam como owner, IGNORANDO RLS),
-- um usuário logado poderia chamá-las pela Data API (PostgREST) e inflar o próprio
-- saldo (grant_topup/grant_subscription/refund) → P0. Portanto REVOGAMOS de
-- PUBLIC/anon/authenticated e concedemos SOMENTE a service_role (o papel usado por
-- createServiceClient() / o webhook via SUPABASE_SERVICE_ROLE_KEY). Espelha o ACL
-- já aplicado ao adjust_credits ({postgres, service_role}).
do $$
declare
  v_sig text;
  v_sigs text[] := array[
    'public.debit_credits(uuid, integer, uuid)',
    'public.refund_generation_credits(uuid, uuid, integer)',
    'public.grant_subscription_credits(uuid, integer, text, text)',
    'public.grant_topup_credits(uuid, integer, integer, text)'
  ];
begin
  foreach v_sig in array v_sigs loop
    execute format('revoke all on function %s from public', v_sig);
    -- anon/authenticated podem não existir fora do Supabase (ex.: teste local);
    -- ignora silenciosamente nesse caso (o essencial é o revoke de public + grant).
    begin execute format('revoke all on function %s from anon', v_sig); exception when undefined_object then null; end;
    begin execute format('revoke all on function %s from authenticated', v_sig); exception when undefined_object then null; end;
    begin execute format('grant execute on function %s to service_role', v_sig); exception when undefined_object then null; end;
  end loop;
end $$;

-- ── ROLLBACK CONCEITUAL (NÃO executar aqui) ──────────────────────────────────
--   drop function if exists public.grant_topup_credits(uuid,integer,integer,text);
--   drop function if exists public.grant_subscription_credits(uuid,integer,text,text);
--   drop function if exists public.refund_generation_credits(uuid,uuid,integer);
--   drop function if exists public.debit_credits(uuid,integer,uuid);
--   drop index if exists public.credit_transactions_refund_job_uidx;
--   drop index if exists public.credit_transactions_external_id_uidx;
--   alter table public.credit_transactions drop column if exists external_id;
-- (Reverter o CÓDIGO junto — ele exige estas RPCs; sem elas, fail-closed.)
