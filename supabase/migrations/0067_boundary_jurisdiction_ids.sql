-- CLASS: pre-deploy safe. Adds a nullable column, an index and a new
-- function overload. Changes no existing object's behaviour.
--
-- COVERAGE IS A SET OF JURISDICTIONS, NOT A SET OF NAMES.
--
-- service_area_boundaries stored only `municipality`, the normalised
-- display name. Two pairs in the Lower Mainland share one:
--
--     North Vancouver — the CITY and the DISTRICT
--     Langley         — the CITY and the TOWNSHIP
--
-- Each pair is two separate municipalities with separate territory, and
-- the district/township is several times the area of its city. So a
-- dataset containing the City of North Vancouver TWICE was
-- indistinguishable from one containing the City and the District: 17
-- rows, 15 distinct names, nothing missing, nothing invalid.
--
-- 0066's activation check compared normalised names and therefore
-- approved exactly that. An independent audit built the duplicate-city
-- dataset and both activation and preflight reported full coverage, while
-- every address in the District of North Vancouver and the Township of
-- Langley lost coverage — several hundred square kilometres of a launch
-- market, silently.
--
-- The loader has always known the right answer: scripts/lib/jurisdictions
-- defines 17 stable ids and matches each source feature to one using the
-- status word in its name. That id is now persisted, and activation
-- compares the exact SET of ids.
--
-- 0066 is left exactly as applied. Correcting applied history is what the
-- migration runner now refuses, and rightly.

alter table service_area_boundaries
  add column if not exists jurisdiction_id text;

comment on column service_area_boundaries.jurisdiction_id is
  'Stable id from scripts/lib/jurisdictions.mjs. Distinguishes municipalities '
  'that share a display name (North Vancouver city vs district, Langley city '
  'vs township). Null on rows loaded before migration 0067: such a dataset '
  'cannot be activated and must be reloaded from its source.';

-- One polygon per jurisdiction per dataset. This is the constraint that
-- makes a duplicated city impossible rather than merely detectable.
create unique index if not exists service_area_boundaries_dataset_jurisdiction_uq
  on service_area_boundaries (dataset_id, jurisdiction_id)
  where jurisdiction_id is not null;

-- ---------------------------------------------------------------------
-- Activation, by jurisdiction id
-- ---------------------------------------------------------------------
drop function if exists public.activate_boundary_dataset(text, text[]);

