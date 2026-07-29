-- ============================================================
-- PRODUÇÃO BASELINE — Fluxyra (reconstruído em 2026-07-26)
-- Fonte: schema real do banco pckfdyrhksdkwakptyuk via PostgREST OpenAPI
-- RECONSTRUÍDO — validar RLS antes de usar em ambiente novo
-- 9 tabelas: profiles, ai_models, generations, assets,
--            credit_transactions, credit_purchases, subscriptions,
--            products, generation_jobs
-- ============================================================

-- Extensão UUID
create extension if not exists "pgcrypto";

-- ============================================================
-- 1. profiles (1:1 com auth.users)
-- ============================================================
create table if not exists public.profiles (
  id                    uuid primary key references auth.users(id) on delete cascade,
  email                 text not null,
  credits_balance       integer not null default 10,
  stripe_customer_id    text,
  plan                  text not null default 'free',
  plan_credits_monthly  integer not null default 0,
  created_at            timestamptz not null default now()
);

-- RLS
alter table public.profiles enable row level security;

create policy if not exists "profiles: users can read own"
  on public.profiles for select
  using (auth.uid() = id);

create policy if not exists "profiles: users can update own"
  on public.profiles for update
  using (auth.uid() = id);

-- Trigger: criar profile com 10 créditos ao cadastrar
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, email, credits_balance, plan)
  values (new.id, new.email, 10, 'free')
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- 2. ai_models (catálogo — leitura pública)
-- ============================================================
create table if not exists public.ai_models (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  provider       text not null default 'piapi',
  type           text not null,                   -- 'image' | 'video' | 'audio'
  model_id       text not null,                   -- id no provider (slug)
  credit_cost    integer not null,
  params         jsonb,                           -- family, backend, task_type, etc.
  is_active      boolean not null default true,
  thumbnail_url  text,
  min_plan       text not null default 'free',
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now()
);

-- Leitura pública (catálogo)
alter table public.ai_models enable row level security;

create policy if not exists "ai_models: leitura pública"
  on public.ai_models for select
  using (true);

-- ============================================================
-- 3. generations (histórico e fila de gerações)
-- ============================================================
create table if not exists public.generations (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles(id) on delete cascade,
  model_id          uuid references public.ai_models(id),
  type              text not null,                -- 'image' | 'video' | 'audio'
  prompt            text not null,
  negative_prompt   text,
  params            jsonb,
  status            text default 'pending',       -- pending/processing/completed/failed
  result_url        text,
  provider_task_id  text,
  credits_used      integer not null default 0,
  error_message     text,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

alter table public.generations enable row level security;

create policy if not exists "generations: users can read own"
  on public.generations for select
  using (auth.uid() = user_id);

create policy if not exists "generations: users can insert own"
  on public.generations for insert
  with check (auth.uid() = user_id);

-- ============================================================
-- 4. assets (biblioteca de mídias do usuário)
-- ============================================================
create table if not exists public.assets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  category    text not null,                    -- 'image' | 'video' | 'audio' | 'custom'
  name        text not null,
  image_url   text not null,
  created_at  timestamptz not null default now()
);

alter table public.assets enable row level security;

create policy if not exists "assets: users can read own"
  on public.assets for select
  using (auth.uid() = user_id);

create policy if not exists "assets: users can insert own"
  on public.assets for insert
  with check (auth.uid() = user_id);

create policy if not exists "assets: users can delete own"
  on public.assets for delete
  using (auth.uid() = user_id);

-- ============================================================
-- 5. credit_transactions (ledger de créditos)
-- ============================================================
create table if not exists public.credit_transactions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  amount          integer not null,               -- positivo = entrada, negativo = saída
  reason          text not null,                  -- 'welcome'|'generation'|'refund'|'topup'|...
  related_job_id  uuid,
  created_at      timestamptz not null default now()
);

alter table public.credit_transactions enable row level security;

create policy if not exists "credit_transactions: users can read own"
  on public.credit_transactions for select
  using (auth.uid() = user_id);

-- ============================================================
-- 6. credit_purchases (top-ups Stripe)
-- ============================================================
create table if not exists public.credit_purchases (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.profiles(id) on delete cascade,
  stripe_session_id  text,
  credits            integer not null,
  amount_cents       integer not null,
  status             text not null default 'pending',
  created_at         timestamptz default now()
);

alter table public.credit_purchases enable row level security;

create policy if not exists "credit_purchases: users can read own"
  on public.credit_purchases for select
  using (auth.uid() = user_id);

-- ============================================================
-- 7. subscriptions (assinaturas Stripe)
-- ============================================================
create table if not exists public.subscriptions (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null references public.profiles(id) on delete cascade,
  stripe_subscription_id   text not null,
  stripe_price_id          text not null,
  plan                     text not null,
  status                   text not null,
  current_period_start     timestamptz,
  current_period_end       timestamptz,
  cancel_at_period_end     boolean default false,
  created_at               timestamptz default now(),
  updated_at               timestamptz default now()
);

alter table public.subscriptions enable row level security;

create policy if not exists "subscriptions: users can read own"
  on public.subscriptions for select
  using (auth.uid() = user_id);

-- ============================================================
-- 8. products (UGC Factory — fase futura)
-- ============================================================
create table if not exists public.products (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  title        text not null,
  description  text,
  image_url    text not null,
  created_at   timestamptz not null default now()
);

alter table public.products enable row level security;

create policy if not exists "products: users can read own"
  on public.products for select
  using (auth.uid() = user_id);

create policy if not exists "products: users can insert own"
  on public.products for insert
  with check (auth.uid() = user_id);

-- ============================================================
-- 9. generation_jobs (tabela legada v1 — mantida para histórico)
-- ============================================================
create table if not exists public.generation_jobs (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles(id) on delete cascade,
  modality         text not null,
  provider         text not null,
  model            text not null,
  model_variant    text,
  prompt           text not null,
  params           jsonb not null default '{}'::jsonb,
  status           text not null default 'pending',
  external_job_id  text,
  result_url       text,
  thumbnail_url    text,
  credits_cost     integer not null default 0,
  error_message    text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table public.generation_jobs enable row level security;

create policy if not exists "generation_jobs: users can read own"
  on public.generation_jobs for select
  using (auth.uid() = user_id);

-- ============================================================
-- Índices para performance
-- ============================================================
create index if not exists idx_generations_user_id
  on public.generations(user_id);

create index if not exists idx_generations_status
  on public.generations(status);

create index if not exists idx_generations_user_created
  on public.generations(user_id, created_at desc);

create index if not exists idx_credit_transactions_user_id
  on public.credit_transactions(user_id);

create index if not exists idx_credit_transactions_job_id
  on public.credit_transactions(related_job_id);

create index if not exists idx_assets_user_id
  on public.assets(user_id);

create index if not exists idx_ai_models_type_active
  on public.ai_models(type, is_active);
