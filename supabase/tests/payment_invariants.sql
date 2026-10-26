-- Payment invariants, executed under REAL roles.
--
-- Reproduces the three bypasses independent testing found on 2026-10-26:
--
--   T03  with a helper marked not-payable, accept_request, start_booking
--        and complete_booking all succeeded in sequence. The booking
--        finished `completed` with payment_status = 'pending' and no
--        Stripe intent.
--   T04  a customer could call set_booking_tip directly and persist
--        tip=1500 / payout=8700 with no charge.
--   T08  a second tip replaced the first while raising a new charge for
--        the full amount.
--
-- Each is attempted here as the actual `authenticated` role, and each must
-- now be refused for a NAMED reason. Every refusal is paired with a
-- positive control that does the same thing legitimately, so a test that
-- passes because the fixture is broken fails instead.
--
-- USAGE: node scripts/run-sql-suite.mjs supabase/tests/payment_invariants.sql

\set ON_ERROR_STOP on

begin;

create or replace function pg_temp.become(p_uid uuid, p_role text default 'customer')
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated',
                      'app_metadata', json_build_object('role', p_role))::text, true);
  execute 'set local role authenticated';
end $$;

create or replace function pg_temp.become_service()
returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $$;

-- The error must name the expected cause. "Any exception is a pass" would
-- be satisfied by a typo in the fixture or a foreign-key violation.
create or replace function pg_temp.must_fail_with(p_sql text, p_expect text, p_label text)
returns void language plpgsql as $$
declare v_msg text; v_state text;
begin
  execute p_sql;
  raise exception 'FAIL %  ->  statement SUCCEEDED but should have been refused', p_label;
exception
  when others then
    get stacked diagnostics v_msg = message_text, v_state = returned_sqlstate;
    if v_msg like 'FAIL %' then raise; end if;
    if v_state like '23%' and p_expect not like '23%' then
      raise exception 'FAIL %  ->  refused by a constraint (%), not by the guard: %',
        p_label, v_state, v_msg;
    end if;
    if position(lower(p_expect) in lower(v_msg)) = 0 and v_state <> p_expect then
      raise exception 'FAIL %  ->  wrong reason. expected "%", got [%] %',
        p_label, p_expect, v_state, v_msg;
    end if;
    raise notice 'PASS %  ->  refused: %', p_label, left(v_msg, 70);
end $$;

create or replace function pg_temp.must_succeed(p_sql text, p_label text)
returns void language plpgsql as $$
begin
  execute p_sql;
  raise notice 'PASS %  (positive control)', p_label;
exception when others then
  raise exception 'FAIL %  ->  legitimate operation was refused: %', p_label, sqlerrm;
end $$;

-- ---------------------------------------------------------------------------
-- Fixture: a scheduled, UNPAID booking held by an unpayable helper.
-- ---------------------------------------------------------------------------
create temp table pf (customer uuid, helper uuid, booking uuid, req uuid, svc text);


do $$
declare
  v_customer uuid; v_helper uuid; v_svc text; v_addr uuid; v_req uuid; v_bk uuid;
begin
  perform pg_temp.become_service();

  select id into v_customer from profiles where role = 'customer' limit 1;
  select user_id into v_helper from provider_profiles limit 1;
  select id into v_svc from services where active order by id limit 1;
  if v_customer is null or v_helper is null or v_svc is null then
    raise exception 'Fixture needs a customer, a provider profile and an active service';
  end if;

  -- Explicitly NOT payable. This is the state the tester reproduced.
  update provider_profiles
     set status = 'approved', is_online = true,
         stripe_transfers_active = false, stripe_connect_account_id = null
   where user_id = v_helper;

  insert into addresses (user_id, formatted, location, country, geocode_verified, geocoded_at)
  values (v_customer, 'FIXTURE — payment invariants',
          st_setsrid(st_makepoint(-117.1611, 32.7157), 4326)::geography, 'US', true, now())
  returning id into v_addr;

  insert into requests (customer_id, service_id, pickup_address_id,
                        estimated_price_cents, estimated_duration_min, status)
  values (v_customer, v_svc, v_addr, 5450, 60, 'matching')
  returning id into v_req;

  insert into match_attempts (request_id, provider_id, distance_km, rank_score)
  values (v_req, v_helper, 1.0, 1.0);

  -- A booking in exactly the state acceptance leaves behind before the
  -- hold is placed: scheduled, payment_status 'pending', no intent.
  insert into bookings (request_id, customer_id, provider_id, service_id, status,
                        scheduled_for, base_price_cents, service_fee_cents,
                        total_cents, platform_fee_cents, payout_cents, currency,
                        payment_status)
  values (v_req, v_customer, v_helper, v_svc, 'scheduled', now(),
          5000, 450, 5450, 1450, 4000, 'USD', 'pending')
  returning id into v_bk;

  insert into pf values (v_customer, v_helper, v_bk, v_req, v_svc);
  raise notice 'fixture: unpaid booking % held by unpayable helper %', v_bk, v_helper;
