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

-- Assert that a statement fails FOR THE EXPECTED REASON.
--
-- A plain "any exception means PASS" helper is not evidence: a foreign-key
-- violation, a permission error or a typo in the fixture all look like
-- success. Two earlier assertions used gen_random_uuid() as a foreign key
-- and would have passed with every guard removed, because the FK constraint
-- rejected them on its own.
--
-- So: the error text must contain `p_expect`, and integrity-constraint
-- classes (23xxx) are rejected outright unless they ARE what is expected.
create or replace function pg_temp.must_fail_with(
  p_label text, p_sql text, p_expect text
) returns void language plpgsql as $mfw$
declare
  v_state text;
  v_msg text;
begin
  begin
    execute p_sql;
  exception
    when others then
      v_state := sqlstate;
      v_msg := sqlerrm;

      -- HW002: refused, but not by the guard under test. A negative control
      -- must NOT accept this — the mutation stayed blocked for an unrelated
      -- reason, which certifies nothing about the removed guard.
      if v_state like '23%' and p_expect not like '%constraint%' then
        raise exception using errcode = 'HW002', message = format(
          'FAIL %s: refused by an integrity constraint (SQLSTATE %s), not by the guard under test: %s',
          p_label, v_state, replace(v_msg, E'\n', ' '));
      end if;

      if position(lower(p_expect) in lower(v_msg)) = 0 then
        raise exception using errcode = 'HW002', message = format(
          'FAIL %s: refused for the wrong reason. expected text %s, got (SQLSTATE %s) %s',
          p_label, quote_literal(p_expect), v_state, replace(v_msg, E'\n', ' '));
      end if;

      raise notice 'PASS %  (guard: %)', p_label, replace(v_msg, E'\n', ' ');
      return;
  end;

  -- HW001: the operation SUCCEEDED when it should have been refused. This
  -- is the only outcome a negative control may treat as proof that the
  -- assertion depends on the guard.
  raise exception using errcode = 'HW001', message = format(
    'FAIL %s: the operation succeeded but must have been refused', p_label);
end $mfw$;

-- For guards that CLAMP rather than raise.
--
-- The attestation trigger silences a false-to-true transition by forcing the
-- column back to false; it does not raise. And because 0001 grants
-- table-wide UPDATE, a column-level REVOKE does not stop the statement
-- either. So the only meaningful assertion is on the persisted value: the
-- statement may succeed or error, but verification must not end up true.
create or replace function pg_temp.must_not_verify(
  p_label text, p_address_id uuid
) returns void language plpgsql as $mnv$
declare
  v_errored boolean := false;
  v_after boolean;
begin
  begin
    execute format('update addresses set geocode_verified = true where id = %L', p_address_id);
  exception
    when others then
      v_errored := true;
  end;

  -- Read back with privilege: the customer role may not see the column
  -- after an error aborts its subtransaction.
  perform pg_temp.become_service();
  select geocode_verified into v_after from addresses where id = p_address_id;

  -- HW003: verification was actually persisted. Distinct from HW001 because
  -- this guard clamps rather than raising, so "the statement succeeded" is
  -- not itself a failure here.
  if coalesce(v_after, false) then
    raise exception using errcode = 'HW003', message = format(
      'FAIL %s: the customer persisted geocode_verified = true', p_label);
  end if;
  raise notice 'PASS %  (verification not persisted; statement %)',
    p_label, case when v_errored then 'was refused' else 'was clamped' end;
end $mnv$;

-- ---------------------------------------------------------------------------
-- Fixture: one customer, one approved+online helper, a verified in-area
-- address, and a sealed two-stop bundle offered to the helper.
-- ---------------------------------------------------------------------------
create temp table t (customer uuid, helper uuid, addr uuid, req uuid,
                     svc_a text, svc_b text, fp text, subtotal int,
                     -- Valid, customer-owned FK targets so a reparent or a
                     -- pickup-address change can only be refused by the
                     -- guard, never by a foreign-key constraint.
                     addr2 uuid, unverified_addr uuid, req2 uuid);

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

  insert into t (customer, helper, addr, req, svc_a, svc_b, fp, subtotal)
  values (v_customer, v_helper, v_addr, v_req, v_a, v_b, v_fp, v_sub);
end $$;

-- Valid FK targets, all owned by the same customer and visible under RLS.
do $$
declare
  r record; v_addr2 uuid; v_unver uuid; v_req2 uuid;
