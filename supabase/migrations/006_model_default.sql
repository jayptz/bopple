-- Refresh preferred-model default off retired Claude Sonnet 4.
-- Users keep their choice unless they were on a retired Sonnet ID.

alter table public.users
  alter column preferred_model set default 'claude-sonnet-5';

update public.users
  set preferred_model = 'claude-sonnet-5'
  where preferred_model in (
    'claude-sonnet-4-20250514',
    'claude-3-7-sonnet-20250219',
    'claude-3-5-sonnet-20241022'
  );
