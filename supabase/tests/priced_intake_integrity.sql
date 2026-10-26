-- The price follows the answers, and the answers cannot change after the
-- offer goes out. Executed under REAL roles.
--
-- accept_request has always re-derived price from the CATALOG and ignored
-- what the request stored — that is what stopped a customer editing their
-- own price. Migration 0053 makes price depend on the customer's own
-- intake, which would hand that guarantee straight back: req_update
-- (0002) lets a customer update their own request, so "8 hours" could
-- become "30 minutes" after a helper accepted an eight-hour job.
--
-- 0054 fingerprints the priced answers at creation and refuses an
-- acceptance where they have changed. This is the test for that.
--
-- USAGE: node scripts/run-sql-suite.mjs supabase/tests/priced_intake_integrity.sql

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

create temp table qf (customer uuid, helper uuid, addr uuid);

do $$
declare v_cust uuid; v_helper uuid; v_addr uuid;
begin
  perform pg_temp.become_service();
  select id into v_cust from profiles where role = 'customer' limit 1;
  select user_id into v_helper from provider_profiles order by user_id limit 1;
  if v_cust is null or v_helper is null then
    raise exception 'Fixture needs a customer and a provider profile';
  end if;

  update provider_profiles set status = 'approved', stripe_transfers_active = true
   where user_id = v_helper;
  insert into provider_services (provider_id, service_id)
  values (v_helper, 'dog-walking') on conflict do nothing;

  insert into addresses (user_id, formatted, location, country, city, region,
                         geocode_verified, geocoded_at)
  values (v_cust, 'FIXTURE — 202 C St, San Diego',
          st_setsrid(st_makepoint(-117.1611, 32.7157), 4326)::geography,
          'US', 'San Diego', 'California', true, now())
  returning id into v_addr;

  insert into qf values (v_cust, v_helper, v_addr);
end $$;

-- A request for an eight-hour walk, sealed and offered.
create or replace function pg_temp.make_request(p_minutes text, p_dogs text)
returns uuid language plpgsql as $$
declare r record; v_req uuid;
begin
  select * into r from qf;
  insert into requests (customer_id, service_id, pickup_address_id,
                        estimated_price_cents, estimated_duration_min, status, intake)
  values (r.customer, 'dog-walking', r.addr, 0, 60, 'matching',
          jsonb_build_object('duration_min', p_minutes, 'dog_count', p_dogs,
                             'notes', 'original brief'))
  returning id into v_req;
  perform seal_request_quote(v_req);
  insert into match_attempts (request_id, provider_id, distance_km, rank_score)
  values (v_req, r.helper, 1.0, 1.0);
  return v_req;
end $$;

-- ---------------------------------------------------------------------------
-- The price actually depends on the answers
-- ---------------------------------------------------------------------------
do $$
declare v_short int; v_long int; v_dogs int;
begin
  perform pg_temp.become_service();
  v_short := price_service_cents('dog-walking', '{"duration_min":"30","dog_count":"1"}'::jsonb);
  v_long  := price_service_cents('dog-walking', '{"duration_min":"480","dog_count":"1"}'::jsonb);
  v_dogs  := price_service_cents('dog-walking', '{"duration_min":"30","dog_count":"3"}'::jsonb);

  if v_short = v_long then
    raise exception 'FAIL Q01 30 minutes and 8 hours still price the same (% both)', v_short;
  end if;
  if v_dogs <= v_short then
    raise exception 'FAIL Q01 three dogs do not cost more than one (% vs %)', v_dogs, v_short;
  end if;
  raise notice 'PASS Q01 duration and quantity move the price (30min $%, 8hr $%, 3 dogs $%)',
    (v_short/100.0)::numeric(10,2), (v_long/100.0)::numeric(10,2), (v_dogs/100.0)::numeric(10,2);
end $$;

-- ---------------------------------------------------------------------------
-- Q02 — the attack: shorten the job after it has been offered
-- ---------------------------------------------------------------------------
do $$
declare r record; v_req uuid; v_booking uuid;
begin
  perform pg_temp.become_service();
  select * into r from qf;
  v_req := pg_temp.make_request('480', '1');   -- an eight-hour walk

  -- The CUSTOMER edits their own request down to half an hour. RLS allows
  -- this; req_update is theirs.
  perform pg_temp.become(r.customer, 'customer');
  update requests
     set intake = jsonb_set(intake, '{duration_min}', '"30"')
   where id = v_req;

  perform pg_temp.become(r.helper, 'provider');
  begin
    v_booking := accept_request(v_req, r.helper);
    raise exception 'FAIL Q02 accepted a job whose duration was changed after the offer';
  exception when others then
    if sqlerrm like 'FAIL %' then raise; end if;
    if position('changed after it was quoted' in sqlerrm) = 0 then
      raise exception 'FAIL Q02 refused for the wrong reason: %', sqlerrm;
    end if;
    raise notice 'PASS Q02 a duration changed after the offer is refused';
  end;
end $$;

