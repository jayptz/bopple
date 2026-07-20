-- Run this in the Supabase SQL editor

-- Users table
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  github_id text unique not null,
  github_username text not null,
  github_access_token text,
  github_avatar_url text,
  telegram_chat_id text unique,
  telegram_connect_token text unique,
  anthropic_api_key text,
  openai_api_key text,
  preferred_model text default 'claude-sonnet-5',
  plan text default 'free',
  tasks_used_this_month integer default 0,
  tasks_limit integer default 10,
  stripe_customer_id text,
  stripe_subscription_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.users enable row level security;

create policy "Users can view own data" on public.users
  for select using (auth.uid() = id);

create policy "Users can insert own data" on public.users
  for insert with check (auth.uid() = id);

create policy "Users can update own data" on public.users
  for update using (auth.uid() = id);

-- Repos table
create table if not exists public.repos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade not null,
  github_repo_id bigint not null,
  name text not null,
  full_name text not null,
  default_branch text default 'main',
  is_private boolean default false,
  is_active boolean default true,
  created_at timestamptz default now()
);

alter table public.repos enable row level security;

create policy "Users can CRUD own repos" on public.repos
  for all using (auth.uid() = user_id);

-- Tasks table
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  repo_id uuid references public.repos(id) on delete set null,
  repo_full_name text,
  prompt text not null,
  status text default 'queued' check (status in ('queued', 'running', 'awaiting_feedback', 'done', 'failed')),
  branch_name text,
  pr_url text,
  pr_number integer,
  pr_title text,
  files_changed integer,
  lines_added integer,
  lines_removed integer,
  error_message text,
  source text default 'telegram' check (source in ('telegram', 'dashboard')),
  telegram_chat_id text,
  trigger_run_id text,
  model_used text,
  tokens_used integer,
  sandbox_id text,
  conversation jsonb default '[]'::jsonb,
  demo_url text,
  demo_logs text,
  diff_text text,
  screenshot_url text,
  agent_logs jsonb default '[]'::jsonb,
  feedback_history jsonb default '[]'::jsonb,
  telegram_message_ids jsonb default '[]'::jsonb,
  created_at timestamptz default now(),
  started_at timestamptz,
  completed_at timestamptz
);

alter table public.tasks enable row level security;

create policy "Users can CRUD own tasks" on public.tasks
  for all using (auth.uid() = user_id);

-- Enable realtime on tasks
alter publication supabase_realtime add table public.tasks;

-- Migration helpers for existing databases
alter table public.tasks alter column user_id drop not null;
alter table public.tasks alter column repo_full_name drop not null;
alter table public.tasks add column if not exists telegram_chat_id text;
alter table public.tasks add column if not exists agent_logs jsonb default '[]'::jsonb;
alter table public.tasks add column if not exists feedback_history jsonb default '[]'::jsonb;
alter table public.tasks add column if not exists diff_text text;
alter table public.tasks add column if not exists screenshot_url text;
alter table public.tasks add column if not exists telegram_message_ids jsonb default '[]'::jsonb;

-- Atomic append for agent activity logs
create or replace function public.append_agent_log(
  p_task_id uuid,
  p_entry jsonb
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.tasks
  set agent_logs = coalesce(agent_logs, '[]'::jsonb) || jsonb_build_array(p_entry)
  where id = p_task_id;
$$;

grant execute on function public.append_agent_log(uuid, jsonb) to service_role;
grant execute on function public.append_agent_log(uuid, jsonb) to authenticated;
