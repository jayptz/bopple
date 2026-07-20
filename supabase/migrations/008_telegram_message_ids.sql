-- Track Telegram message IDs so replies can be threaded to the same task
alter table public.tasks
  add column if not exists telegram_message_ids jsonb default '[]'::jsonb;