begin
  select * into r from t;
  perform pg_temp.become_service();

  -- A second VERIFIED address: a legitimate reassignment target, so only the
  -- quote guard can refuse repointing the pickup.
  insert into addresses (user_id, formatted, location, country, geocode_verified, geocoded_at)
  values (r.customer, 'FIXTURE — second verified address',
          st_setsrid(st_makepoint(-123.10, 49.26), 4326)::geography, 'CA', true, now())
  returning id into v_addr2;

  -- An UNVERIFIED address: the subject of the false-to-true attempt, which
  -- is the transition the trigger actually guards. Attempting it on an
  -- already-verified row is a no-op and proves nothing.
  insert into addresses (user_id, formatted, location, country)
  values (r.customer, 'FIXTURE — unverified address',
          st_setsrid(st_makepoint(-123.11, 49.27), 4326)::geography, 'CA')
  returning id into v_unver;
  if (select geocode_verified from addresses where id = v_unver) then
    raise exception 'Fixture error: the unverified address was created verified';
  end if;

  -- A second request owned by the same customer: a valid reparent target.
  insert into requests (customer_id, service_id, pickup_address_id,
                        estimated_price_cents, estimated_duration_min, status)
  values (r.customer, r.svc_a, v_addr2, 2450, 45, 'matching')
  returning id into v_req2;

  update t set addr2 = v_addr2, unverified_addr = v_unver, req2 = v_req2;
end $$;

-- Confirm the targets are visible AND writable to the customer, so a later
-- refusal cannot be blamed on RLS or on a missing row.
do $$
declare r record; v_seen int;
begin
  select * into r from t;
  perform pg_temp.become(r.customer, 'customer');

  select count(*) into v_seen from requests where id in (r.req, r.req2);
  if v_seen <> 2 then
    raise exception 'Fixture error: customer sees % of 2 own requests under RLS', v_seen;
  end if;
  select count(*) into v_seen from addresses where id in (r.addr, r.addr2, r.unverified_addr);
  if v_seen <> 3 then
    raise exception 'Fixture error: customer sees % of 3 own addresses under RLS', v_seen;
  end if;

  -- An UNPROTECTED column on the same rows must be writable, proving the
  -- role can update these rows at all.
  update requests set notes = 'control write' where id = r.req2;
  update addresses set label = 'control write' where id = r.addr2;
  raise notice 'PASS fixture control: customer can see and update its own rows';

  perform pg_temp.become_service();
end $$;

-- ---------------------------------------------------------------------------
-- 1. As the actual CUSTOMER: every protected quote mutation must be refused
--    BY ITS GUARD, not by a constraint, a permission or a missing row.
-- ---------------------------------------------------------------------------
do $$
declare r record;
  c_item constant text := 'fixed at request creation';
  c_del  constant text := 'cannot be removed after the quote is created';
  c_req  constant text := 'request quote fields are server-controlled';
begin
  select * into r from t;
  perform pg_temp.become(r.customer, 'customer');

  perform pg_temp.must_fail_with('customer deletes a bundle stop',
    format('delete from request_bundle_items where request_id = %L and position = 2', r.req),
    c_del);

  perform pg_temp.must_fail_with('customer rewrites a stop price',
    format('update request_bundle_items set item_price_cents = 0 where request_id = %L', r.req),
    c_item);

  perform pg_temp.must_fail_with('customer swaps a stop service',
    format('update request_bundle_items set service_id = %L where request_id = %L and position = 1',
           r.svc_b, r.req),
    c_item);

  perform pg_temp.must_fail_with('customer moves a stop position',
    format('update request_bundle_items set position = 9 where request_id = %L and position = 1', r.req),
    c_item);

  -- Reparent onto a REAL request the same customer owns, so the foreign key
  -- is satisfied and only the guard can refuse.
  perform pg_temp.must_fail_with('customer reparents a stop onto another own request',
    format('update request_bundle_items set request_id = %L where request_id = %L and position = 1',
           r.req2, r.req),
    c_item);

  perform pg_temp.must_fail_with('customer edits bundle_item_count',
    format('update requests set bundle_item_count = 1 where id = %L', r.req), c_req);

  perform pg_temp.must_fail_with('customer edits the quote fingerprint',
    format('update requests set quote_fingerprint = %L where id = %L', 'forged', r.req), c_req);

  perform pg_temp.must_fail_with('customer edits the estimated price',
    format('update requests set estimated_price_cents = 1 where id = %L', r.req), c_req);

  perform pg_temp.must_fail_with('customer flips is_bundle',
    format('update requests set is_bundle = false where id = %L', r.req), c_req);

  -- Repoint at a REAL address the same customer owns.
  perform pg_temp.must_fail_with('customer repoints pickup to another own address',
    format('update requests set pickup_address_id = %L where id = %L', r.addr2, r.req), c_req);

  perform pg_temp.become_service();
end $$;