end $$;

-- ---------------------------------------------------------------------------
-- T03 — an unpaid booking cannot start or finish
-- ---------------------------------------------------------------------------
do $$
declare r record;
begin
  -- `set local role` lasts for the transaction, so this block would
  -- otherwise inherit the role the previous one left set, and a temp
  -- fixture table is not readable as `authenticated`.
  perform pg_temp.become_service();
  select * into r from pf;
  perform pg_temp.become(r.helper, 'provider');

  perform pg_temp.must_fail_with(
    format('select start_booking(%L)', r.booking),
    'not been paid for',
    'T03a helper starts an unpaid booking');

  perform pg_temp.become_service();
  update bookings set status = 'in_progress', started_at = now() where id = r.booking;
  perform pg_temp.become(r.helper, 'provider');

  perform pg_temp.must_fail_with(
    format('select complete_booking(%L)', r.booking),
    'not been paid for',
    'T03b helper completes an unpaid booking');

  perform pg_temp.become_service();
  update bookings set status = 'scheduled', started_at = null where id = r.booking;
end $$;

-- A declined card is refused for its own reason, not the generic one.
do $$
declare r record;
begin
  -- `set local role` lasts for the transaction, so this block would
  -- otherwise inherit the role the previous one left set, and a temp
  -- fixture table is not readable as `authenticated`.
  perform pg_temp.become_service();
  select * into r from pf;
  update bookings set payment_status = 'failed' where id = r.booking;
  perform pg_temp.become(r.helper, 'provider');

  perform pg_temp.must_fail_with(
    format('select start_booking(%L)', r.booking),
    'declined',
    'T03c a declined card names itself');
end $$;

-- POSITIVE CONTROL. Without this, every assertion above would also pass if
-- start_booking were simply broken for all inputs.
do $$
declare r record;
begin
  -- `set local role` lasts for the transaction, so this block would
  -- otherwise inherit the role the previous one left set, and a temp
  -- fixture table is not readable as `authenticated`.
  perform pg_temp.become_service();
  select * into r from pf;
  update bookings set payment_status = 'authorized', authorized_at = now(),
                      stripe_payment_intent_id = 'pi_fixture_authorized'
   where id = r.booking;
  perform pg_temp.become(r.helper, 'provider');

  perform pg_temp.must_succeed(
    format('select start_booking(%L)', r.booking),
    'T03d an AUTHORIZED booking starts normally');
  perform pg_temp.must_succeed(
    format('select complete_booking(%L)', r.booking),
    'T03e an authorized booking completes normally');
end $$;

