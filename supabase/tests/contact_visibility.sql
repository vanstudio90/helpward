-- Who can read a phone number, under REAL roles.
--
-- profiles_read (0002) exposes any row where role = 'provider' to every
-- authenticated user, and `phone` sat on that row — so every helper's
-- number was readable by anyone with an account, permanently. RLS is
-- row-level and could not hide one column of a row it was exposing, so
-- the number moved to its own table in 0050.
--
-- Every grant below is paired with the case it must NOT grant. A policy
-- that let the right person read would also pass if it let everyone.
--
-- USAGE: node scripts/run-sql-suite.mjs supabase/tests/contact_visibility.sql

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
-- Fixture: a customer, their assigned helper, an unrelated helper, and an
-- active booking. Everyone has a number.
-- ---------------------------------------------------------------------------
create temp table cf (customer uuid, helper uuid, other uuid, booking uuid);

do $$
declare v_cust uuid; v_helper uuid; v_other uuid; v_svc text; v_addr uuid; v_req uuid; v_bk uuid;
begin
  perform pg_temp.become_service();
  select id into v_cust from profiles where role = 'customer' limit 1;
  select user_id into v_helper from provider_profiles order by user_id limit 1;
  select user_id into v_other from provider_profiles where user_id <> v_helper order by user_id limit 1;
  select id into v_svc from services where active order by id limit 1;
  if v_cust is null or v_helper is null or v_other is null then
    raise exception 'Fixture needs a customer and TWO provider profiles';
  end if;

  insert into profile_contacts (user_id, phone) values
    (v_cust,   '+1-555-CUSTOMER'),
    (v_helper, '+1-555-HELPER'),
    (v_other,  '+1-555-OTHER')
  on conflict (user_id) do update set phone = excluded.phone;

  insert into addresses (user_id, formatted, location, country, geocode_verified, geocoded_at)
  values (v_cust, 'FIXTURE — contact visibility',
          st_setsrid(st_makepoint(-117.1611, 32.7157), 4326)::geography, 'US', true, now())
  returning id into v_addr;

  insert into requests (customer_id, service_id, pickup_address_id,
                        estimated_price_cents, estimated_duration_min, status)
  values (v_cust, v_svc, v_addr, 2450, 60, 'matched') returning id into v_req;

  insert into bookings (request_id, customer_id, provider_id, service_id, status,
                        scheduled_for, base_price_cents, service_fee_cents, total_cents,
                        platform_fee_cents, payout_cents, currency, payment_status)
  values (v_req, v_cust, v_helper, v_svc, 'scheduled', now(),
          2000, 450, 2450, 850, 1600, 'USD', 'authorized')
  returning id into v_bk;

  insert into cf values (v_cust, v_helper, v_other, v_bk);
end $$;

-- ---------------------------------------------------------------------------
-- During an active booking, the two parties can reach each other
-- ---------------------------------------------------------------------------
do $$
declare r record;
begin
  perform pg_temp.become_service(); select * into r from cf;

  perform pg_temp.become(r.helper, 'provider');
  perform pg_temp.expect_rows(
    format('select phone from profile_contacts where user_id = %L', r.customer), 1,
    'P01a the assigned helper can reach the customer');

  perform pg_temp.become(r.customer, 'customer');
  perform pg_temp.expect_rows(
    format('select phone from profile_contacts where user_id = %L', r.helper), 1,
    'P01b the customer can reach their helper');
  perform pg_temp.expect_rows(
    format('select phone from profile_contacts where user_id = %L', r.customer), 1,
    'P01c anyone can read their own number');
end $$;

-- ---------------------------------------------------------------------------
-- Nobody else can, and this is the leak that existed before
-- ---------------------------------------------------------------------------
do $$
declare r record;
begin
  perform pg_temp.become_service(); select * into r from cf;

  -- The exact old bug: a HELPER's number, read by an unrelated signed-in
  -- user, because profiles_read exposes every provider row.
  perform pg_temp.become(r.customer, 'customer');
  perform pg_temp.expect_rows(
    format('select phone from profile_contacts where user_id = %L', r.other), 0,
    'P02a a customer cannot read an unrelated HELPER''s number');

  perform pg_temp.become(r.other, 'provider');
  perform pg_temp.expect_rows(
    format('select phone from profile_contacts where user_id = %L', r.customer), 0,
    'P02b an unrelated helper cannot read the customer''s number');
  perform pg_temp.expect_rows(
    format('select phone from profile_contacts where user_id = %L', r.helper), 0,
    'P02c ... nor another helper''s');

  -- And the table as a whole is not browsable.
  perform pg_temp.become(r.other, 'provider');
  perform pg_temp.expect_rows(
    'select user_id from profile_contacts', 1,
    'P02d a signed-in user sees only their own row');
