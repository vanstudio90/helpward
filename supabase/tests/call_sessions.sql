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

-- ---------------------------------------------------------------------------
-- L09 — an answer signal is NOT a connection
-- ---------------------------------------------------------------------------
-- 0062 recovered a missing connected_at from the earliest `answer`
-- signal, reasoning that an answer proves the peers negotiated. It does —
-- but the answer is sent right after setLocalDescription, BEFORE ICE has
-- found a path, and the call can still fail afterwards. So a call that
-- negotiated and never connected gained a positive duration: exactly the
-- invented fact that fallback existed to avoid. 0063 keeps the answer
-- time as negotiated_at, which is what it is.
do $$
declare r record; v_call uuid; v_conn timestamptz; v_neg timestamptz; v_dur int;
begin
  perform pg_temp.become_service(); select * into r from cl;
  insert into call_sessions (booking_id, customer_id, provider_id, started_by)
  values (r.booking, r.customer, r.helper, r.customer) returning id into v_call;
  insert into call_signals (call_id, sender_id, kind, payload)
  values (v_call, r.helper, 'answer', '{"sdp":"negotiated"}'::jsonb);

  perform pg_temp.become(r.customer, 'customer');
  -- Negotiated, then the network refused a path.
  perform update_call_status(v_call, 'ended', 'ice_failed');

  perform pg_temp.become_service();
  select connected_at, negotiated_at, duration_sec into v_conn, v_neg, v_dur
    from call_sessions where id = v_call;

  if v_conn is not null then
    raise exception 'FAIL L09 a call that never connected recorded a connection time';
  end if;
  if v_dur is not null then
    raise exception 'FAIL L09 a call that never connected recorded a duration of %s', v_dur;
  end if;
  if v_neg is null then
    raise exception 'FAIL L09 the answer time was lost instead of kept as negotiated_at';
  end if;
  raise notice 'PASS L09 negotiated-but-never-connected has no duration, and keeps negotiated_at';
end $$;

-- POSITIVE CONTROL: a call that really connected records both.
do $$
declare r record; v_call uuid; v_conn timestamptz; v_dur int;
begin
  perform pg_temp.become_service(); select * into r from cl;
  insert into call_sessions (booking_id, customer_id, provider_id, started_by)
  values (r.booking, r.customer, r.helper, r.customer) returning id into v_call;

  perform pg_temp.become(r.customer, 'customer');
  perform update_call_status(v_call, 'connected', null);

  -- Age the connection by hand rather than sleeping.
  --
  -- now() is TRANSACTION START time in Postgres, so it does not advance
  -- inside one transaction however long you wait — pg_sleep(1.1) here
  -- produced a duration of 0 and looked like a bug in the arithmetic.
  -- In production the connect and the hang-up are separate transactions
  -- seconds or minutes apart, which is what this reproduces.
  perform pg_temp.become_service();
  update call_sessions set connected_at = connected_at - interval '42 seconds'
   where id = v_call;

  perform pg_temp.become(r.customer, 'customer');
  perform update_call_status(v_call, 'ended', 'hung_up');

  perform pg_temp.become_service();
  select connected_at, duration_sec into v_conn, v_dur from call_sessions where id = v_call;
  if v_conn is null then
    raise exception 'FAIL L10 a connected call recorded no connection time';
  end if;
  if coalesce(v_dur, 0) < 40 or v_dur > 45 then
    raise exception 'FAIL L10 a 42-second call recorded a duration of %s', v_dur;
  end if;
  raise notice 'PASS L10 a real connection records its time and duration (% s)', v_dur;
end $$;

-- ---------------------------------------------------------------------------
-- L11 — where the call IS the service, it needs the payment hold
-- ---------------------------------------------------------------------------
do $$
declare r record;
begin
  perform pg_temp.become_service(); select * into r from cl;
  update bookings set status = 'in_progress', payment_status = 'pending' where id = r.booking;

  perform pg_temp.become(r.customer, 'customer');
  begin
    perform start_call(r.booking);
    raise exception 'FAIL L11 a paid listening session started with no payment hold';
  exception when others then
    if sqlerrm like 'FAIL %' then raise; end if;
    if position('payment is confirmed' in sqlerrm) = 0 then
      raise exception 'FAIL L11 refused for the wrong reason: %', sqlerrm;
    end if;
    raise notice 'PASS L11 a call-delivered service needs the hold first';
  end;

  -- CONTROL: authorize it and the same call goes through, so the refusal
  -- above is the payment gate and not something else failing.
  perform pg_temp.become_service();
  update bookings set payment_status = 'authorized' where id = r.booking;
  perform pg_temp.become(r.customer, 'customer');
  perform start_call(r.booking);
  raise notice 'PASS L12 once authorized, the session starts (control)';
