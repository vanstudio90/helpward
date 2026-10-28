-- CLASS: pre-deploy
-- =========================================================================
-- 0072 — the cities a helper actually works in
--
-- Dispatch matched on DISTANCE ONLY: find_nearby_providers filtered by the
-- radius the caller passed and by the helper's own service_radius_km, and
-- nothing else. A circle is a poor description of where someone is willing
-- to work. A 20 km radius centred on Burnaby covers Vancouver, Richmond,
-- New Westminster, Coquitlam and Surrey, so a helper who only ever wanted
-- Burnaby jobs was offered all of them and had to decline the rest.
--
-- The signup form already asked "Where will you work?" and submitted
-- work_region / work_city. NOTHING READ THEM. The answer was collected and
-- discarded, which is worse than not asking.
--
-- THREE DECISIONS WORTH KNOWING ABOUT
--
-- 1. ZERO ROWS MEANS UNRESTRICTED, NOT "NOWHERE".
--    31 helper accounts already exist and none of them can have rows here.
--    Reading an empty set as "works nowhere" would switch every one of them
--    off the moment this is applied. So an empty set keeps today's
--    behaviour — radius only — and any non-empty set is enforced strictly.
--    This is NOT a silent default: the profile page states in words which
--    of the two a helper is in, and the UI refuses to save an empty set, so
--    "unrestricted" can only ever be the state of an account that has never
--    been configured, never a state someone lands in by deselecting.
--
-- 2. A NAME, NOT A JURISDICTION ID.
--    0067 exists because "North Vancouver" is two municipalities (City and
--    District) and "Langley" is two more (City and Township). For COVERAGE
--    that distinction is load-bearing and ids are the only safe currency.
--    For a HELPER'S PREFERENCE it is noise: nobody says "I work in the
--    District of North Vancouver." A helper picks the name they would say
--    out loud and it resolves to BOTH polygons of the pair.
--
-- 3. POLYGON CONTAINMENT, NOT NAME COMPARISON.
--    We do not compare the helper's city to requests.pickup_city. That
--    column is Mapbox's context.place and carries the known limitation
--    documented in lib/service-areas.ts. We test whether the pickup POINT
--    falls inside the helper's chosen municipal polygons, in the active
--    boundary dataset — the same authority is_point_serviceable() uses.
-- =========================================================================

-- -------------------------------------------------------------------------
-- normalize_municipality — the SQL twin of normalizeMunicipality() in
-- lib/service-areas.ts. Casefold, strip accents, drop punctuation, and
-- remove the municipal status words that Mapbox, official datasets and
-- people all use differently ("City of Langley", "Langley Township",
-- "District of North Vancouver"). Must stay in step with the TS version;
-- tests/working-cities.test.ts asserts they agree name by name.
--
-- IMMUTABLE because provider_cities.muni_key is a generated column.
-- -------------------------------------------------------------------------
create or replace function public.normalize_municipality(p_input text)
returns text
language sql
immutable
as $$
  select coalesce(string_agg(w, ' ' order by ord), '')
  from unnest(
         regexp_split_to_array(
           regexp_replace(
             lower(regexp_replace(normalize(coalesce(p_input, ''), NFD),
                                  '[̀-ͯ]', '', 'g')),
             '[^a-z0-9[:space:]]', ' ', 'g'),
           '\s+')
       ) with ordinality as t(w, ord)
  where w <> ''
    and w not in ('city', 'district', 'township', 'municipality', 'town',
                  'village', 'borough', 'of', 'the', 'corporation');
$$;

grant execute on function public.normalize_municipality(text) to authenticated, service_role;

-- -------------------------------------------------------------------------
-- A normalised key on the boundary rows themselves.
--
-- service_area_boundaries.municipality is the name as the SOURCE dataset
-- spells it ("City of North Vancouver", "Township of Langley"), which is
-- deliberate — it is what makes reconciliation possible. Normalising it
-- collapses both halves of a shared-name pair onto one key, so a helper who
-- picks "North Vancouver" gets the City and the District, and one who picks
-- "Langley" gets the City and the Township. That is the intended reading of
-- a helper's answer; see decision 2 at the top.
-- -------------------------------------------------------------------------
alter table service_area_boundaries
  add column if not exists muni_key text
  generated always as (public.normalize_municipality(municipality)) stored;

