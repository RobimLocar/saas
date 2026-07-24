-- ============================================================
-- Fluxyra — Schema inicial (v2.0)
-- 10 tabelas: profiles, ai_models, generations, assets, seeds,
-- saved_prompts, flows, credit_transactions, subscription_plans, referrals
-- RLS em todas as tabelas privadas · trigger de cadastro com créditos de boas-vindas
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- ENUMS ----------
do $$ begin
  create type modality as enum ('image', 'video', 'audio');
exception when duplicate_object then null; end $$;

do $$ begin
  create type generation_status as enum ('pending', 'processing', 'completed', 'failed', 'refunded');
exception when duplicate_object then null; end $$;

do $$ begin
  create type plan_code as enum ('free', 'starter', 'pro', 'agency');
exception when duplicate_object then null; end $$;

do $$ begin
  create type credit_txn_type as enum ('welcome', 'subscription', 'topup', 'generation', 'refund', 'referral', 'adjustment');
exception when duplicate_object then null; end $$;

-- ============================================================
-- 1. subscription_plans  (catálogo de planos — leitura pública)
-- ============================================================
create table if not exists public.subscription_plans (
  id             uuid primary key default gen_random_uuid(),
  code           plan_code unique not null,
  name           text not null,
  price_brl      numeric(10,2) not null default 0,        -- v2: preço em BRL
  monthly_credits integer not null default 0,
  daily_limit    integer not null default 0,              -- limite de gerações/dia
  parallel_generations integer not null default 1,        -- 2/4/6 simultâneas
  rollover_cap   integer not null default 0,              -- teto de acúmulo mensal
  pix_enabled    boolean not null default false,          -- v2: pagável via Pix
  nfe_required   boolean not null default true,           -- v2: emite NF-e
  stripe_price_id_monthly text,
  stripe_price_id_annual  text,
  features       jsonb not null default '[]'::jsonb,
  is_active      boolean not null default true,
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now()
);

-- ============================================================
-- 2. ai_models  (catálogo de modelos — leitura pública)
-- ============================================================
create table if not exists public.ai_models (
  id             uuid primary key default gen_random_uuid(),
  slug           text unique not null,
  name           text not null,
  modality       modality not null,
  provider       text not null default 'piapi',           -- roteável por modelo (§3.3)
  provider_fallback text,                                  -- v2: provedor de redundância (fal.ai)
  provider_model_id text,                                  -- id do modelo no provider
  credits        integer not null,                        -- créditos cobrados por geração
  measured_api_cost_usd numeric(10,4),                    -- v2: custo real medido
  cost_last_verified_at timestamptz,                      -- v2: última verificação de custo
  description    text,
  thumbnail_url  text,
  is_premium     boolean not null default false,          -- ultra-premium (pass-through)
  is_active      boolean not null default true,
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now()
);

-- ============================================================
-- 3. profiles  (1:1 com auth.users)
-- ============================================================
create table if not exists public.profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  email          text,
  full_name      text,
  avatar_url     text,
  credits_balance integer not null default 10,            -- créditos de boas-vindas
  plan_code      plan_code not null default 'free',
  stripe_customer_id text,
  stripe_subscription_id text,
  subscription_status text,
  subscription_renews_at timestamptz,
  daily_generations_used integer not null default 0,
  daily_reset_at timestamptz not null default now(),
  onboarding_completed boolean not null default false,
  referral_code  text unique,
  referred_by    uuid references public.profiles(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ============================================================
-- 4. generations  (fila/histórico de gerações)
-- ============================================================
create table if not exists public.generations (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(id) on delete cascade,
  model_id       uuid references public.ai_models(id),
  modality       modality not null,
  prompt         text,
  negative_prompt text,
  params         jsonb not null default '{}'::jsonb,      -- ratio, duração, resolução, refs...
  status         generation_status not null default 'pending',
  provider       text,
  provider_task_id text,                                   -- task_id do provider (polling)
  credits_charged integer not null default 0,
  error_message  text,
  started_at     timestamptz,
  completed_at   timestamptz,
  created_at     timestamptz not null default now()
);

-- ============================================================
-- 5. assets  (mídia final persistida no Storage)
-- ============================================================
create table if not exists public.assets (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(id) on delete cascade,
  generation_id  uuid references public.generations(id) on delete set null,
  modality       modality not null,
  storage_path   text not null,                            -- caminho no Supabase Storage
  thumbnail_path text,
  mime_type      text,
  width          integer,
  height         integer,
  duration_seconds numeric(8,2),
  is_favorite    boolean not null default false,
  metadata       jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);

-- ============================================================
-- 6. seeds  (personagens/consistência visual — Fase 2)
-- ============================================================
create table if not exists public.seeds (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(id) on delete cascade,
  name           text not null,
  description    text,
  reference_asset_id uuid references public.assets(id) on delete set null,
  metadata       jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);

-- ============================================================
-- 7. saved_prompts  (My Prompts — Fase 2)
-- ============================================================
create table if not exists public.saved_prompts (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(id) on delete cascade,
  title          text,
  prompt         text not null,
  modality       modality,
  tags           text[] not null default '{}',
  created_at     timestamptz not null default now()
);

-- ============================================================
-- 8. flows  (templates de automação encadeada — Fase 2)
-- ============================================================
create table if not exists public.flows (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references public.profiles(id) on delete cascade,
  name           text not null,
  description    text,
  is_template    boolean not null default false,
  definition     jsonb not null default '{}'::jsonb,      -- passos encadeados
  created_at     timestamptz not null default now()
);

-- ============================================================
-- 9. credit_transactions  (ledger de créditos)
-- ============================================================
create table if not exists public.credit_transactions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(id) on delete cascade,
  amount         integer not null,                         -- + entrada, - saída
  type           credit_txn_type not null,
  balance_after  integer,
  generation_id  uuid references public.generations(id) on delete set null,
  reference      text,                                     -- id de sessão Stripe, etc.
  metadata       jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);