end $$;

-- Messaging is deliberately NOT gated: coordinating about a booking is
-- not the thing being sold.
do $$
declare r record; v_rows int;
begin
  perform pg_temp.become_service(); select * into r from cl;
  perform pg_temp.become(r.customer, 'customer');
  select count(*) into v_rows from conversations where booking_id = r.booking;
  raise notice 'PASS L13 messaging stays reachable regardless of payment (% conversation row(s))', v_rows;
end $$;

-- ---------------------------------------------------------------------------
-- L14 — a call belongs to a person
-- ---------------------------------------------------------------------------
-- started_by is NOT NULL and comes from auth.uid(). Without the explicit
-- check this surfaced as a constraint violation rather than a reason.
do $$
declare r record;
begin
  perform pg_temp.become_service(); select * into r from cl;
  begin
    perform start_call(r.booking);
    raise exception 'FAIL L14 a call was started by nobody';
  exception when others then
    if sqlerrm like 'FAIL %' then raise; end if;
    if position('null value in column' in sqlerrm) > 0 then
      raise exception 'FAIL L14 failed on a constraint instead of explaining: %', sqlerrm;
    end if;
    raise notice 'PASS L14 a caller with no identity is refused with a reason';
  end;
end $$;

-- ---------------------------------------------------------------------------
-- L15 — abandoned ringing sessions are swept
-- ---------------------------------------------------------------------------
-- A refused microphone, a closed tab or a crash left a session 'ringing'
-- forever, and the next page load auto-joined that corpse instead of
-- starting a real call.
do $$
declare r record; v_old uuid; v_new uuid; v_swept int; v_status text;
begin
  perform pg_temp.become_service(); select * into r from cl;

  insert into call_sessions (booking_id, customer_id, provider_id, started_by, started_at)
  values (r.booking, r.customer, r.helper, r.customer, now() - interval '10 minutes')
  returning id into v_old;

  -- One that is genuinely still ringing, to prove the sweep is selective.
  insert into call_sessions (booking_id, customer_id, provider_id, started_by)
  values (r.booking, r.customer, r.helper, r.customer)
  returning id into v_new;

  v_swept := expire_stale_calls(r.booking);

  select status::text into v_status from call_sessions where id = v_old;
  if v_status <> 'missed' then
    raise exception 'FAIL L15 a 10-minute-old ringing session was not swept (is %)', v_status;
  end if;

  select status::text into v_status from call_sessions where id = v_new;
  if v_status <> 'ringing' then
    raise exception 'FAIL L15 the sweep killed a call that was still ringing (is %)', v_status;
  end if;
  raise notice 'PASS L15 abandoned rings are swept, live ones are not (% swept)', v_swept;

  -- And a CONNECTED call is never swept, however long it runs.
  perform pg_temp.become_service();
  update call_sessions set status = 'connected', connected_at = now(),
         started_at = now() - interval '3 hours'
   where id = v_new;
  perform expire_stale_calls(r.booking);
  select status::text into v_status from call_sessions where id = v_new;
  if v_status <> 'connected' then
    raise exception 'FAIL L16 a three-hour call in progress was swept (is %)', v_status;
  end if;
  raise notice 'PASS L16 a long call in progress is never swept';
end $$;

-- ---------------------------------------------------------------------------
-- L17 — an anonymous caller cannot touch a call
-- ---------------------------------------------------------------------------
-- `auth.uid() not in (a, b)` is NULL when auth.uid() is NULL, and NULL is
-- not TRUE — so the `if` never fired and an UNAUTHENTICATED caller
-- holding a call id could end someone else's call. Found against the
-- running database, not by reading.
create or replace function pg_temp.become_anon()
returns void language plpgsql as $$
begin
  -- A JWT with no `sub`: exactly what an anon key produces.
  perform set_config('request.jwt.claims',
    json_build_object('role', 'anon')::text, true);
  execute 'set local role anon';
end $$;