create index if not exists sab_muni_key_idx
  on service_area_boundaries (area_id, muni_key);

-- -------------------------------------------------------------------------
-- provider_cities
-- -------------------------------------------------------------------------
create table if not exists public.provider_cities (
  provider_id  uuid not null references auth.users(id) on delete cascade,
  area_id      text not null,
  municipality text not null,
  muni_key     text generated always as (public.normalize_municipality(municipality)) stored,
  created_at   timestamptz not null default now(),
  primary key (provider_id, area_id, municipality)
);

create index if not exists provider_cities_provider_idx on public.provider_cities (provider_id);
create index if not exists provider_cities_lookup_idx   on public.provider_cities (area_id, muni_key);

alter table public.provider_cities enable row level security;

-- A helper reads and manages only their own rows. Writes go through
-- set_provider_working_cities() so that every write is validated against
-- real boundaries, but direct select is useful and harmless.
drop policy if exists provider_cities_own_read on public.provider_cities;
create policy provider_cities_own_read on public.provider_cities
  for select to authenticated using (provider_id = auth.uid());

-- No insert/update/delete policy: RLS denies by default, so the RPC below
-- (security definer) is the only write path and validation cannot be
-- bypassed by posting straight at PostgREST.
revoke insert, update, delete on public.provider_cities from authenticated, anon;

-- -------------------------------------------------------------------------
-- set_provider_working_cities — replace the caller's whole set.
--
-- Validated against the ACTIVE boundary dataset, so a name that no polygon
-- answers to is refused loudly at save time. Saving an unmatched name would
-- otherwise leave a helper configured, confident, and permanently
-- undispatchable — a silent dead end of exactly the kind 0067 was written
-- about.
-- -------------------------------------------------------------------------
create or replace function public.set_provider_working_cities(
  p_area_id       text,
  p_municipalities text[]
)
returns int
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_name  text;
  v_count int;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not exists (select 1 from provider_profiles where user_id = v_uid) then
    raise exception 'not a helper account' using errcode = '42501';
  end if;
  if p_area_id is null or p_municipalities is null then
    raise exception 'area and cities are both required';
  end if;
  if array_length(p_municipalities, 1) is null then
    raise exception 'choose at least one city';
  end if;
  if array_length(p_municipalities, 1) > 200 then
    raise exception 'too many cities';
  end if;

  -- Every name must resolve to at least one polygon in the active dataset.
  foreach v_name in array p_municipalities loop
    if not exists (
      select 1
      from service_area_boundaries b
      join service_area_datasets d on d.id = b.dataset_id and d.is_active
      where b.area_id = p_area_id
        and b.muni_key = normalize_municipality(v_name)
    ) then
      raise exception 'no active boundary for % in %', v_name, p_area_id;
    end if;
  end loop;

  delete from provider_cities where provider_id = v_uid;
  insert into provider_cities (provider_id, area_id, municipality)
  select v_uid, p_area_id, distinct_name
  from (select distinct unnest(p_municipalities) as distinct_name) s;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.set_provider_working_cities(text, text[]) from public, anon;
grant execute on function public.set_provider_working_cities(text, text[]) to authenticated, service_role;

-- -------------------------------------------------------------------------
-- Seed the signup answer.
--
-- handle_new_user() already builds the provider_profiles row from
-- raw_user_meta_data, so the city the helper picked on the signup form is
-- seeded in the same place by the same trigger. Doing it here rather than
-- in the signup action means it holds for every path that creates a user,
-- including an admin-created account and any future OAuth route.
--
-- Deliberately best-effort: an unrecognised city is SKIPPED, never fatal.
-- Failing here would fail auth.users insert and break signup entirely, and
-- a lost preference is recoverable in one click on the profile page while a
-- broken signup is not. A skipped seed leaves zero rows, which the profile
-- page reports in plain words rather than leaving the helper to guess.
-- -------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  meta_role text;
  v_area    text;
  v_city    text;
