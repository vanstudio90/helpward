-- CLASS: pre-deploy
-- =========================================================================
-- 0079 — a helper's phone number and base address
--
-- Neither was reachable by a helper. set_my_phone (0061) exists and writes
-- profile_contacts, but the only page that calls it is /settings, which
-- lives in the CUSTOMER route group and is not in the helper navigation —
-- the same gap that made a helper's display name uneditable.
--
-- There was nowhere at all to record where a helper is based. base_location
-- is a geography point with no text beside it, so an admin looking at a
-- helper could see coordinates and no address.
--
-- DISPATCH DOES NOT USE THIS. Matching is driven by current_location, the
-- live point a helper reports while online, checked for freshness by
-- find_nearby_providers. A base address is for records, support and the
-- helper's own sense of where they have said they work — it must never be
-- mistaken for the thing that decides whether a job reaches them.
-- =========================================================================

alter table public.provider_profiles
  add column if not exists base_address text;

comment on column public.provider_profiles.base_address is
  'Free-text address a helper gives as their base. NOT used for matching — '
  'find_nearby_providers uses current_location, the live reported point. '
  'Kept for records and support.';

-- A helper may write their own, and only their own. provider_profiles
-- already has an owner-scoped update policy from 0001; this grants the
-- column so that policy can reach it.
grant update (base_address) on public.provider_profiles to authenticated;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_name = 'provider_profiles' and column_name = 'base_address'
  ) then
    raise exception 'base_address was not added';
  end if;
  raise notice 'helper base_address ready';
end $$;
