-- Preferred-helper routing — when a customer hits "Book again" on a saved
-- favorite helper, the new request is offered to that helper for 2 minutes
-- before the matching engine broadcasts to the broader pool.
--
-- Model:
--   * requests.preferred_helper_id — the favorited helper the customer wants
--     to route to first. Null = normal broadcast.
--   * requests.preferred_until — timestamp when the preferred-only window
--     closes and the request becomes eligible for a fall-through broadcast.
--   * match_attempts.preferred — flag so the helper's UI can render a "you
--     were specifically requested" badge on offered cards.
--
-- The cron at /api/cron/expand-preferred-broadcasts runs every minute and
-- expands stale preferred-only requests into the wider pool. We don't rely
-- on setTimeout-from-action because Vercel serverless kills post-response
-- promises (see [[feedback_vercel_serverless_no_fire_and_forget]]).

alter table requests
  add column if not exists preferred_helper_id uuid references auth.users(id) on delete set null,
  add column if not exists preferred_until timestamptz;

create index if not exists requests_preferred_helper_idx
  on requests(preferred_helper_id, preferred_until)
  where preferred_helper_id is not null;

alter table match_attempts
  add column if not exists preferred boolean not null default false;

-- =========================================================================
-- Rewrite broadcast_request — preferred-helper-first path with fall-through
-- =========================================================================
create or replace function public.broadcast_request(
  p_request_id uuid,
  p_radius_km int default 20
) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_request record;
  v_count int := 0;
  v_preferred_qualifies boolean := false;
begin
  -- Skip if already broadcast
  if exists (select 1 from match_attempts where request_id = p_request_id) then
    return 0;
  end if;

  select r.*, a.location as pickup_loc
  into v_request
  from requests r
  left join addresses a on a.id = r.pickup_address_id
  where r.id = p_request_id;

  if not found or v_request.pickup_loc is null then
    return 0;
  end if;

  -- Preferred-helper-first path. Only kicks in if the helper is approved,
  -- online, offers the requested service, and is in range. If they don't
  -- qualify we fall straight through to the broad broadcast — no point
  -- holding the customer's request hostage to an unavailable favourite.
  if v_request.preferred_helper_id is not null then
    select exists (
      select 1
      from provider_profiles pp
      inner join provider_services ps on ps.provider_id = pp.user_id
      where pp.user_id = v_request.preferred_helper_id
        and ps.service_id = v_request.service_id
        and pp.status = 'approved'
        and pp.is_online = true
        and pp.current_location is not null
        and st_dwithin(pp.current_location, v_request.pickup_loc, p_radius_km * 1000)
    ) into v_preferred_qualifies;

    if v_preferred_qualifies then
      insert into match_attempts (request_id, provider_id, distance_km, rank_score, preferred)
      select
        p_request_id,
        v_request.preferred_helper_id,
        round((st_distance(pp.current_location, v_request.pickup_loc) / 1000.0)::numeric, 2),
        1.0,
        true
      from provider_profiles pp
      where pp.user_id = v_request.preferred_helper_id;

      update requests
        set preferred_until = now() + interval '2 minutes'
        where id = p_request_id;

      insert into notifications (user_id, type, payload)
      values (
        v_request.preferred_helper_id,
        'new_request_offered',
        jsonb_build_object(
          'request_id', p_request_id,
          'service_id', v_request.service_id,
          'preferred', true
        )
      );

      return 1;
    end if;
  end if;

  -- Standard broadcast — top 5 nearby qualified providers
  insert into match_attempts (request_id, provider_id, distance_km, rank_score)
  select p_request_id, p.provider_id, p.distance_km, p.rank_score
  from find_nearby_providers(v_request.service_id, v_request.pickup_loc, p_radius_km, 5) p;

  get diagnostics v_count = row_count;

  if v_count > 0 then
    insert into notifications (user_id, type, payload)
    select provider_id, 'new_request_offered', jsonb_build_object(
      'request_id', p_request_id,
      'service_id', v_request.service_id
    )
    from match_attempts where request_id = p_request_id;
  end if;

  return v_count;
end;
$$;

grant execute on function public.broadcast_request(uuid, int) to authenticated, service_role;

-- =========================================================================
-- expand_broadcast_to_pool — fall through after the preferred helper's
-- 2-minute window expires. Adds the top N other qualified providers as
-- additional match_attempts so the request actually finds someone.
-- =========================================================================
create or replace function public.expand_broadcast_to_pool(
  p_request_id uuid,
  p_radius_km int default 20
) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_request record;
  v_added int := 0;
begin
  select r.*, a.location as pickup_loc
  into v_request
  from requests r
  left join addresses a on a.id = r.pickup_address_id
  where r.id = p_request_id;

  if not found or v_request.pickup_loc is null then
    return 0;
  end if;

  -- Only expand if request is still actively matching and the preferred
  -- window has actually closed. Belt-and-braces against the cron firing
  -- against a request the helper has since accepted.
  if v_request.status <> 'matching' then
    return 0;
  end if;
  if v_request.preferred_until is null or v_request.preferred_until > now() then
    return 0;
  end if;

  -- Append nearby providers we haven't already offered the request to
  insert into match_attempts (request_id, provider_id, distance_km, rank_score)
  select p_request_id, p.provider_id, p.distance_km, p.rank_score
  from find_nearby_providers(v_request.service_id, v_request.pickup_loc, p_radius_km, 5) p
  where not exists (
    select 1 from match_attempts ma
    where ma.request_id = p_request_id and ma.provider_id = p.provider_id
  );

  get diagnostics v_added = row_count;

  if v_added > 0 then
    insert into notifications (user_id, type, payload)
    select ma.provider_id, 'new_request_offered', jsonb_build_object(
      'request_id', p_request_id,
      'service_id', v_request.service_id
    )
    from match_attempts ma
    where ma.request_id = p_request_id
      and ma.preferred = false
      and not exists (
        select 1 from notifications n
        where n.user_id = ma.provider_id
          and n.payload ->> 'request_id' = p_request_id::text
          and n.type = 'new_request_offered'
      );
  end if;

  -- Clear preferred_until so the cron doesn't keep picking this up
  update requests set preferred_until = null where id = p_request_id;

  return v_added;
end;
$$;

grant execute on function public.expand_broadcast_to_pool(uuid, int) to authenticated, service_role;
