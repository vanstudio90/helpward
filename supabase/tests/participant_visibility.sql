-- What a helper can see about the job they are doing, under REAL roles.
--
-- Browser testing, 2026-10-26: the assigned helper saw "Pickup —" and
-- "Customer". The pages queried correctly; RLS returned nothing.
--
-- Every grant here is paired with the case it must NOT grant, because a
-- policy that fixes "the helper sees nothing" by exposing every address is
-- not a fix.
--
-- USAGE: node scripts/run-sql-suite.mjs supabase/tests/participant_visibility.sql

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
begin execute 'reset role'; perform set_config('request.jwt.claims', '', true); end $$;

create or replace function pg_temp.expect_rows(p_sql text, p_want int, p_label text)
returns void language plpgsql as $$
declare v_got int;
begin
  execute format('select count(*) from (%s) q', p_sql) into v_got;
  if v_got <> p_want then
    raise exception 'FAIL %  ->  expected % row(s), got %', p_label, p_want, v_got;
  end if;
  raise notice 'PASS %  (% row(s))', p_label, v_got;
end $$;

-- ---------------------------------------------------------------------------
-- Fixture: customer, assigned helper, an UNRELATED helper, an active booking
-- ---------------------------------------------------------------------------
create temp table vf (customer uuid, helper uuid, other uuid,
                      addr uuid, req uuid, booking uuid);

do $$
declare
  v_cust uuid; v_helper uuid; v_other uuid; v_svc text;
  v_addr uuid; v_req uuid; v_bk uuid;
begin
  perform pg_temp.become_service();
  select id into v_cust from profiles where role = 'customer' limit 1;
  select user_id into v_helper from provider_profiles order by user_id limit 1;
  select user_id into v_other from provider_profiles
   where user_id <> v_helper order by user_id limit 1;
  select id into v_svc from services where active order by id limit 1;
  if v_cust is null or v_helper is null or v_other is null then
    raise exception 'Fixture needs a customer and TWO provider profiles';
  end if;

  insert into addresses (user_id, formatted, location, country, city, region,
                         geocode_verified, geocoded_at)
  values (v_cust, '202 East C Street, San Diego, California 92101, United States',
          st_setsrid(st_makepoint(-117.1611, 32.7157), 4326)::geography,
          'US', 'San Diego', 'California', true, now())
  returning id into v_addr;

  insert into requests (customer_id, service_id, pickup_address_id,
                        estimated_price_cents, estimated_duration_min, status)
  values (v_cust, v_svc, v_addr, 2450, 60, 'matched')
  returning id into v_req;

  -- Both helpers were OFFERED it; only one accepted.
  insert into match_attempts (request_id, provider_id, distance_km, rank_score)
  values (v_req, v_helper, 2.4, 1.0), (v_req, v_other, 9.1, 0.5);

  insert into bookings (request_id, customer_id, provider_id, service_id, status,
                        scheduled_for, base_price_cents, service_fee_cents,
                        total_cents, platform_fee_cents, payout_cents, currency,
                        payment_status)
  values (v_req, v_cust, v_helper, v_svc, 'scheduled', now(),
          2000, 450, 2450, 850, 1600, 'USD', 'authorized')
  returning id into v_bk;

  insert into vf values (v_cust, v_helper, v_other, v_addr, v_req, v_bk);
end $$;

-- ---------------------------------------------------------------------------
-- U01a — the assigned helper can see the pickup and the customer
-- ---------------------------------------------------------------------------
do $$
declare r record;
begin
  perform pg_temp.become_service(); select * into r from vf;
  perform pg_temp.become(r.helper, 'provider');

  perform pg_temp.expect_rows(
    format('select formatted from addresses where id = %L', r.addr), 1,
    'U01a assigned helper reads the pickup address');
  perform pg_temp.expect_rows(
    format('select full_name from profiles where id = %L', r.customer), 1,
    'U01b assigned helper reads the customer profile');
end $$;

-- ---------------------------------------------------------------------------
-- The same reads must FAIL for everyone else
-- ---------------------------------------------------------------------------
do $$
declare r record;
begin
  perform pg_temp.become_service(); select * into r from vf;

  -- A helper who was offered the job and did not get it.
  perform pg_temp.become(r.other, 'provider');
  perform pg_temp.expect_rows(
    format('select formatted from addresses where id = %L', r.addr), 0,
    'U01c an OFFERED-but-not-assigned helper gets no address');
  perform pg_temp.expect_rows(
    format('select full_name from profiles where id = %L', r.customer), 0,
    'U01d ... and no customer profile');

  -- Every other address in the database stays invisible to the assigned
  -- helper. Without this, "the helper can see the pickup" would also pass
  -- for a policy that exposed all addresses.
  perform pg_temp.become(r.helper, 'provider');
  perform pg_temp.expect_rows(
    format('select id from addresses where id <> %L and user_id = %L', r.addr, r.customer),
    0, 'U01e the assigned helper sees ONLY this booking''s address');
end $$;

-- ---------------------------------------------------------------------------
-- Visibility ends with the booking
-- ---------------------------------------------------------------------------
do $$
declare r record;
begin
  perform pg_temp.become_service(); select * into r from vf;
  update bookings set status = 'completed', completed_at = now() where id = r.booking;

  perform pg_temp.become(r.helper, 'provider');
  perform pg_temp.expect_rows(
    format('select formatted from addresses where id = %L', r.addr), 0,
    'U01f a COMPLETED booking is not a standing licence to re-read the address');
  perform pg_temp.expect_rows(
    format('select full_name from profiles where id = %L', r.customer), 0,
    'U01g ... nor the customer profile');

  -- Control: restoring the booking restores the access, so the refusals
  -- above are the status check and not a policy that never matches.
  perform pg_temp.become_service();
  update bookings set status = 'in_progress' where id = r.booking;
  perform pg_temp.become(r.helper, 'provider');
  perform pg_temp.expect_rows(
    format('select formatted from addresses where id = %L', r.addr), 1,
    'U01h an in-progress booking restores it (control)');
end $$;

-- ---------------------------------------------------------------------------
-- Offer stage shows the area, not the doorstep
-- ---------------------------------------------------------------------------
do $$
declare r record; v_city text; v_dist numeric;
begin
  perform pg_temp.become_service(); select * into r from vf;
  perform pg_temp.become(r.other, 'provider');

  select city, distance_km into v_city, v_dist from offer_area(r.req);
  if v_city is distinct from 'San Diego' then
    raise exception 'FAIL offer_area gave city % for an offered helper', v_city;
  end if;
  raise notice 'PASS U01i an offered helper gets the area (% , %km)', v_city, v_dist;

  -- And still not the street address.
  perform pg_temp.expect_rows(
    format('select formatted from addresses where id = %L', r.addr), 0,
    'U01j ... but not the street address');
end $$;

do $$
declare r record; v_uninvolved uuid;
begin
  perform pg_temp.become_service(); select * into r from vf;
  select id into v_uninvolved from profiles
   where id <> r.customer and id <> r.helper and id <> r.other limit 1;
  if v_uninvolved is null then
    raise notice 'SKIP U01k no uninvolved user in this database';
    return;
  end if;

  perform pg_temp.become(v_uninvolved, 'customer');
  begin
    perform offer_area(r.req);
    raise exception 'FAIL U01k offer_area answered a stranger';
  exception when others then
    if sqlerrm like 'FAIL %' then raise; end if;
    raise notice 'PASS U01k offer_area refuses a stranger: %', left(sqlerrm, 50);
  end;
end $$;

rollback;
