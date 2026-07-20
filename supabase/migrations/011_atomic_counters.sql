-- Atomic increment for monthly task usage (read-modify-write in app code
-- could undercount under concurrent requests).
create or replace function public.increment_tasks_used(p_user_id uuid)
returns void
language sql
as $$
  update public.users
  set tasks_used_this_month = tasks_used_this_month + 1
  where id = p_user_id;
$$;

-- Atomic, deduplicated append of Telegram message IDs to a task.
create or replace function public.append_telegram_message_ids(p_task_id uuid, p_ids jsonb)
returns void
language sql
as $$
  update public.tasks
  set telegram_message_ids = (
    select coalesce(jsonb_agg(distinct v), '[]'::jsonb)
    from jsonb_array_elements(coalesce(telegram_message_ids, '[]'::jsonb) || p_ids) as t(v)
  )
  where id = p_task_id;
$$;

-- Only the service role (server-side) should call these.
revoke execute on function public.increment_tasks_used(uuid) from public, anon, authenticated;
revoke execute on function public.append_telegram_message_ids(uuid, jsonb) from public, anon, authenticated;
