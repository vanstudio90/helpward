-- CLASS: deploy-coupled
-- =========================================================================
-- 0058 — acceptance seeds the crew and staffs the rest
--
-- 0057 gave a booking a crew; this fills it. When a helper accepts a job
-- the customer paid to staff with four people, the accepting helper
-- becomes the LEAD and the remaining places are opened to the helpers who
-- were offered the same request.
--
-- Deploy-coupled: it rewrites accept_request.
-- =========================================================================

-- How many helpers the customer asked for, read through the same pricing
-- rule that charged them for it — so staffing and billing cannot disagree.
create or replace function public.requested_crew_size(p_request_id uuid)
returns int
language plpgsql stable security definer set search_path = public as $$
declare
  v_request record;
  v_rule service_pricing%rowtype;
  v_size int;
begin
  select service_id, intake into v_request from requests where id = p_request_id;
  if not found then return 1; end if;

  select * into v_rule from service_pricing where service_id = v_request.service_id;
  if v_rule.crew_field is null then return 1; end if;

  begin
    v_size := nullif(trim(coalesce(v_request.intake ->> v_rule.crew_field, '')), '')::int;
  exception when invalid_text_representation then
    return 1;
  end;

  -- Clamped: the customer is billed per helper, so a nonsense answer must
  -- not open an unbounded number of paid places.
  return greatest(1, least(coalesce(v_size, 1), 10));
end;
$$;

revoke execute on function public.requested_crew_size(uuid) from public;
grant execute on function public.requested_crew_size(uuid) to authenticated, service_role;

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
  v_subtotal int;
  v_fee constant int := 450;
  v_payout int;
  v_platform int;
  v_crew int;
