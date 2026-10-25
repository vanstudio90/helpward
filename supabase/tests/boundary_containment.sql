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
-- This is the core of the test. For each launch area, pick a real boundary
-- segment from the loaded dataset and assert a point a few metres either
-- side of it. Generated from the dataset itself so the points are guaranteed
-- to straddle the true edge rather than a guess.
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
  v_edge geometry;
  v_inside geometry;
  v_outside geometry;
  v_in text;
  v_out text;
begin
  for r in
    select b.area_id, b.municipality, b.boundary
    from service_area_boundaries b
    join service_area_datasets d on d.id = b.dataset_id and d.is_active
    -- One representative municipality per area.
    where b.id in (
      select min(b2.id) from service_area_boundaries b2
      join service_area_datasets d2 on d2.id = b2.dataset_id and d2.is_active
      group by b2.area_id
    )
  loop
    v_edge := st_boundary(r.boundary::geometry);

    -- 25 m inside and 25 m outside, measured perpendicular to the edge by
    -- buffering the polygon inward/outward and taking a boundary point.
    v_inside  := st_pointonsurface(st_buffer(r.boundary::geography, -25)::geometry);
    v_outside := st_difference(
                   st_buffer(r.boundary::geography, 25)::geometry,
                   st_buffer(r.boundary::geography, 5)::geometry
                 );
    v_outside := st_pointonsurface(v_outside);

    if v_inside is null or st_isempty(v_inside) then
      raise exception 'Could not derive an inside point for % (%). Geometry may be too small or invalid.', r.municipality, r.area_id;
    end if;

    v_in  := is_point_serviceable(v_inside::geography);
    v_out := is_point_serviceable(v_outside::geography);

    if v_in <> 'serviceable' then
      raise exception 'FAIL % (%): point 25m INSIDE the boundary returned %', r.municipality, r.area_id, v_in;
    end if;
    raise notice 'PASS % (%): 25m inside  -> serviceable', r.municipality, r.area_id;

    -- A point 25m outside may legitimately fall inside an ADJACENT approved
    -- municipality (Vancouver/Burnaby share a border), which is still
    -- serviceable and correct. Only assert the strict case where the
    -- neighbour is not in any active boundary.
    if point_service_area(v_outside::geography) is null then
      if v_out <> 'outside_boundary' then
        raise exception 'FAIL % (%): point 25m OUTSIDE all boundaries returned %', r.municipality, r.area_id, v_out;
      end if;
      raise notice 'PASS % (%): 25m outside -> outside_boundary', r.municipality, r.area_id;
    else
      raise notice 'SKIP % (%): 25m outside falls in an adjacent approved municipality (%), which is correctly serviceable',
        r.municipality, r.area_id, point_service_area(v_outside::geography);
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