-- ---------------------------------------------------------------------------
-- T04 — a customer cannot record a tip
-- ---------------------------------------------------------------------------
do $$
declare r record;
begin
  -- `set local role` lasts for the transaction, so this block would
  -- otherwise inherit the role the previous one left set, and a temp
  -- fixture table is not readable as `authenticated`.
  perform pg_temp.become_service();
  select * into r from pf;
  update bookings set payment_status = 'captured', captured_at = now() where id = r.booking;

  perform pg_temp.become(r.customer, 'customer');
  perform pg_temp.must_fail_with(
    format('select set_booking_tip(%L, 1500, null)', r.booking),
    'permission denied',
    'T04a customer calls the tip writer directly');

  -- The old two-argument call shape is refused too. It does not fail as
  -- "does not exist": the two-argument function was dropped, so Postgres
  -- resolves the call to the three-argument one using its default, and the
  -- revoked grant stops it there. Either way there is no unprivileged
  -- two-argument path left for the old UI to reach.
  perform pg_temp.must_fail_with(
    format('select set_booking_tip(%L, 1500)', r.booking),
    'permission denied',
    'T04b the old two-argument call shape is refused');
end $$;

-- POSITIVE CONTROL: the server, having charged, can record it.
do $$
declare r record; v_payout int; v_tip int;
begin
  perform pg_temp.become_service();
  select * into r from pf;
  perform pg_temp.become_service();
  perform pg_temp.must_succeed(
    format('select set_booking_tip(%L, 1500, %L)', r.booking, 'pi_fixture_tip'),
    'T04c the service role records a charged tip');

  select tip_cents, payout_cents into v_tip, v_payout from bookings where id = r.booking;
  if v_tip <> 1500 then raise exception 'FAIL tip not recorded (got %)', v_tip; end if;
  if v_payout <> 5500 then
    raise exception 'FAIL helper payout should be 4000 + 1500 = 5500, got %', v_payout;
  end if;
  raise notice 'PASS T04d the whole tip reaches the helper (payout %)', v_payout;
end $$;

-- ---------------------------------------------------------------------------
-- T08 — a charged tip is final
-- ---------------------------------------------------------------------------
do $$
declare r record;
begin
  -- `set local role` lasts for the transaction, so this block would
  -- otherwise inherit the role the previous one left set, and a temp
  -- fixture table is not readable as `authenticated`.
  perform pg_temp.become_service();
  select * into r from pf;
  perform pg_temp.become_service();
  perform pg_temp.must_fail_with(
    format('select set_booking_tip(%L, 3000, %L)', r.booking, 'pi_second'),
    'already been collected',
    'T08a a second tip cannot overwrite a charged one');
end $$;

-- ---------------------------------------------------------------------------
-- T03/accept — an unpayable helper cannot accept
-- ---------------------------------------------------------------------------
do $$
declare r record; v_req2 uuid; v_addr uuid;
begin
  -- `set local role` lasts for the transaction, so this block would
  -- otherwise inherit the role the previous one left set, and a temp
  -- fixture table is not readable as `authenticated`.
  perform pg_temp.become_service();
  select * into r from pf;
  update requests set status = 'matching' where id = r.req;

  perform pg_temp.become(r.helper, 'provider');
  perform pg_temp.must_fail_with(
    format('select accept_request(%L, %L)', r.req, r.helper),
    'setting up payouts',
    'T03f an unpayable helper accepts a request');

  -- POSITIVE CONTROL in its own block, with its own request. Sharing a
  -- request with the refusal above coupled the two: the refused
  -- accept_request leaves its block's savepoint rolled back, and the
  -- control then could not see the row it was meant to accept.
end $$;

do $$
declare r record; v_addr uuid; v_req3 uuid; v_booking uuid;
begin
  perform pg_temp.become_service();
  select * into r from pf;
  select pickup_address_id into v_addr from requests where id = r.req;

  update provider_profiles
     set stripe_transfers_active = true, stripe_connect_account_id = 'acct_fixture'
   where user_id = r.helper;
  insert into provider_services (provider_id, service_id)
  values (r.helper, r.svc) on conflict do nothing;

  insert into requests (customer_id, service_id, pickup_address_id,
                        estimated_price_cents, estimated_duration_min, status)
  values (r.customer, r.svc, v_addr, 5450, 60, 'matching')
  returning id into v_req3;
  insert into match_attempts (request_id, provider_id, distance_km, rank_score)
  values (v_req3, r.helper, 1.0, 1.0);

  perform pg_temp.become(r.helper, 'provider');
  perform pg_temp.must_succeed(
    format('select accept_request(%L, %L)', v_req3, r.helper),
    'T03g a payable helper accepts normally');

  -- And the booking it created starts life unpaid, so the invariant above
  -- still stands between acceptance and authorization.
  perform pg_temp.become_service();
  select id into v_booking from bookings where request_id = v_req3;
  if (select payment_status from bookings where id = v_booking) <> 'pending' then
    raise exception 'FAIL a new booking should start as payment_status pending';
  end if;
  raise notice 'PASS T03h a freshly accepted booking is unpaid until authorized';

  perform pg_temp.become(r.helper, 'provider');
  perform pg_temp.must_fail_with(
    format('select start_booking(%L)', v_booking),
    'not been paid for',
    'T03i and therefore still cannot be started');
