-- 20260821190000_historical_drift_capture.sql
-- FLUXYRA — HISTORICAL DRIFT CAPTURE (contrato completo — HISTORICAL-BRIDGE-CONTRACT-FIX-01).
-- Janela: APÓS 20260821182706 (stripe_events_idempotency) e ANTES de 20260821221106 (etapa_7_2_1_1).
-- Captura o schema/dado ESTÁTICO criado FORA do migration history (drift) que já existia ANTES do
-- primeiro etapa_7: 9 tabelas com FKs/UNIQUEs/INDEXes/RLS/policies reais + catálogo ai_models
-- (43 linhas literais, UUIDs fixos, PRÉ-etapa, com sort_order). products é do remote #5 — o bridge
-- só adiciona a policy que faltava (products_update_own, do artifact products_rls).
-- FAIL-LOUD e idempotente (NO-OP em produção; cria em fresh branch). SQL PostgreSQL válido.

-- ══ ai_models (product config, migration-controlled) ══
create table if not exists public.ai_models (
  id uuid primary key default gen_random_uuid(), name text not null, provider text not null,
  type text not null, model_id text not null, credit_cost integer not null,
  params jsonb default '{}'::jsonb, is_active boolean default true, thumbnail_url text,
  min_plan text default 'free', sort_order integer default 0, created_at timestamptz default now());
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='ai_models' and column_name='id')
     or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='ai_models' and column_name='model_id')
     or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='ai_models' and column_name='type')
     or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='ai_models' and column_name='params')
     or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='ai_models' and column_name='credit_cost')
     or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='ai_models' and column_name='is_active')
     or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='ai_models' and column_name='min_plan')
     or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='ai_models' and column_name='sort_order')
  then raise exception 'HISTORICAL BRIDGE: contrato incompatível em ai_models (colunas faltando: id/model_id/type/params/credit_cost/is_active/min_plan/sort_order)'; end if;
end $$;
alter table public.ai_models enable row level security;
do $$ begin if not exists (select 1 from pg_policies where schemaname='public' and tablename='ai_models' and policyname='ai_models_read') then
  create policy "ai_models_read" on public.ai_models for select using (true); end if; end $$;

-- ══ generations ══
create table if not exists public.generations (
  id uuid primary key default gen_random_uuid(), user_id uuid not null,
  model_id uuid, type text not null, prompt text not null, negative_prompt text,
  params jsonb default '{}'::jsonb, status text default 'pending', result_url text,
  provider_task_id text, credits_used integer not null default 0, error_message text,
  created_at timestamptz default now(), updated_at timestamptz default now());
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='generations' and column_name='id')
     or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='generations' and column_name='user_id')
     or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='generations' and column_name='model_id')
     or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='generations' and column_name='type')
     or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='generations' and column_name='prompt')
  then raise exception 'HISTORICAL BRIDGE: contrato incompatível em generations (colunas faltando: id/user_id/model_id/type/prompt)'; end if;
end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname='generations_user_id_fkey') then
  alter table public.generations add constraint generations_user_id_fkey foreign key (user_id) references public.profiles (id) on delete cascade; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname='generations_model_id_fkey') then
  alter table public.generations add constraint generations_model_id_fkey foreign key (model_id) references public.ai_models (id) on delete no action; end if; end $$;
alter table public.generations enable row level security;
do $$ begin if not exists (select 1 from pg_policies where schemaname='public' and tablename='generations' and policyname='generations_own') then
  create policy "generations_own" on public.generations for all using (auth.uid() = user_id); end if; end $$;

-- ══ subscriptions ══
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null, stripe_subscription_id text not null,
  stripe_price_id text not null, plan text not null, status text not null default 'active',
  current_period_start timestamptz, current_period_end timestamptz, cancel_at_period_end boolean default false,
  created_at timestamptz default now(), updated_at timestamptz default now());
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='subscriptions' and column_name='id')
     or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='subscriptions' and column_name='user_id')
     or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='subscriptions' and column_name='stripe_subscription_id')
     or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='subscriptions' and column_name='plan')
     or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='subscriptions' and column_name='status')
  then raise exception 'HISTORICAL BRIDGE: contrato incompatível em subscriptions (colunas faltando: id/user_id/stripe_subscription_id/plan/status)'; end if;
end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname='subscriptions_user_id_fkey') then
  alter table public.subscriptions add constraint subscriptions_user_id_fkey foreign key (user_id) references public.profiles (id) on delete cascade; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname='subscriptions_stripe_subscription_id_key') then
  alter table public.subscriptions add constraint subscriptions_stripe_subscription_id_key unique (stripe_subscription_id); end if; end $$;
