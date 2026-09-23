create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null, credits_balance integer not null default 100,
  created_at timestamptz not null default now());
alter table public.profiles enable row level security;
create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);
create table public.credit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  amount integer not null,
  reason text not null check (reason in ('purchase','generation','refund','bonus')),
  related_job_id uuid, created_at timestamptz not null default now());
alter table public.credit_transactions enable row level security;
create policy "credit_transactions_select_own" on public.credit_transactions for select using (auth.uid() = user_id);
create index credit_transactions_user_id_idx on public.credit_transactions (user_id, created_at desc);
create table public.generation_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  modality text not null check (modality in ('image','video','audio')),
  provider text not null check (provider in ('piapi','atlascloud')),
  model text not null, prompt text not null, params jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','processing','completed','failed')),
  external_job_id text, result_url text, thumbnail_url text, credits_cost integer not null,
  error_message text, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
alter table public.generation_jobs enable row level security;
create policy "generation_jobs_select_own" on public.generation_jobs for select using (auth.uid() = user_id);
create index generation_jobs_user_id_idx on public.generation_jobs (user_id, created_at desc);
create index generation_jobs_status_idx on public.generation_jobs (status) where status in ('pending','processing');
create function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
create trigger set_generation_jobs_updated_at before update on public.generation_jobs for each row execute function public.set_updated_at();
create function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$ begin
  insert into public.profiles (id, email) values (new.id, new.email);
  insert into public.credit_transactions (user_id, amount, reason) values (new.id, 100, 'bonus'); return new; end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
create function public.adjust_credits(p_user_id uuid, p_amount integer, p_reason text, p_related_job_id uuid default null)
returns integer language plpgsql security definer set search_path = public as $$ declare v_new_balance integer; begin
  update public.profiles set credits_balance = credits_balance + p_amount where id = p_user_id returning credits_balance into v_new_balance;
  if v_new_balance is null then raise exception 'profile % not found', p_user_id; end if;
  if v_new_balance < 0 then raise exception 'insufficient_credits'; end if;
  insert into public.credit_transactions (user_id, amount, reason, related_job_id) values (p_user_id, p_amount, p_reason, p_related_job_id);
  return v_new_balance; end; $$;
