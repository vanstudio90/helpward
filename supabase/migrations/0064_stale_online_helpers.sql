-- CLASS: pre-deploy
-- =========================================================================
-- 0064 — a helper who has gone stale is told, not silently skipped
--
-- find_nearby_providers requires location_updated_at to be inside
-- max_location_age() — 30 minutes. Location comes from
-- navigator.geolocation.watchPosition in the browser, which only runs
-- while the tab is open and focused.
--
-- So: a helper closes the tab, or their phone sleeps, or the permission
-- is refused. Their location goes stale. Dispatch stops offering them
-- work. The toggle still says ONLINE, nothing tells them, and the first
-- they know is that a quiet shift was quiet because they were invisible.
--
-- This marks them offline once their position is older than the window
-- dispatch actually uses, and notifies them. Being told you are offline
-- is recoverable; believing you are online when you are not is not.
--
-- The real fix is a native app with background location, or at minimum a
-- PWA that can hold a service worker. Neither exists. This makes the
-- failure visible in the meantime, which is the part that matters.
-- =========================================================================

alter table provider_profiles
  add column if not exists went_offline_at timestamptz,
  add column if not exists offline_reason text;

create or replace function public.mark_stale_helpers_offline()
returns int
language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  with stale as (
    update provider_profiles pp
       set is_online = false,
           went_offline_at = now(),
           offline_reason = 'location_stale'
     where pp.is_online
       -- Older than the window dispatch uses, so this cannot mark
       -- somebody offline who was still being offered work.
       and (pp.location_updated_at is null
            or pp.location_updated_at < now() - max_location_age())
    returning pp.user_id
  )
  insert into notifications (user_id, type, payload)
  select s.user_id, 'went_offline',
         jsonb_build_object(
           'reason', 'location_stale',
           'detail', 'We stopped receiving your location, so you were not being offered work. Open Helpward and go online again.')
    from stale s;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.mark_stale_helpers_offline() from public, anon, authenticated;
grant execute on function public.mark_stale_helpers_offline() to service_role;

-- Going online clears the stale marker, so the banner does not linger
-- after the helper has fixed it.
create or replace function public.set_online(p_online boolean)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  update provider_profiles
     set is_online = p_online,
         went_offline_at = case when p_online then null else went_offline_at end,
         offline_reason  = case when p_online then null else offline_reason end
   where user_id = auth.uid();
end;
$$;

revoke execute on function public.set_online(boolean) from public, anon;
grant execute on function public.set_online(boolean) to authenticated, service_role;