create index if not exists idx_subscriptions_stripe on public.subscriptions (stripe_subscription_id);
create index if not exists idx_subscriptions_user on public.subscriptions (user_id);
alter table public.subscriptions enable row level security;
do $$ begin if not exists (select 1 from pg_policies where schemaname='public' and tablename='subscriptions' and policyname='Service role full access subscriptions') then
  create policy "Service role full access subscriptions" on public.subscriptions for all using (auth.role() = 'service_role'::text); end if; end $$;
do $$ begin if not exists (select 1 from pg_policies where schemaname='public' and tablename='subscriptions' and policyname='Users read own subscriptions') then
  create policy "Users read own subscriptions" on public.subscriptions for select using (auth.uid() = user_id); end if; end $$;

-- ══ credit_purchases ══
create table if not exists public.credit_purchases (
  id uuid primary key default gen_random_uuid(), user_id uuid not null, stripe_session_id text,
  credits integer not null, amount_cents integer not null, status text not null default 'pending',
  created_at timestamptz default now());
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='credit_purchases' and column_name='id')
     or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='credit_purchases' and column_name='user_id')
     or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='credit_purchases' and column_name='stripe_session_id')
     or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='credit_purchases' and column_name='credits')
     or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='credit_purchases' and column_name='amount_cents')
  then raise exception 'HISTORICAL BRIDGE: contrato incompatível em credit_purchases (colunas faltando: id/user_id/stripe_session_id/credits/amount_cents)'; end if;
end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname='credit_purchases_user_id_fkey') then
  alter table public.credit_purchases add constraint credit_purchases_user_id_fkey foreign key (user_id) references public.profiles (id) on delete cascade; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname='credit_purchases_stripe_session_id_key') then
  alter table public.credit_purchases add constraint credit_purchases_stripe_session_id_key unique (stripe_session_id); end if; end $$;
create index if not exists idx_credit_purchases_user on public.credit_purchases (user_id);
alter table public.credit_purchases enable row level security;
do $$ begin if not exists (select 1 from pg_policies where schemaname='public' and tablename='credit_purchases' and policyname='Service role full access purchases') then
  create policy "Service role full access purchases" on public.credit_purchases for all using (auth.role() = 'service_role'::text); end if; end $$;
do $$ begin if not exists (select 1 from pg_policies where schemaname='public' and tablename='credit_purchases' and policyname='Users read own purchases') then
  create policy "Users read own purchases" on public.credit_purchases for select using (auth.uid() = user_id); end if; end $$;

-- ══ saved_prompts ══
create table if not exists public.saved_prompts (
  id uuid primary key default gen_random_uuid(), user_id uuid not null, title text, prompt text not null,
  type text, tags text[] default '{}'::text[], use_count integer default 0, created_at timestamptz default now(),
  negative_prompt text, default_model_id uuid, last_used_at timestamptz);
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='saved_prompts' and column_name='id')
     or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='saved_prompts' and column_name='user_id')
     or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='saved_prompts' and column_name='prompt')
     or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='saved_prompts' and column_name='default_model_id')
  then raise exception 'HISTORICAL BRIDGE: contrato incompatível em saved_prompts (colunas faltando: id/user_id/prompt/default_model_id)'; end if;
end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname='saved_prompts_user_id_fkey') then
  alter table public.saved_prompts add constraint saved_prompts_user_id_fkey foreign key (user_id) references public.profiles (id) on delete cascade; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname='saved_prompts_default_model_id_fkey') then
  alter table public.saved_prompts add constraint saved_prompts_default_model_id_fkey foreign key (default_model_id) references public.ai_models (id) on delete no action; end if; end $$;
create index if not exists idx_saved_prompts_user_id on public.saved_prompts (user_id);
alter table public.saved_prompts enable row level security;
do $$ begin if not exists (select 1 from pg_policies where schemaname='public' and tablename='saved_prompts' and policyname='sp_select_own') then
  create policy "sp_select_own" on public.saved_prompts for select using (auth.uid() = user_id); end if; end $$;
do $$ begin if not exists (select 1 from pg_policies where schemaname='public' and tablename='saved_prompts' and policyname='sp_insert_own') then
  create policy "sp_insert_own" on public.saved_prompts for insert with check (auth.uid() = user_id); end if; end $$;
do $$ begin if not exists (select 1 from pg_policies where schemaname='public' and tablename='saved_prompts' and policyname='sp_update_own') then
  create policy "sp_update_own" on public.saved_prompts for update using (auth.uid() = user_id); end if; end $$;
do $$ begin if not exists (select 1 from pg_policies where schemaname='public' and tablename='saved_prompts' and policyname='sp_delete_own') then
  create policy "sp_delete_own" on public.saved_prompts for delete using (auth.uid() = user_id); end if; end $$;

-- ══ seeds ══
create table if not exists public.seeds (
  id uuid primary key default gen_random_uuid(), user_id uuid not null, asset_id uuid, name text not null,
  description text, tags text[] default '{}'::text[], preview_url text, use_count integer default 0,
  last_used_at timestamptz, created_at timestamptz default now());
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='seeds' and column_name='id')
     or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='seeds' and column_name='user_id')
     or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='seeds' and column_name='asset_id')
     or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='seeds' and column_name='name')
  then raise exception 'HISTORICAL BRIDGE: contrato incompatível em seeds (colunas faltando: id/user_id/asset_id/name)'; end if;