-- The attestation guard CLAMPS rather than raising, and 0001 grants
-- table-wide UPDATE, so this is asserted on the persisted value. The target
-- is the UNVERIFIED address: false-to-true is the transition being guarded.
do $$
declare r record;
begin
  select * into r from t;
  perform pg_temp.become(r.customer, 'customer');
  perform pg_temp.must_not_verify(
    'customer grants itself verification on an unverified address', r.unverified_addr);
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

  -- must_fail_with, not the removed must_fail: a call to a non-existent
  -- helper aborts the whole file under ON_ERROR_STOP, which would have
  -- silently skipped every negative control in section 7.
  --
  -- The expected refusal is the function's own authorisation message. If
  -- the REVOKE in 0033 denies EXECUTE first, the error is SQLSTATE 42501
  -- (insufficient_privilege) instead — also a correct refusal, so both are
  -- accepted, but nothing else is.
  perform pg_temp.become(r.customer, 'customer');
  begin
    perform pg_temp.must_fail_with('customer calls the boundary loader RPC',
      'select insert_service_area_boundary(''fixture-ds'', ''lower-mainland-bc'', ''Hack'', ''{"type":"Polygon","coordinates":[[[0,0],[0,1],[1,1],[1,0],[0,0]]]}'')',
      'not authorised');
  exception
    when sqlstate 'HW002' then
      -- Wrong-reason: acceptable only if the reason is a privilege denial.
      if position('permission denied' in lower(sqlerrm)) > 0
         or position('42501' in sqlerrm) > 0 then
        raise notice 'PASS customer calls the boundary loader RPC  (denied by EXECUTE privilege)';
      else
        raise;
      end if;
  end;
  perform pg_temp.become_service();
end $$;

-- ---------------------------------------------------------------------------
-- 7. NEGATIVE CONTROLS — prove the assertions above have teeth.
--
-- Both review findings on this file came down to assertions that would have
-- passed with the guard removed: one targeted an already-true flag, two
-- relied on a foreign-key violation. A suite that cannot fail is not
-- evidence, so each protection is disabled in turn here and the
-- corresponding assertion is REQUIRED to fail.
--
-- All of this runs inside the same transaction, which is rolled back, and
-- each real definition is also restored explicitly. Runs last because it
-- deliberately leaves tampered rows behind.
-- ---------------------------------------------------------------------------

-- Expect an assertion to raise. Fails the suite if it passes.
create or replace function pg_temp.control_must_fail(
  p_label text, p_sql text, p_expect_state text default 'HW001'
) returns void language plpgsql as $ctl$
declare
  v_state text;
begin
  begin
    execute p_sql;
  exception
    when others then
      v_state := sqlstate;

      -- Only the INTENDED assertion failure proves the assertion depends on
      -- the guard that was removed:
      --   HW001  the mutation succeeded when the assertion expected refusal
      --   HW003  verification was persisted when the clamp was expected
      --
      -- Anything else means the mutation stayed blocked for an unrelated
      -- reason — a constraint, a privilege, a wrong-reason refusal, or a
      -- missing helper — so it certifies nothing. Those propagate.
      if v_state = p_expect_state then
        raise notice 'PASS negative control %  (assertion failed as required, SQLSTATE %)',
          p_label, v_state;
        return;
      end if;

      raise exception
        'FAIL negative control %: the assertion failed with SQLSTATE % (expected %), so the mutation was blocked for an unrelated reason and this control proves nothing: %',
        p_label, v_state, p_expect_state, replace(sqlerrm, E'\n', ' ');
  end;
  raise exception
    'FAIL negative control %: the assertion still passed with its guard removed, so it proves nothing',
    p_label;
end $ctl$;

do $neg$
declare
  r record;
  v_real_item text;
  v_real_req  text;
  v_real_attn text;
  v_real_accept text;
  v_req3 uuid;
  v_accepted boolean := false;
