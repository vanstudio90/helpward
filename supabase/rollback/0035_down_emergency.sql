-- ============================================================================
-- EMERGENCY ONLY — REINSTATES DISPATCH TO UNVERIFIED COORDINATES
-- ============================================================================
--
-- DO NOT RUN THIS AS PART OF A ROUTINE ROLLBACK.
--
-- An earlier draft of this file restored the permissive pre-0035
-- broadcast_request so that an application rollback would "work". That was
-- wrong, and the launch review rejected it: it bypasses address verification
-- to make rollback appear successful, and it would re-enable dispatch to the
-- legacy downtown-Vancouver placeholder coordinates — sending helpers to an
-- address nobody lives at.
--
-- THE CORRECT ROLLBACK POSTURE
--
-- Address verification is a safety requirement, not a feature flag. An
-- application release that cannot produce verified addresses must not be
-- dispatching tasks. Therefore:
--
--   * Rolling the application back does NOT require reverting 0035.
--   * With 0035 in place and old code running, every request is refused,
--     each refusal is recorded in dispatch_refusals with reason
--     'address_unverified', and every admin is notified. The failure is
--     loud and actionable by design — that is the intended behaviour, not
--     a defect to be patched away.
--   * The recovery path is to roll FORWARD (redeploy the verifying release)
--     and run the address backfill, not to weaken the gate.
--
-- See supabase/rollback/ROLLBACK.md for the full runbook.
--
-- ----------------------------------------------------------------------------
-- WHEN THIS FILE IS LEGITIMATE
--
-- Exactly one scenario: a confirmed fault in the verification path itself
-- (e.g. is_point_serviceable wrongly refusing valid addresses) is blocking
-- all bookings, roll-forward is not available, and an accountable owner has
-- decided to accept dispatch-to-unverified-coordinates as the lesser risk
-- for a bounded window.
--
-- That decision must be recorded. This script refuses to run unless the
-- operator supplies it.
--
-- USAGE (psql):
--   \set reason 'incident-1234: is_point_serviceable rejecting all BC addresses'
--   \set owner  'name@helpward.com'
--   \i supabase/rollback/0035_down_emergency.sql
-- ============================================================================

do $$
begin
  if coalesce(current_setting('helpward.rollback_reason', true), '') = ''
     or coalesce(current_setting('helpward.rollback_owner', true), '') = '' then
    raise exception using
      message = 'Refusing to disable address verification without a recorded reason and owner.',
      hint    = 'Run: select set_config(''helpward.rollback_reason'', ''<incident + why>'', false), set_config(''helpward.rollback_owner'', ''<email>'', false); then re-run this script.';
  end if;
end $$;

-- Permanent record, written BEFORE the gate comes down.
insert into audit_log (actor_id, action, target_table, target_id, payload)
values (
  null,
  'EMERGENCY_DISABLE_ADDRESS_VERIFICATION',
  'broadcast_request',
  null,
  jsonb_build_object(
    'reason', current_setting('helpward.rollback_reason', true),
    'owner',  current_setting('helpward.rollback_owner', true),
    'at',     now(),
    'effect', 'broadcast_request will dispatch to addresses whose geocode_verified is false, including legacy placeholder coordinates',
    'revert', 'apply supabase/migrations/0035_matching_functions.sql'
  )
);

-- Degraded broadcast: keeps the boundary check and keeps recording
-- refusals, but accepts unverified addresses. It does NOT restore
-- placeholder geocoding and does NOT revert the application-side guard,
-- which still refuses to CREATE an unverified address.
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

  -- VERIFICATION GATE DELIBERATELY DEGRADED. Still recorded on every
  -- occurrence so the blast radius is measurable afterwards.
  if coalesce(v_request.pickup_verified, false) = false then
    perform record_dispatch_refusal(
      p_request_id, 'address_unverified',
      'DISPATCHED ANYWAY under emergency override — coordinates are unverified and may be a legacy placeholder'
    );
  end if;

  -- Boundary containment is NOT relaxed. An unverified coordinate that is
  -- also outside every launch boundary stays undispatchable.
  v_boundary := is_point_serviceable(v_request.pickup_loc);
  if v_boundary <> 'serviceable' then
    perform record_dispatch_refusal(
      p_request_id,
      case when v_boundary = 'no_dataset' then 'boundary_no_dataset' else 'boundary_outside' end,
      'refused under emergency override: boundary check is not relaxed'
    );
    return 0;
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