-- Same attack on the quantity.
do $$
declare r record; v_req uuid; v_booking uuid;
begin
  perform pg_temp.become_service();
  select * into r from qf;
  v_req := pg_temp.make_request('30', '4');

  perform pg_temp.become(r.customer, 'customer');
  update requests set intake = jsonb_set(intake, '{dog_count}', '"1"') where id = v_req;

  perform pg_temp.become(r.helper, 'provider');
  begin
    v_booking := accept_request(v_req, r.helper);
    raise exception 'FAIL Q03 accepted a job whose dog count was changed after the offer';
  exception when others then
    if sqlerrm like 'FAIL %' then raise; end if;
    if position('changed after it was quoted' in sqlerrm) = 0 then
      raise exception 'FAIL Q03 refused for the wrong reason: %', sqlerrm;
    end if;
    raise notice 'PASS Q03 a quantity changed after the offer is refused';
  end;
end $$;

-- ---------------------------------------------------------------------------
-- Q04 — POSITIVE CONTROL: an untouched request accepts, at the right price
-- ---------------------------------------------------------------------------
do $$
declare r record; v_req uuid; v_booking uuid; v_base int; v_expected int;
begin
  perform pg_temp.become_service();
  select * into r from qf;
  v_req := pg_temp.make_request('480', '2');
  v_expected := price_service_cents('dog-walking', '{"duration_min":"480","dog_count":"2"}'::jsonb);

  perform pg_temp.become(r.helper, 'provider');
  v_booking := accept_request(v_req, r.helper);

  perform pg_temp.become_service();
  select base_price_cents into v_base from bookings where id = v_booking;
  if v_base <> v_expected then
    raise exception 'FAIL Q04 booking priced % but the answers price %', v_base, v_expected;
  end if;
  raise notice 'PASS Q04 an untouched 8-hour, 2-dog job accepts at $% (control)',
    (v_base/100.0)::numeric(10,2);
end $$;

-- ---------------------------------------------------------------------------
-- Q05 — editing something that does NOT price the job is still allowed
-- ---------------------------------------------------------------------------
-- Hashing the whole intake blob would void an offer because the customer
-- fixed a typo in their notes. Only the priced fields are sealed.
do $$
declare r record; v_req uuid; v_booking uuid;
begin
  perform pg_temp.become_service();
  select * into r from qf;
  v_req := pg_temp.make_request('60', '1');

  perform pg_temp.become(r.customer, 'customer');
  update requests
     set intake = jsonb_set(intake, '{notes}', '"he pulls on the lead, sorry"')
   where id = v_req;

  perform pg_temp.become(r.helper, 'provider');
  v_booking := accept_request(v_req, r.helper);
  raise notice 'PASS Q05 a note added after the offer does not void the quote';
end $$;

-- ---------------------------------------------------------------------------
-- Q06 — a request that was never sealed cannot be accepted
-- ---------------------------------------------------------------------------
do $$
declare r record; v_req uuid; v_booking uuid;
begin
  perform pg_temp.become_service();
  select * into r from qf;
  insert into requests (customer_id, service_id, pickup_address_id,
                        estimated_price_cents, estimated_duration_min, status, intake)
  values (r.customer, 'dog-walking', r.addr, 0, 60, 'matching',
          '{"duration_min":"60","dog_count":"1"}'::jsonb)
  returning id into v_req;
  insert into match_attempts (request_id, provider_id, distance_km, rank_score)
  values (v_req, r.helper, 1.0, 1.0);

  perform pg_temp.become(r.helper, 'provider');
  begin
    v_booking := accept_request(v_req, r.helper);
    raise exception 'FAIL Q06 accepted an unsealed request';
  exception when others then
    if sqlerrm like 'FAIL %' then raise; end if;
    if position('never sealed' in sqlerrm) = 0 then
      raise exception 'FAIL Q06 refused for the wrong reason: %', sqlerrm;
    end if;
    raise notice 'PASS Q06 an unsealed request cannot be accepted';
  end;
end $$;

-- ---------------------------------------------------------------------------
-- Q07 — a customer cannot seal, or re-seal, their own request
-- ---------------------------------------------------------------------------
do $$
declare r record; v_req uuid;
begin
  perform pg_temp.become_service();
  select * into r from qf;
  v_req := pg_temp.make_request('30', '1');

  perform pg_temp.become(r.customer, 'customer');
  begin
    perform seal_request_quote(v_req);
    raise exception 'FAIL Q07 a customer re-sealed their own request';
  exception when others then
    if sqlerrm like 'FAIL %' then raise; end if;
    raise notice 'PASS Q07 a customer cannot seal a request: %', left(sqlerrm, 48);
  end;

  -- Not even the server may re-seal an already-sealed request: that would
  -- launder exactly the edit this exists to catch.
  perform pg_temp.become_service();
  begin
    perform seal_request_quote(v_req);
    raise exception 'FAIL Q08 an already-sealed request was re-sealed';
  exception when others then
    if sqlerrm like 'FAIL %' then raise; end if;
    raise notice 'PASS Q08 a sealed request cannot be re-sealed';
  end;
end $$;

rollback;