end $$;

-- ---------------------------------------------------------------------------
-- Access ends with the booking
-- ---------------------------------------------------------------------------
do $$
declare r record;
begin
  perform pg_temp.become_service(); select * into r from cf;
  update bookings set status = 'completed', completed_at = now() where id = r.booking;

  perform pg_temp.become(r.helper, 'provider');
  perform pg_temp.expect_rows(
    format('select phone from profile_contacts where user_id = %L', r.customer), 0,
    'P03a a finished job is not a licence to keep the number');

  -- Control: restoring the booking restores the access, so the refusal
  -- above is the status check and not a policy that never matches.
  perform pg_temp.become_service();
  update bookings set status = 'in_progress' where id = r.booking;
  perform pg_temp.become(r.helper, 'provider');
  perform pg_temp.expect_rows(
    format('select phone from profile_contacts where user_id = %L', r.customer), 1,
    'P03b an in-progress booking restores it (control)');
end $$;

-- ---------------------------------------------------------------------------
-- You cannot write someone else's number, or mark your own verified
-- ---------------------------------------------------------------------------
do $$
declare r record; v_ok boolean;
begin
  perform pg_temp.become_service(); select * into r from cf;
  perform pg_temp.become(r.other, 'provider');

  update profile_contacts set phone = '+1-555-HIJACK' where user_id = r.customer;
  perform pg_temp.become_service();
  select phone = '+1-555-CUSTOMER' into v_ok from profile_contacts where user_id = r.customer;
  if not v_ok then raise exception 'FAIL P04a a stranger rewrote the customer''s number'; end if;
  raise notice 'PASS P04a a stranger cannot rewrite someone else''s number';

  -- phone_verified is an attestation: only the server may grant it.
  perform pg_temp.become(r.other, 'provider');
  begin
    update profile_contacts set phone_verified = true where user_id = r.other;
    perform pg_temp.become_service();
    if (select phone_verified from profile_contacts where user_id = r.other) then
      raise exception 'FAIL P04b a user marked their own number verified';
    end if;
    raise notice 'PASS P04b phone_verified cannot be self-granted';
  exception when insufficient_privilege then
    raise notice 'PASS P04b phone_verified cannot be self-granted (refused outright)';
  end;
end $$;

-- ---------------------------------------------------------------------------
-- P05 — saving your own number, including the FIRST time
-- ---------------------------------------------------------------------------
-- Settings failed with "permission denied for table profile_contacts".
-- The cause was the upsert: PostgREST puts every column it was given into
-- the ON CONFLICT ... SET clause, user_id included, and user_id is
-- deliberately not writable. Edits to an existing row worked; first-time
-- saves did not — so the bug only appeared for people who had never
-- given a number, which is everyone at launch.
do $$
declare r record; v_phone text; v_verified boolean;
begin
  perform pg_temp.become_service(); select * into r from cf;
  delete from profile_contacts where user_id = r.customer;

  perform pg_temp.become(r.customer, 'customer');
  perform set_my_phone('+1-555-FIRST');
  perform pg_temp.become_service();
  select phone into v_phone from profile_contacts where user_id = r.customer;
  if v_phone is distinct from '+1-555-FIRST' then
    raise exception 'FAIL P05 a first-time save did not persist (got %)', v_phone;
  end if;
  raise notice 'PASS P05 a first-time save works';

  -- A changed number is an unverified number: carrying verification
  -- across would let someone verify one number and swap in another.
  update profile_contacts set phone_verified = true where user_id = r.customer;
  perform pg_temp.become(r.customer, 'customer');
  perform set_my_phone('+1-555-SECOND');
  perform pg_temp.become_service();
  select phone, phone_verified into v_phone, v_verified
    from profile_contacts where user_id = r.customer;
  if v_phone <> '+1-555-SECOND' then
    raise exception 'FAIL P06 an edit did not persist';
  end if;
  if v_verified then
    raise exception 'FAIL P06 a changed number kept its verification';
  end if;
  raise notice 'PASS P06 changing the number clears its verification';
end $$;

-- And it still only ever writes YOUR row.
do $$
declare r record; v_other text;
begin
  perform pg_temp.become_service(); select * into r from cf;
  perform pg_temp.become(r.other, 'provider');
  perform set_my_phone('+1-555-MINE');
  perform pg_temp.become_service();
  select phone into v_other from profile_contacts where user_id = r.customer;
  if v_other = '+1-555-MINE' then
    raise exception 'FAIL P07 set_my_phone wrote someone else''s row';
  end if;
  raise notice 'PASS P07 set_my_phone writes only the caller''s own row';
end $$;

rollback;
