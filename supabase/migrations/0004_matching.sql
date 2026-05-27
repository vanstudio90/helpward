-- Helpward matching engine: PostGIS proximity + broadcast + accept functions.
-- All security definer so they can run from a customer/provider context but
-- still touch tables the caller doesn't directly have RLS rights on.

-- =========================================================================
-- find_nearby_providers — proximity + service + status filter
-- =========================================================================
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
  select
    pp.user_id as provider_id,
    round((st_distance(pp.current_location, p_pickup) / 1000.0)::numeric, 2) as distance_km,
    pp.rating_avg,
    -- Rank: closer = better, higher rating = better, more experience = small boost
    (1.0 / greatest(st_distance(pp.current_location, p_pickup) / 1000.0, 0.5)) * 0.5
    + coalesce(pp.rating_avg / 5.0, 0.7) * 0.3
    + (case when pp.tasks_completed > 50 then 0.2 when pp.tasks_completed > 10 then 0.15 else 0.1 end) as rank_score
  from provider_profiles pp
  inner join provider_services ps on ps.provider_id = pp.user_id
  where ps.service_id = p_service_id
    and pp.status = 'approved'
    and pp.is_online = true
    and pp.current_location is not null
    and st_dwithin(pp.current_location, p_pickup, p_radius_km * 1000)
  order by rank_score desc
  limit p_limit;
$$;

grant execute on function public.find_nearby_providers(text, geography, int, int) to authenticated, service_role;

-- =========================================================================
-- broadcast_request — insert match_attempts + notifications for top N nearby
-- providers. Returns count notified. Idempotent-ish: refuses to broadcast if
-- there are already match_attempts on the request.
-- =========================================================================
create or replace function public.broadcast_request(
  p_request_id uuid,
  p_radius_km int default 20
) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_request record;
  v_count int := 0;
