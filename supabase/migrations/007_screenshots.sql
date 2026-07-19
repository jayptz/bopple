-- Screenshot feature: run in the Supabase SQL editor.

-- 1. Store the public URL of a captured screenshot on the task.
alter table public.tasks
  add column if not exists screenshot_url text;

-- 2. Public bucket the agent uploads screenshots to. Public = objects are
--    readable via their public URL (so Telegram and the dashboard can load them).
--    Uploads happen through the service-role key, which bypasses RLS.
insert into storage.buckets (id, name, public)
values ('screenshots', 'screenshots', true)
on conflict (id) do nothing;
