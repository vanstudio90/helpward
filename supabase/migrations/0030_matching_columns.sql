-- ADDITIVE ONLY — safe to apply before the application release.
--
-- Split out of the original 0030 because the function replacements in that
-- migration are NOT backward compatible (see 0032), while these columns
-- are needed BY the new application code. Applying them separately is what
-- lets the deploy be ordered safely:
--
--   0029 + 0030 (additive)  ->  deploy app  ->  0031 + 0032 (functions)
--
-- Old application code ignores these columns entirely.

alter table provider_profiles
  add column if not exists location_updated_at timestamptz;

comment on column provider_profiles.location_updated_at is
  'Stamped by the browser GPS ping loop (lib/gps/ping.ts) whenever current_location is written. find_nearby_providers requires this to be recent; NULL means the helper is not dispatchable.';

create index if not exists pp_dispatchable_idx
  on provider_profiles (status, is_online)
  where status = 'approved' and is_online = true;

-- How stale a helper location may be before they stop receiving offers.
-- Defined here (not in 0032) so it can be tuned without touching the
-- matching functions.
create or replace function public.max_location_age() returns interval
language sql immutable as $$ select interval '30 minutes' $$;

grant execute on function public.max_location_age() to authenticated, service_role;
