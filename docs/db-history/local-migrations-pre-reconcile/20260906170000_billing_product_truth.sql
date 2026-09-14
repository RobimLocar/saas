-- P7c — Billing Product Truth + Security Defaults (PREPARE-ONLY).
--
-- 1) WELCOME CREDITS = 0 (GROWTH-02 — Product Owner). Fluxyra NÃO tem free plan
--    recorrente: todo novo usuário entra com credits_balance = 0 e possui apenas
--    1 imagem grátis global por e-mail (entitlement em 20260907120000, NÃO é crédito).
--    NÃO ajusta saldos EXISTENTES — só afeta NOVOS signups.
-- 2) SEM ledger de boas-vindas: nenhum crédito é concedido no signup, portanto
--    nenhuma linha credit_transactions(reason='bonus') é criada. (A reconciliação
--    forward permanece trivialmente verdadeira: saldo inicial 0 == soma vazia.)
-- 3) DEFENSE-IN-DEPTH: endurece o DEFAULT PRIVILEGE de FUNÇÕES no schema public para
--    o papel que roda as migrations — funções FUTURAS deixam de conceder EXECUTE a
--    PUBLIC/anon/authenticated automaticamente (o default atual do projeto concedia).
--    Funções EXISTENTES mantêm seus ACLs explícitos. RPCs futuros intencionalmente
--    públicos precisarão de GRANT explícito (fail-closed por padrão).
--
-- NÃO cria buckets. NÃO expira créditos. NÃO reescreve histórico. NÃO altera preços.
--
-- ⚠ APPLY GATE: chain 110000→120000→130000→140000→150000→160000→(esta 170000)
--    continua NÃO aplicada. APPLY GATE = NOT APPROVED.

-- ── 1) Coluna default de créditos = 0 (GROWTH-02; só afeta inserts futuros) ──
alter table public.profiles alter column credits_balance set default 0;

-- ── 2) handle_new_user: welcome=0, SEM ledger 'bonus' ─────────────────────────
-- SECURITY DEFINER com search_path fixo e relações schema-qualificadas (padrão P7b).
-- Novo usuário nasce com saldo 0 (sem crédito de boas-vindas). O trial de 1 imagem
-- grátis é um entitlement por e-mail (20260907120000), não um crédito.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  insert into public.profiles (id, email, credits_balance, plan, plan_credits_monthly)
  values (new.id, new.email, 0, 'free', 0)
  on conflict (id) do nothing;

  return new;
exception when others then
  -- Nunca bloquear o signup por falha no provisionamento de perfil.
  return new;
end;
$$;

-- handle_new_user é um TRIGGER (SECURITY DEFINER): NÃO precisa de EXECUTE por papéis
-- de browser. Nega explicitamente (determinístico em DB fresco ou existente).
revoke all on function public.handle_new_user() from public;
do $$
begin
  begin execute 'revoke all on function public.handle_new_user() from anon'; exception when undefined_object then null; end;
  begin execute 'revoke all on function public.handle_new_user() from authenticated'; exception when undefined_object then null; end;
end $$;

-- ── 3) DEFENSE-IN-DEPTH: DEFAULT-DENY para funções FUTURAS ─────────────────────
-- CORREÇÃO (P7c-ACL-CLOSE): a conclusão anterior — "default-ACL não protege" — era
-- ampla demais. O que é INEFICAZ é a forma POR-SCHEMA de revogar do PUBLIC
--   (ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ... FROM PUBLIC) → no-op, pois
--   defaults por schema só removem GRANTS por-schema, não o grant GLOBAL embutido.
-- O que FUNCIONA (provado em PG 18.4, local) é a forma GLOBAL por PAPEL CRIADOR:
--   ALTER DEFAULT PRIVILEGES FOR ROLE <criador> REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;  (sem IN SCHEMA)
-- Isso remove o grant GLOBAL embutido de EXECUTE ao PUBLIC para funções FUTURAS
-- criadas por aquele papel. Somado à remoção das deviations por-schema (anon/
-- authenticated/service_role em public, criadas pelo Supabase para o MESMO papel),
-- toda função nova nasce SEM execute para PUBLIC/anon/authenticated/service_role.
--
-- Papel criador = quem roda as migrations (evidência remota: owner de
-- adjust_credits/handle_new_user = postgres; current_user = postgres). Usamos
-- current_user dinamicamente para robustez entre ambientes. NÃO tocamos o papel
-- supabase_admin (internals do Supabase mantêm seus próprios defaults).
--
-- POSTURA: opt-in. Toda RPC callable precisa de GRANT EXPLÍCITO (ex.: as 4 RPCs
-- financeiras de 20260906160000, que já concedem service_role). LAYER 1 = default
-- deny (aqui); LAYER 2 = REVOKE/GRANT por função (160000) — permanece.
--
-- LIMITAÇÃO (documentada): a plataforma Supabase pode recriar/alterar defaults FORA
-- de migrations; o controle DURÁVEL continua sendo o REVOKE/GRANT por função (LAYER 2).
do $$
declare
  v_role text := current_user;
begin
  -- GLOBAL: remove o grant embutido de EXECUTE ao PUBLIC (funções futuras deste papel).
  execute format('alter default privileges for role %I revoke execute on functions from public', v_role);
  -- POR-SCHEMA public: remove as deviations que concediam anon/authenticated/service_role.
  begin execute format('alter default privileges for role %I in schema public revoke execute on functions from anon', v_role); exception when undefined_object then null; end;
  begin execute format('alter default privileges for role %I in schema public revoke execute on functions from authenticated', v_role); exception when undefined_object then null; end;
  begin execute format('alter default privileges for role %I in schema public revoke execute on functions from service_role', v_role); exception when undefined_object then null; end;
end $$;

-- ── ROLLBACK CONCEITUAL (NÃO executar aqui) ──────────────────────────────────
--   alter table public.profiles alter column credits_balance set default 100;
--   (restaurar handle_new_user para a versão anterior — welcome=10, sem ledger)
--   alter default privileges for role <criador> grant execute on functions to public;                       -- global
--   alter default privileges for role <criador> in schema public grant execute on functions to anon, authenticated, service_role;
-- NÃO reverter saldos de usuários; NÃO apagar linhas 'bonus' já criadas.
