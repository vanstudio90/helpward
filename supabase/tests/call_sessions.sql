-- Calls are private to the two people on them. Executed under REAL roles.
--
-- Listening service and sleep-call companion are delivered entirely by
-- talking. Signalling carries network paths and session descriptions; a
-- third party who can read or write them can join a call that two people
-- believe is theirs.
--
-- USAGE: node scripts/run-sql-suite.mjs supabase/tests/call_sessions.sql

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

create temp table cl (customer uuid, helper uuid, other uuid, booking uuid, call_id uuid);

do $$
declare v_cust uuid; v_helper uuid; v_other uuid; v_addr uuid; v_req uuid; v_bk uuid;
begin
  perform pg_temp.become_service();
  select id into v_cust from profiles where role = 'customer' limit 1;
  select user_id into v_helper from provider_profiles order by user_id limit 1;
  select user_id into v_other from provider_profiles where user_id <> v_helper order by user_id limit 1;

  insert into addresses (user_id, formatted, location, country, geocode_verified, geocoded_at)
  values (v_cust, 'FIXTURE — call',
          st_setsrid(st_makepoint(-117.1611, 32.7157), 4326)::geography, 'US', true, now())
  returning id into v_addr;

  insert into requests (customer_id, service_id, pickup_address_id,
                        estimated_price_cents, estimated_duration_min, status, intake)
  values (v_cust, 'listening-service', v_addr, 2450, 60, 'matched', '{"duration_min":"60"}'::jsonb)
  returning id into v_req;

  insert into bookings (request_id, customer_id, provider_id, service_id, status,
                        scheduled_for, base_price_cents, service_fee_cents, total_cents,
                        platform_fee_cents, payout_cents, currency, payment_status)
  values (v_req, v_cust, v_helper, 'listening-service', 'in_progress', now(),
          2000, 450, 2450, 850, 1600, 'USD', 'authorized')
  returning id into v_bk;

  insert into cl values (v_cust, v_helper, v_other, v_bk, null);
end $$;

-- ---------------------------------------------------------------------------
-- L01 — either party can start, and both land in the SAME call
-- ---------------------------------------------------------------------------
do $$
declare r record; v_first uuid; v_second uuid; v_count int;
begin
  perform pg_temp.become_service(); select * into r from cl;

  perform pg_temp.become(r.customer, 'customer');
  v_first := start_call(r.booking);

  -- The helper pressing Call must JOIN, not open a second session.
  perform pg_temp.become(r.helper, 'provider');
  v_second := start_call(r.booking);

  if v_first <> v_second then
    raise exception 'FAIL L01 both sides pressing Call opened two sessions';
  end if;
  perform pg_temp.become_service();
  update cl set call_id = v_first;

  select count(*) into v_count from call_sessions where booking_id = r.booking;
  if v_count <> 1 then raise exception 'FAIL L01 % sessions exist, expected 1', v_count; end if;
  raise notice 'PASS L01 both sides pressing Call land in one session';
end $$;

-- ---------------------------------------------------------------------------
-- L02 — a stranger cannot see or join it
-- ---------------------------------------------------------------------------
do $$
declare r record; v_rows int;
begin
  perform pg_temp.become_service(); select * into r from cl;

  perform pg_temp.become(r.other, 'provider');
  select count(*) into v_rows from call_sessions where id = r.call_id;
  if v_rows <> 0 then raise exception 'FAIL L02 an outsider can see the call'; end if;
  raise notice 'PASS L02 an outsider cannot see the call';

  -- Signalling carries the session description. Reading it is enough to
  -- follow the call.
  perform pg_temp.become_service();
  insert into call_signals (call_id, sender_id, kind, payload)
  values (r.call_id, r.customer, 'offer', '{"sdp":"SECRET"}'::jsonb);

  perform pg_temp.become(r.other, 'provider');
  select count(*) into v_rows from call_signals where call_id = r.call_id;
  if v_rows <> 0 then raise exception 'FAIL L03 an outsider can read call signalling'; end if;
  raise notice 'PASS L03 an outsider cannot read call signalling';

  -- Nor inject into it.
  begin
    insert into call_signals (call_id, sender_id, kind, payload)
    values (r.call_id, r.other, 'offer', '{"sdp":"INJECTED"}'::jsonb);
    perform pg_temp.become_service();
    if exists (select 1 from call_signals where call_id = r.call_id and sender_id = r.other) then
      raise exception 'FAIL L04 an outsider injected a signal into the call';
    end if;
    raise notice 'PASS L04 an outsider cannot inject signalling';
  exception when insufficient_privilege or check_violation then
    raise notice 'PASS L04 an outsider cannot inject signalling (refused outright)';
  end;
