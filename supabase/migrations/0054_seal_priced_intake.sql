-- CLASS: deploy-coupled
-- =========================================================================
-- 0054 — seal the answers that set the price
--
-- accept_request has always re-derived the price from the CATALOG and
-- ignored whatever the request stored. That is what stops a customer
-- editing their own price between submitting and a helper accepting: the
-- stored number is never trusted.
--
-- 0053 makes the price depend on the customer's own intake — duration,
-- dog count, crew size. Pricing from intake at acceptance would hand that
-- guarantee straight back: req_update (0002) lets a customer update their
-- own request, so "8 hours" could become "30 minutes" after a helper
-- accepted an eight-hour job, and acceptance would price the shorter one.
--
-- So the priced answers get the same treatment the bundle stop set got in
-- 0035: fingerprinted at creation, recomputed at acceptance, refused if
-- they changed. The customer may still edit a request — they simply
-- cannot do it after an offer went out and have the new answers priced.
--
-- Deploy-coupled: the application must call seal_request_quote() when it
-- creates a request, or every acceptance fails on an absent fingerprint.
-- =========================================================================

-- -------------------------------------------------------------------------
-- The fingerprint
-- -------------------------------------------------------------------------
-- Covers the service, every intake field that CAN affect price for that
-- service, and the resulting subtotal. Including the subtotal means a
-- change to the RATES also invalidates outstanding offers, which is
-- correct: a helper accepted a job at a quoted price.
create or replace function public.compute_request_fingerprint(p_request_id uuid)
returns text
language plpgsql stable security definer set search_path = public as $$
declare
  v_request record;
  v_rule service_pricing%rowtype;
  v_parts text;
begin
  select id, service_id, intake into v_request from requests where id = p_request_id;
  if not found then
    raise exception 'Request % not found', p_request_id;
  end if;

  select * into v_rule from service_pricing where service_id = v_request.service_id;

  -- Only the fields that actually price this service. Hashing the whole
  -- intake blob would void an offer because the customer fixed a typo in
  -- their notes.
  v_parts := 'v1|' || coalesce(v_request.service_id, '')
    || '|d:' || coalesce(v_request.intake ->> coalesce(v_rule.duration_field, 'duration_min'), '')
    || '|u:' || coalesce(v_request.intake ->> coalesce(v_rule.unit_field, '-'), '')
    || '|c:' || coalesce(v_request.intake ->> coalesce(v_rule.crew_field, '-'), '')
    || '|s:' || price_service_cents(v_request.service_id, coalesce(v_request.intake, '{}'::jsonb))::text;

  return encode(sha256(convert_to(v_parts, 'UTF8')), 'hex');
end;
$$;

revoke execute on function public.compute_request_fingerprint(uuid) from public;
grant execute on function public.compute_request_fingerprint(uuid) to authenticated, service_role;

-- -------------------------------------------------------------------------
-- Sealing
-- -------------------------------------------------------------------------
-- Called once, by the server, as the request is created. Refuses to
-- re-seal: a second call after an offer went out would launder exactly
-- the edit this exists to catch.
create or replace function public.seal_request_quote(p_request_id uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_existing text;
  v_status text;
  v_fingerprint text;
begin
  select quote_fingerprint, status into v_existing, v_status
    from requests where id = p_request_id for update;
  if not found then raise exception 'Request % not found', p_request_id; end if;

  if v_existing is not null then
    raise exception 'Request % is already sealed', p_request_id using errcode = 'HW020';
  end if;

  v_fingerprint := compute_request_fingerprint(p_request_id);
  update requests set quote_fingerprint = v_fingerprint where id = p_request_id;
  return v_fingerprint;
end;
$$;

revoke execute on function public.seal_request_quote(uuid) from public, anon, authenticated;
grant execute on function public.seal_request_quote(uuid) to service_role;

-- -------------------------------------------------------------------------
-- accept_request prices from the sealed answers
-- -------------------------------------------------------------------------
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

  perform assert_helper_payable(p_provider_id);

  select * into v_service from services where id = v_request.service_id;

  if coalesce(v_request.is_bundle, false) then
    v_subtotal := bundle_subtotal_cents(p_request_id);
    if v_subtotal <= 0 then
      raise exception 'Bundle has no priced stops';
    end if;
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

    -- The price now depends on the customer's own answers, so those
    -- answers must be the ones the offer was made against.
    if coalesce(v_request.quote_fingerprint, '') = '' then
      raise exception 'Request was never sealed with a quote fingerprint'
        using errcode = 'HW021';
    end if;
    if compute_request_fingerprint(p_request_id) <> v_request.quote_fingerprint then
      raise exception 'The job changed after it was quoted and offered — refusing to accept'
        using errcode = 'HW022';
    end if;

    v_subtotal := price_service_cents(v_request.service_id, coalesce(v_request.intake, '{}'::jsonb));
  end if;

  v_payout   := round(v_subtotal * 0.80);
  v_platform := (v_subtotal - v_payout) + v_fee;

  -- Currency follows the JOB, not the customer (0052).
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
