-- Influencer Studio (4d-1)
-- Observação: tabela já existente em produção no momento da criação desta migration.
-- Mantemos DDL idempotente para versionamento do schema.

create table if not exists public.influencers (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid references auth.users(id) on delete cascade not null,
  name                  text not null,
  handle                text,
  gender                text,
  age_range             text,
  styles                text[],
  hair_color            text,
  eye_color             text,
  additional_details    text,
  reference_image_urls  text[],
  variations            text[],
  avatar_image_url      text,
  status                text default 'draft',
  created_at            timestamptz default now(),
  updated_at            timestamptz default now()
);

alter table public.influencers enable row level security;

drop policy if exists "Users can manage their own influencers" on public.influencers;
create policy "Users can manage their own influencers"
  on public.influencers
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
