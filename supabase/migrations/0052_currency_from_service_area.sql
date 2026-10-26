-- CLASS: deploy-coupled
-- =========================================================================
-- 0052 — price a job in the currency of the place it happens
--
-- accept_request derived currency from the CUSTOMER's profiles.country:
--
--   v_currency := case (select country from profiles
--                        where id = v_request.customer_id)
--                   when 'CA' then 'CAD' else 'USD' end;
--
-- So an American booking a job in Vancouver got a USD booking, and the
-- destination charge went to a Canadian connected account, which settles
-- in CAD. Independent testing hit this from the other side: a CAD charge
-- to a US test account settled in USD, and the split could not be
-- reconciled against the quote.
--
-- The pickup address is the fact that matters — it is where the work
-- happens, it carries its own country, and the geocoder verified it
-- before the request could be dispatched at all.
--
-- Deploy-coupled: it changes the currency on new bookings, so the
-- release that displays and charges them must already be live.
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
  if not found then raise exception 'Request not found'; end if;
  if v_request.status <> 'matching' then raise exception 'Request is no longer available'; end if;

  if not exists (
    select 1 from match_attempts
    where request_id = p_request_id and provider_id = p_provider_id
  ) then
    raise exception 'Request was not offered to this provider';
  end if;

  -- A helper who cannot be paid may not take work. The server action also
  -- refuses and rolls the acceptance back, but that is a code path, not a
  -- rule: PostgREST exposes accept_request directly, so a helper calling
  -- the RPC themselves would otherwise skip it. Refusing here also spares
  -- the customer an accept-then-cancel they would have seen.
  perform assert_helper_payable(p_provider_id);

  select * into v_service from services where id = v_request.service_id;

  if coalesce(v_request.is_bundle, false) then
    -- Raises if any stored stop price disagrees with the catalog.
    v_subtotal := bundle_subtotal_cents(p_request_id);
    if v_subtotal <= 0 then
      raise exception 'Bundle has no priced stops';
    end if;
    -- The sealed quote must still describe this bundle. bundle_item_count
    -- alone was not an independent check: it is a parent column the
    -- customer could edit to agree with a shortened stop set.
    if coalesce(v_request.quote_fingerprint, '') = '' then
      raise exception 'Bundle was never sealed with a quote fingerprint';
    end if;
    if compute_bundle_fingerprint(p_request_id) <> v_request.quote_fingerprint then
      raise exception 'Bundle changed after it was quoted and offered — refusing to accept';
    end if;
  else
    if v_service.id is null or not v_service.active then
      raise exception 'Service is no longer available';
    end if;
    v_subtotal := v_service.base_price_cents;
  end if;

  v_payout   := round(v_subtotal * 0.80);
  v_platform := (v_subtotal - v_payout) + v_fee;

  -- Currency follows the JOB, not the customer.
  --
  -- This used to read the customer's profiles.country, so an American
  -- visiting Vancouver was quoted USD for a job in Canada — and the
  -- destination charge then went to a Canadian connected account, which
  -- settles CAD. Independent testing hit exactly this: a CAD charge to a
  -- US account settled in USD and the allocation could not be checked.
  --
  -- The pickup address is where the work happens and carries its own
  -- country, verified by the geocoder before the request was accepted.
  select case a.country when 'CA' then 'CAD' else 'USD' end
    into v_currency
    from addresses a
   where a.id = v_request.pickup_address_id;

  if v_currency is null then
    raise exception 'Request % has no pickup address to price from', p_request_id;
  end if;

  insert into bookings (
    request_id, customer_id, provider_id, service_id, status,
    scheduled_for,
    base_price_cents, distance_cents, service_fee_cents, total_cents,
    platform_fee_cents, payout_cents, currency, intake
  ) values (
    p_request_id, v_request.customer_id, p_provider_id, v_request.service_id, 'scheduled',
    coalesce(v_request.scheduled_for, now()),
    v_subtotal, 0, v_fee, v_subtotal + v_fee,
    v_platform, v_payout, v_currency,
    -- Carried over so the helper keeps the brief for the whole job.
    v_request.intake
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