begin
  select * into r from t;
  perform pg_temp.become_service();

  v_real_item   := pg_get_functiondef(to_regprocedure('public.enforce_bundle_item_quote()'));
  v_real_req    := pg_get_functiondef(to_regprocedure('public.enforce_request_quote()'));
  v_real_attn   := pg_get_functiondef(to_regprocedure('public.enforce_address_attestation()'));
  v_real_accept := pg_get_functiondef(to_regprocedure('public.accept_request(uuid,uuid)'));

  -- ---- control A: bundle stop guard disabled ------------------------------
  create or replace function public.enforce_bundle_item_quote()
  returns trigger language plpgsql security definer set search_path = public as $noop$
  begin return case when tg_op = 'DELETE' then old else new end; end $noop$;

  perform pg_temp.become(r.customer, 'customer');
  perform pg_temp.control_must_fail('stop price guard', format(
    'select pg_temp.must_fail_with(%L, %L, %L)',
    'ctl price',
    format('update request_bundle_items set item_price_cents = 0 where request_id = %L', r.req),
    'fixed at request creation'));
  perform pg_temp.control_must_fail('stop reparent guard', format(
    'select pg_temp.must_fail_with(%L, %L, %L)',
    'ctl reparent',
    format('update request_bundle_items set request_id = %L where request_id = %L and position = 1',
           r.req2, r.req),
    'fixed at request creation'));
  perform pg_temp.control_must_fail('stop delete guard', format(
    'select pg_temp.must_fail_with(%L, %L, %L)',
    'ctl delete',
    format('delete from request_bundle_items where request_id = %L and position = 2', r.req),
    'cannot be removed after the quote is created'));
  perform pg_temp.become_service();
  execute v_real_item;

  -- ---- control B: parent quote guard disabled -----------------------------
  create or replace function public.enforce_request_quote()
  returns trigger language plpgsql security definer set search_path = public as $noop$
  begin return new; end $noop$;

  perform pg_temp.become(r.customer, 'customer');
  perform pg_temp.control_must_fail('bundle_item_count guard', format(
    'select pg_temp.must_fail_with(%L, %L, %L)',
    'ctl count',
    format('update requests set bundle_item_count = 1 where id = %L', r.req),
    'request quote fields are server-controlled'));
  perform pg_temp.control_must_fail('pickup repoint guard', format(
    'select pg_temp.must_fail_with(%L, %L, %L)',
    'ctl pickup',
    format('update requests set pickup_address_id = %L where id = %L', r.addr2, r.req),
    'request quote fields are server-controlled'));
  perform pg_temp.become_service();
  execute v_real_req;

  -- ---- control C: attestation clamp disabled ------------------------------
  -- The control the original self-grant assertion lacked entirely: with the
  -- clamp removed a customer CAN persist verification, so must_not_verify
  -- must fail.
  create or replace function public.enforce_address_attestation()
  returns trigger language plpgsql security definer set search_path = public as $noop$
  begin return new; end $noop$;

  perform pg_temp.become(r.customer, 'customer');
  perform pg_temp.control_must_fail('attestation clamp', format(
    'select pg_temp.must_not_verify(%L, %L)', 'ctl attest', r.unverified_addr),
    'HW003');
  perform pg_temp.become_service();
  execute v_real_attn;

  update addresses set geocode_verified = false, needs_reconfirmation = false
   where id = r.unverified_addr;

  -- ---- control D: acceptance fingerprint comparison removed ---------------
  -- Proves section 4 depends on the comparison and not on some other error.
  insert into requests (customer_id, service_id, pickup_address_id,
                        estimated_price_cents, estimated_duration_min, status,
                        is_bundle, bundle_item_count)
  values (r.customer, r.svc_a, r.addr, 0, 60, 'matching', true, 2)
  returning id into v_req3;
  insert into request_bundle_items (request_id, position, service_id, item_price_cents)
  values (v_req3, 1, r.svc_a, 0), (v_req3, 2, r.svc_b, 0);
  perform seal_bundle_quote(v_req3);
  insert into match_attempts (request_id, provider_id, distance_km, rank_score)
  values (v_req3, r.helper, 1.0, 1.0);

  delete from request_bundle_items where request_id = v_req3 and position = 2;
  update requests set bundle_item_count = 1 where id = v_req3;

  execute replace(v_real_accept,
    'if compute_bundle_fingerprint(p_request_id) <> v_request.quote_fingerprint then',
    'if false then');

  perform pg_temp.become(r.helper, 'provider');
  begin
    perform accept_request(v_req3, r.helper);
    v_accepted := true;
  exception when others then
    v_accepted := false;
  end;
  perform pg_temp.become_service();
  execute v_real_accept;

  if not v_accepted then
    raise exception 'FAIL negative control acceptance fingerprint: the tampered bundle was still refused with the comparison removed, so section 4 does not depend on it';
  end if;
  raise notice 'PASS negative control acceptance fingerprint  (tampered bundle accepted once the comparison was removed)';

  -- Confirm the real definitions are back.
  if position('fixed at request creation' in
        pg_get_functiondef(to_regprocedure('public.enforce_bundle_item_quote()'))) = 0
     or position('server-controlled' in
        pg_get_functiondef(to_regprocedure('public.enforce_request_quote()'))) = 0
     or position('compute_bundle_fingerprint' in
        pg_get_functiondef(to_regprocedure('public.accept_request(uuid,uuid)'))) = 0 then
    raise exception 'FAIL: a real guard definition was not restored after the negative controls';
  end if;
  raise notice 'PASS: all real guard definitions restored';
end $neg$;

select 'quote_integrity.sql: all assertions and negative controls passed' as result;

rollback;