begin
  -- Skip if already broadcast
  if exists (select 1 from match_attempts where request_id = p_request_id) then
    return 0;
  end if;

  -- Get request + pickup geography
  select r.*, a.location as pickup_loc
  into v_request
  from requests r
  left join addresses a on a.id = r.pickup_address_id
  where r.id = p_request_id;

  if not found or v_request.pickup_loc is null then
    return 0;
  end if;

  -- Insert match_attempts for top 5 nearby providers
  insert into match_attempts (request_id, provider_id, distance_km, rank_score)
  select p_request_id, p.provider_id, p.distance_km, p.rank_score
  from find_nearby_providers(v_request.service_id, v_request.pickup_loc, p_radius_km, 5) p;

  get diagnostics v_count = row_count;

  -- Notifications for each matched provider
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
-- accept_request — provider accepts; creates booking, updates statuses,
-- creates conversation, notifies customer.
-- =========================================================================
create or replace function public.accept_request(
  p_request_id uuid,
  p_provider_id uuid
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_request record;
  v_service record;
  v_booking_id uuid;
  v_currency text;
begin
  -- Caller must be the provider being assigned (or service role / admin)
  if auth.uid() is not null and auth.uid() <> p_provider_id
    and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin'
  then
    raise exception 'You can only accept requests offered to you';
  end if;

  -- Get request (and lock row to prevent race)
  select * into v_request from requests where id = p_request_id for update;
  if not found then
    raise exception 'Request not found';
  end if;
  if v_request.status <> 'matching' then
    raise exception 'Request is no longer available';
  end if;

  -- Validate this provider was actually offered the request
  if not exists (
    select 1 from match_attempts
    where request_id = p_request_id and provider_id = p_provider_id
  ) then
    raise exception 'Request was not offered to this provider';
  end if;

  -- Get service pricing
  select * into v_service from services where id = v_request.service_id;
  v_currency := case (select country from profiles where id = v_request.customer_id)
                  when 'CA' then 'CAD' else 'USD' end;

  -- Create the booking
  insert into bookings (
    request_id, customer_id, provider_id, service_id, status,
    scheduled_for,
    base_price_cents, service_fee_cents, total_cents,
    platform_fee_cents, payout_cents, currency
  ) values (
    p_request_id, v_request.customer_id, p_provider_id, v_request.service_id, 'scheduled',
    coalesce(v_request.scheduled_for, now()),
    v_service.base_price_cents,
    450,                                  -- $4.50 fixed service fee
    v_service.base_price_cents + 450,
    round((v_service.base_price_cents + 450) * 0.20),  -- 20% platform fee
    round((v_service.base_price_cents + 450) * 0.80),  -- 80% provider payout
    v_currency
  ) returning id into v_booking_id;

  -- Update request status
  update requests set status = 'matched' where id = p_request_id;

  -- Mark this provider's match_attempt accepted, others timed out
  update match_attempts
    set responded_at = now(), response = 'accept'
   where request_id = p_request_id and provider_id = p_provider_id;
  update match_attempts
    set responded_at = now(), response = 'timeout'
   where request_id = p_request_id and provider_id <> p_provider_id and responded_at is null;

  -- Open a conversation
  insert into conversations (booking_id, customer_id, provider_id)
  values (v_booking_id, v_request.customer_id, p_provider_id);

  -- Notify customer
  insert into notifications (user_id, type, payload)
  values (v_request.customer_id, 'booking_accepted', jsonb_build_object('booking_id', v_booking_id));

  return v_booking_id;
end;
$$;

grant execute on function public.accept_request(uuid, uuid) to authenticated, service_role;

-- =========================================================================
-- decline_request — provider declines; just marks their match_attempt
-- =========================================================================
create or replace function public.decline_request(
  p_request_id uuid,
  p_provider_id uuid
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and auth.uid() <> p_provider_id
    and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin'
  then
    raise exception 'You can only decline requests offered to you';
  end if;

  update match_attempts
    set responded_at = now(), response = 'decline'
  where request_id = p_request_id
    and provider_id = p_provider_id
    and responded_at is null;
end;
$$;

grant execute on function public.decline_request(uuid, uuid) to authenticated, service_role;

-- =========================================================================
-- start_booking — provider says "I've arrived / starting"
-- =========================================================================
create or replace function public.start_booking(p_booking_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_booking record;
begin
  select * into v_booking from bookings where id = p_booking_id;
  if not found then
    raise exception 'Booking not found';
  end if;
  if auth.uid() <> v_booking.provider_id
    and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin'
  then
    raise exception 'Only the provider can start this booking';
  end if;
  if v_booking.status <> 'scheduled' then
    raise exception 'Booking is not in scheduled state';
  end if;

  update bookings
    set status = 'in_progress', started_at = now()
    where id = p_booking_id;

  insert into notifications (user_id, type, payload)
  values (v_booking.customer_id, 'task_started', jsonb_build_object('booking_id', p_booking_id));
end;
$$;
grant execute on function public.start_booking(uuid) to authenticated, service_role;

-- =========================================================================
-- complete_booking — provider marks done (customer can confirm later)
-- =========================================================================
create or replace function public.complete_booking(p_booking_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_booking record;
begin
  select * into v_booking from bookings where id = p_booking_id;
  if not found then
    raise exception 'Booking not found';
  end if;
  if auth.uid() <> v_booking.provider_id
    and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin'
  then
    raise exception 'Only the provider can complete this booking';
  end if;
  if v_booking.status <> 'in_progress' then
    raise exception 'Booking is not in progress';
  end if;

  update bookings
    set status = 'completed', completed_at = now()
    where id = p_booking_id;

  -- Bump provider's task count
  update provider_profiles
    set tasks_completed = tasks_completed + 1
    where user_id = v_booking.provider_id;

  insert into notifications (user_id, type, payload)
  values (v_booking.customer_id, 'task_completed', jsonb_build_object('booking_id', p_booking_id));
end;
$$;
grant execute on function public.complete_booking(uuid) to authenticated, service_role;

-- =========================================================================
-- cancel_request — customer cancels a pending matching request
-- =========================================================================
create or replace function public.cancel_request(p_request_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_request record;
begin
  select * into v_request from requests where id = p_request_id;
  if not found then
    raise exception 'Request not found';
  end if;
  if auth.uid() <> v_request.customer_id
    and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin'
  then
    raise exception 'You can only cancel your own requests';
  end if;
  if v_request.status not in ('draft','matching') then
    raise exception 'Request can no longer be cancelled at status %', v_request.status;
  end if;

  update requests set status = 'cancelled' where id = p_request_id;
end;
$$;
grant execute on function public.cancel_request(uuid) to authenticated, service_role;
