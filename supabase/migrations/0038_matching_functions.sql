-- DEPLOY-COUPLED — apply only WITH or AFTER the matching application
-- release, never before.
--
-- DEPENDS ON 0033 (is_point_serviceable), 0034 (record_dispatch_refusal)
-- and 0037 (boundary_enforcement_mode). Must be applied after all three.
--
-- NOT BACKWARD COMPATIBLE. broadcast_request below refuses to dispatch a
-- request whose pickup address is not geocode_verified. The previous
-- application code never set that column, so running this migration against
-- the old release silently stops ALL dispatch (broadcast returns 0 and no
-- helper is ever offered a task). See supabase/rollback/0032_down.sql for
-- the revert, which MUST be run if the application is rolled back.
--
-- Fixes three matching defects:
--   1. find_nearby_providers ignored provider_profiles.service_radius_km and
--      used only the caller's p_radius_km (always 20), so a helper who
--      configured a 5 km radius still got offers 20 km away.
--   2. current_location had no freshness requirement, so a helper who went
--      online once months ago still looked dispatchable at a stale point.
--   3. broadcast_request would dispatch an unverified placeholder address.

create or replace function public.find_nearby_providers(
  p_service_id text,
  p_pickup geography,
  p_radius_km int default 20,
  p_limit int default 5
) returns table (
  provider_id uuid,
  distance_km numeric,
  rating_avg numeric,
  rank_score numeric
)
language sql stable as $$
  select
    pp.user_id as provider_id,
    round((st_distance(pp.current_location, p_pickup) / 1000.0)::numeric, 2) as distance_km,
    pp.rating_avg,
    (1.0 / greatest(st_distance(pp.current_location, p_pickup) / 1000.0, 0.5)) * 0.5
    + coalesce(pp.rating_avg / 5.0, 0.7) * 0.3
    + (case when pp.tasks_completed > 50 then 0.2 when pp.tasks_completed > 10 then 0.15 else 0.1 end) as rank_score
  from provider_profiles pp
  inner join provider_services ps on ps.provider_id = pp.user_id
  where ps.service_id = p_service_id
    and pp.status = 'approved'
    and pp.is_online = true
    and coalesce(pp.vacation_mode, false) = false
    and pp.current_location is not null
    -- Location must be recent.
    and pp.location_updated_at is not null
    and pp.location_updated_at > now() - max_location_age()
    -- Inside the dispatch radius the caller asked for...
    and st_dwithin(pp.current_location, p_pickup, p_radius_km * 1000)
    -- ...AND inside the radius this helper configured for themselves.
    and st_dwithin(pp.current_location, p_pickup, coalesce(pp.service_radius_km, 20) * 1000)
  order by rank_score desc
  limit p_limit;
$$;

revoke execute on function public.find_nearby_providers(text, geography, int, int) from public;
grant execute on function public.find_nearby_providers(text, geography, int, int) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- is_placeholder_point — the legacy "downtown Vancouver" fallback coordinate.
--
-- This exists because boundary containment CANNOT protect against it. The
-- placeholder is (-123.1207, 49.2827), which is inside the City of Vancouver
-- — an approved launch municipality. So all 53 legacy rows carrying it would
-- pass is_point_serviceable() as 'serviceable'. Geography is the wrong tool
-- for detecting a coordinate that is geographically plausible but factually
-- wrong about where the customer lives.
--
-- Checked UNCONDITIONALLY on every dispatch, independent of
-- geocode_verified, so that a buggy backfill which wrongly marked a
-- placeholder row verified still cannot send a helper to it. No override
-- relaxes this.
-- ---------------------------------------------------------------------------
create or replace function public.is_placeholder_point(p_point geography)
returns boolean
language sql immutable as $$
  select p_point is not null
     and abs(st_x(p_point::geometry) - (-123.1207)) < 0.000001
     and abs(st_y(p_point::geometry) -   49.2827)  < 0.000001;
$$;

revoke execute on function public.is_placeholder_point(geography) from public;
grant execute on function public.is_placeholder_point(geography) to authenticated, service_role;

