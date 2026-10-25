-- Protect server attestations from the clients they are meant to constrain.
--
-- Independent review found that the new trust signals were writable by the
-- very parties they gate:
--
--   R01  addresses.geocode_verified is server attestation, but policy
--        addr_self (0002) is FOR ALL on the owner's own rows and this
--        column was added with no restriction. A customer could set
--        geocode_verified = true themselves, or move a verified address's
--        coordinates while keeping the flag. Any non-placeholder point
--        inside an active polygon would then dispatch with no Mapbox
--        verification at all. saved_addresses had the same hole.
--
--   R02  accept_request now prices a bundle from
--        request_bundle_items.item_price_cents, but policy rbi_write_own
--        (0015) is FOR ALL for the customer, and rbi_update_assigned_helper
--        grants the helper whole-row UPDATE. Either party could rewrite a
--        stop price between request creation and acceptance. Catalog
--        validation in the server action does not constrain a later direct
--        database write.
--
-- Approach: column-level privileges where they suffice, plus BEFORE
-- triggers that re-assert the invariant for every writer that is not the
-- service role. Triggers rather than policies because RLS cannot express
-- "this column may not change".

-- =========================================================================
-- R01 — geocode attestation
-- =========================================================================

-- Only the service role may write the attestation columns directly.
revoke update (geocode_verified, needs_reconfirmation, geocoded_at, geocode_note)
  on addresses from authenticated;
revoke update (geocode_verified, needs_reconfirmation, geocoded_at, geocode_note)
  on saved_addresses from authenticated;

create or replace function public.enforce_address_attestation()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_is_service boolean := coalesce(current_setting('request.jwt.claims', true), '') = ''
                          or jwt_role() = 'service_role';
begin
  -- The service role (server actions, backfill, cron) attests. Everyone
  -- else gets the flag forced off.
  if v_is_service then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.geocode_verified := false;
    new.needs_reconfirmation := coalesce(new.needs_reconfirmation, false);
    new.geocoded_at := null;
    new.geocode_note := null;
    return new;
  end if;

  -- UPDATE: an attestation cannot be granted, and it cannot survive a
  -- change to the thing it attests to.
  if coalesce(new.geocode_verified, false) and not coalesce(old.geocode_verified, false) then
    new.geocode_verified := false;
  end if;

  if tg_table_name = 'addresses' then
    if new.location is distinct from old.location
       or new.formatted is distinct from old.formatted then
      new.geocode_verified := false;
      new.needs_reconfirmation := true;
      new.geocode_note := 'verification cleared: address or coordinates changed by the owner';
    end if;
  else
    if new.lat is distinct from old.lat
       or new.lng is distinct from old.lng
       or new.formatted is distinct from old.formatted then
      new.geocode_verified := false;
      new.needs_reconfirmation := true;
      new.geocode_note := 'verification cleared: address or coordinates changed by the owner';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_addresses_attestation on addresses;
create trigger trg_addresses_attestation
  before insert or update on addresses
  for each row execute function public.enforce_address_attestation();

drop trigger if exists trg_saved_addresses_attestation on saved_addresses;
create trigger trg_saved_addresses_attestation
  before insert or update on saved_addresses
  for each row execute function public.enforce_address_attestation();

-- =========================================================================
-- R02 — bundle stop prices are a server quote, not customer input
-- =========================================================================

revoke update (item_price_cents, service_id, position)
  on request_bundle_items from authenticated;

create or replace function public.enforce_bundle_item_quote()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_is_service boolean := coalesce(current_setting('request.jwt.claims', true), '') = ''
                          or jwt_role() = 'service_role';
  v_catalog_price int;
begin
  if v_is_service then
    -- Even the server writes the catalog price, never a client-supplied
    -- one, so a bug in the action cannot mint a cheaper stop.
    if tg_op = 'INSERT' then
      select base_price_cents into v_catalog_price
        from services where id = new.service_id and active;
      if v_catalog_price is null then
        raise exception 'bundle stop references an inactive or unknown service: %', new.service_id;
      end if;
      new.item_price_cents := v_catalog_price;
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    raise exception 'bundle stops are created by the server, not directly';
  end if;

  -- Customers may edit their own notes; helpers may record completion
  -- state. Neither may touch price, service or ordering.
  if new.item_price_cents is distinct from old.item_price_cents
     or new.service_id is distinct from old.service_id
     or new.position is distinct from old.position then
    raise exception 'bundle stop price, service and position are fixed at request creation';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_bundle_item_quote on request_bundle_items;
