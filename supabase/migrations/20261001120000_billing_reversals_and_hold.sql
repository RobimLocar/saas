-- BILLING-REVERSALS-01 — créditos comprados voltam quando o dinheiro volta.
--
-- Problema: reembolso, contestação (chargeback) e alerta de fraude do Radar
-- não tiravam os créditos concedidos. Um cartão clonado (ou um cliente que
-- pede reembolso depois de usar) ficava com os créditos e o dinheiro saía.
-- O Radar da conta é o padrão (sem regras próprias), então a defesa precisa
-- estar no app.
--
-- Modelo:
--  • Cada compra tem UMA linha de grant no extrato, identificada por
--    external_id: 'stripe:checkout:<session>' (top-up) ou
--    'stripe:invoice:<invoice>' (assinatura).
--  • Estornos e reinstalações ficam no extrato com reason 'reversal' e
--    external_id 'reversal:<grant>:<chave>' — a chave (id do evento de
--    origem) garante idempotência; o prefixo permite somar o que já foi
--    estornado daquela compra.
--  • reverse_purchase_credits leva o estorno acumulado da compra até
--    ceil(créditos × fração). Reembolso parcial usa a fração reembolsada;
--    contestação e alerta de fraude usam 1 (tudo). O saldo PODE ficar
--    negativo: quem já gastou fica devendo e não gera mais até pagar.
--  • profiles.billing_hold bloqueia novas gerações (debit_credits → BLOCKED)
--    enquanto houver contestação/alerta aberto.
--
-- Idempotente.

-- 1) Novo motivo no extrato.
alter table public.credit_transactions
  drop constraint if exists credit_transactions_reason_check,
  add constraint credit_transactions_reason_check
  check (reason in ('purchase','generation','refund','bonus','topup','subscription','reversal'));

-- 2) Bloqueio de cobrança no perfil.
alter table public.profiles
  add column if not exists billing_hold boolean not null default false,
  add column if not exists billing_hold_reason text,
  add column if not exists billing_hold_at timestamptz;

-- 3) Estorno de créditos de uma compra.
create or replace function public.reverse_purchase_credits(
  p_grant_external_id text,
  p_key               text,
  p_fraction          numeric,
  p_hold              boolean default false,
  p_hold_reason       text default null
) returns text
language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare
  v_user     uuid;
  v_granted  integer;
  v_reversed integer;
  v_target   integer;
  v_delta    integer;
  v_new      integer;
  v_key      text := 'reversal:' || p_grant_external_id || ':' || p_key;
begin
  if p_grant_external_id is null or p_key is null then
    return 'NOOP';
  end if;

  -- Trava a linha da compra: estornos concorrentes da mesma compra serializam.
  select user_id, amount into v_user, v_granted
  from public.credit_transactions
  where external_id = p_grant_external_id and reason in ('topup', 'subscription')
  for update;

  if v_user is null then
    return 'GRANT_NOT_FOUND';
  end if;

  if exists (select 1 from public.credit_transactions where external_id = v_key) then
    return 'ALREADY_APPLIED';
  end if;

  select coalesce(-sum(amount), 0)::integer into v_reversed
  from public.credit_transactions
  where reason = 'reversal' and external_id like 'reversal:' || p_grant_external_id || ':%';

  v_target := least(v_granted, ceil(v_granted * greatest(least(coalesce(p_fraction, 1), 1), 0))::integer);
  v_delta  := greatest(v_target - v_reversed, 0);

  -- Registra a chave mesmo com delta 0 (idempotência do evento).
  insert into public.credit_transactions (user_id, amount, reason, external_id)
  values (v_user, -v_delta, 'reversal', v_key);

  update public.profiles
     set credits_balance     = credits_balance - v_delta,
         billing_hold        = billing_hold or coalesce(p_hold, false),
         billing_hold_reason = case when coalesce(p_hold, false) then p_hold_reason else billing_hold_reason end,
         billing_hold_at     = case when coalesce(p_hold, false) then now() else billing_hold_at end
   where id = v_user
  returning credits_balance into v_new;

  return 'APPLIED:' || v_delta || ':' || v_new;
end;
$$;

-- 4) Contestação ganha: devolve os créditos estornados por ela e libera a conta.
create or replace function public.reinstate_dispute_credits(
  p_grant_external_id text,
  p_dispute_key       text,
  p_key               text
) returns text
language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare
  v_user    uuid;
  v_amount  integer;
  v_new     integer;
  v_key     text := 'reversal:' || p_grant_external_id || ':' || p_key;
begin
  select user_id, -amount into v_user, v_amount
  from public.credit_transactions
  where external_id = 'reversal:' || p_grant_external_id || ':' || p_dispute_key
  for update;

  if v_user is null then
    return 'DISPUTE_REVERSAL_NOT_FOUND';
  end if;

  if exists (select 1 from public.credit_transactions where external_id = v_key) then
    return 'ALREADY_APPLIED';
  end if;

  insert into public.credit_transactions (user_id, amount, reason, external_id)
  values (v_user, v_amount, 'reversal', v_key);

  update public.profiles
     set credits_balance     = credits_balance + v_amount,
         billing_hold        = false,
         billing_hold_reason = null,
         billing_hold_at     = null
   where id = v_user
  returning credits_balance into v_new;

  return 'APPLIED:' || v_amount || ':' || v_new;
end;
$$;

-- 5) Conta bloqueada não debita (não gera). Mesmo corpo de 20260906160000 +
--    a checagem de billing_hold.
create or replace function public.debit_credits(
  p_user_id uuid,
  p_amount  integer,
  p_job_id  uuid
) returns text
language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare
  v_new integer;
begin
  if p_amount is null or p_amount <= 0 then
    return 'NOOP';
  end if;

  if exists (select 1 from public.profiles where id = p_user_id and billing_hold) then
    return 'BLOCKED';
  end if;

  update public.profiles
     set credits_balance = credits_balance - p_amount
   where id = p_user_id and credits_balance >= p_amount and not billing_hold
  returning credits_balance into v_new;

  if v_new is null then
    if not exists (select 1 from public.profiles where id = p_user_id) then
      raise exception 'profile % not found', p_user_id;
    end if;
    if exists (select 1 from public.profiles where id = p_user_id and billing_hold) then
      return 'BLOCKED';
    end if;
    return 'INSUFFICIENT';
  end if;

  insert into public.credit_transactions (user_id, amount, reason, related_job_id)
  values (p_user_id, -p_amount, 'generation', p_job_id);

  return 'APPLIED:' || v_new;
end;
$$;

revoke execute on function public.reverse_purchase_credits(text, text, numeric, boolean, text) from public, anon, authenticated;
revoke execute on function public.reinstate_dispute_credits(text, text, text) from public, anon, authenticated;
revoke execute on function public.debit_credits(uuid, integer, uuid) from public, anon, authenticated;
