-- Persist the subdirectory (or ".") where the agent made changes so feedback
-- follow-ups can reuse it for demo/screenshot even when they write no new files.
alter table public.tasks
  add column if not exists working_scope text;