begin
  if auth.uid() is not null and auth.uid() <> p_provider_id
    and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin'
  then
    raise exception 'You can only accept requests offered to you';
  end if;

  select * into v_request from requests where id = p_request_id for update;
  if not found then raise exception 'Request not found'; end if;
  if v_request.status <> 'matching' then raise exception 'Request is no longer available'; end if;

  if not exists (
    select 1 from match_attempts
    where request_id = p_request_id and provider_id = p_provider_id
  ) then
    raise exception 'Request was not offered to this provider';
  end if;

  perform assert_helper_payable(p_provider_id);

  select * into v_service from services where id = v_request.service_id;

  if coalesce(v_request.is_bundle, false) then
    v_subtotal := bundle_subtotal_cents(p_request_id);
    if v_subtotal <= 0 then raise exception 'Bundle has no priced stops'; end if;
    if coalesce(v_request.quote_fingerprint, '') = '' then
      raise exception 'Bundle was never sealed with a quote fingerprint';
    end if;
    if compute_bundle_fingerprint(p_request_id) <> v_request.quote_fingerprint then
      raise exception 'Bundle changed after it was quoted and offered — refusing to accept';
    end if;
    v_crew := 1;
  else
    if v_service.id is null or not v_service.active then
      raise exception 'Service is no longer available';
    end if;
    if coalesce(v_request.quote_fingerprint, '') = '' then
      raise exception 'Request was never sealed with a quote fingerprint' using errcode = 'HW021';
    end if;
    if compute_request_fingerprint(p_request_id) <> v_request.quote_fingerprint then
      raise exception 'The job changed after it was quoted and offered — refusing to accept'
        using errcode = 'HW022';
    end if;
    v_subtotal := price_service_cents(v_request.service_id, coalesce(v_request.intake, '{}'::jsonb));
    v_crew := requested_crew_size(p_request_id);
  end if;

  v_payout   := round(v_subtotal * 0.80);
  v_platform := (v_subtotal - v_payout) + v_fee;

  select case a.country when 'CA' then 'CAD' else 'USD' end
    into v_currency
    from addresses a where a.id = v_request.pickup_address_id;
  if v_currency is null then
    raise exception 'Request % has no pickup address to price from', p_request_id;
  end if;

  insert into bookings (
    request_id, customer_id, provider_id, service_id, status,
    scheduled_for,
    base_price_cents, distance_cents, service_fee_cents, total_cents,
    platform_fee_cents, payout_cents, currency, intake, crew_size
  ) values (
    p_request_id, v_request.customer_id, p_provider_id, v_request.service_id, 'scheduled',
    coalesce(v_request.scheduled_for, now()),
    v_subtotal, 0, v_fee, v_subtotal + v_fee,
    v_platform, v_payout, v_currency,
    v_request.intake, v_crew
  ) returning id into v_booking_id;

  -- The accepting helper leads. accept_crew_invite computes their share.
  insert into booking_crew (booking_id, provider_id, is_lead, status, invited_at)
  values (v_booking_id, p_provider_id, true, 'invited', now());
  perform accept_crew_invite(v_booking_id, p_provider_id);

  update requests set status = 'matched' where id = p_request_id;
  update match_attempts set responded_at = now(), response = 'accept'
   where request_id = p_request_id and provider_id = p_provider_id;

  if v_crew > 1 then
    -- The other helpers who were offered this request keep their place:
    -- they are now invited to join the crew rather than timed out. The
    -- customer paid for a crew; somebody has to staff it.
    insert into booking_crew (booking_id, provider_id, is_lead, status)
    select v_booking_id, m.provider_id, false, 'invited'
      from match_attempts m
     where m.request_id = p_request_id
       and m.provider_id <> p_provider_id
       and m.responded_at is null
    on conflict (booking_id, provider_id) do nothing;

    insert into notifications (user_id, type, payload)
    select m.provider_id, 'crew_invite',
           jsonb_build_object('booking_id', v_booking_id,
                              'places', v_crew - 1,
                              'service_id', v_request.service_id)
      from match_attempts m
     where m.request_id = p_request_id
       and m.provider_id <> p_provider_id
       and m.responded_at is null;
  else
    update match_attempts set responded_at = now(), response = 'timeout'
     where request_id = p_request_id and provider_id <> p_provider_id and responded_at is null;
  end if;

  insert into conversations (booking_id, customer_id, provider_id)
  values (v_booking_id, v_request.customer_id, p_provider_id);
  insert into notifications (user_id, type, payload)
  values (v_request.customer_id, 'booking_accepted',
          jsonb_build_object('booking_id', v_booking_id, 'crew_size', v_crew));

  return v_booking_id;
end;
$$;

grant execute on function public.accept_request(uuid, uuid) to authenticated, service_role;

-- -------------------------------------------------------------------------
-- A crewed job cannot start short-handed
-- -------------------------------------------------------------------------
create or replace function public.start_booking(p_booking_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_booking record;
  v_short int;
begin
  select * into v_booking from bookings where id = p_booking_id for update;
  if not found then raise exception 'Booking not found'; end if;
  if auth.uid() <> v_booking.provider_id
    and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin'
  then
    raise exception 'Only the provider can start this booking';
  end if;
  if v_booking.status <> 'scheduled' then
    raise exception 'Booking is not in scheduled state';
  end if;

  perform assert_booking_paid(v_booking);

  -- The customer paid for a crew. Starting with half of it is starting a
  -- different job from the one they bought.
  if coalesce(v_booking.crew_size, 1) > 1 then
    v_short := crew_shortfall(p_booking_id);
    if v_short > 0 then
      raise exception
        'This job needs % more helper(s) before it can start.', v_short
        using errcode = 'HW041';
    end if;
  end if;

  update bookings set status = 'in_progress', started_at = now() where id = p_booking_id;

  insert into notifications (user_id, type, payload)
  values (v_booking.customer_id, 'task_started', jsonb_build_object('booking_id', p_booking_id));
end;
$$;

revoke execute on function public.start_booking(uuid) from public;
grant execute on function public.start_booking(uuid) to authenticated, service_role;