end $$;

-- ---------------------------------------------------------------------------
-- L05 — you cannot send as somebody else
-- ---------------------------------------------------------------------------
do $$
declare r record;
begin
  perform pg_temp.become_service(); select * into r from cl;
  perform pg_temp.become(r.helper, 'provider');
  begin
    insert into call_signals (call_id, sender_id, kind, payload)
    values (r.call_id, r.customer, 'answer', '{"sdp":"SPOOF"}'::jsonb);
    perform pg_temp.become_service();
    if exists (select 1 from call_signals
                where call_id = r.call_id and kind = 'answer' and sender_id = r.customer) then
      raise exception 'FAIL L05 a participant sent a signal as the other party';
    end if;
    raise notice 'PASS L05 a participant cannot send as the other party';
  exception when insufficient_privilege or check_violation then
    raise notice 'PASS L05 a participant cannot send as the other party (refused)';
  end;
end $$;

-- POSITIVE CONTROL: the real participants CAN read and send, or every
-- refusal above would also pass with signalling simply broken.
do $$
declare r record; v_rows int;
begin
  perform pg_temp.become_service(); select * into r from cl;
  perform pg_temp.become(r.helper, 'provider');

  insert into call_signals (call_id, sender_id, kind, payload)
  values (r.call_id, r.helper, 'answer', '{"sdp":"REAL"}'::jsonb);

  select count(*) into v_rows from call_signals where call_id = r.call_id;
  if v_rows < 2 then
    raise exception 'FAIL L06 a real participant cannot use signalling (% rows)', v_rows;
  end if;
  raise notice 'PASS L06 the two participants can read and send (control)';
end $$;

-- ---------------------------------------------------------------------------
-- L07 — an ended call stays ended
-- ---------------------------------------------------------------------------
do $$
declare r record; v_status text; v_duration int;
begin
  perform pg_temp.become_service(); select * into r from cl;

  perform pg_temp.become(r.customer, 'customer');
  perform update_call_status(r.call_id, 'connected', null);
  perform update_call_status(r.call_id, 'ended', 'hung_up');

  -- A late "connected" from a reconnecting client must not reopen a call
  -- both people hung up.
  perform update_call_status(r.call_id, 'connected', null);

  perform pg_temp.become_service();
  select status::text, duration_sec into v_status, v_duration
    from call_sessions where id = r.call_id;
  if v_status <> 'ended' then
    raise exception 'FAIL L07 an ended call reopened (now %)', v_status;
  end if;
  if v_duration is null then
    raise exception 'FAIL L07 an ended call recorded no duration';
  end if;
  raise notice 'PASS L07 an ended call stays ended, with its duration recorded';
end $$;

-- ---------------------------------------------------------------------------
-- L08 — no call outside an active booking
-- ---------------------------------------------------------------------------
do $$
declare r record;
begin
  perform pg_temp.become_service(); select * into r from cl;
  update bookings set status = 'completed', completed_at = now() where id = r.booking;

  perform pg_temp.become(r.customer, 'customer');
  begin
    perform start_call(r.booking);
    raise exception 'FAIL L08 started a call on a finished booking';
  exception when others then
    if sqlerrm like 'FAIL %' then raise; end if;
    if position('not active' in sqlerrm) = 0 then
      raise exception 'FAIL L08 refused for the wrong reason: %', sqlerrm;
    end if;
    raise notice 'PASS L08 a finished booking is not a standing phone line';
  end;
end $$;

rollback;
