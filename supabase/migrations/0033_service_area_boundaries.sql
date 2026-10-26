-- CLASS: pre-deploy
-- Official municipal boundary polygons — the AUTHORITATIVE service-area test.
--
-- Municipality-name matching (lib/service-areas.ts) is retained, but only as
-- a PRELIMINARY check: it is fast, it produces good error copy, and it
-- catches obviously-out-of-area addresses. It is NOT sufficient for a
-- city-limits launch, because Mapbox's `context.place` attribution is a
-- label, not a boundary. Unincorporated land adjacent to a launch city can
-- carry that city's place name.
--
-- Both checks must pass before a task is dispatchable.
--
-- FAIL-CLOSED: until a boundary set is loaded and marked active for an area,
-- is_point_serviceable() returns 'no_dataset' and nothing in that area is
-- dispatchable. No booking is ever accepted on the preliminary check alone.

create table if not exists service_area_datasets (
  id              text primary key,
  -- Which launch area this dataset covers. Matches ServiceArea.id in
  -- lib/service-areas.ts so the two layers can be reconciled.
  area_id         text not null,
  -- PROVENANCE. Every one of these is required: an unsourced boundary is
  -- not an official boundary, and "which version did we launch on" is a
  -- question we must be able to answer later.
  source_name     text not null,
  source_url      text not null,
  source_version  text not null,
  source_retrieved_at timestamptz not null,
  license         text not null,
  -- Set by the loader from the raw file, so a silent re-download that
  -- changes geometry is detectable.
  source_sha256   text not null,
  feature_count   int  not null check (feature_count > 0),
  notes           text,
  -- Only one dataset per area may be active. Swapping versions is an
  -- explicit, auditable act.
  is_active       boolean not null default false,
  loaded_at       timestamptz not null default now(),
  loaded_by       uuid references profiles(id)
);

create unique index if not exists sad_one_active_per_area
  on service_area_datasets (area_id) where is_active;

create table if not exists service_area_boundaries (
  id          bigserial primary key,
  dataset_id  text not null references service_area_datasets(id) on delete cascade,
  area_id     text not null,
  -- Municipality name as it appears in the SOURCE dataset, not as Mapbox
  -- reports it. Kept for reconciliation against the preliminary check.
  municipality text not null,
  -- geometry, not geography: official boundary files ship as polygons in a
  -- projected or geographic CRS and ST_Covers on geometry(4326) is both
  -- correct and fast here. Multipolygons are normal (islands, exclaves).
  boundary    geometry(MultiPolygon, 4326) not null,
  created_at  timestamptz not null default now()
);

create index if not exists sab_boundary_gix on service_area_boundaries using gist (boundary);
create index if not exists sab_dataset_idx  on service_area_boundaries (dataset_id);

alter table service_area_datasets  enable row level security;
alter table service_area_boundaries enable row level security;

-- Boundaries are public reference data; only admins may change them.
drop policy if exists sad_read on service_area_datasets;
create policy sad_read on service_area_datasets for select using (true);
drop policy if exists sad_admin_write on service_area_datasets;
create policy sad_admin_write on service_area_datasets for all
  using (is_admin()) with check (is_admin());

drop policy if exists sab_read on service_area_boundaries;
create policy sab_read on service_area_boundaries for select using (true);
drop policy if exists sab_admin_write on service_area_boundaries;
create policy sab_admin_write on service_area_boundaries for all
  using (is_admin()) with check (is_admin());

-- =========================================================================
-- is_point_serviceable — the authoritative check.
--
-- Returns a reason code rather than a boolean so the caller can tell these
-- apart, which the launch plan explicitly requires:
--
--   'serviceable'      inside an active boundary
--   'outside_boundary' geocoded fine, inside no boundary we operate in.
--                      This is the unincorporated-land case: the address may
--                      sit in a county that shares a launch city's name.
--   'no_dataset'       no active boundary set for ANY area, so we cannot
--                      answer. Treated as not serviceable (fail-closed).
-- =========================================================================
create or replace function public.is_point_serviceable(p_point geography)
returns text
language plpgsql stable security definer set search_path = public as $$
declare
  v_area text;
  v_has_any boolean;
