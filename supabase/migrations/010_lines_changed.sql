-- Track insertions/deletions from the latest agent commit for Telegram + dashboard
alter table public.tasks
  add column if not exists lines_added integer;

alter table public.tasks
  add column if not exists lines_removed integer;
