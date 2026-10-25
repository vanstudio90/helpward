-- Quote integrity and dispatch privileges, executed under REAL roles.
--
-- STATUS: NOT YET EXECUTED. Needs the isolated database with the full
-- migration chain applied. Run during rehearsal; see
-- supabase/rollback/ROLLBACK.md.
--
-- Why this file exists: an earlier version of these checks lived in
-- boundary_containment.sql §8 and sealed, then deleted, a bundle entirely
-- within the privileged fixture context, asserting only that the hash
-- changed. That proved the hash function is sensitive to input. It did not
-- exercise a single customer-role mutation and never called accept_request,
-- so it could not substantiate the guarantees it was cited for.
--
-- Everything here runs inside one transaction that is rolled back, and
-- every protected operation is attempted as the actual `authenticated` role
-- with `request.jwt.claims` set, so RLS and the triggers see a real
-- customer or helper.
--
-- USAGE (psql):
--   \i supabase/tests/quote_integrity.sql

\set ON_ERROR_STOP on

begin;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Become a signed-in user. jwt_role() reads app_metadata.role, falling back
-- to the top-level role claim, and auth.uid() reads `sub`.
create or replace function pg_temp.become(p_uid uuid, p_role text default 'customer')
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated',
                      'app_metadata', json_build_object('role', p_role))::text,
    true);
  execute 'set local role authenticated';
end $$;

-- Back to the privileged fixture context.
create or replace function pg_temp.become_service()
returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $$;

-- Assert that a statement fails. Raises if it unexpectedly succeeds.
create or replace function pg_temp.must_fail(p_label text, p_sql text)
returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception
    when others then
      raise notice 'PASS %  (refused: %)', p_label, replace(sqlerrm, E'\n', ' ');
      return;
  end;
  raise exception 'FAIL %: the operation succeeded but must have been refused', p_label;
end $$;

-- ---------------------------------------------------------------------------
-- Fixture: one customer, one approved+online helper, a verified in-area
-- address, and a sealed two-stop bundle offered to the helper.
-- ---------------------------------------------------------------------------
create temp table t (customer uuid, helper uuid, addr uuid, req uuid,
                     svc_a text, svc_b text, fp text, subtotal int);

do $$
declare
  v_customer uuid; v_helper uuid; v_addr uuid; v_req uuid;
  v_a text; v_b text; v_fp text; v_sub int;
begin
  perform pg_temp.become_service();

  select id into v_customer from profiles where role = 'customer' limit 1;
  select user_id into v_helper from provider_profiles limit 1;
  select id into v_a from services where active order by id limit 1;
  select id into v_b from services where active order by id offset 1 limit 1;
  if v_customer is null or v_helper is null or v_b is null then
    raise exception 'Fixture needs a customer profile, a provider profile and two active services';
  end if;

  -- Make the helper genuinely eligible.
  update provider_profiles
     set status = 'approved', is_online = true, vacation_mode = false,
         current_location = st_setsrid(st_makepoint(-123.12, 49.28), 4326)::geography,
         location_updated_at = now(), service_radius_km = 25
   where user_id = v_helper;
  insert into provider_services (provider_id, service_id)
  values (v_helper, v_a), (v_helper, v_b)
  on conflict do nothing;

  insert into addresses (user_id, formatted, location, country, geocode_verified, geocoded_at)
  values (v_customer, 'FIXTURE — verified in-area',
          st_setsrid(st_makepoint(-123.12, 49.28), 4326)::geography, 'CA', true, now())
  returning id into v_addr;

  insert into requests (customer_id, service_id, pickup_address_id,
                        estimated_price_cents, estimated_duration_min, status,
                        is_bundle, bundle_item_count)
  values (v_customer, v_a, v_addr, 0, 60, 'matching', true, 2)
  returning id into v_req;

  -- Prices deliberately zero: the INSERT trigger must overwrite them from
  -- the catalog even for the service role.
  insert into request_bundle_items (request_id, position, service_id, item_price_cents)
  values (v_req, 1, v_a, 0), (v_req, 2, v_b, 0);

  select coalesce(sum(i.item_price_cents), 0) into v_sub
    from request_bundle_items i where i.request_id = v_req;
  if v_sub = 0 then
    raise exception 'FAIL: the insert trigger did not apply catalog prices';
  end if;
  raise notice 'PASS: catalog prices applied on insert (subtotal %)', v_sub;

  v_fp := seal_bundle_quote(v_req);
  insert into match_attempts (request_id, provider_id, distance_km, rank_score)
  values (v_req, v_helper, 1.0, 1.0);

  insert into t values (v_customer, v_helper, v_addr, v_req, v_a, v_b, v_fp, v_sub);
