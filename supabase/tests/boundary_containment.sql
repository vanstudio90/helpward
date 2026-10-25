-- Inside/outside boundary test — RETAINED per the launch review.
--
-- This is the test the earlier acceptance run proposed striking because the
-- implementation could not satisfy it. That was the wrong direction: it
-- would have weakened the city-limits requirement to fit the code. The
-- implementation now has polygon containment (migration 0033), so the test
-- stays and the code has to pass it.
--
-- STATUS: NOT YET EXECUTED. Requires the isolated environment with
-- migrations applied and an official boundary dataset loaded and active.
-- Run during rehearsal step R4/R5 (see supabase/rollback/ROLLBACK.md).
--
-- USAGE (psql, against the isolated environment):
--   \i supabase/tests/boundary_containment.sql
--
-- Every assertion raises on failure, so the script aborts at the first
-- problem and a clean run means every case passed.

\set ON_ERROR_STOP on

do $$
declare
  v_active int;
begin
  select count(*) into v_active from service_area_datasets where is_active;
  if v_active = 0 then
    raise exception 'No active boundary dataset. Load one before running this test (docs/BOUNDARY-DATASETS.md).';
  end if;
  raise notice 'Active boundary datasets: %', v_active;
end $$;

-- ---------------------------------------------------------------------------
-- Helper: assert is_point_serviceable() for a labelled point.
-- ---------------------------------------------------------------------------
create or replace function pg_temp.expect_verdict(
  p_label text, p_lng double precision, p_lat double precision, p_expected text
) returns void language plpgsql as $$
declare
  v text;
begin
  v := is_point_serviceable(st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography);
  if v <> p_expected then
    raise exception 'FAIL % (%, %): expected %, got %', p_label, p_lng, p_lat, p_expected, v;
  end if;
  raise notice 'PASS %  ->  %', p_label, v;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Deep inside each launch area — must be serviceable.
--    Replace coordinates with addresses verified against the loaded dataset.
-- ---------------------------------------------------------------------------
select pg_temp.expect_verdict('downtown Vancouver, BC',    -123.1207, 49.2827, 'serviceable');
select pg_temp.expect_verdict('downtown Los Angeles, CA',  -118.2437, 34.0522, 'serviceable');
select pg_temp.expect_verdict('downtown San Diego, CA',    -117.1611, 32.7157, 'serviceable');

-- ---------------------------------------------------------------------------
-- 2. Clearly outside — must be refused.
-- ---------------------------------------------------------------------------
select pg_temp.expect_verdict('Abbotsford, BC (excluded municipality)', -122.3045, 49.0504, 'outside_boundary');
select pg_temp.expect_verdict('Santa Monica, CA (adjacent city)',       -118.4912, 34.0195, 'outside_boundary');
select pg_temp.expect_verdict('Tijuana, MX (outside both countries)',   -117.0382, 32.5149, 'outside_boundary');

-- ---------------------------------------------------------------------------
-- 3. IMMEDIATELY inside vs immediately outside a boundary.
--
-- Paired points are derived from ONE selected real boundary segment and
-- are verified to be the intended distance from it, so this genuinely
-- tests edge behaviour. The earlier version took ST_PointOnSurface of the
-- whole negatively-buffered polygon, which can sit deep in the interior —
-- it would have passed even if containment eroded a wide strip near the
-- edge.
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
  v_edge geometry;
  v_pt geometry;          -- a point ON the boundary
  v_in geometry;
  v_out geometry;
  v_din double precision;
  v_dout double precision;
  v_vin text;
  v_vout text;
  v_tol constant double precision := 25.0;  -- metres either side