create or replace function public.activate_boundary_dataset(
  p_dataset_id text,
  -- The exact set of jurisdiction ids the caller requires. Null is NOT
  -- accepted: activating without a coverage check is how a partial
  -- dataset goes live, and the caller always knows this list.
  p_expected_jurisdiction_ids text[]
)
returns table (
  out_dataset_id        text,
  out_area_id           text,
  out_deactivated       text,
  out_boundary_rows     int,
  out_jurisdictions     int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ds      record;
  v_rows    int;
  v_invalid int;
  v_empty   int;
  v_nullids int;
  v_missing text[];
  v_extra   text[];
  v_prev    text;
begin
  if p_expected_jurisdiction_ids is null
     or array_length(p_expected_jurisdiction_ids, 1) is null then
    raise exception
      'Refusing to activate % without the expected jurisdiction ids', p_dataset_id
      using errcode = 'HW065';
  end if;

  select d.* into v_ds
    from service_area_datasets d
   where d.id = p_dataset_id
   for update;
  if not found then
    raise exception 'No boundary dataset %', p_dataset_id using errcode = 'HW060';
  end if;

  select count(*),
         count(*) filter (where b.boundary is null
                            or not st_isvalid(b.boundary::geometry)),
         count(*) filter (where b.boundary is not null
                            and st_isempty(b.boundary::geometry)),
         count(*) filter (where b.jurisdiction_id is null)
    into v_rows, v_invalid, v_empty, v_nullids
    from service_area_boundaries b
   where b.dataset_id = p_dataset_id;

  if v_rows = 0 then
    raise exception 'Dataset % has no boundary rows; refusing to activate it', p_dataset_id
      using errcode = 'HW061';
  end if;
  if v_invalid > 0 or v_empty > 0 then
    raise exception
      'Dataset % has % invalid and % empty geometries; st_covers would match nothing',
      p_dataset_id, v_invalid, v_empty
      using errcode = 'HW062';
  end if;
  if v_nullids > 0 then
    raise exception
      'Dataset % has % row(s) with no jurisdiction_id. It predates migration 0067, '
      'so its coverage cannot be verified by jurisdiction — reload it from source.',
      p_dataset_id, v_nullids
      using errcode = 'HW066';
  end if;
  if v_ds.feature_count is not null and v_ds.feature_count <> v_rows then
    raise exception
      'Dataset % is incomplete: feature_count is % but % boundary rows exist',
      p_dataset_id, v_ds.feature_count, v_rows
      using errcode = 'HW063';
  end if;

  -- EXACT set comparison, both directions. Missing means a market loses
  -- coverage; unexpected means we are dispatching somewhere nobody
  -- approved.
  select array_agg(want order by want) into v_missing
    from unnest(p_expected_jurisdiction_ids) as want
   where not exists (
     select 1 from service_area_boundaries b
      where b.dataset_id = p_dataset_id and b.jurisdiction_id = want);

  select array_agg(distinct b.jurisdiction_id order by b.jurisdiction_id) into v_extra
    from service_area_boundaries b
   where b.dataset_id = p_dataset_id
     and not (b.jurisdiction_id = any (p_expected_jurisdiction_ids));

  if v_missing is not null and array_length(v_missing, 1) > 0 then
    raise exception
      'Dataset % is missing required jurisdiction(s): %',
      p_dataset_id, array_to_string(v_missing, ', ')
      using errcode = 'HW064';
  end if;
  if v_extra is not null and array_length(v_extra, 1) > 0 then
    raise exception
      'Dataset % covers unapproved jurisdiction(s): %',
      p_dataset_id, array_to_string(v_extra, ', ')
      using errcode = 'HW067';
  end if;

  select d.id into v_prev
    from service_area_datasets d
   where d.area_id = v_ds.area_id and d.is_active and d.id <> p_dataset_id
   limit 1;

  update service_area_datasets d
     set is_active = false
   where d.area_id = v_ds.area_id and d.is_active and d.id <> p_dataset_id;

  update service_area_datasets d
     set is_active = true
   where d.id = p_dataset_id;

  return query select
    p_dataset_id, v_ds.area_id, v_prev, v_rows,
    array_length(p_expected_jurisdiction_ids, 1);
end;
$$;

revoke execute on function
  public.activate_boundary_dataset(text, text[]) from public, anon, authenticated;
grant execute on function
  public.activate_boundary_dataset(text, text[]) to service_role;

comment on function public.activate_boundary_dataset(text, text[]) is
  'Validates a boundary dataset by exact jurisdiction-id set and swaps it in '
  'atomically. Replaces the name-based check from 0066, which could not tell '
  'the City of North Vancouver from the District and so approved a dataset '
  'containing the city twice.';

-- ---------------------------------------------------------------------
-- Loading, with the jurisdiction id
-- ---------------------------------------------------------------------
-- A new 5-argument overload rather than a change to the 4-argument one,
-- so the existing function keeps working for anything that still calls
-- it and this migration stays pre-deploy safe.
create or replace function public.insert_service_area_boundary(
  p_dataset_id      text,
  p_area_id         text,
  p_municipality    text,
  p_jurisdiction_id text,
  p_geojson         text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_jurisdiction_id is null or btrim(p_jurisdiction_id) = '' then
    raise exception 'jurisdiction_id is required' using errcode = 'HW068';
  end if;
  -- Same cast as the 4-argument original: the column is
  -- geometry(MultiPolygon, 4326), not geography. st_covers in
  -- is_point_serviceable casts the stored value when it compares.
  insert into service_area_boundaries
    (dataset_id, area_id, municipality, jurisdiction_id, boundary)
  values (
    p_dataset_id, p_area_id, p_municipality, p_jurisdiction_id,
    st_multi(st_setsrid(st_geomfromgeojson(p_geojson), 4326))::geometry(MultiPolygon, 4326)
  );
end;
$$;

revoke execute on function
  public.insert_service_area_boundary(text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function
  public.insert_service_area_boundary(text, text, text, text, text) to service_role;
