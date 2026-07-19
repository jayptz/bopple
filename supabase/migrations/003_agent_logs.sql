-- Agent activity logs for live dashboard feed
alter table public.tasks
  add column if not exists agent_logs jsonb default '[]'::jsonb;

-- Atomic append so concurrent updates don't clobber the array
create or replace function public.append_agent_log(
  p_task_id uuid,
  p_entry jsonb
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.tasks
  set agent_logs = coalesce(agent_logs, '[]'::jsonb) || jsonb_build_array(p_entry)
  where id = p_task_id;
$$;

grant execute on function public.append_agent_log(uuid, jsonb) to service_role;
grant execute on function public.append_agent_log(uuid, jsonb) to authenticated;
