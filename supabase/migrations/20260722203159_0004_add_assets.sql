insert into storage.buckets (id, name, public) values ('uploads','uploads',true) on conflict (id) do nothing;
create policy "uploads_insert_own" on storage.objects for insert with check (bucket_id = 'uploads' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "uploads_select_own" on storage.objects for select using (bucket_id = 'uploads' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "uploads_delete_own" on storage.objects for delete using (bucket_id = 'uploads' and (storage.foldername(name))[1] = auth.uid()::text);
create table public.assets (id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  category text not null check (category in ('character','scene','product','custom')),
  name text not null, image_url text not null, created_at timestamptz not null default now());
alter table public.assets enable row level security;
create policy "assets_select_own" on public.assets for select using (auth.uid() = user_id);
create policy "assets_insert_own" on public.assets for insert with check (auth.uid() = user_id);
create policy "assets_delete_own" on public.assets for delete using (auth.uid() = user_id);
create index assets_user_id_idx on public.assets (user_id, created_at desc);