begin
  if p_point is null then
    return 'outside_boundary';
  end if;

  select exists (select 1 from service_area_datasets where is_active) into v_has_any;
  if not v_has_any then
    -- No official boundaries loaded. We refuse rather than silently
    -- degrading to the preliminary name check.
    return 'no_dataset';
  end if;

  select b.area_id into v_area
  from service_area_boundaries b
  join service_area_datasets d on d.id = b.dataset_id and d.is_active
  where st_covers(b.boundary, p_point::geometry)
  limit 1;

  if v_area is null then
    return 'outside_boundary';
  end if;
  return 'serviceable';
end;
$$;

grant execute on function public.is_point_serviceable(geography) to authenticated, service_role;

-- Which area a point falls in (null when none). Used for reporting and to
-- reconcile the authoritative answer against the preliminary name match.
create or replace function public.point_service_area(p_point geography)
returns text
language sql stable security definer set search_path = public as $$
  select b.area_id
  from service_area_boundaries b
  join service_area_datasets d on d.id = b.dataset_id and d.is_active
  where p_point is not null and st_covers(b.boundary, p_point::geometry)
  limit 1;
$$;

grant execute on function public.point_service_area(geography) to authenticated, service_role;

comment on table service_area_datasets is
  'Provenance for official municipal boundary sets. source_* columns are mandatory: we must be able to state which dataset version a launch decision was made on.';
comment on function public.is_point_serviceable(geography) is
  'Authoritative service-area test. Returns serviceable | outside_boundary | no_dataset. Municipality-name matching in the application is only a preliminary filter and never sufficient on its own.';

-- Insert helper for the loader. PostgREST cannot construct PostGIS geometry
-- from a GeoJSON string directly, and ST_Multi normalises a single-ring
-- Polygon so every row stores the same MultiPolygon type.
-- Authorisation note: the loader authenticates with the service-role key,
-- and jwt_role() returns 'service_role' for those requests — so is_admin()
-- is false while request.jwt.claims is populated. An earlier draft raised
-- 'admin only' here, rejecting precisely the caller the grant was for, and
-- a later migration tried to correct it. That put the fix behind a
-- deploy-coupled migration while the runbook loads boundaries BEFORE the
-- cutover, so a fresh rehearsal stopped at the load step. The authorisation
-- belongs here, in the pre-deploy-safe migration that defines the function.
create or replace function public.insert_service_area_boundary(
  p_dataset_id text,
  p_area_id text,
  p_municipality text,
  p_geojson text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_role text := jwt_role();
  v_no_claims boolean := coalesce(current_setting('request.jwt.claims', true), '') = '';
begin
  -- Allowed: the service role (the loader), an admin, or a direct psql
  -- session with no JWT. Everyone else is denied explicitly.
  if not (v_no_claims or v_role = 'service_role' or v_role = 'admin') then
    raise exception 'insert_service_area_boundary: not authorised for role %', v_role;
  end if;

  insert into service_area_boundaries (dataset_id, area_id, municipality, boundary)
  values (
    p_dataset_id, p_area_id, p_municipality,
    st_multi(st_setsrid(st_geomfromgeojson(p_geojson), 4326))::geometry(MultiPolygon, 4326)
  );
end;
$$;

-- Default PUBLIC EXECUTE is revoked here, not in a later migration, for the
-- same reason: this function is callable from the moment it exists.
revoke execute on function public.insert_service_area_boundary(text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.insert_service_area_boundary(text, text, text, text) to service_role;

revoke execute on function public.is_point_serviceable(geography) from public, anon;
revoke execute on function public.point_service_area(geography) from public, anon;
grant execute on function public.is_point_serviceable(geography) to authenticated, service_role;
grant execute on function public.point_service_area(geography) to authenticated, service_role;