create trigger trg_bundle_item_quote
  before insert or update on request_bundle_items
  for each row execute function public.enforce_bundle_item_quote();

-- accept_request re-derives the subtotal from the CATALOG at acceptance
-- time and compares it to the stored stops, so acceptance never trusts a
-- stored number on its own.
create or replace function public.bundle_subtotal_cents(p_request_id uuid)
returns int
language plpgsql stable security definer set search_path = public as $$
declare
  v_stored int;
  v_catalog int;
begin
  select coalesce(sum(i.item_price_cents), 0) into v_stored
    from request_bundle_items i where i.request_id = p_request_id;

  select coalesce(sum(s.base_price_cents), 0) into v_catalog
    from request_bundle_items i
    join services s on s.id = i.service_id and s.active
   where i.request_id = p_request_id;

  if v_stored <> v_catalog then
    raise exception 'bundle stop prices do not match the catalog (stored %, catalog %) — refusing to accept', v_stored, v_catalog;
  end if;
  return v_catalog;
end;
$$;

grant execute on function public.bundle_subtotal_cents(uuid) to service_role;

-- =========================================================================
-- R04 — let the service-role loader through its own guard
-- =========================================================================
--
-- jwt_role() returns 'service_role' for a service-role request, so
-- is_admin() is false while request.jwt.claims is populated: the old guard
-- raised 'admin only' for exactly the caller it was granted to, making the
-- documented boundary load impossible.
create or replace function public.insert_service_area_boundary(
  p_dataset_id text,
  p_area_id text,
  p_municipality text,
  p_geojson text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_role text := jwt_role();
  v_no_claims boolean := coalesce(current_setting('request.jwt.claims', true), '') = '';
begin
  -- Allowed: the service role (the loader), an admin, or a direct psql
  -- session with no JWT at all. Everyone else is denied explicitly.
  if not (v_no_claims or v_role = 'service_role' or v_role = 'admin') then
    raise exception 'insert_service_area_boundary: not authorised for role %', v_role;
  end if;

  insert into service_area_boundaries (dataset_id, area_id, municipality, boundary)
  values (
    p_dataset_id, p_area_id, p_municipality,
    st_multi(st_setsrid(st_geomfromgeojson(p_geojson), 4326))::geometry(MultiPolygon, 4326)
  );
end;
$$;

-- =========================================================================
-- R05 — remove the default PUBLIC execute grant on privileged functions
-- =========================================================================
--
-- Postgres grants EXECUTE on a new function to PUBLIC by default, and a
-- narrower GRANT does not revoke it. Every SECURITY DEFINER function below
-- is therefore callable by anon/authenticated unless PUBLIC is revoked
-- first. record_dispatch_refusal in particular writes rows and notifies
-- every admin, so an unauthenticated caller could fabricate refusals.
revoke execute on function public.record_dispatch_refusal(uuid, text, text) from public;
revoke execute on function public.dispatch_health(interval) from public;
revoke execute on function public.insert_service_area_boundary(text, text, text, text) from public;
revoke execute on function public.enforce_address_attestation() from public;
revoke execute on function public.enforce_bundle_item_quote() from public;
revoke execute on function public.bundle_subtotal_cents(uuid) from public;
revoke execute on function public.broadcast_request(uuid, int) from public;
revoke execute on function public.accept_request(uuid, uuid) from public;
revoke execute on function public.is_point_serviceable(geography) from public;
revoke execute on function public.point_service_area(geography) from public;

-- Re-grant deliberately, narrowest first.
grant execute on function public.record_dispatch_refusal(uuid, text, text) to service_role;
grant execute on function public.insert_service_area_boundary(text, text, text, text) to service_role;
grant execute on function public.bundle_subtotal_cents(uuid) to service_role;
-- Helpers accept their own offers; the function itself checks the caller is
-- the assigned provider.
grant execute on function public.accept_request(uuid, uuid) to authenticated, service_role;
grant execute on function public.broadcast_request(uuid, int) to service_role;
-- Read-only geography checks: needed by the request form.
grant execute on function public.is_point_serviceable(geography) to authenticated, service_role;
grant execute on function public.point_service_area(geography) to authenticated, service_role;

-- dispatch_health bypasses the admin-read policy on dispatch_refusals, so
-- it must not be callable by ordinary users.
create or replace function public.dispatch_health(p_since interval default interval '1 hour')
returns table (
  reason text,
  occurrences bigint,
  distinct_requests bigint,
  last_seen timestamptz,
  is_configuration_fault boolean
)
language plpgsql stable security definer set search_path = public as $$
begin
  if coalesce(current_setting('request.jwt.claims', true), '') <> ''
     and jwt_role() not in ('admin', 'service_role') then
    raise exception 'dispatch_health: admins only';
  end if;
  return query
    select r.reason, count(*), count(distinct r.request_id), max(r.created_at),
           r.reason <> 'no_eligible_helper'
    from dispatch_refusals r
    where r.created_at > now() - p_since
    group by r.reason
    order by (r.reason <> 'no_eligible_helper') desc, count(*) desc;
end;
$$;

revoke execute on function public.dispatch_health(interval) from public;
grant execute on function public.dispatch_health(interval) to authenticated, service_role;

-- =========================================================================
-- accept_request — price the bundle through the catalog-checked helper
-- =========================================================================
--
-- Replaces the 0031 body so the subtotal is never taken from a stored
-- number on its own. bundle_subtotal_cents() raises if the stored stop
-- prices disagree with the live catalog, so a tampered row fails the
-- acceptance rather than discounting it.

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
    v_subtotal, 0, v_fee, v_subtotal + v_fee,
    v_platform, v_payout, v_currency
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

revoke execute on function public.accept_request(uuid, uuid) from public;
grant execute on function public.accept_request(uuid, uuid) to authenticated, service_role;

-- =========================================================================
-- D02 — the whole quote structure is immutable once offered, not just price
-- =========================================================================
--
-- Freezing item_price_cents was not enough. rbi_write_own (0015) is FOR
-- ALL, so a customer could DELETE a stop; the UPDATE trigger did not freeze
-- request_id, so a stop could be reparented; and req_update (0002) let the
-- customer edit requests.bundle_item_count, so the acceptance count check
-- could be made to agree with a shortened bundle. A three-stop offer could
-- become a two-stop booking after the helper accepted what they saw.
--
-- The fix is an immutable quote identity. seal_bundle_quote() records a
-- fingerprint of the stop set at creation; acceptance recomputes it and
-- refuses if anything about the quote changed.

alter table requests
  add column if not exists quote_fingerprint text;

comment on column requests.quote_fingerprint is
  'Hash of the bundle stop set (service ids, prices, positions) at the moment the request was created. accept_request recomputes it and refuses if the bundle changed after the offer went out.';

create or replace function public.compute_bundle_fingerprint(p_request_id uuid)
returns text
language sql stable security definer set search_path = public as $$
  select encode(digest(coalesce(string_agg(
           i.position || ':' || i.service_id || ':' || i.item_price_cents, '|'
           order by i.position, i.service_id), ''), 'sha256'), 'hex')
  from request_bundle_items i
  where i.request_id = p_request_id;
$$;

create or replace function public.seal_bundle_quote(p_request_id uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_fp text;
  v_count int;
begin
  if coalesce(current_setting('request.jwt.claims', true), '') <> ''
     and jwt_role() <> 'service_role' then
    raise exception 'seal_bundle_quote: service role only';
  end if;

  select count(*) into v_count from request_bundle_items where request_id = p_request_id;
  if v_count < 2 then
    raise exception 'cannot seal a bundle with % stop(s)', v_count;
  end if;

  v_fp := compute_bundle_fingerprint(p_request_id);
  update requests
     set quote_fingerprint = v_fp, bundle_item_count = v_count
   where id = p_request_id;
  return v_fp;
end;
$$;

-- Deletion and reparenting are server-only, matching INSERT.
create or replace function public.enforce_bundle_item_quote()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_is_service boolean := coalesce(current_setting('request.jwt.claims', true), '') = ''
                          or jwt_role() = 'service_role';
  v_catalog_price int;
begin
  if v_is_service then
    if tg_op = 'INSERT' then
      select base_price_cents into v_catalog_price
        from services where id = new.service_id and active;
      if v_catalog_price is null then
        raise exception 'bundle stop references an inactive or unknown service: %', new.service_id;
      end if;
      new.item_price_cents := v_catalog_price;
    end if;
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'INSERT' then
    raise exception 'bundle stops are created by the server, not directly';
  end if;
  if tg_op = 'DELETE' then
    raise exception 'bundle stops cannot be removed after the quote is created';
  end if;

  -- request_id included: a stop may not be reparented onto another request.
  if new.item_price_cents is distinct from old.item_price_cents
     or new.service_id  is distinct from old.service_id
     or new.position    is distinct from old.position
     or new.request_id  is distinct from old.request_id then
    raise exception 'bundle stop price, service, position and parent are fixed at request creation';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_bundle_item_quote on request_bundle_items;
create trigger trg_bundle_item_quote
  before insert or update or delete on request_bundle_items
  for each row execute function public.enforce_bundle_item_quote();

-- Parent quote fields are server-owned too, so the count cannot be edited
-- to agree with a tampered stop set.
create or replace function public.enforce_request_quote()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_is_service boolean := coalesce(current_setting('request.jwt.claims', true), '') = ''
                          or jwt_role() = 'service_role' or is_admin();
begin
  if v_is_service then return new; end if;

  if new.is_bundle          is distinct from old.is_bundle
     or new.bundle_item_count  is distinct from old.bundle_item_count
     or new.quote_fingerprint  is distinct from old.quote_fingerprint
     or new.service_id         is distinct from old.service_id
     or new.estimated_price_cents is distinct from old.estimated_price_cents
     or new.pickup_address_id  is distinct from old.pickup_address_id then
    raise exception 'request quote fields are server-controlled';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_request_quote on requests;
create trigger trg_request_quote
  before update on requests
  for each row execute function public.enforce_request_quote();

revoke execute on function public.compute_bundle_fingerprint(uuid) from public;
revoke execute on function public.seal_bundle_quote(uuid) from public;
revoke execute on function public.enforce_request_quote() from public;
grant execute on function public.compute_bundle_fingerprint(uuid) to service_role;
grant execute on function public.seal_bundle_quote(uuid) to service_role;

-- =========================================================================
-- D04 — revoke the HISTORICAL direct grants, not just PUBLIC
-- =========================================================================
--
-- 0004 granted authenticated EXECUTE on broadcast_request explicitly.
-- Revoking PUBLIC leaves that grant in place, and CREATE OR REPLACE in 0038
-- preserves it, so ordinary signed-in users would retain access to a
-- privileged dispatch RPC that performs no caller-ownership check.
revoke execute on function public.broadcast_request(uuid, int) from public, anon, authenticated;
revoke execute on function public.record_dispatch_refusal(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.insert_service_area_boundary(text, text, text, text) from public, anon, authenticated;
revoke execute on function public.bundle_subtotal_cents(uuid) from public, anon, authenticated;
revoke execute on function public.compute_bundle_fingerprint(uuid) from public, anon, authenticated;
revoke execute on function public.seal_bundle_quote(uuid) from public, anon, authenticated;
revoke execute on function public.enforce_address_attestation() from public, anon, authenticated;
revoke execute on function public.enforce_bundle_item_quote() from public, anon, authenticated;
revoke execute on function public.enforce_request_quote() from public, anon, authenticated;

grant execute on function public.broadcast_request(uuid, int) to service_role;
grant execute on function public.record_dispatch_refusal(uuid, text, text) to service_role;
grant execute on function public.insert_service_area_boundary(text, text, text, text) to service_role;
grant execute on function public.bundle_subtotal_cents(uuid) to service_role;
grant execute on function public.compute_bundle_fingerprint(uuid) to service_role;
grant execute on function public.seal_bundle_quote(uuid) to service_role;
