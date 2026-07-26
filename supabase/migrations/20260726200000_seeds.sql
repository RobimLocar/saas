-- ============================================================
-- Migration: seeds — Etapa 4b
-- Idempotente: tabela + RLS + policies
-- ============================================================

create extension if not exists "pgcrypto";

create table if not exists public.seeds (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  name         text,
  description  text,
  asset_id     uuid,
  preview_url  text,
  tags         text[] default '{}',
  use_count    integer default 0,
  last_used_at timestamptz,
  created_at   timestamptz default now()
);

create index if not exists idx_seeds_user_id on public.seeds(user_id);
create index if not exists idx_seeds_last_used_at on public.seeds(last_used_at desc);

alter table public.seeds enable row level security;

-- SELECT
DO $$
BEGIN
  CREATE POLICY sp_seeds_select
    ON public.seeds
    FOR SELECT
    USING (auth.uid() = user_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

-- INSERT
DO $$
BEGIN
  CREATE POLICY sp_seeds_insert
    ON public.seeds
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

-- UPDATE
DO $$
BEGIN
  CREATE POLICY sp_seeds_update
    ON public.seeds
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

-- DELETE
DO $$
BEGIN
  CREATE POLICY sp_seeds_delete
    ON public.seeds
    FOR DELETE
    USING (auth.uid() = user_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;
