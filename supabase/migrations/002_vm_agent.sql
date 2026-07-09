-- VM agent upgrade: run in Supabase SQL editor if tasks table already exists

alter table public.tasks drop constraint if exists tasks_status_check;

alter table public.tasks
  add column if not exists sandbox_id text,
  add column if not exists conversation jsonb default '[]'::jsonb,
  add column if not exists demo_url text,
  add column if not exists demo_logs text;

alter table public.tasks
  add constraint tasks_status_check
  check (status in ('queued', 'running', 'awaiting_feedback', 'done', 'failed'));
