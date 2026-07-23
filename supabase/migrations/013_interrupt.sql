-- Soft interrupt flag: set by dashboard Stop / Telegram "stop",
-- polled by the agent loop after each tool call.
alter table public.tasks
  add column if not exists interrupt_requested_at timestamptz;
