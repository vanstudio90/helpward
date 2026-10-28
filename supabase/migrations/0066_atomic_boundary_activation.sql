-- CLASS: pre-deploy safe. Adds one function; changes no existing object.
--
-- ATOMIC BOUNDARY ACTIVATION.
--
-- scripts/load-boundaries.mjs activated a dataset with two separate
-- PostgREST PATCH calls: deactivate the area's current dataset, then
-- activate the new one. Between those two requests the area has NO active
-- dataset, and is_point_serviceable (0033) fail-closes to 'no_dataset'
-- when none is active — so every address in that market is refused and no
-- booking can be created.
--
-- If the second request fails, it stays that way. An independent audit
-- injected exactly that failure and the previous dataset remained
-- deactivated: a boundary replacement turning into an outage, with the
-- market quietly closed until somebody noticed.
--
-- Two HTTP calls cannot be made atomic from the client. One function can:
-- a plpgsql function body runs inside the calling statement's
-- transaction, so either the swap happens completely or not at all.
--
-- It also VALIDATES before it swaps. Activating a dataset whose polygons
-- are missing, empty or invalid replaces working coverage with coverage
-- that matches nothing — which looks identical to an outage and is harder
-- to diagnose, because a dataset is active.

-- Dropped first: `create or replace` cannot change a function's return
-- type, and this migration is re-runnable by design.
drop function if exists public.activate_boundary_dataset(text, text[]);

create or replace function public.activate_boundary_dataset(
  p_dataset_id text,
  -- What the caller required this dataset to contain. The approved
  -- municipality list lives in lib/service-areas.ts, so the database
  -- cannot know it; the caller states it and this verifies it. Null skips
  -- the coverage check and is reported back as unverified.
  p_expected_municipalities text[] default null
)
-- OUT column names are deliberately NOT dataset_id / area_id. A
-- RETURNS TABLE column is an in-scope identifier throughout the body, so
-- `dataset_id` collided with service_area_boundaries.dataset_id and the
-- first call failed with "column reference is ambiguous". Prefixing them
-- removes the whole class rather than qualifying each use and hoping the
-- next edit remembers.
returns table (
  out_dataset_id        text,
  out_area_id           text,
  out_deactivated       text,
  out_boundary_rows     int,
  out_coverage_verified  boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ds        record;
  v_rows      int;
  v_invalid   int;
  v_empty     int;
  v_missing   text[];
  v_prev      text;
begin
  -- Lock the dataset row for the duration, so two concurrent activations
  -- on the same area cannot interleave their swaps.
  select d.* into v_ds
    from service_area_datasets d
   where d.id = p_dataset_id
   for update;
  if not found then
    raise exception 'No boundary dataset %', p_dataset_id
      using errcode = 'HW060';
  end if;

  select count(*),
         count(*) filter (where boundary is null or not st_isvalid(boundary::geometry)),
         count(*) filter (where boundary is not null and st_isempty(boundary::geometry))
    into v_rows, v_invalid, v_empty
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
  if v_ds.feature_count is not null and v_ds.feature_count <> v_rows then
    raise exception
      'Dataset % is incomplete: feature_count is % but % boundary rows exist',
      p_dataset_id, v_ds.feature_count, v_rows
      using errcode = 'HW063';
  end if;

  -- Every municipality the caller required must be present. Status words
  -- ("City of", "District of") are stripped both sides, exactly as
  -- normalizeMunicipality does in the application.
  if p_expected_municipalities is not null then
    select array_agg(want)
      into v_missing
      from unnest(p_expected_municipalities) as want
     where not exists (
       select 1 from service_area_boundaries b
        where b.dataset_id = p_dataset_id
          and regexp_replace(
                regexp_replace(lower(b.municipality),
                  '^(city|district|township|town|village) of ', ''),
                ' (city|district|township|town|village)$', '')
            = regexp_replace(
                regexp_replace(lower(want),
                  '^(city|district|township|town|village) of ', ''),
                ' (city|district|township|town|village)$', '')
     );
    if v_missing is not null and array_length(v_missing, 1) > 0 then
      raise exception
        'Dataset % is missing required municipality(ies): %',
        p_dataset_id, array_to_string(v_missing, ', ')
        using errcode = 'HW064';
    end if;
  end if;

  -- Only now, and in one transaction with the deactivation.
  select d.id into v_prev
    from service_area_datasets d
   where d.area_id = v_ds.area_id
     and d.is_active
     and d.id <> p_dataset_id
   limit 1;

  update service_area_datasets d
     set is_active = false
   where d.area_id = v_ds.area_id
     and d.is_active
     and d.id <> p_dataset_id;

  update service_area_datasets d
     set is_active = true
   where d.id = p_dataset_id;

  return query select
    p_dataset_id,
    v_ds.area_id,
    v_prev,
    v_rows,
    (p_expected_municipalities is not null);
end;
$$;

-- Activation is an operator action, not something a signed-in user may do.
revoke execute on function
  public.activate_boundary_dataset(text, text[]) from public, anon, authenticated;
grant execute on function
  public.activate_boundary_dataset(text, text[]) to service_role;

comment on function public.activate_boundary_dataset(text, text[]) is
  'Validates a boundary dataset and swaps it in atomically. Replaces the '
  'two-PATCH client sequence, which left an area with no active dataset '
  'between calls and permanently so if the second call failed.';