end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname='seeds_user_id_fkey') then
  alter table public.seeds add constraint seeds_user_id_fkey foreign key (user_id) references public.profiles (id) on delete cascade; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname='seeds_asset_id_fkey') then
  alter table public.seeds add constraint seeds_asset_id_fkey foreign key (asset_id) references public.assets (id) on delete set null; end if; end $$;
create index if not exists idx_seeds_user_id on public.seeds (user_id);
alter table public.seeds enable row level security;
do $$ begin if not exists (select 1 from pg_policies where schemaname='public' and tablename='seeds' and policyname='seeds_select_own') then
  create policy "seeds_select_own" on public.seeds for select using (auth.uid() = user_id); end if; end $$;
do $$ begin if not exists (select 1 from pg_policies where schemaname='public' and tablename='seeds' and policyname='seeds_insert_own') then
  create policy "seeds_insert_own" on public.seeds for insert with check (auth.uid() = user_id); end if; end $$;
do $$ begin if not exists (select 1 from pg_policies where schemaname='public' and tablename='seeds' and policyname='seeds_update_own') then
  create policy "seeds_update_own" on public.seeds for update using (auth.uid() = user_id); end if; end $$;
do $$ begin if not exists (select 1 from pg_policies where schemaname='public' and tablename='seeds' and policyname='seeds_delete_own') then
  create policy "seeds_delete_own" on public.seeds for delete using (auth.uid() = user_id); end if; end $$;

-- ══ influencers ══
create table if not exists public.influencers (
  id uuid primary key default gen_random_uuid(), user_id uuid not null, name text not null, handle text,
  gender text, age_range text, styles text[] default '{}'::text[], hair_color text, eye_color text,
  additional_details text, avatar_image_url text, variations jsonb default '[]'::jsonb,
  is_premade boolean default false, created_at timestamptz default now());
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='influencers' and column_name='id')
     or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='influencers' and column_name='user_id')
     or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='influencers' and column_name='name')
  then raise exception 'HISTORICAL BRIDGE: contrato incompatível em influencers (colunas faltando: id/user_id/name)'; end if;
end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname='influencers_user_id_fkey') then
  alter table public.influencers add constraint influencers_user_id_fkey foreign key (user_id) references public.profiles (id) on delete cascade; end if; end $$;
create index if not exists idx_influencers_user_id on public.influencers (user_id);
alter table public.influencers enable row level security;
do $$ begin if not exists (select 1 from pg_policies where schemaname='public' and tablename='influencers' and policyname='inf_select_own') then
  create policy "inf_select_own" on public.influencers for select using (auth.uid() = user_id); end if; end $$;
do $$ begin if not exists (select 1 from pg_policies where schemaname='public' and tablename='influencers' and policyname='inf_insert_own') then
  create policy "inf_insert_own" on public.influencers for insert with check (auth.uid() = user_id); end if; end $$;
do $$ begin if not exists (select 1 from pg_policies where schemaname='public' and tablename='influencers' and policyname='inf_update_own') then
  create policy "inf_update_own" on public.influencers for update using (auth.uid() = user_id); end if; end $$;
do $$ begin if not exists (select 1 from pg_policies where schemaname='public' and tablename='influencers' and policyname='inf_delete_own') then
  create policy "inf_delete_own" on public.influencers for delete using (auth.uid() = user_id); end if; end $$;

-- ══ ugc_projects (FK avatar_seed_id→seeds, product_id→products[remote#5]) ══
create table if not exists public.ugc_projects (
  id uuid primary key default gen_random_uuid(), user_id uuid not null, name text not null, product_id uuid,
  avatar_seed_id uuid, avatar_label text, script jsonb default '{}'::jsonb, segments jsonb default '[]'::jsonb,
  broll jsonb default '[]'::jsonb, status text default 'draft', created_at timestamptz default now(),
  updated_at timestamptz default now(), avatar_image_url text);
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='ugc_projects' and column_name='id')
     or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='ugc_projects' and column_name='user_id')
     or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='ugc_projects' and column_name='name')
  then raise exception 'HISTORICAL BRIDGE: contrato incompatível em ugc_projects (colunas faltando: id/user_id/name)'; end if;
end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname='ugc_projects_user_id_fkey') then
  alter table public.ugc_projects add constraint ugc_projects_user_id_fkey foreign key (user_id) references public.profiles (id) on delete cascade; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname='ugc_projects_product_id_fkey') then
  alter table public.ugc_projects add constraint ugc_projects_product_id_fkey foreign key (product_id) references public.products (id) on delete set null; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname='ugc_projects_avatar_seed_id_fkey') then
  alter table public.ugc_projects add constraint ugc_projects_avatar_seed_id_fkey foreign key (avatar_seed_id) references public.seeds (id) on delete set null; end if; end $$;
