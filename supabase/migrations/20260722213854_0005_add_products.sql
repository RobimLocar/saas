create table public.products (id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null, description text, image_url text not null, created_at timestamptz not null default now());
alter table public.products enable row level security;
create policy "products_select_own" on public.products for select using (auth.uid() = user_id);
create policy "products_insert_own" on public.products for insert with check (auth.uid() = user_id);
create policy "products_delete_own" on public.products for delete using (auth.uid() = user_id);
create index products_user_id_idx on public.products (user_id, created_at desc);
