-- Influencer Studio 4d-3
-- Tabela para packs de conteúdo da persona

create table if not exists public.influencer_content (
  id              uuid primary key default gen_random_uuid(),
  influencer_id   uuid references public.influencers(id) on delete cascade not null,
  user_id         uuid references auth.users(id) on delete cascade not null,
  category        text not null,
  prompt          text not null,
  image_url       text,
  generation_id   uuid references public.generations(id),
  caption         text,
  format          text default '9:16',
  created_at      timestamptz default now()
);

-- Compatibilidade com ambientes que já tinham a tabela sem coluna format
alter table if exists public.influencer_content
  add column if not exists format text default '9:16';

alter table public.influencer_content enable row level security;

drop policy if exists "Users manage their own influencer content" on public.influencer_content;
create policy "Users manage their own influencer content"
  on public.influencer_content
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
