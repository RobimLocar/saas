create table if not exists public.stripe_events (event_id text primary key, received_at timestamptz not null default now());
alter table public.stripe_events enable row level security;
