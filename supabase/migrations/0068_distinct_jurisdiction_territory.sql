-- CLASS: pre-deploy safe. Replaces one function's body; adds no column.
--
-- TWO MUNICIPALITIES CANNOT OCCUPY THE SAME TERRITORY.
--
-- 0067 made activation compare the exact SET of jurisdiction ids, which
-- was necessary and turned out not to be sufficient. An audit built a
-- 17-row dataset in which the District of North Vancouver and the
-- Township of Langley carried DUPLICATE CITY polygons. Every id present,
-- every id distinct, every geometry valid, feature_count correct — and
-- points in the District and the Township were refused, because the
-- labels were right and the territory was wrong.
--
-- Set comparison cannot see that. This can: no two jurisdictions in a
-- dataset may have identical geometry. It is a true invariant about
-- municipal boundaries, not a heuristic, and it catches the duplication
-- exactly.
--
-- It does NOT catch every wrong geometry — a district replaced by a
-- slightly different polygon would pass. That is what the per-
-- jurisdiction interior probes in preflight are for
-- (scripts/lib/jurisdiction-probes.mjs). Neither check subsumes the
-- other, so both exist.

create or replace function public.activate_boundary_dataset(
  p_dataset_id text,
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
  v_shapes  int;
  v_dupes   text;
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
         count(*) filter (where b.jurisdiction_id is null),
         count(distinct md5(st_asbinary(b.boundary::geometry)))
    into v_rows, v_invalid, v_empty, v_nullids, v_shapes
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

  -- THE NEW CHECK. Two jurisdictions sharing one polygon means one of
  -- them has been given the other's territory.
  if v_shapes <> v_rows then
    select string_agg(ids, '; ') into v_dupes
      from (
        select string_agg(b.jurisdiction_id, ' = ' order by b.jurisdiction_id) as ids
          from service_area_boundaries b
         where b.dataset_id = p_dataset_id
         group by md5(st_asbinary(b.boundary::geometry))
        having count(*) > 1
      ) dup;
    raise exception
      'Dataset % gives the same territory to more than one jurisdiction: %. '
      'Two municipalities cannot occupy the same ground; one has been loaded '
      'with the other''s polygon.',
      p_dataset_id, coalesce(v_dupes, '(unidentified)')
      using errcode = 'HW069';
  end if;

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
