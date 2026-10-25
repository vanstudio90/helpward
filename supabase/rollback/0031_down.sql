-- REVERT 0031 — restores the ORIGINAL payout split, where both the platform
-- fee and the helper payout were computed off (base + $4.50), so the helper
-- received 80% of the service fee too.
--
-- 0031 is backward COMPATIBLE: it depends on no new column and the old
-- application code calls accept_request with the same signature, so a
-- rollback does NOT require running this. Only run it if the 80/20-on-
-- subtotal decision itself is being reversed.
--
-- It also reverts the bundle fix, so accepting a multi-stop bundle will once
-- again price the booking from the parent request's primary service only.

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

  select * into v_service from services where id = v_request.service_id;
  v_currency := case (select country from profiles where id = v_request.customer_id)
                  when 'CA' then 'CAD' else 'USD' end;

  insert into bookings (
    request_id, customer_id, provider_id, service_id, status,
    scheduled_for,
    base_price_cents, service_fee_cents, total_cents,
    platform_fee_cents, payout_cents, currency
  ) values (
    p_request_id, v_request.customer_id, p_provider_id, v_request.service_id, 'scheduled',
    coalesce(v_request.scheduled_for, now()),
    v_service.base_price_cents,
    450,
    v_service.base_price_cents + 450,
    round((v_service.base_price_cents + 450) * 0.20),
    round((v_service.base_price_cents + 450) * 0.80),
    v_currency
  ) returning id into v_booking_id;

  update requests set status = 'matched' where id = p_request_id;
  update match_attempts set responded_at = now(), response = 'accept'
   where request_id = p_request_id and provider_id = p_provider_id;
  update match_attempts set responded_at = now(), response = 'timeout'
   where request_id = p_request_id and provider_id <> p_provider_id and responded_at is null;

  insert into conversations (booking_id, customer_id, provider_id)
  values (v_booking_id, v_request.customer_id, p_provider_id);
  insert into notifications (user_id, type, payload)
  values (v_request.customer_id, 'booking_accepted', jsonb_build_object('booking_id', v_booking_id));

  return v_booking_id;
end;
$$;

grant execute on function public.accept_request(uuid, uuid) to authenticated, service_role;
