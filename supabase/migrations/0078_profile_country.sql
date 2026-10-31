-- CLASS: pre-deploy
-- =========================================================================
-- 0078 — a profile's country has to be the one they chose
--
-- handle_new_user built the profiles row from raw_user_meta_data but never
-- read `country`, so every account since the beginning took the column
-- default: 'US'. 93 of 94 profiles say US, including helpers who picked
-- Canada at signup and who only work Lower Mainland cities.
--
-- That is not cosmetic. startHelperOnboarding passes this column to Stripe
-- as the connected account's country, and **a Connect account's country
-- cannot be changed after it is created** — Stripe requires a new account.
-- So a Canadian helper was handed a US onboarding form asking for a Social
-- Security number, a US state and a +1 phone number, and no amount of
-- filling it in correctly could work.
-- =========================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  meta_role    text;
  meta_country text;
  v_area       text;
  v_city       text;
begin
  meta_role := coalesce(new.raw_user_meta_data->>'role', 'customer');

  -- The country they actually picked. Anything other than the two we
  -- operate in falls back to the column default rather than failing the
  -- signup over a value the enum will not accept.
  meta_country := upper(nullif(trim(coalesce(new.raw_user_meta_data->>'country', '')), ''));
  if meta_country not in ('US', 'CA') then
    meta_country := null;
  end if;

  insert into public.profiles (id, role, full_name, avatar_url, country)
  values (
    new.id,
    meta_role::user_role,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url',
    coalesce(meta_country::country, 'US'::country)
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
-- Backfill, but only where the evidence is unambiguous.
--
-- Two sources, in order of how much they are worth:
--
--   1. The cities a helper DELIBERATELY ticked. Someone who chose Lower
--      Mainland municipalities works in Canada. This is the strongest
--      signal there is, because it was an explicit choice about where they
--      will physically go.
--   2. The country in their signup metadata, which was collected and then
--      dropped on the floor.
--
-- Nothing is guessed from an address, a phone number or a name.
-- -------------------------------------------------------------------------
do $$
declare v_from_cities int; v_from_meta int;
begin
  -- 1. Working area.
  with area_country as (
    select pc.provider_id,
           case when pc.area_id = 'lower-mainland-bc' then 'CA'
                when pc.area_id = 'san-diego-ca'      then 'US' end as c
    from provider_cities pc
    group by pc.provider_id, pc.area_id
  )
  update profiles p
     set country = a.c::country, updated_at = now()
    from area_country a
   where a.provider_id = p.id and a.c is not null and p.country::text <> a.c;
  get diagnostics v_from_cities = row_count;

  -- 2. Signup metadata, for anyone the first pass did not cover.
  update profiles p
     set country = m.c::country, updated_at = now()
    from (
      select u.id, upper(u.raw_user_meta_data->>'country') as c
        from auth.users u
       where upper(coalesce(u.raw_user_meta_data->>'country', '')) in ('US', 'CA')
    ) m
   where m.id = p.id
     and p.country::text <> m.c
     and not exists (select 1 from provider_cities pc where pc.provider_id = p.id);
  get diagnostics v_from_meta = row_count;

  raise notice 'country backfilled: % from working area, % from signup metadata',
    v_from_cities, v_from_meta;
end $$;

-- A new signup must now carry its country through.
do $$
declare v_id uuid := gen_random_uuid(); v_got text;
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at)
  values (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'country-check-' || v_id || '@helpward.com', 'x', now(), '{}',
          '{"role":"customer","country":"CA","full_name":"Check"}'::jsonb, now(), now());

  select country::text into v_got from profiles where id = v_id;
  delete from auth.users where id = v_id;

  if v_got <> 'CA' then
    raise exception 'handle_new_user still drops the country: got %', v_got;
  end if;
  raise notice 'signup country verified';
end $$;