begin
  meta_role := coalesce(new.raw_user_meta_data->>'role', 'customer');

  insert into public.profiles (id, role, full_name, avatar_url)
  values (
    new.id,
    meta_role::user_role,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  );

  if meta_role = 'provider' then
    insert into public.provider_profiles (user_id) values (new.id);

    v_area := nullif(trim(coalesce(new.raw_user_meta_data->>'work_region', '')), '');
    v_city := nullif(trim(coalesce(new.raw_user_meta_data->>'work_city', '')), '');

    if v_area is not null and v_city is not null then
      insert into public.provider_cities (provider_id, area_id, municipality)
      select new.id, v_area, v_city
      where exists (
        select 1
        from public.service_area_boundaries b
        join public.service_area_datasets d on d.id = b.dataset_id and d.is_active
        where b.area_id = v_area
          and b.muni_key = public.normalize_municipality(v_city)
      )
      on conflict do nothing;
    end if;
  else
    insert into public.customer_profiles (user_id) values (new.id);
  end if;

  insert into public.notification_prefs (user_id) values (new.id);

  return new;
end;
$$;

-- -------------------------------------------------------------------------
-- The dispatch gate.
--
-- Signature unchanged, so CREATE OR REPLACE keeps 0038's ACLs and no caller
-- needs touching. The pickup point is resolved to its municipal polygons
-- ONCE in a CTE rather than per candidate helper.
--
-- `not exists (...)` is the compatibility clause described in decision 1:
-- a helper with no configured cities is matched exactly as before.
-- -------------------------------------------------------------------------
create or replace function public.find_nearby_providers(
  p_service_id text,
  p_pickup geography,
  p_radius_km int default 20,
  p_limit int default 5
) returns table (
  provider_id uuid,
  distance_km numeric,
  rating_avg numeric,
  rank_score numeric
)
language sql stable as $$
  with pickup_muni as (
    -- Which municipalities cover this pickup point, in the active dataset.
    -- Normally one; a point on a shared boundary can land in two, and
    -- matching either is correct.
    select b.area_id, b.muni_key
    from service_area_boundaries b
    join service_area_datasets d on d.id = b.dataset_id and d.is_active
    where st_covers(b.boundary, p_pickup::geometry)
  )
  select
    pp.user_id as provider_id,
    round((st_distance(pp.current_location, p_pickup) / 1000.0)::numeric, 2) as distance_km,
    pp.rating_avg,
    (1.0 / greatest(st_distance(pp.current_location, p_pickup) / 1000.0, 0.5)) * 0.5
    + coalesce(pp.rating_avg / 5.0, 0.7) * 0.3
    + (case when pp.tasks_completed > 50 then 0.2 when pp.tasks_completed > 10 then 0.15 else 0.1 end) as rank_score
  from provider_profiles pp
  inner join provider_services ps on ps.provider_id = pp.user_id
  where ps.service_id = p_service_id
    and pp.status = 'approved'
    and pp.is_online = true
    and coalesce(pp.vacation_mode, false) = false
    and pp.current_location is not null
    -- Location must be recent.
    and pp.location_updated_at is not null
    and pp.location_updated_at > now() - max_location_age()
    -- Inside the dispatch radius the caller asked for...
    and st_dwithin(pp.current_location, p_pickup, p_radius_km * 1000)
    -- ...AND inside the radius this helper configured for themselves.
    and st_dwithin(pp.current_location, p_pickup, coalesce(pp.service_radius_km, 20) * 1000)
    -- ...AND in a city they said they work in, if they said anything at all.
    and (
      not exists (select 1 from provider_cities pc where pc.provider_id = pp.user_id)
      or exists (
        select 1
        from provider_cities pc
        join pickup_muni m
          on m.area_id = pc.area_id and m.muni_key = pc.muni_key
        where pc.provider_id = pp.user_id
      )
    )
  order by rank_score desc
  limit p_limit;
$$;

revoke execute on function public.find_nearby_providers(text, geography, int, int) from public, anon;
grant execute on function public.find_nearby_providers(text, geography, int, int) to authenticated, service_role;

-- -------------------------------------------------------------------------
-- Why the "no eligible helper" refusal now has a second cause.
--
-- broadcast_request records 'no_eligible_helper' when find_nearby_providers
-- returns nothing. That reason previously meant "nobody online and close
-- enough"; it can now also mean "everyone close enough has excluded this
-- city". Both are ordinary low-supply misses, neither is a fault, and the
-- admin dispatch-refusal view reads the same either way.
-- -------------------------------------------------------------------------
comment on table public.provider_cities is
  'Cities a helper accepts work in. Empty set = unrestricted (legacy '
  'accounts); any non-empty set is enforced by find_nearby_providers '
  'through polygon containment of the pickup point.';