begin
  for r in
    select b.area_id, b.municipality, b.boundary
    from service_area_boundaries b
    join service_area_datasets d on d.id = b.dataset_id and d.is_active
    where b.id in (
      select min(b2.id) from service_area_boundaries b2
      join service_area_datasets d2 on d2.id = b2.dataset_id and d2.is_active
      group by b2.area_id
    )
  loop
    v_edge := st_boundary(r.boundary);
    -- A concrete point on the edge, then step perpendicular by walking
    -- along the inward/outward normals that ST_Buffer produces locally.
    v_pt := st_lineinterpolatepoint(
              st_geometryn(st_multi(st_linemerge(v_edge)), 1), 0.5);

    -- Nearest interior/exterior points at the requested offset, found by
    -- intersecting a small circle around the edge point with the polygon
    -- and its complement.
    v_in := st_pointonsurface(
              st_intersection(st_buffer(v_pt::geography, v_tol)::geometry, r.boundary));
    v_out := st_pointonsurface(
              st_difference(st_buffer(v_pt::geography, v_tol)::geometry, r.boundary));

    if v_in is null or st_isempty(v_in) or v_out is null or st_isempty(v_out) then
      raise exception 'Could not derive a paired inside/outside point for % (%)', r.municipality, r.area_id;
    end if;

    -- Verify the pair really does straddle the edge, independently.
    v_din  := st_distance(v_in::geography,  v_edge::geography);
    v_dout := st_distance(v_out::geography, v_edge::geography);
    if v_din > v_tol or v_dout > v_tol then
      raise exception 'FAIL % (%): derived points are not within %m of the boundary (in=%m out=%m)',
        r.municipality, r.area_id, v_tol, round(v_din::numeric, 1), round(v_dout::numeric, 1);
    end if;
    if not st_covers(r.boundary, v_in) then
      raise exception 'FAIL % (%): the "inside" point is not inside the polygon', r.municipality, r.area_id;
    end if;
    if st_covers(r.boundary, v_out) then
      raise exception 'FAIL % (%): the "outside" point is inside the polygon', r.municipality, r.area_id;
    end if;

    v_vin  := is_point_serviceable(v_in::geography);
    v_vout := is_point_serviceable(v_out::geography);

    if v_vin <> 'serviceable' then
      raise exception 'FAIL % (%): point %sm INSIDE the boundary returned %',
        r.municipality, r.area_id, round(v_din::numeric, 1), v_vin;
    end if;
    raise notice 'PASS % (%): %sm inside  -> serviceable', r.municipality, r.area_id, round(v_din::numeric, 1);

    -- A point just outside may legitimately fall inside an ADJACENT
    -- approved municipality (Vancouver and Burnaby share a border), which
    -- is correctly serviceable. Only assert the strict case.
    if point_service_area(v_out::geography) is null then
      if v_vout <> 'outside_boundary' then
        raise exception 'FAIL % (%): point %sm OUTSIDE all boundaries returned %',
          r.municipality, r.area_id, round(v_dout::numeric, 1), v_vout;
      end if;
      raise notice 'PASS % (%): %sm outside -> outside_boundary', r.municipality, r.area_id, round(v_dout::numeric, 1);
    else
      raise notice 'SKIP % (%): the outside point falls in adjacent approved municipality %',
        r.municipality, r.area_id, point_service_area(v_out::geography);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Exclaves survived the load. A city with non-contiguous territory must
--    be stored as MultiPolygon; loading only the largest ring silently drops
--    neighbourhoods that are genuinely inside city limits.
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select b.municipality, st_numgeometries(b.boundary) as parts
    from service_area_boundaries b
    join service_area_datasets d on d.id = b.dataset_id and d.is_active
    where b.municipality in ('Los Angeles', 'San Diego')
  loop
    raise notice 'INFO % has % polygon part(s)', r.municipality, r.parts;
    if r.parts < 2 then
      raise warning 'REVIEW: % loaded as a single polygon. Both cities have non-contiguous territory — confirm the source file was not simplified to its largest ring.', r.municipality;
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Fail-closed: deactivating every dataset must stop dispatch, not fall
--    back to the preliminary municipality-name check.
-- ---------------------------------------------------------------------------
do $$
declare v text;
begin
  create temp table _saved_active as
    select id from service_area_datasets where is_active;

  update service_area_datasets set is_active = false where is_active;

  v := is_point_serviceable(st_setsrid(st_makepoint(-123.1207, 49.2827), 4326)::geography);
  if v <> 'no_dataset' then
    update service_area_datasets set is_active = true
      where id in (select id from _saved_active);
    raise exception 'FAIL fail-closed: with no active dataset, downtown Vancouver returned % (expected no_dataset)', v;
  end if;
  raise notice 'PASS fail-closed: no active dataset -> no_dataset';

  update service_area_datasets set is_active = true
    where id in (select id from _saved_active);
  drop table _saved_active;
