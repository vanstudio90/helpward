-- =========================================================================
-- 0042 — retire the Los Angeles service area
--
-- CLASS: pre-deploy safe. Deletes boundary DATA for one area; touches no
-- schema and no function. Safe to apply before or after the release.
--
-- Owner decision, 2026-10-26: California launch is San Diego only.
--
-- Why this needs a migration at all. Service areas are declared in two
-- places that must agree: lib/service-areas.ts (the preliminary name
-- check, which produces the error copy) and service_area_boundaries (the
-- authoritative polygon check in is_point_serviceable). Removing Los
-- Angeles from the TypeScript alone would leave the polygon loaded, and
-- is_point_serviceable is the check that actually gates dispatch — so an
-- LA address would have been refused by the form and accepted by the
-- database. Deleting the rows is what makes the two agree.
--
-- The dataset row is retired rather than deleted so the provenance record
-- of what was loaded, from where, and when survives.
-- =========================================================================

delete from service_area_boundaries where area_id = 'los-angeles-ca';

update service_area_datasets
   set is_active = false
 where area_id = 'los-angeles-ca';

-- A city can only be reinstated deliberately: re-running the loader for
-- 'los-angeles-ca' is the explicit act, and lib/service-areas.ts plus the
-- "Los Angeles is out of scope" assertions in tests/acceptance-logic.test.ts
-- and tests/regression.test.ts have to be changed in the same breath.
do $$
declare v_left int;
begin
  select count(*) into v_left
    from service_area_boundaries where area_id = 'los-angeles-ca';
  if v_left <> 0 then
    raise exception 'los-angeles-ca still has % boundary rows after delete', v_left;
  end if;
  raise notice 'los-angeles-ca retired: 0 boundary rows remain';
end $$;
