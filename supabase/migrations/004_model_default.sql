-- Move off the retired Claude Sonnet 4 model. Run in the Supabase SQL editor.

alter table public.users
  alter column preferred_model set default 'claude-opus-4-8';

update public.users
  set preferred_model = 'claude-opus-4-8'
  where preferred_model = 'claude-sonnet-4-20250514';