-- ============================================================
-- 10. referrals  (indicações)
-- ============================================================
create table if not exists public.referrals (
  id             uuid primary key default gen_random_uuid(),
  referrer_id    uuid not null references public.profiles(id) on delete cascade,
  referred_id    uuid references public.profiles(id) on delete set null,
  referred_email text,
  status         text not null default 'pending',          -- pending | converted
  credits_awarded integer not null default 0,
  converted_at   timestamptz,
  created_at     timestamptz not null default now()
);

-- ---------- ÍNDICES ----------
create index if not exists idx_generations_user on public.generations(user_id, created_at desc);
create index if not exists idx_generations_status on public.generations(status);
create index if not exists idx_assets_user on public.assets(user_id, created_at desc);
create index if not exists idx_assets_favorite on public.assets(user_id) where is_favorite;
create index if not exists idx_credit_txn_user on public.credit_transactions(user_id, created_at desc);
create index if not exists idx_seeds_user on public.seeds(user_id);
create index if not exists idx_saved_prompts_user on public.saved_prompts(user_id);
create index if not exists idx_referrals_referrer on public.referrals(referrer_id);

-- ---------- updated_at automático em profiles ----------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end; $$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------- Trigger de cadastro (cria profile + créditos de boas-vindas) ----------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, credits_balance, referral_code)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    10,
    'FLX' || upper(substr(replace(new.id::text, '-', ''), 1, 8))
  )
  on conflict (id) do nothing;

  insert into public.credit_transactions (user_id, amount, type, balance_after)
  values (new.id, 10, 'welcome', 10)
  on conflict do nothing;

  return new;
exception when others then
  return new; -- nunca bloqueia o cadastro
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

grant usage on schema public to supabase_auth_admin;
grant insert, select, update on public.profiles to supabase_auth_admin;
grant insert on public.credit_transactions to supabase_auth_admin;

-- ============================================================
-- RLS
-- ============================================================
alter table public.profiles            enable row level security;
alter table public.generations         enable row level security;
alter table public.assets              enable row level security;
alter table public.seeds               enable row level security;
alter table public.saved_prompts       enable row level security;
alter table public.flows               enable row level security;
alter table public.credit_transactions enable row level security;
alter table public.referrals           enable row level security;
alter table public.subscription_plans  enable row level security;
alter table public.ai_models           enable row level security;

-- Catálogos: leitura pública (somente ativos)
drop policy if exists "plans readable" on public.subscription_plans;
create policy "plans readable" on public.subscription_plans
  for select using (is_active = true);

drop policy if exists "models readable" on public.ai_models;
create policy "models readable" on public.ai_models
  for select using (is_active = true);

-- profiles: dono lê/edita o próprio
drop policy if exists "own profile select" on public.profiles;
create policy "own profile select" on public.profiles
  for select using (auth.uid() = id);
drop policy if exists "own profile update" on public.profiles;
create policy "own profile update" on public.profiles
  for update using (auth.uid() = id);

-- Helper macro via política padrão dono-only para tabelas de usuário
drop policy if exists "own generations" on public.generations;
create policy "own generations" on public.generations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own assets" on public.assets;
create policy "own assets" on public.assets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own seeds" on public.seeds;
create policy "own seeds" on public.seeds
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own saved_prompts" on public.saved_prompts;
create policy "own saved_prompts" on public.saved_prompts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- flows: templates públicos legíveis por todos; próprios editáveis pelo dono
drop policy if exists "flows read" on public.flows;
create policy "flows read" on public.flows
  for select using (is_template = true or auth.uid() = user_id);
drop policy if exists "flows write" on public.flows;
create policy "flows write" on public.flows
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- credit_transactions: dono só lê (escrita via service role)
drop policy if exists "own credit txn select" on public.credit_transactions;
create policy "own credit txn select" on public.credit_transactions
  for select using (auth.uid() = user_id);

-- referrals: dono (referrer) lê
drop policy if exists "own referrals" on public.referrals;
create policy "own referrals" on public.referrals
  for select using (auth.uid() = referrer_id);