end $$;

-- ---------------------------------------------------------------------------
-- 1. As the actual CUSTOMER: every protected quote mutation must be refused.
-- ---------------------------------------------------------------------------
do $$
declare r record;
begin
  select * into r from t;
  perform pg_temp.become(r.customer, 'customer');

  perform pg_temp.must_fail('customer deletes a bundle stop',
    format('delete from request_bundle_items where request_id = %L and position = 2', r.req));

  perform pg_temp.must_fail('customer rewrites a stop price',
    format('update request_bundle_items set item_price_cents = 0 where request_id = %L', r.req));

  perform pg_temp.must_fail('customer swaps a stop service',
    format('update request_bundle_items set service_id = %L where request_id = %L and position = 1',
           r.svc_b, r.req));

  perform pg_temp.must_fail('customer reparents a stop',
    format('update request_bundle_items set request_id = gen_random_uuid() where request_id = %L', r.req));

  perform pg_temp.must_fail('customer edits bundle_item_count',
    format('update requests set bundle_item_count = 1 where id = %L', r.req));

  perform pg_temp.must_fail('customer edits the quote fingerprint',
    format('update requests set quote_fingerprint = %L where id = %L', 'forged', r.req));

  perform pg_temp.must_fail('customer edits the estimated price',
    format('update requests set estimated_price_cents = 1 where id = %L', r.req));

  perform pg_temp.must_fail('customer repoints the pickup address',
    format('update requests set pickup_address_id = gen_random_uuid() where id = %L', r.req));

  perform pg_temp.must_fail('customer grants itself a verified address',
    format('update addresses set geocode_verified = true where id = %L', r.addr));

  perform pg_temp.become_service();
end $$;

-- ---------------------------------------------------------------------------
-- 2. A customer-owned address edit must INVALIDATE its attestation rather
--    than fail, so an existing verified row cannot be moved and kept.
-- ---------------------------------------------------------------------------
do $$
declare r record; v_still boolean; v_recon boolean;
begin
  select * into r from t;
  perform pg_temp.become(r.customer, 'customer');
  update addresses
     set location = st_setsrid(st_makepoint(-118.2437, 34.0522), 4326)::geography
   where id = r.addr;
  perform pg_temp.become_service();

  select geocode_verified, needs_reconfirmation into v_still, v_recon
    from addresses where id = r.addr;
  if v_still then
    raise exception 'FAIL: moving a verified address kept its attestation';
  end if;
  if not v_recon then
    raise exception 'FAIL: moved address was not flagged for reconfirmation';
  end if;
  raise notice 'PASS: moving a verified address cleared the attestation and flagged reconfirmation';

  -- Put it back for the acceptance tests below.
  update addresses
     set location = st_setsrid(st_makepoint(-123.12, 49.28), 4326)::geography,
         geocode_verified = true, needs_reconfirmation = false
   where id = r.addr;
end $$;

-- ---------------------------------------------------------------------------
-- 3. The ordinary successful path: the offered helper accepts the untampered
--    two-stop bundle and the booking prices the whole quote.
-- ---------------------------------------------------------------------------
do $$
declare
  r record; v_booking uuid; v_total int; v_payout int; v_platform int;
begin
  select * into r from t;
  perform pg_temp.become(r.helper, 'provider');
  v_booking := accept_request(r.req, r.helper);
  perform pg_temp.become_service();

  select total_cents, payout_cents, platform_fee_cents
    into v_total, v_payout, v_platform
    from bookings where id = v_booking;

  if v_total <> r.subtotal + 450 then
    raise exception 'FAIL: booking total % does not equal subtotal % + 450', v_total, r.subtotal;
  end if;
  if v_payout <> round(r.subtotal * 0.80) then
    raise exception 'FAIL: payout % is not 80%% of the subtotal %', v_payout, r.subtotal;
  end if;
  if v_payout + v_platform <> v_total then
    raise exception 'FAIL: payout + platform (%) does not reconcile to the total %', v_payout + v_platform, v_total;
  end if;
  raise notice 'PASS: two-stop bundle accepted; total % payout % platform % reconciles',
    v_total, v_payout, v_platform;
end $$;

-- ---------------------------------------------------------------------------
-- 4. A TAMPERED sealed bundle must be refused at acceptance.
--
-- The tamper is applied with privilege, which is the hard case: it
-- simulates any path that mutates the stop set after sealing, including a
-- bug in server code. The fingerprint comparison inside accept_request is
-- the only thing that catches it.
-- ---------------------------------------------------------------------------
do $$
declare
  r record; v_req2 uuid; v_fp2 text; v_ok boolean := false;
