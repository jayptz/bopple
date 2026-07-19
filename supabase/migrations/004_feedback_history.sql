-- Feedback history + ensure done status usable as resolved
alter table public.tasks
  add column if not exists feedback_history jsonb default '[]'::jsonb;