create index if not exists idx_ugc_projects_user_id on public.ugc_projects (user_id);
alter table public.ugc_projects enable row level security;
do $$ begin if not exists (select 1 from pg_policies where schemaname='public' and tablename='ugc_projects' and policyname='ugcp_select_own') then
  create policy "ugcp_select_own" on public.ugc_projects for select using (auth.uid() = user_id); end if; end $$;
do $$ begin if not exists (select 1 from pg_policies where schemaname='public' and tablename='ugc_projects' and policyname='ugcp_insert_own') then
  create policy "ugcp_insert_own" on public.ugc_projects for insert with check (auth.uid() = user_id); end if; end $$;
do $$ begin if not exists (select 1 from pg_policies where schemaname='public' and tablename='ugc_projects' and policyname='ugcp_update_own') then
  create policy "ugcp_update_own" on public.ugc_projects for update using (auth.uid() = user_id); end if; end $$;
do $$ begin if not exists (select 1 from pg_policies where schemaname='public' and tablename='ugc_projects' and policyname='ugcp_delete_own') then
  create policy "ugcp_delete_own" on public.ugc_projects for delete using (auth.uid() = user_id); end if; end $$;

-- ══ influencer_content (FK influencer_id→influencers) ══
create table if not exists public.influencer_content (
  id uuid primary key default gen_random_uuid(), user_id uuid not null, influencer_id uuid not null,
  category text, prompt text, image_url text, caption text, generation_id uuid,
  created_at timestamptz default now(), format text);
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='influencer_content' and column_name='id')
     or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='influencer_content' and column_name='user_id')
     or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='influencer_content' and column_name='influencer_id')
  then raise exception 'HISTORICAL BRIDGE: contrato incompatível em influencer_content (colunas faltando: id/user_id/influencer_id)'; end if;
end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname='influencer_content_user_id_fkey') then
  alter table public.influencer_content add constraint influencer_content_user_id_fkey foreign key (user_id) references public.profiles (id) on delete cascade; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname='influencer_content_influencer_id_fkey') then
  alter table public.influencer_content add constraint influencer_content_influencer_id_fkey foreign key (influencer_id) references public.influencers (id) on delete cascade; end if; end $$;
create index if not exists idx_influencer_content_user_inf on public.influencer_content (user_id, influencer_id);
alter table public.influencer_content enable row level security;
do $$ begin if not exists (select 1 from pg_policies where schemaname='public' and tablename='influencer_content' and policyname='ic_select_own') then
  create policy "ic_select_own" on public.influencer_content for select using (auth.uid() = user_id); end if; end $$;
do $$ begin if not exists (select 1 from pg_policies where schemaname='public' and tablename='influencer_content' and policyname='ic_insert_own') then
  create policy "ic_insert_own" on public.influencer_content for insert with check (auth.uid() = user_id); end if; end $$;
do $$ begin if not exists (select 1 from pg_policies where schemaname='public' and tablename='influencer_content' and policyname='ic_update_own') then
  create policy "ic_update_own" on public.influencer_content for update using (auth.uid() = user_id); end if; end $$;
do $$ begin if not exists (select 1 from pg_policies where schemaname='public' and tablename='influencer_content' and policyname='ic_delete_own') then
  create policy "ic_delete_own" on public.influencer_content for delete using (auth.uid() = user_id); end if; end $$;

-- ══ products: criada pelo remote #5. Bridge NÃO recria; só adiciona a policy do artifact
--    products_rls que faltava no remote (products_update_own), se ausente. ══
do $$ begin if not exists (select 1 from pg_policies where schemaname='public' and tablename='products' and policyname='products_update_own') then
  create policy "products_update_own" on public.products for update using (auth.uid() = user_id); end if; end $$;