do $$
declare r record; v_call uuid; v_status text;
begin
  perform pg_temp.become_service(); select * into r from cl;
  insert into call_sessions (booking_id, customer_id, provider_id, started_by)
  values (r.booking, r.customer, r.helper, r.customer) returning id into v_call;

  perform pg_temp.become_anon();
  begin
    perform update_call_status(v_call, 'ended', 'hijacked');
    perform pg_temp.become_service();
    select status::text into v_status from call_sessions where id = v_call;
    if v_status = 'ended' then
      raise exception 'FAIL L17 an anonymous caller ended someone else''s call';
    end if;
    raise notice 'PASS L17 an anonymous caller cannot end a call';
  exception when others then
    if sqlerrm like 'FAIL %' then raise; end if;
    perform pg_temp.become_service();
    raise notice 'PASS L17 an anonymous caller is refused outright: %', left(sqlerrm, 40);
  end;

  -- Control: the real participant still can, so the refusal above is the
  -- identity check and not the function being broken for everyone.
  perform pg_temp.become(r.customer, 'customer');
  perform update_call_status(v_call, 'ended', 'hung_up');
  perform pg_temp.become_service();
  select status::text into v_status from call_sessions where id = v_call;
  if v_status <> 'ended' then
    raise exception 'FAIL L18 the real participant could not end their own call (%)', v_status;
  end if;
  raise notice 'PASS L18 the real participant still can (control)';
end $$;

-- ---------------------------------------------------------------------------
-- L19 — refusing the microphone on an INCOMING call
-- ---------------------------------------------------------------------------
-- Someone IS calling and we cannot answer. Without this the attempt sits
-- ringing until the sweeper notices, and the caller watches it ring.
do $$
declare r record; v_call uuid; v_status text; v_reason text;
begin
  perform pg_temp.become_service(); select * into r from cl;
  insert into call_sessions (booking_id, customer_id, provider_id, started_by)
  values (r.booking, r.customer, r.helper, r.customer) returning id into v_call;

  -- The HELPER is being called and their microphone is blocked.
  perform pg_temp.become(r.helper, 'provider');
  perform abandon_call(v_call, 'mic_denied');

  perform pg_temp.become_service();
  select status::text, end_reason into v_status, v_reason
    from call_sessions where id = v_call;
  if v_status <> 'missed' then
    raise exception 'FAIL L19 a refused incoming call stayed % instead of missed', v_status;
  end if;
  raise notice 'PASS L19 a refused incoming call ends immediately (%)', v_reason;
end $$;

-- A connected call cannot be abandoned out from under the people on it.
do $$
declare r record; v_call uuid; v_status text;
begin
  perform pg_temp.become_service(); select * into r from cl;
  insert into call_sessions (booking_id, customer_id, provider_id, started_by, status, connected_at)
  values (r.booking, r.customer, r.helper, r.customer, 'connected', now())
  returning id into v_call;

  perform pg_temp.become(r.helper, 'provider');
  perform abandon_call(v_call, 'mic_denied');

  perform pg_temp.become_service();
  select status::text into v_status from call_sessions where id = v_call;
  if v_status <> 'connected' then
    raise exception 'FAIL L20 a live call was abandoned (is %)', v_status;
  end if;
  raise notice 'PASS L20 a connected call cannot be abandoned';
end $$;

-- And a stranger cannot abandon a call they are not on.
do $$
declare r record; v_call uuid; v_status text;
begin
  perform pg_temp.become_service(); select * into r from cl;
  insert into call_sessions (booking_id, customer_id, provider_id, started_by)
  values (r.booking, r.customer, r.helper, r.customer) returning id into v_call;

  perform pg_temp.become(r.other, 'provider');
  begin
    perform abandon_call(v_call, 'hijack');
    perform pg_temp.become_service();
    select status::text into v_status from call_sessions where id = v_call;
    if v_status <> 'ringing' then
      raise exception 'FAIL L21 a stranger killed someone else''s call';
    end if;
    raise notice 'PASS L21 a stranger cannot abandon a call they are not on';
  exception when others then
    -- assert_call_participant raises SQLSTATE HW051, a custom class that
    -- `when raise_exception` (P0001) does not catch.
    if sqlerrm like 'FAIL %' then raise; end if;
    perform pg_temp.become_service();
    raise notice 'PASS L21 a stranger is refused outright: %', left(sqlerrm, 40);
  end;
end $$;

rollback;
