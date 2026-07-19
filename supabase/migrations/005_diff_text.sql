-- Store the unified git diff for the code panel
alter table public.tasks
  add column if not exists diff_text text;
