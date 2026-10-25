-- Agreed payout model (2026-10-24):
--   Helper   = 80% of the service subtotal + 100% of any tip
--   Helpward = 20% of the service subtotal + the $4.50 service fee
--
-- Previously accept_request computed BOTH sides off (base + 450), so the
-- helper received 80% of the service fee too and Helpward netted $0.90 of
-- it — contradicting the published /vs/pricing explanation that the flat
-- fee covers platform costs.
--
-- Also fixes bundle pricing at acceptance: the booking was priced from the
-- parent request's primary service only, so accepting a 3-stop bundle
-- created a booking charging for one stop. The subtotal now sums the
-- bundle items.
--
-- Rounding: the helper's 80% is rounded and the platform takes the exact
-- remainder, so the subtotal always splits with no cent created or lost.
--
-- distance_cents stays 0. Nothing computes a distance component anywhere in
-- the system; if one is ever introduced, whether it is commissionable is an
-- open decision (see DISTANCE_IS_COMMISSIONABLE in lib/pricing.ts).

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
begin
  if auth.uid() is not null and auth.uid() <> p_provider_id
    and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin'
  then
    raise exception 'You can only accept requests offered to you';
  end if;

  select * into v_request from requests where id = p_request_id for update;
  if not found then
    raise exception 'Request not found';
  end if;
  if v_request.status <> 'matching' then
    raise exception 'Request is no longer available';
  end if;

  if not exists (
    select 1 from match_attempts
    where request_id = p_request_id and provider_id = p_provider_id
  ) then
    raise exception 'Request was not offered to this provider';
  end if;

  select * into v_service from services where id = v_request.service_id;

  -- Commissionable subtotal: every stop for a bundle, the single service
  -- price otherwise.
  if coalesce(v_request.is_bundle, false) then
    select coalesce(sum(item_price_cents), 0) into v_subtotal
      from request_bundle_items where request_id = p_request_id;
  else
    v_subtotal := v_service.base_price_cents;
  end if;

  v_payout   := round(v_subtotal * 0.80);
  v_platform := (v_subtotal - v_payout) + v_fee;   -- 20% of subtotal + fee

  v_currency := case (select country from profiles where id = v_request.customer_id)
                  when 'CA' then 'CAD' else 'USD' end;

  insert into bookings (
    request_id, customer_id, provider_id, service_id, status,
    scheduled_for,
    base_price_cents, distance_cents, service_fee_cents, total_cents,
    platform_fee_cents, payout_cents, currency
  ) values (
    p_request_id, v_request.customer_id, p_provider_id, v_request.service_id, 'scheduled',
    coalesce(v_request.scheduled_for, now()),
    v_subtotal,
    0,
    v_fee,
    v_subtotal + v_fee,
    v_platform,
    v_payout,
    v_currency
  ) returning id into v_booking_id;

  update requests set status = 'matched' where id = p_request_id;

  update match_attempts
    set responded_at = now(), response = 'accept'
   where request_id = p_request_id and provider_id = p_provider_id;
  update match_attempts
    set responded_at = now(), response = 'timeout'
   where request_id = p_request_id and provider_id <> p_provider_id and responded_at is null;

  insert into conversations (booking_id, customer_id, provider_id)
  values (v_booking_id, v_request.customer_id, p_provider_id);

  insert into notifications (user_id, type, payload)
  values (v_request.customer_id, 'booking_accepted', jsonb_build_object('booking_id', v_booking_id));

  return v_booking_id;
end;
$$;

grant execute on function public.accept_request(uuid, uuid) to authenticated, service_role;
