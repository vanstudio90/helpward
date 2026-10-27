-- A helper whose location has gone stale is told, not silently skipped.
--
-- find_nearby_providers requires a position newer than
-- max_location_age(). Position comes from watchPosition in the browser,
-- which only runs while the tab is open — so a helper who closes it
-- keeps an ONLINE toggle, stops being offered work, and learns nothing.
-- The first they know is that a quiet shift was quiet because they were
-- invisible.
--
-- USAGE: node scripts/run-sql-suite.mjs supabase/tests/stale_helpers.sql

\set ON_ERROR_STOP on
begin;

create temp table sh (helper uuid, other uuid);

do $$
declare v_a uuid; v_b uuid;
begin
  select user_id into v_a from provider_profiles order by user_id limit 1;
  select user_id into v_b from provider_profiles where user_id <> v_a order by user_id limit 1;
  if v_b is null then raise exception 'Fixture needs TWO provider profiles'; end if;
  -- Everyone else out of the way, so counts below are about these two.
  update provider_profiles set is_online = false where user_id not in (v_a, v_b);
  insert into sh values (v_a, v_b);
end $$;

-- ---------------------------------------------------------------------------
-- S01 — a stale helper is marked offline and told why
-- ---------------------------------------------------------------------------
do $$
declare r record; v_marked int; v_online boolean; v_reason text; v_notes int;
begin
  select * into r from sh;

  -- One stale, one fresh.
  update provider_profiles
     set is_online = true, location_updated_at = now() - (max_location_age() + interval '15 minutes'),
         went_offline_at = null, offline_reason = null
   where user_id = r.helper;
  update provider_profiles
     set is_online = true, location_updated_at = now(),
         went_offline_at = null, offline_reason = null
   where user_id = r.other;

  v_marked := mark_stale_helpers_offline();

  select is_online, offline_reason into v_online, v_reason
    from provider_profiles where user_id = r.helper;
  if v_online then
    raise exception 'FAIL S01 a helper with a stale position stayed online';
  end if;
  if v_reason is distinct from 'location_stale' then
    raise exception 'FAIL S01 no reason recorded (got %)', v_reason;
  end if;

  select count(*) into v_notes from notifications
   where user_id = r.helper and type = 'went_offline';
  if v_notes = 0 then
    raise exception 'FAIL S01 the helper was marked offline and never told';
  end if;
  raise notice 'PASS S01 a stale helper goes offline, with a reason and a notification';

  -- CONTROL: the fresh helper is untouched, so this is the staleness
  -- check and not a sweep that takes everyone offline.
  select is_online into v_online from provider_profiles where user_id = r.other;
  if not v_online then
    raise exception 'FAIL S02 a helper with a CURRENT position was marked offline';
  end if;
  raise notice 'PASS S02 a helper with a current position is left alone (control)';
end $$;

-- ---------------------------------------------------------------------------
-- S03 — the threshold matches the one dispatch actually uses
-- ---------------------------------------------------------------------------
-- If the sweep were stricter than max_location_age() it would take
-- helpers offline who were still being offered work.
do $$
declare r record; v_online boolean;
begin
  select * into r from sh;
  update provider_profiles
     set is_online = true,
         location_updated_at = now() - (max_location_age() - interval '1 minute'),
         went_offline_at = null, offline_reason = null
   where user_id = r.helper;

  perform mark_stale_helpers_offline();

  select is_online into v_online from provider_profiles where user_id = r.helper;
  if not v_online then
    raise exception 'FAIL S03 a helper still INSIDE the dispatch window was marked offline';
  end if;
  raise notice 'PASS S03 a helper inside the dispatch window stays online';
end $$;

-- ---------------------------------------------------------------------------
-- S04 — going back online clears the marker
-- ---------------------------------------------------------------------------
do $$
declare r record; v_reason text; v_went timestamptz;
begin
  select * into r from sh;
  update provider_profiles set is_online = false, offline_reason = 'location_stale',
         went_offline_at = now()
   where user_id = r.helper;

  perform set_config('request.jwt.claims',
    json_build_object('sub', r.helper::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform set_online(true);
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  select offline_reason, went_offline_at into v_reason, v_went
    from provider_profiles where user_id = r.helper;
  if v_reason is not null or v_went is not null then
    raise exception 'FAIL S04 the stale banner survived going back online';
  end if;
  raise notice 'PASS S04 going online clears the marker';
end $$;

-- ---------------------------------------------------------------------------
-- S05 — nobody can take another helper offline
-- ---------------------------------------------------------------------------
do $$
declare r record; v_online boolean;
begin
  select * into r from sh;
  update provider_profiles set is_online = true where user_id = r.other;

  perform set_config('request.jwt.claims',
    json_build_object('sub', r.helper::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform set_online(false);          -- only ever affects the caller
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  select is_online into v_online from provider_profiles where user_id = r.other;
  if not v_online then
    raise exception 'FAIL S05 set_online took a DIFFERENT helper offline';
  end if;
  raise notice 'PASS S05 set_online only ever affects the caller';
end $$;

rollback;
