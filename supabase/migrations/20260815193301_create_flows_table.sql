create table if not exists public.flows (id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade, name text not null default 'Novo Flow',
  description text, is_template boolean not null default false,
  definition jsonb not null default '{"nodes":[],"edges":[],"viewport":{"x":0,"y":0,"zoom":1}}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
alter table public.flows enable row level security;
create policy flows_select_own on public.flows for select using (auth.uid() = user_id);
create policy flows_insert_own on public.flows for insert with check (auth.uid() = user_id);
create policy flows_update_own on public.flows for update using (auth.uid() = user_id);
create policy flows_delete_own on public.flows for delete using (auth.uid() = user_id);
create index if not exists flows_user_id_idx on public.flows(user_id);
