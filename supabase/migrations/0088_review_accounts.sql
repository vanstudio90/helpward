-- CLASS: pre-deploy
-- =========================================================================
-- 0088 — a reviewer can complete a booking without touching real supply
--
-- App Review has to be able to request, be accepted, message, complete and
-- cancel. Today they cannot: no helper is online, and if one were, a
-- reviewer's request would be dispatched to a real person who would drive
-- to a made-up address.
--
-- The fix is NOT a bypass. A review booking must take exactly the same
-- path as a real one — same validation, same pricing, same policies, same
-- payment transitions — and differ in one respect only: WHO can be matched
-- to it.
--
-- So the isolation is a matching rule, enforced here rather than in a
-- component:
--
--     a review customer's request reaches ONLY review helpers
--     a real customer's request reaches NO review helper
--
-- Symmetric on purpose. The second half matters as much as the first: a
-- test helper must never be able to take a stranger's booking.
-- =========================================================================

alter table public.profiles
  add column if not exists is_review_account boolean not null default false;

comment on column public.profiles.is_review_account is
  'App Review demonstration account. Set by an admin only. Its requests are dispatched exclusively to review helpers.';

alter table public.provider_profiles
  add column if not exists is_review_helper boolean not null default false;

comment on column public.provider_profiles.is_review_helper is
  'Controlled helper that exists to answer App Review bookings. Never offered a real customer request.';

-- Nobody may set either flag on themselves. profiles_update and the helper
-- profile forms both allow a user to write their own row, so without this a
-- customer could promote themselves into the review pool and watch its
-- traffic — or, worse, a review helper could un-flag itself and start
-- receiving real work.
create or replace function public.reject_self_review_flag()
returns trigger language plpgsql as $$
begin
  if tg_table_name = 'profiles' then
    if new.is_review_account is distinct from old.is_review_account and not is_admin() then
      raise exception 'is_review_account may only be changed by an admin';
    end if;
  else
    if new.is_review_helper is distinct from old.is_review_helper and not is_admin() then
      raise exception 'is_review_helper may only be changed by an admin';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_review_flag_guard on public.profiles;
create trigger profiles_review_flag_guard
  before update on public.profiles
  for each row execute function public.reject_self_review_flag();

drop trigger if exists helper_review_flag_guard on public.provider_profiles;
create trigger helper_review_flag_guard
  before update on public.provider_profiles
  for each row execute function public.reject_self_review_flag();

-- -------------------------------------------------------------------------
-- The matching rule itself.
--
-- find_nearby_providers gains a review parameter and filters on it. Giving
-- it a default keeps every existing caller working unchanged and dispatching
-- to real helpers only, which is the safe default if a future call site
-- forgets the argument.
-- -------------------------------------------------------------------------
-- REBASED ON 0072, NOT 0038. find_nearby_providers was last redefined in
-- 0072_provider_working_cities, which added the provider_cities filter.
-- Restating the 0038 body here — which is what I wrote first — would have
-- silently reverted that: every helper would have become matchable in every
-- municipality again. The only safe way to change one line of a function is
-- to restate the CURRENT one.
create or replace function public.find_nearby_providers(
  p_service_id text,
  p_pickup geography,
  p_radius_km int default 20,
  p_limit int default 5,
  p_review boolean default false
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
    -- The review isolation, both ways round: a review customer's request
    -- reaches only review helpers, and a real customer's reaches none.
    and coalesce(pp.is_review_helper, false) = coalesce(p_review, false)
  order by rank_score desc
  limit p_limit;
$$;


revoke execute on function public.find_nearby_providers(text, geography, int, int, boolean) from public;
grant execute on function public.find_nearby_providers(text, geography, int, int, boolean)
  to authenticated, service_role;

-- -------------------------------------------------------------------------
-- broadcast_request passes the customer's flag down.
--
-- Replaced wholesale rather than patched, because the only honest way to
-- change one line of a security-definer function is to restate it. Every
-- refusal path above the dispatch is unchanged: a review booking is still
-- refused for a missing pickup location, an unverified address, a
-- placeholder coordinate or a pickup outside the serviceable boundary. A
-- reviewer meets the same validation a customer does.
-- -------------------------------------------------------------------------
create or replace function public.broadcast_request(
  p_request_id uuid,
  p_radius_km int default 20
) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_request record;
  v_count int := 0;
  v_boundary text;
  v_review boolean := false;
begin
  if exists (select 1 from match_attempts where request_id = p_request_id) then
    return 0;
  end if;

  select r.*, a.location as pickup_loc, a.geocode_verified as pickup_verified
  into v_request
  from requests r
  left join addresses a on a.id = r.pickup_address_id
  where r.id = p_request_id;

  if not found then
    return 0;
  end if;

  -- Whose request this is decides which pool may see it.
  select coalesce(p.is_review_account, false) into v_review
  from profiles p where p.id = v_request.customer_id;

  if v_request.pickup_loc is null then
    perform record_dispatch_refusal(p_request_id, 'no_pickup_location', null);
    return 0;
  end if;

  if coalesce(v_request.pickup_verified, false) = false then
    perform record_dispatch_refusal(p_request_id, 'address_unverified', null);
    return 0;
  end if;

  if is_placeholder_point(v_request.pickup_loc) then
    perform record_dispatch_refusal(p_request_id, 'placeholder_point', null);
    return 0;
  end if;

  v_boundary := is_point_serviceable(v_request.pickup_loc);
  if boundary_enforcement_mode() = 'relaxed' and v_boundary <> 'serviceable' then
    perform record_dispatch_refusal(
      p_request_id,
      case when v_boundary = 'no_dataset' then 'boundary_no_dataset' else 'boundary_outside' end,
      'DISPATCHED ANYWAY — boundary enforcement relaxed by declared incident; verification and placeholder checks still applied'
    );
    v_boundary := 'serviceable';
  end if;
  if v_boundary = 'no_dataset' then
    perform record_dispatch_refusal(
      p_request_id, 'boundary_no_dataset',
      'no active row in service_area_datasets — official municipal boundaries have not been loaded'
    );
    return 0;
  end if;
  if v_boundary <> 'serviceable' then
    perform record_dispatch_refusal(
      p_request_id, 'boundary_outside',
      'pickup point is outside every active municipal boundary'
    );
    return 0;
  end if;

  insert into match_attempts (request_id, provider_id, distance_km, rank_score)
  select p_request_id, p.provider_id, p.distance_km, p.rank_score
  from find_nearby_providers(
         v_request.service_id, v_request.pickup_loc, p_radius_km, 5, v_review
       ) p;

  get diagnostics v_count = row_count;

  if v_count = 0 then
    perform record_dispatch_refusal(
      p_request_id,
      case when v_review then 'no_review_helper_online' else 'no_providers_in_range' end,
      null
    );
  end if;

  return v_count;
end;
$$;

revoke execute on function public.broadcast_request(uuid, int) from public;
grant execute on function public.broadcast_request(uuid, int) to authenticated, service_role;