begin
  select * into r from t;
  perform pg_temp.become_service();

  insert into requests (customer_id, service_id, pickup_address_id,
                        estimated_price_cents, estimated_duration_min, status,
                        is_bundle, bundle_item_count)
  values (r.customer, r.svc_a, r.addr, 0, 60, 'matching', true, 2)
  returning id into v_req2;
  insert into request_bundle_items (request_id, position, service_id, item_price_cents)
  values (v_req2, 1, r.svc_a, 0), (v_req2, 2, r.svc_b, 0);
  v_fp2 := seal_bundle_quote(v_req2);
  insert into match_attempts (request_id, provider_id, distance_km, rank_score)
  values (v_req2, r.helper, 1.0, 1.0);

  -- Drop a stop AFTER the offer went out, then make the parent count agree
  -- so that a count-based check would have been satisfied.
  delete from request_bundle_items where request_id = v_req2 and position = 2;
  update requests set bundle_item_count = 1 where id = v_req2;

  perform pg_temp.become(r.helper, 'provider');
  begin
    perform accept_request(v_req2, r.helper);
    v_ok := true;
  exception
    when others then
      raise notice 'PASS tampered bundle refused at acceptance (%)', replace(sqlerrm, E'\n', ' ');
  end;
  perform pg_temp.become_service();

  if v_ok then
    raise exception 'FAIL: a tampered sealed bundle was accepted';
  end if;
  if exists (select 1 from bookings where request_id = v_req2) then
    raise exception 'FAIL: a booking exists for the tampered bundle';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Dispatch privileges: the historical `authenticated` grant must be gone.
-- ---------------------------------------------------------------------------
do $$
declare r record; v_bad int := 0;
begin
  for r in
    select fn,
           has_function_privilege('authenticated', fn, 'EXECUTE') as auth_can,
           has_function_privilege('anon', fn, 'EXECUTE')          as anon_can,
           has_function_privilege('service_role', fn, 'EXECUTE')  as svc_can
    from (values
      ('public.broadcast_request(uuid,int)'),
      ('public.record_dispatch_refusal(uuid,text,text)'),
      ('public.seal_bundle_quote(uuid)'),
      ('public.bundle_subtotal_cents(uuid)'),
      ('public.compute_bundle_fingerprint(uuid)'),
      ('public.insert_service_area_boundary(text,text,text,text)')
    ) t(fn)
  loop
    if r.auth_can or r.anon_can then
      raise warning 'FAIL % executable by authenticated=% anon=%', r.fn, r.auth_can, r.anon_can;
      v_bad := v_bad + 1;
    elsif not r.svc_can then
      raise warning 'FAIL % NOT executable by service_role', r.fn;
      v_bad := v_bad + 1;
    else
      raise notice 'PASS % service-role only', r.fn;
    end if;
  end loop;
  if v_bad > 0 then
    raise exception 'FAIL: % privileged function(s) have the wrong grants', v_bad;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 6. The loader's RPC must work for the service role and be denied to a
--    customer — the authorisation that blocked the documented rehearsal.
-- ---------------------------------------------------------------------------
do $$
declare r record;
begin
  select * into r from t;

  perform set_config('request.jwt.claims',
    json_build_object('sub', gen_random_uuid()::text, 'role', 'service_role',
                      'app_metadata', json_build_object('role', 'service_role'))::text, true);
  insert into service_area_datasets (id, area_id, source_name, source_url, source_version,
    source_retrieved_at, license, source_sha256, feature_count, is_active)
  values ('fixture-ds', 'lower-mainland-bc', 'fixture', 'http://fixture', 'v0',
          now(), 'fixture', repeat('0', 64), 1, false);
  perform insert_service_area_boundary('fixture-ds', 'lower-mainland-bc', 'Vancouver',
    '{"type":"Polygon","coordinates":[[[-123.2,49.2],[-123.2,49.3],[-123.0,49.3],[-123.0,49.2],[-123.2,49.2]]]}');
  raise notice 'PASS: service role can load a boundary';

  perform pg_temp.become(r.customer, 'customer');
  perform pg_temp.must_fail('customer calls the boundary loader RPC',
    'select insert_service_area_boundary(''fixture-ds'', ''lower-mainland-bc'', ''Hack'', ''{"type":"Polygon","coordinates":[[[0,0],[0,1],[1,1],[1,0],[0,0]]]}'')');
  perform pg_temp.become_service();
end $$;

select 'quote_integrity.sql: all assertions passed' as result;

rollback;