-- ══ Catálogo estático ai_models (43 linhas LITERAIS, UUIDs fixos, PRÉ-etapa, com sort_order) ══
-- FAIL-LOUD por linha: se já existir id com contrato de produto divergente
-- (model_id/provider/type/credit_cost/is_active/min_plan/sort_order ou task_type histórico), ABORTA.
-- Senão insere quando ausente (fresh) e é NO-OP quando presente (produção).
do $$
declare r record;
begin
  for r in
    select * from jsonb_to_recordset($BRIDGE_ROWS$[{"id":"4631274e-0a97-43d8-86fa-8ef4e4a3d055","model_id":"kling","name":"Kling Standard","type":"video","provider":"piapi","is_active":false,"credit_cost":20,"min_plan":"starter","sort_order":11,"params":{"family":"Kling","task_type":"video_generation","kling_mode":"standard","kling_version":"1.0"}},{"id":"93c9f7db-d47d-4824-9214-aea12b7edcb1","model_id":"seedance-2.0","name":"Seedance 2.0","type":"video","provider":"piapi","is_active":true,"credit_cost":150,"min_plan":"free","sort_order":20,"params":{"badge":"NEW","family":"Seedance","backend":"seedance","dur_max":15,"dur_min":4,"has_audio":true,"task_type":"seedance-2","output_key":"output.video","resolution":"1080p","duration_range":"4s–15s","credit_per_second":{"480p":8,"720p":16,"1080p":40},"pricing_lr_markup_applied":true}},{"id":"3f4636f8-54b2-4b7d-80af-3d9e4708fb76","model_id":"Qubico/flux1-schnell","name":"Flux Schnell","type":"image","provider":"piapi","is_active":true,"credit_cost":2,"min_plan":"free","sort_order":1,"params":{"width":1024,"family":"Flux","height":1024}},{"id":"f4d2a19e-cb6b-453d-a677-3f44b5ba9fee","model_id":"veo-3-fast","name":"Veo 3 Fast","type":"video","provider":"piapi","is_active":true,"credit_cost":50,"min_plan":"free","sort_order":14,"params":{"badge":"FAST","family":"Veo","backend":"veo3","dur_max":8,"dur_min":4,"has_audio":true,"task_type":"veo3-video-fast","resolution":"720p","credit_per_second":{"720p":7.2,"1080p":7.2}}},{"id":"cbb49771-cbe9-4361-88c2-d82810201d79","model_id":"ideogram-v4-turbo","name":"Ideogram v4 Turbo","type":"image","provider":"atlas","is_active":false,"credit_cost":4,"min_plan":"free","sort_order":3,"params":{"family":"Ideogram","backend":"gpt-image-2","provider":"gpt-image","abacus_model":"ideogram"}},{"id":"f357fc48-ced1-4a5c-9200-e2afa7c00dcc","model_id":"gpt-image-2","name":"GPT Image 2","type":"image","provider":"atlas","is_active":true,"credit_cost":4,"min_plan":"free","sort_order":4,"params":{"family":"GPT Image","backend":"gpt-image-2","provider":"gpt-image","abacus_model":"gpt_image2"}},{"id":"1be7e30b-b701-4e32-8944-828d75921a4a","model_id":"suno-chirp-v4","name":"Suno Música","type":"audio","provider":"atlas","is_active":false,"credit_cost":16,"min_plan":"free","sort_order":21,"params":{"kind":"music","family":"Música","backend":"music-u"}},{"id":"99cdc7b3-8cdb-4383-9e31-eafb41e21a29","model_id":"Qubico/flux1-dev","name":"Flux Dev","type":"image","provider":"piapi","is_active":true,"credit_cost":4,"min_plan":"free","sort_order":2,"params":{"family":"Flux"}},{"id":"e64c16ee-181d-46d9-afff-4358f240f800","model_id":"Qubico/ace-step","name":"Ace-Step","type":"audio","provider":"piapi","is_active":true,"credit_cost":4,"min_plan":"free","sort_order":20,"params":{"kind":"music","family":"Música"}},{"id":"385d9b10-868e-4fa0-9b93-f78237632799","model_id":"seedance-2.0-fast","name":"Seedance 2.0 Fast","type":"video","provider":"piapi","is_active":true,"credit_cost":66,"min_plan":"free","sort_order":21,"params":{"badge":"FAST","family":"Seedance","backend":"seedance","dur_max":15,"dur_min":4,"has_audio":true,"task_type":"seedance-2-fast","resolution":"720p","credit_per_second":{"480p":6.4,"720p":12.8}}},{"id":"2e91c396-323e-4267-bac2-8941c0501e0b","model_id":"kling","name":"Kling Pro","type":"video","provider":"piapi","is_active":false,"credit_cost":36,"min_plan":"pro","sort_order":12,"params":{"family":"Kling","task_type":"video_generation","kling_mode":"pro","kling_version":"1.6"}},{"id":"0465a3f1-01fa-4045-9a93-af6782e3c256","model_id":"elevenlabs-sfx","name":"Ace-Step Sound Effects","type":"audio","provider":"atlas","is_active":true,"credit_cost":4,"min_plan":"free","sort_order":13,"params":{"kind":"sfx","badge":"NEW","family":"ElevenLabs","backend":"Qubico/ace-step","gen_time":"5S"}},{"id":"14dbd10d-ab3a-4e70-b948-5dc67a258b85","model_id":"nano-banana-pro","name":"Nano Banana Pro","type":"image","provider":"atlas","is_active":true,"credit_cost":10,"min_plan":"free","sort_order":21,"params":{"family":"Nano Banana","backend":"gpt-image-2","provider":"gpt-image","abacus_model":"nano_banana_pro","credit_cost_map":{"1K":10,"2K":10,"4K":18}}},{"id":"eeaa3ce0-0324-4b78-b08a-cc9a3100710e","model_id":"kling","name":"Kling 2.1 Master","type":"video","provider":"piapi","is_active":false,"credit_cost":44,"min_plan":"pro","sort_order":23,"params":{"family":"Kling","task_type":"video_generation","kling_mode":"master","kling_version":"2.1"}},{"id":"6c5ac504-8481-42b1-8442-46da680e11c2","model_id":"kling","name":"Kling 1.6 Standard","type":"video","provider":"piapi","is_active":false,"credit_cost":24,"min_plan":"starter","sort_order":21,"params":{"family":"Kling","task_type":"video_generation","kling_mode":"standard","kling_version":"1.6"}},{"id":"a0591bfe-f8e8-456d-bb76-669e136cbbe4","model_id":"nano-banana","name":"Nano Banana","type":"image","provider":"atlas","is_active":true,"credit_cost":6,"min_plan":"free","sort_order":20,"params":{"family":"Nano Banana","backend":"gpt-image-2","provider":"gpt-image","abacus_model":"nano_banana"}},{"id":"b1736b24-1af5-45c9-b434-a7828f10cb31","model_id":"wan-2.1-video","name":"Wan 2.6","type":"video","provider":"piapi","is_active":true,"credit_cost":20,"min_plan":"free","sort_order":60,"params":{"family":"Wan","backend":"Wan","dur_max":15,"dur_min":5,"has_audio":true,"task_type":"wan26-txt2video","resolution":"720p","credit_per_second":{"720p":6.4,"1080p":9.6}}},{"id":"ac9eadbf-75fb-4287-93f7-d5e05f16ad8c","model_id":"hailuo-live","name":"Hailuo Live","type":"video","provider":"piapi","is_active":true,"credit_cost":32,"min_plan":"free","sort_order":41,"params":{"family":"Hailuo","backend":"hailuo","dur_max":10,"dur_min":6,"has_audio":false,"task_type":"video_generation","resolution":"720p"}},{"id":"367f0843-e8f0-4691-b83a-14b0f3b7bd7f","model_id":"elevenlabs-turbo-v2.5","name":"ElevenLabs Turbo V2.5","type":"audio","provider":"atlas","is_active":true,"credit_cost":4,"min_plan":"free","sort_order":11,"params":{"kind":"tts","badge":"RECOMMENDED","family":"ElevenLabs","backend":"atlas-tts","tts_model":"gpt-4o-mini-audio-preview","atlas_model":"elevenlabs/v3/text-to-speech"}},{"id":"3801dbff-a31a-4d82-953f-87783794b7b9","model_id":"Qubico/flux1-pro","name":"Flux 1.1 Pro","type":"image","provider":"piapi","is_active":false,"credit_cost":8,"min_plan":"free","sort_order":13,"params":{"family":"Flux","backend":"Qubico/flux1-dev"}},{"id":"a58e46c6-51a6-4e11-ba98-e0d33c849ff2","model_id":"recraft-v3","name":"Recraft V3","type":"image","provider":"atlas","is_active":false,"credit_cost":6,"min_plan":"free","sort_order":30,"params":{"family":"Recraft","backend":"Qubico/flux1-dev"}},{"id":"3f0a5064-2d18-4f36-b78a-d84637c27c6f","model_id":"elevenlabs-flash","name":"ElevenLabs Flash","type":"audio","provider":"atlas","is_active":true,"credit_cost":2,"min_plan":"free","sort_order":10,"params":{"kind":"tts","badge":"FAST","family":"ElevenLabs","backend":"atlas-tts","tts_model":"gpt-4o-mini-audio-preview","atlas_model":"elevenlabs/v3/text-to-speech"}},{"id":"93d40d5f-e9c5-41a8-8331-099e00263dd0","model_id":"veo-3","name":"Veo 3","type":"video","provider":"piapi","is_active":true,"credit_cost":80,"min_plan":"free","sort_order":51,"params":{"family":"Veo","backend":"veo3","dur_max":8,"dur_min":4,"has_audio":true,"task_type":"veo3-video","resolution":"1080p","credit_per_second":{"720p":19.2,"1080p":19.2}}},{"id":"3d3e5f74-7341-4218-8fbe-0dd1f1c4b46b","model_id":"mmaudio","name":"Ace-Step Audio","type":"audio","provider":"piapi","is_active":true,"credit_cost":8,"min_plan":"free","sort_order":40,"params":{"kind":"sfx","family":"MMAudio","backend":"Qubico/ace-step"}},{"id":"acdfa29d-558f-4e7b-bf18-2029cb2f1a77","model_id":"hailuo","name":"Hailuo MiniMax","type":"video","provider":"piapi","is_active":true,"credit_cost":28,"min_plan":"free","sort_order":40,"params":{"family":"Hailuo","backend":"hailuo","dur_max":10,"dur_min":6,"has_audio":false,"task_type":"video_generation","resolution":"720p","hailuo_model":"v2.3"}},{"id":"19315605-efb1-431a-b3ce-74523edb43fb","model_id":"qwen-image","name":"Qwen Image","type":"image","provider":"atlas","is_active":true,"credit_cost":4,"min_plan":"free","sort_order":40,"params":{"family":"Qwen","backend":"Qubico/flux1-schnell"}},{"id":"0206ebca-284e-4a70-8ad3-68f5ec35e10d","model_id":"ltx-video","name":"LTX Video","type":"video","provider":"piapi","is_active":false,"credit_cost":16,"min_plan":"starter","sort_order":40,"params":{"family":"LTX","backend":"kling","dur_max":10,"dur_min":4,"has_audio":false,"task_type":"video_generation","kling_mode":"standard","resolution":"720p","kling_version":"1.6"}},{"id":"43c7a34a-30a8-4700-ae1d-0ff5d45ea688","model_id":"udio-music","name":"Udio Música","type":"audio","provider":"piapi","is_active":true,"credit_cost":16,"min_plan":"free","sort_order":30,"params":{"kind":"music","family":"Música","backend":"music-u"}},{"id":"1a26807e-792d-4373-acc1-75c8b6cb4dfa","model_id":"elevenlabs-multilingual-v2","name":"ElevenLabs Multilingual V2","type":"audio","provider":"atlas","is_active":true,"credit_cost":6,"min_plan":"free","sort_order":12,"params":{"kind":"tts","family":"ElevenLabs","backend":"atlas-tts","tts_model":"gpt-4o-audio-preview","atlas_model":"elevenlabs/v3/text-to-speech"}},{"id":"5a1d0c40-025e-4c81-a8e9-5472200a2764","model_id":"kling-3.0","name":"Kling 3.0","type":"video","provider":"piapi","is_active":true,"credit_cost":70,"min_plan":"free","sort_order":10,"params":{"badge":"MULTI","family":"Kling","backend":"kling","dur_max":15,"dur_min":3,"has_audio":true,"task_type":"video_generation","kling_mode":"std","resolution":"1080p","kling_version":"3.0","credit_per_second":{"720p":12,"1080p":16}}},{"id":"c3ec0929-a36e-44e4-99a6-62adf1b80cc9","model_id":"kling-3.0-motion","name":"Kling 3.0 Motion Control","type":"video","provider":"piapi","is_active":true,"credit_cost":60,"min_plan":"free","sort_order":11,"params":{"family":"Kling","backend":"kling","dur_max":30,"dur_min":3,"has_audio":false,"task_type":"motion_control","resolution":"1080p","kling_version":"3.0"}},{"id":"226b1fb1-bd87-4207-a022-22503af4ab09","model_id":"kling-omni","name":"Kling Omni","type":"video","provider":"piapi","is_active":true,"credit_cost":80,"min_plan":"free","sort_order":12,"params":{"badge":"MULTI","family":"Kling","backend":"kling","dur_max":15,"dur_min":3,"task_type":"omni_video_generation","kling_mode":"pro","kling_version":"3.0","credit_per_second":{"720p":12,"1080p":16}}},{"id":"f9318793-5c11-4fdb-b7db-118bdd62264d","model_id":"kling-2.5-turbo","name":"Kling 2.5 Turbo","type":"video","provider":"piapi","is_active":true,"credit_cost":50,"min_plan":"free","sort_order":13,"params":{"badge":"TURBO","family":"Kling","backend":"kling-turbo","dur_max":10,"dur_min":5,"task_type":"video_generation","kling_mode":"pro","resolution":"1080p","kling_version":"2.5-turbo","credit_per_second":{"720p":10.4,"1080p":15.2}}},{"id":"9d08262e-4bb0-4dce-b830-cf2b73be2520","model_id":"seedance-1.5-pro","name":"Seedance 2.0 Mini","type":"video","provider":"piapi","is_active":true,"credit_cost":100,"min_plan":"free","sort_order":22,"params":{"family":"Seedance","backend":"seedance","dur_max":15,"dur_min":4,"has_audio":true,"task_type":"seedance-2-mini","resolution":"720p","credit_per_second":{"480p":5.6,"720p":11.2}}},{"id":"8d9bbe2c-3575-4b53-9c5f-0f5f991395eb","model_id":"veo-3.1-quality","name":"Veo 3.1 Quality","type":"video","provider":"piapi","is_active":true,"credit_cost":120,"min_plan":"free","sort_order":30,"params":{"family":"Veo","backend":"veo3.1","dur_max":8,"dur_min":4,"has_audio":true,"task_type":"veo3.1-video","resolution":"1080p","credit_per_second":{"720p":19.2,"1080p":19.2}}},{"id":"84614992-e4a3-4a77-aedc-9570198e423b","model_id":"veo-3.1-fast","name":"Veo 3.1 Fast","type":"video","provider":"piapi","is_active":true,"credit_cost":80,"min_plan":"free","sort_order":31,"params":{"badge":"FAST","family":"Veo","backend":"veo3.1","dur_max":8,"dur_min":4,"has_audio":true,"task_type":"veo3.1-video-fast","resolution":"1080p","credit_per_second":{"720p":7.2,"1080p":7.2}}},{"id":"75983223-61a2-4f7b-8f28-1da871d92493","model_id":"ltx-fast","name":"LTX Fast","type":"video","provider":"piapi","is_active":false,"credit_cost":16,"min_plan":"free","sort_order":50,"params":{"badge":"FAST","family":"LTX","backend":"kling","dur_max":10,"dur_min":4,"has_audio":false,"task_type":"video_generation","kling_mode":"standard","resolution":"720p","kling_version":"1.0"}},{"id":"de3ea38a-1841-41df-9df7-d7ad6d5997a0","model_id":"seedance-2.0-less-restriction","name":"Seedance 2.0 — Rosto Real","type":"video","provider":"piapi","is_active":true,"credit_cost":166,"min_plan":"free","sort_order":21,"params":{"badge":"REAL","family":"Seedance","backend":"seedance","dur_max":15,"dur_min":4,"has_audio":true,"task_type":"seedance-2-less-restriction","resolution":"1080p","less_restriction":true,"credit_per_second":{"480p":8.8,"720p":17.6,"1080p":44}}},{"id":"cad04dc4-3a91-4a8b-a857-b0f835e2dd19","model_id":"kling-avatar","name":"Talking Avatar (Kling)","type":"video","provider":"piapi","is_active":false,"credit_cost":50,"min_plan":"free","sort_order":16,"params":{"badge":"UGC","family":"Avatar","backend":"kling","ugc_only":true,"task_type":"avatar","kling_avatar_mode":"std","credit_per_second":{"720p":4.2,"1080p":4.2}}},{"id":"e88d41be-55ae-4000-b6fa-71f8cb2306ad","model_id":"kling-avatar","name":"Kling Avatar","type":"video","provider":"piapi","is_active":true,"credit_cost":58,"min_plan":"free","sort_order":100,"params":{"backend":"kling","dur_max":8,"dur_min":4,"task_type":"avatar","credit_per_second":{"720p":8.4,"1080p":8.4}}},{"id":"95681446-db53-4689-91ac-fd11f27874a6","model_id":"seedance-2.5","name":"Seedance 2.5 (Preview)","type":"video","provider":"piapi","is_active":true,"credit_cost":200,"min_plan":"free","sort_order":19,"params":{"badge":"PREVIEW","family":"Seedance","backend":"seedance","dur_max":30,"dur_min":4,"has_audio":true,"task_type":"seedance-2.5-less-restriction","resolution":"720p","less_restriction":true}},{"id":"947b529d-4c20-44c3-ae8e-abeda8facbc2","model_id":"Qubico/image-toolkit","name":"Upscale","type":"image","provider":"piapi","is_active":false,"credit_cost":3,"min_plan":"free","sort_order":0,"params":{"kind":"upscale","backend":"image-toolkit","task_type":"upscale"}},{"id":"11005d3c-7ad0-491b-bd0c-07e3cf633545","model_id":"Qubico/image-toolkit","name":"Remove BG","type":"image","provider":"piapi","is_active":false,"credit_cost":2,"min_plan":"free","sort_order":0,"params":{"kind":"removebg","backend":"image-toolkit","task_type":"background-remove","rmbg_model":"RMBG-2.0"}}]$BRIDGE_ROWS$)
      as x(id uuid, model_id text, name text, type text, provider text,
           is_active boolean, credit_cost integer, min_plan text, sort_order integer, params jsonb)
  loop
    if exists (
      select 1 from public.ai_models a where a.id = r.id and (
        a.model_id <> r.model_id or a.provider <> r.provider or a.type <> r.type
        or a.credit_cost <> r.credit_cost or a.is_active is distinct from r.is_active
        or a.min_plan is distinct from r.min_plan or a.sort_order is distinct from r.sort_order
        or (r.params ? 'task_type' and (a.params->>'task_type') is distinct from (r.params->>'task_type'))
      )
    ) then
      raise exception 'HISTORICAL BRIDGE: drift de contrato em ai_models % (model_id=% provider=% type=% cc=% active=% min_plan=% sort=% task_type=%)',
        r.id, r.model_id, r.provider, r.type, r.credit_cost, r.is_active, r.min_plan, r.sort_order, r.params->>'task_type';
    end if;
    insert into public.ai_models (id, model_id, name, type, provider, is_active, credit_cost, min_plan, sort_order, params)
    values (r.id, r.model_id, r.name, r.type, r.provider, r.is_active, r.credit_cost, r.min_plan, r.sort_order, r.params)
    on conflict (id) do nothing;
  end loop;
end $$;