end $$;

select 'boundary_containment.sql: all assertions passed' as result;

-- ---------------------------------------------------------------------------
-- 6. The placeholder coordinate must be refused even though it is inside an
--    approved municipality.
--
-- This is the case boundary containment cannot catch, and the reason
-- is_placeholder_point() exists as an independent, non-overridable gate.
-- ---------------------------------------------------------------------------
do $$
declare
  v_verdict text;
  v_is_placeholder boolean;
begin
  v_verdict := is_point_serviceable(
    st_setsrid(st_makepoint(-123.1207, 49.2827), 4326)::geography);
  v_is_placeholder := is_placeholder_point(
    st_setsrid(st_makepoint(-123.1207, 49.2827), 4326)::geography);

  -- Containment SAYS YES. That is the whole point.
  if v_verdict <> 'serviceable' then
    raise warning 'Unexpected: the placeholder point is not inside the loaded Vancouver boundary (got %). Check the dataset — this assertion assumes it is, which is why the placeholder guard is needed.', v_verdict;
  else
    raise notice 'CONFIRMED: placeholder point IS serviceable by boundary containment — geography alone cannot reject it';
  end if;

  if not v_is_placeholder then
    raise exception 'FAIL: is_placeholder_point() did not recognise the legacy placeholder coordinate';
  end if;
  raise notice 'PASS: is_placeholder_point() rejects it independently of geography';

  -- A real coordinate nearby must not be swept up.
  if is_placeholder_point(st_setsrid(st_makepoint(-123.1297, 49.2190), 4326)::geography) then
    raise exception 'FAIL: is_placeholder_point() false-positived on a genuine nearby coordinate';
  end if;
  raise notice 'PASS: a genuine nearby coordinate is not flagged';
end $$;

-- ---------------------------------------------------------------------------
-- 7. EXECUTE broadcast_request against a wrongly-verified placeholder row.
--
-- The earlier version inspected pg_get_functiondef for the string
-- "is_placeholder_point", which would also have passed if the guard
-- appeared only in a comment or an unreachable branch. This runs the real
-- function in a transaction that is rolled back, so it proves behaviour.
-- ---------------------------------------------------------------------------
do $$
declare
  v_customer uuid;
  v_service  text;
  v_addr     uuid;
  v_req      uuid;
  v_count    int;
  v_reason   text;
begin
  select id into v_customer from profiles where role = 'customer' limit 1;
  select id into v_service from services where active limit 1;
  if v_customer is null or v_service is null then
    raise exception 'Need at least one customer profile and one active service to run this fixture';
  end if;

  -- Placeholder coordinates, DELIBERATELY marked verified — the exact
  -- state a buggy backfill would leave behind.
  insert into addresses (user_id, formatted, location, country, geocode_verified)
  values (v_customer, 'FIXTURE — placeholder, wrongly verified',
          st_setsrid(st_makepoint(-123.1207, 49.2827), 4326)::geography, 'CA', true)
  returning id into v_addr;

  insert into requests (customer_id, service_id, pickup_address_id,
                        estimated_price_cents, estimated_duration_min, status)
  values (v_customer, v_service, v_addr, 2450, 45, 'matching')
  returning id into v_req;

  v_count := broadcast_request(v_req, 20);

  if v_count <> 0 then
    raise exception 'FAIL: broadcast_request dispatched a wrongly-verified placeholder address (% offers)', v_count;
  end if;

  select reason into v_reason from dispatch_refusals
   where request_id = v_req order by created_at desc limit 1;
  if v_reason is distinct from 'address_placeholder' then
    raise exception 'FAIL: expected refusal reason address_placeholder, got %', coalesce(v_reason, '<none>');
  end if;

  if exists (select 1 from match_attempts where request_id = v_req) then
    raise exception 'FAIL: match_attempts were created for a placeholder address';
  end if;

  raise notice 'PASS: wrongly-verified placeholder refused with reason address_placeholder, no match_attempts';

  -- Roll the fixture back.
  raise exception using errcode = 'HW000', message = '__fixture_rollback__';
exception
  when sqlstate 'HW000' then
    raise notice 'fixture rolled back';
end $$;

select 'placeholder guard assertions passed' as result;
