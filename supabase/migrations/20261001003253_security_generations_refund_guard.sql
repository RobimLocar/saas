-- SECURITY-GENERATIONS-REFUND-01 — fecha a criação de créditos via
-- public.generations, a mesma classe de falha que 20260918030000 fechou em
-- profiles/credit_transactions, mas que ficou aberta nesta tabela.
--
-- Root cause: a política `generations_own` (cmd=ALL, sem WITH CHECK) + o grant
-- total de `authenticated` permitem ao usuário, com a chave pública, INSERIR e
-- ATUALIZAR as próprias gerações. A rota GET /api/generate/status estorna
-- gerações `submission_unknown` vencidas chamando refund_generation_credits
-- com p_fallback_amount = generations.credits_used. Sem débito no ledger, o
-- RPC creditava o fallback. Resultado provado em Postgres local montado com
-- todas as migrations: saldo 20 → 1.000.019 com uma linha forjada.
-- Variante: reabrir uma geração já entregue para receber o estorno do débito.
--
-- A política e os grants NÃO são revogados aqui: as rotas image/audio/
-- removebg/upscale/video ainda gravam status/provider_task_id/result_url pelo
-- cliente do usuário (createClient), então revogar UPDATE/INSERT quebraria
-- produção. A correção definitiva (mover essas escritas para a service role e
-- então revogar) fica para um PR de código separado.
--
-- Idempotente.

-- 1) Estorno só devolve o que foi REALMENTE debitado no ledger para aquele
--    usuário e job. Sem débito → NOOP. p_fallback_amount é ignorado de
--    propósito (assinatura mantida para não quebrar chamadores).
create or replace function public.refund_generation_credits(
  p_user_id         uuid,
  p_job_id          uuid,
  p_fallback_amount integer default null
) returns text
language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare
  v_amount integer;
  v_new    integer;
begin
  select abs(amount) into v_amount
  from public.credit_transactions
  where related_job_id = p_job_id
    and reason = 'generation'
    and user_id = p_user_id
  order by created_at asc
  limit 1;

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
revoke execute on function public.refund_generation_credits(uuid, uuid, integer) from public, anon, authenticated;

-- 2) Guarda de transições para escritas com a chave pública (anon /
--    authenticated). Só bloqueia o que nenhum fluxo legítimo faz pelo cliente
--    do usuário (conferido em todas as rotas do main):
--      • reabrir uma geração terminal (completed/failed → outro status);
--      • usar os status internos submitting / submission_unknown, ou inserir
--        já como completed;
--      • apagar/trocar provider_task_id já definido;
--      • trocar dono, custo ou data de criação.
--    Service role e funções SECURITY DEFINER (postgres) não passam pela guarda.
create or replace function public.guard_generation_client_writes()
returns trigger language plpgsql set search_path to 'public', 'pg_temp' as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status in ('submitting', 'submission_unknown', 'completed') then
      raise exception 'generations: status % não permitido pelo cliente', new.status
        using errcode = '42501';
    end if;
    return new;
  end if;

  if old.status in ('completed', 'failed') and new.status is distinct from old.status then
    raise exception 'generations: geração finalizada não pode ser reaberta'
      using errcode = '42501';
  end if;
  if new.status in ('submitting', 'submission_unknown') and new.status is distinct from old.status then
    raise exception 'generations: status % é interno', new.status
      using errcode = '42501';
  end if;
  if old.provider_task_id is not null and new.provider_task_id is distinct from old.provider_task_id then
    raise exception 'generations: provider_task_id é imutável pelo cliente'
      using errcode = '42501';
  end if;
  if new.user_id is distinct from old.user_id
     or new.credits_used is distinct from old.credits_used
     or new.created_at is distinct from old.created_at then
    raise exception 'generations: campo protegido'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_generation_client_writes on public.generations;
create trigger guard_generation_client_writes
  before insert or update on public.generations
  for each row execute function public.guard_generation_client_writes();

-- 3) Função de event trigger criada pela plataforma não deve ser chamável pela
--    API (advisor 0028/0029). Existe em Produção; pode não existir num Preview.
do $$ begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end $$;