create or replace function public.broadcast_request(
  p_request_id uuid,
  p_radius_km int default 20
) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_request record;
  v_count int := 0;
  v_boundary text;
begin
  if exists (select 1 from match_attempts where request_id = p_request_id) then
    return 0;
  end if;

  select r.*, a.location as pickup_loc, a.geocode_verified as pickup_verified
  into v_request
  from requests r
  left join addresses a on a.id = r.pickup_address_id
  where r.id = p_request_id;

  if not found then
    return 0;
  end if;

  if v_request.pickup_loc is null then
    perform record_dispatch_refusal(p_request_id, 'no_pickup_location', null);
    return 0;
  end if;

  -- Hard gate: an address that never passed geocode verification is not
  -- dispatchable, whatever coordinates it happens to carry. This is what
  -- stops the legacy downtown-Vancouver placeholder rows from sending a
  -- helper somewhere nobody lives.
  --
  -- It is ALSO the gate that an older application release cannot satisfy,
  -- because it never set this column. Refusals are recorded and admins are
  -- notified precisely so that situation is immediately visible instead of
  -- silently halting all dispatch. See supabase/rollback/ROLLBACK.md.
  if coalesce(v_request.pickup_verified, false) = false then
    perform record_dispatch_refusal(
      p_request_id, 'address_unverified',
      'addresses.geocode_verified is false — written by a release that predates geocode verification, or never remediated by the address backfill'
    );
    return 0;
  end if;

  -- Unconditional, and not overridable. The placeholder sits inside the
  -- City of Vancouver, so the boundary check below would pass it. This is
  -- the only thing standing between a legacy row and a helper being sent to
  -- an address nobody lives at.
  if is_placeholder_point(v_request.pickup_loc) then
    perform record_dispatch_refusal(
      p_request_id, 'address_placeholder',
      'pickup coordinates are the legacy downtown-Vancouver placeholder; the address was never really geocoded'
    );
    return 0;
  end if;

  -- Authoritative boundary containment. Fail-closed: with no active
  -- official boundary dataset we refuse rather than fall back to the
  -- application's preliminary municipality-name match.
  -- Boundary containment, unless a boundary incident is declared. The
  -- application guard reads the same setting, so the emergency scope is
  -- identical in both layers (review finding R08).
  v_boundary := is_point_serviceable(v_request.pickup_loc);
  if boundary_enforcement_mode() = 'relaxed' and v_boundary <> 'serviceable' then
    perform record_dispatch_refusal(
      p_request_id,
      case when v_boundary = 'no_dataset' then 'boundary_no_dataset' else 'boundary_outside' end,
      'DISPATCHED ANYWAY — boundary enforcement relaxed by declared incident; verification and placeholder checks still applied'
    );
    v_boundary := 'serviceable';
  end if;
  if v_boundary = 'no_dataset' then
    perform record_dispatch_refusal(
      p_request_id, 'boundary_no_dataset',
      'no active row in service_area_datasets — official municipal boundaries have not been loaded'
    );
    return 0;
  end if;
  if v_boundary <> 'serviceable' then
    perform record_dispatch_refusal(
      p_request_id, 'boundary_outside',
      'pickup point is outside every active municipal boundary'
    );
    return 0;
  end if;

  insert into match_attempts (request_id, provider_id, distance_km, rank_score)
  select p_request_id, p.provider_id, p.distance_km, p.rank_score
  from find_nearby_providers(v_request.service_id, v_request.pickup_loc, p_radius_km, 5) p;

  get diagnostics v_count = row_count;

  if v_count = 0 then
    -- Ordinary low-supply miss. Recorded for reporting, but deliberately
    -- NOT treated as a configuration fault and never notified.
    perform record_dispatch_refusal(p_request_id, 'no_eligible_helper', null);
    return 0;
  end if;

  insert into notifications (user_id, type, payload)
  select provider_id, 'new_request_offered', jsonb_build_object(
    'request_id', p_request_id,
    'service_id', v_request.service_id
  )
  from match_attempts where request_id = p_request_id;

  return v_count;
end;
$$;

revoke execute on function public.broadcast_request(uuid, int) from public;
grant execute on function public.broadcast_request(uuid, int) to service_role;
