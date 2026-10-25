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
-- REVERT: select set_boundary_enforcement('enforced', 'incident closed', '<email>');
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
      message = 'is_placeholder_point() is missing — migration 0038 is not applied.',
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
    'revert', 'apply supabase/migrations/0038_matching_functions.sql'
  )
);

-- Flip the shared setting. Migration 0038's broadcast_request AND the
-- application guard (lib/service-area-check.ts) both read it, so the
-- exception now has one scope instead of two that disagreed. No function
-- body is replaced here: the normal 0038 definition already honours the
-- setting, which means verification and placeholder rejection remain
-- exactly as they are in normal operation.
select set_boundary_enforcement(
  'relaxed',
  current_setting('helpward.rollback_reason', true),
  current_setting('helpward.rollback_owner', true)
);

-- Confirm the two gates that are NOT relaxed are still in place.
do $$
begin
  if to_regprocedure('public.is_placeholder_point(geography)') is null then
    raise exception 'is_placeholder_point() missing — refusing to relax boundaries without it';
  end if;
  if position('pickup_verified' in
      pg_get_functiondef(to_regprocedure('public.broadcast_request(uuid,int)'))) = 0 then
    raise exception 'broadcast_request no longer checks address verification — refusing to relax boundaries';
  end if;
  raise notice 'Boundary enforcement RELAXED. Address verification and placeholder rejection remain enforced.';
  raise notice 'Restore with: select set_boundary_enforcement(''enforced'', ''incident closed'', ''<email>'');';
end $$;
