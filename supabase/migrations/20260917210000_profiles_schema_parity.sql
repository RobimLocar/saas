-- PROFILES-SCHEMA-PARITY-01 — add the two profiles columns Production already has
-- but that no migration in this history ever creates.
--
-- Root cause (proven live against both projects + exhaustive migration grep):
-- 20260906170000_billing_product_truth.sql redefines handle_new_user() to insert
-- into profiles(id, email, credits_balance, plan, plan_credits_monthly), and
-- 20260906160000_billing_atomicity.sql's credit-grant RPC updates
-- profiles.plan / profiles.plan_credits_monthly — but neither that migration nor
-- any other in this history ever runs `alter table profiles add column plan` or
-- `add column plan_credits_monthly`. Production has these columns (confirmed via
-- read-only information_schema query: plan text not null default 'free',
-- plan_credits_monthly integer not null default 0) because they were added
-- outside this migration history at some point. A fresh branch built purely from
-- these migrations does not have them. handle_new_user()'s own
-- `exception when others then return new;` swallows the resulting
-- undefined_column error, so signup silently "succeeds" while creating NO
-- profiles row at all — the actual cause of the "Erro ao registrar geração" 500
-- on a subsequent generate call (generations.user_id -> profiles(id) has no row
-- to reference, a foreign-key violation surfaced by PostgREST as 409 and
-- collapsed into a generic 500 by the route).
--
-- Scope: only adds the two missing columns (idempotent, Production-proven types/
-- defaults), backfills profiles for any existing auth.users without one, and
-- redefines handle_new_user() with an added (non-blocking) diagnostic warning.
-- Does NOT touch RLS, policies, provider RPC grants, billing RPC grants, trial
-- uniqueness, webhook reliability, the historical bridge, or the
-- data_api_grants_parity migration.

alter table public.profiles
  add column if not exists plan text not null default 'free';

alter table public.profiles
  add column if not exists plan_credits_monthly integer not null default 0;

-- Backfill: only auth.users rows with no matching profiles row yet. Idempotent
-- (on conflict do nothing; safe to re-run), touches zero existing profiles rows,
-- uses the exact same values a fresh signup gets today (credits_balance=0,
-- plan='free', plan_credits_monthly=0). Safe no-op on Production, where
-- handle_new_user already succeeds today because the columns already exist
-- there; fixes orphaned users on fresh Preview branches created before this fix
-- (e.g. auth.users d3d92fc9-00f3-458f-a7af-81cdb99ec32e on this Preview).
insert into public.profiles (id, email, credits_balance, plan, plan_credits_monthly)
select u.id, u.email, 0, 'free', 0
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
on conflict (id) do nothing;

-- handle_new_user: identical business logic to the version already defined in
-- 20260906170000_billing_product_truth.sql (welcome credits = 0, plan = 'free',
-- plan_credits_monthly = 0, never blocks signup on any internal failure) — the
-- only change is a RAISE WARNING inside the exception handler, so a future
-- schema/permission bug surfaces in Postgres logs instead of failing perfectly
-- silently the way this one did. Does not change the fail-open contract: signup
-- still always succeeds regardless of profile-provisioning outcome. CREATE OR
-- REPLACE preserves the function's existing owner/ACL (already hardened by
-- 20260722023930_0002_harden_function_security.sql and
-- 20260906170000_billing_product_truth.sql) — no grants are reissued here.
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
  -- Nunca bloquear o signup por falha no provisionamento de perfil — mas agora
  -- deixa rastro no log do Postgres em vez de falhar em silêncio total.
  raise warning 'handle_new_user failed for user %: %', new.id, sqlerrm;
  return new;
end;
$$;
