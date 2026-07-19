-- Diff capture: run in Supabase SQL editor if tasks table already exists

alter table public.tasks
  add column if not exists diff text;
