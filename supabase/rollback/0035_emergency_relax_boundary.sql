-- ============================================================================
-- EMERGENCY OVERRIDE — RELAXES BOUNDARY CONTAINMENT ONLY
--
-- It does NOT relax address verification, and it CANNOT dispatch placeholder
-- or otherwise unverified locations. There is no override in this codebase
-- that can.
-- ============================================================================
--
-- HISTORY OF THIS FILE (kept deliberately, because the mistake matters)
--
-- Draft 1 restored the permissive pre-0035 broadcast_request so an
-- application rollback would "work". Rejected: it bypassed address
-- verification to make rollback appear successful.
--
-- Draft 2 relaxed the geocode_verified gate while keeping boundary
-- containment, on the reasoning that geography still constrained the blast
-- radius. **That reasoning was wrong.** The legacy placeholder coordinate is
-- (-123.1207, 49.2827) — downtown Vancouver, inside an approved launch
-- municipality. Every one of the 53 legacy placeholder rows would have
-- passed the boundary check as 'serviceable'. Boundary containment cannot
-- protect against a coordinate that is geographically plausible and
-- factually wrong, and an audit trail naming an owner and a reason records
-- accountability — it does not establish that a location is correct.
--
-- This draft inverts it. The override relaxes the check that can actually
-- fail spuriously (boundary containment), and leaves untouched the two
-- checks that establish the address is real:
--
--   * addresses.geocode_verified must be true           — NOT overridable
--   * is_placeholder_point() must be false              — NOT overridable
--
-- A verified address has real Mapbox-confirmed coordinates for a real
-- street address. Relaxing only the polygon widens the GEOGRAPHY we are
-- willing to serve, which is a commercial decision. It never sends a helper
-- to a coordinate nobody confirmed.
--
-- ----------------------------------------------------------------------------
-- WHEN THIS IS LEGITIMATE
--
-- A confirmed fault in boundary containment — is_point_serviceable()
-- refusing addresses that are genuinely inside a launch city (a bad dataset
-- load, a dropped exclave, a projection error) — is blocking bookings, and
-- reloading a correct dataset is not immediately possible.
--
-- It is NOT legitimate for: an application rollback (recover by rolling
-- forward), unremediated legacy addresses (run the backfill), or a region we
-- have not launched (that is a launch decision, not an incident).
--
-- PRODUCTION AVAILABILITY: this file must not be applied to production until
-- the condition above has been reviewed and signed off. Nothing here is
-- applied automatically; it requires a deliberate psql run with a recorded
-- reason and owner.
--
-- USAGE (psql):
--   select set_config('helpward.rollback_reason', 'incident-1234: boundary
--     dataset dropped the San Pedro exclave, LA bookings refused', false),
--          set_config('helpward.rollback_owner',  'name@helpward.com', false);
--   \i supabase/rollback/0035_emergency_relax_boundary.sql
--
-- REVERT: re-apply supabase/migrations/0035_matching_functions.sql.
-- ============================================================================

do $$
begin
  if coalesce(current_setting('helpward.rollback_reason', true), '') = ''
     or coalesce(current_setting('helpward.rollback_owner', true), '') = '' then
    raise exception using
      message = 'Refusing to relax boundary containment without a recorded reason and owner.',
      hint    = 'select set_config(''helpward.rollback_reason'', ''<incident + why>'', false), set_config(''helpward.rollback_owner'', ''<email>'', false); then re-run.';
  end if;
end $$;

-- Refuse outright if the verification gate is not in place to back us up.
-- Relaxing geography is only tolerable while address verification holds.
do $$
begin
  if to_regprocedure('public.is_placeholder_point(geography)') is null then
    raise exception using
      message = 'is_placeholder_point() is missing — migration 0035 is not applied.',
      hint    = 'This override is only safe on top of the verification gates it preserves. Apply 0035 first.';
  end if;
end $$;

insert into audit_log (actor_id, action, target_table, target_id, payload)
values (
  null,
  'EMERGENCY_RELAX_BOUNDARY_CONTAINMENT',
  'broadcast_request',
  null,
  jsonb_build_object(
    'reason', current_setting('helpward.rollback_reason', true),
    'owner',  current_setting('helpward.rollback_owner', true),
    'at',     now(),
    'relaxed', 'municipal boundary containment only',
    'still_enforced', jsonb_build_array(
      'addresses.geocode_verified must be true',
      'is_placeholder_point() must be false'
    ),
    'revert', 'apply supabase/migrations/0035_matching_functions.sql'
  )
);

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

  if not found then return 0; end if;

  if v_request.pickup_loc is null then
    perform record_dispatch_refusal(p_request_id, 'no_pickup_location', null);
    return 0;
  end if;

  -- NOT RELAXED. An unverified address is never dispatchable, under any
  -- override. This is the gate an application rollback cannot satisfy, and
  -- that is intentional: recover by rolling forward.
  if coalesce(v_request.pickup_verified, false) = false then
    perform record_dispatch_refusal(
      p_request_id, 'address_unverified',
      'refused under emergency boundary override: address verification is never relaxed'
    );
    return 0;
  end if;

  -- NOT RELAXED. The placeholder is inside an approved municipality, so the
  -- boundary check we are about to skip would not have caught it either.
  if is_placeholder_point(v_request.pickup_loc) then
    perform record_dispatch_refusal(
      p_request_id, 'address_placeholder',
      'refused under emergency boundary override: placeholder coordinates are never dispatchable'
    );
    return 0;
  end if;

  -- RELAXED: boundary containment. Recorded on every occurrence so the
  -- geographic blast radius is measurable afterwards.
  v_boundary := is_point_serviceable(v_request.pickup_loc);
  if v_boundary <> 'serviceable' then
    perform record_dispatch_refusal(
      p_request_id,
      case when v_boundary = 'no_dataset' then 'boundary_no_dataset' else 'boundary_outside' end,
      'DISPATCHED ANYWAY under emergency boundary override — address is verified and non-placeholder, but outside active boundaries'
    );
    -- fall through deliberately
  end if;

  insert into match_attempts (request_id, provider_id, distance_km, rank_score)
  select p_request_id, p.provider_id, p.distance_km, p.rank_score
  from find_nearby_providers(v_request.service_id, v_request.pickup_loc, p_radius_km, 5) p;

  get diagnostics v_count = row_count;

  if v_count = 0 then
    perform record_dispatch_refusal(p_request_id, 'no_eligible_helper', null);
    return 0;
  end if;

  insert into notifications (user_id, type, payload)
  select provider_id, 'new_request_offered', jsonb_build_object(
    'request_id', p_request_id, 'service_id', v_request.service_id
  )
  from match_attempts where request_id = p_request_id;

  return v_count;
end;
$$;

grant execute on function public.broadcast_request(uuid, int) to authenticated, service_role;