end $$;

-- ---------------------------------------------------------------------------
-- Currency follows the job, not the customer (0052)
-- ---------------------------------------------------------------------------
do $$
declare
  r record; v_addr uuid; v_req uuid; v_bk uuid; v_currency text; v_was text;
begin
  perform pg_temp.become_service();
  select * into r from pf;

  -- A CANADIAN pickup, booked by a customer whose profile says US.
  select country into v_was from profiles where id = r.customer;
  update profiles set country = 'US'::country where id = r.customer;

  insert into addresses (user_id, formatted, location, country, city, region,
                         geocode_verified, geocoded_at)
  values (r.customer, 'FIXTURE — 1055 Canada Pl, Vancouver BC',
          st_setsrid(st_makepoint(-123.1115, 49.2888), 4326)::geography,
          'CA', 'Vancouver', 'British Columbia', true, now())
  returning id into v_addr;

  insert into requests (customer_id, service_id, pickup_address_id,
                        estimated_price_cents, estimated_duration_min, status)
  values (r.customer, r.svc, v_addr, 2450, 60, 'matching') returning id into v_req;
  insert into match_attempts (request_id, provider_id, distance_km, rank_score)
  values (v_req, r.helper, 1.0, 1.0);

  update provider_profiles set stripe_transfers_active = true where user_id = r.helper;
  insert into provider_services (provider_id, service_id)
  values (r.helper, r.svc) on conflict do nothing;

  perform pg_temp.become(r.helper, 'provider');
  v_bk := accept_request(v_req, r.helper);

  perform pg_temp.become_service();
  select currency into v_currency from bookings where id = v_bk;
  update profiles set country = v_was::country where id = r.customer;

  if v_currency <> 'CAD' then
    raise exception
      'FAIL C01 a job in Vancouver was priced %, not CAD — currency followed the customer, not the work',
      v_currency;
  end if;
  raise notice 'PASS C01 a Vancouver job is priced in CAD even for a US customer';
end $$;

-- Control: a US pickup for the same customer still prices in USD, so the
-- assertion above is reading the address and not simply always CAD.
do $$
declare r record; v_addr uuid; v_req uuid; v_bk uuid; v_currency text;
begin
  perform pg_temp.become_service();
  select * into r from pf;

  insert into addresses (user_id, formatted, location, country, city, region,
                         geocode_verified, geocoded_at)
  values (r.customer, 'FIXTURE — 202 C St, San Diego CA',
          st_setsrid(st_makepoint(-117.1611, 32.7157), 4326)::geography,
          'US', 'San Diego', 'California', true, now())
  returning id into v_addr;

  insert into requests (customer_id, service_id, pickup_address_id,
                        estimated_price_cents, estimated_duration_min, status)
  values (r.customer, r.svc, v_addr, 2450, 60, 'matching') returning id into v_req;
  insert into match_attempts (request_id, provider_id, distance_km, rank_score)
  values (v_req, r.helper, 1.0, 1.0);

  perform pg_temp.become(r.helper, 'provider');
  v_bk := accept_request(v_req, r.helper);

  perform pg_temp.become_service();
  select currency into v_currency from bookings where id = v_bk;
  if v_currency <> 'USD' then
    raise exception 'FAIL C02 a San Diego job priced %, not USD', v_currency;
  end if;
  raise notice 'PASS C02 a San Diego job is still priced in USD (control)';
end $$;

rollback;
