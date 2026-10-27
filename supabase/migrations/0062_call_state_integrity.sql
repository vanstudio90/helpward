-- CLASS: pre-deploy
-- =========================================================================
-- 0062 — call sessions tell the truth about what happened
--
-- Three things, found by testing a call that genuinely connected.
--
-- 1. A connected call recorded nothing. Both screens showed "On a call"
--    with a 43-second timer and audio flowing, and the session row ended
--    with connected_at and duration_sec null. The client fired the status
--    update and discarded the result, so a failure was invisible. The
--    client now checks it (lib/call/use-call.ts) — and this adds a
--    server-side fallback so the record is right even when that write is
--    lost.
--
-- 2. NULL auth.uid() walked straight through the participant guard.
--    `auth.uid() not in (a, b)` is NULL when auth.uid() is NULL, and
--    NULL is not TRUE, so the `if` never fired: an UNAUTHENTICATED caller
--    holding a call id could end someone else's call. Verified against
--    the running database, not inferred.
--
-- 3. Abandoned 'ringing' sessions accumulated. A denied microphone left
--    the session live forever, and the next page load auto-joined the
--    corpse instead of starting a fresh call.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 2. The participant guard, written so NULL cannot pass it
-- -------------------------------------------------------------------------
create or replace function public.assert_call_participant(
  p_customer uuid, p_provider uuid
) returns void
language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  -- The service role and cron have no JWT at all; that is the only case
  -- where a missing uid is legitimate.
  if coalesce(current_setting('request.jwt.claims', true), '') = '' then
    return;
  end if;
  if coalesce(jwt_role(), '') in ('admin', 'service_role') then
    return;
  end if;
  -- Explicit null check FIRST. `null not in (a, b)` is NULL, and an `if`
  -- on NULL does nothing — which is how an anonymous caller got through.
  if v_uid is null then
    raise exception 'You are not on this call' using errcode = 'HW051';
  end if;
  if v_uid <> p_customer and v_uid <> p_provider then
    raise exception 'You are not on this call' using errcode = 'HW051';
  end if;
end;
$$;

revoke execute on function public.assert_call_participant(uuid, uuid) from public;
grant execute on function public.assert_call_participant(uuid, uuid) to authenticated, service_role;

-- -------------------------------------------------------------------------
-- 1 + 2. update_call_status
-- -------------------------------------------------------------------------
create or replace function public.update_call_status(
  p_call_id uuid,
  p_status  call_status,
  p_reason  text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_call record;
  v_negotiated timestamptz;
  v_connected timestamptz;
begin
  select * into v_call from call_sessions where id = p_call_id for update;
  if not found then raise exception 'Call not found'; end if;

  perform assert_call_participant(v_call.customer_id, v_call.provider_id);

  -- An ended call stays ended: a late "connected" from a reconnecting
  -- client must not reopen one both people hung up.
  if v_call.status in ('ended', 'missed', 'declined') then
    return;
  end if;

  v_connected := v_call.connected_at;

  if p_status = 'connected' then
    v_connected := coalesce(v_connected, now());
  end if;

  -- The fallback. If we are ending a call that never recorded a
  -- connection, look for server-side EVIDENCE that one happened: an
  -- `answer` signal means the two peers completed negotiation, which
  -- does not occur unless media was agreed.
  --
  -- Deliberately not invented from nothing — no answer signal, no
  -- connection time. A call that never negotiated stays null, which is
  -- the truth about it.
  if p_status in ('ended', 'missed', 'declined') and v_connected is null then
    select min(created_at) into v_negotiated
      from call_signals where call_id = p_call_id and kind = 'answer';
    v_connected := v_negotiated;
  end if;

  update call_sessions
     set status = p_status,
         connected_at = v_connected,
         ended_at = case
           when p_status in ('ended', 'missed', 'declined') then now()
           else ended_at end,
         duration_sec = case
           when p_status in ('ended', 'missed', 'declined') and v_connected is not null
           then greatest(0, extract(epoch from (now() - v_connected))::int)
           else duration_sec end,
         end_reason = coalesce(p_reason, end_reason)
   where id = p_call_id;
end;
$$;

revoke execute on function public.update_call_status(uuid, call_status, text) from public, anon;
grant execute on function public.update_call_status(uuid, call_status, text) to authenticated, service_role;

-- start_call gets the same guard.
create or replace function public.start_call(p_booking_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_booking record;
  v_existing uuid;
  v_call_id uuid;
begin
  select * into v_booking from bookings where id = p_booking_id;
  if not found then raise exception 'Booking not found'; end if;

  perform assert_call_participant(v_booking.customer_id, v_booking.provider_id);

  if v_booking.status not in ('scheduled', 'in_progress') then
    raise exception 'This booking is not active' using errcode = 'HW050';
  end if;

  -- Sweep this booking's abandoned attempts before looking for a live
  -- one, so a corpse from a denied microphone is not handed back as the
  -- call to join.
  perform expire_stale_calls(p_booking_id);

  select id into v_existing from call_sessions
   where booking_id = p_booking_id and status in ('ringing', 'connected')
   order by started_at desc limit 1;
  if found then return v_existing; end if;

  insert into call_sessions (booking_id, customer_id, provider_id, started_by)
  values (p_booking_id, v_booking.customer_id, v_booking.provider_id, auth.uid())
  returning id into v_call_id;

  insert into notifications (user_id, type, payload)
  values (
    case when auth.uid() = v_booking.customer_id
         then v_booking.provider_id else v_booking.customer_id end,
    'incoming_call',
    jsonb_build_object('booking_id', p_booking_id, 'call_id', v_call_id)
  );

  return v_call_id;
end;
$$;

revoke execute on function public.start_call(uuid) from public, anon;
grant execute on function public.start_call(uuid) to authenticated, service_role;

-- -------------------------------------------------------------------------
-- 3. Abandoned ringing sessions
-- -------------------------------------------------------------------------
-- A denied microphone, a closed tab or a crash leaves a session 'ringing'
-- with nobody on it. Two minutes is longer than any real ring and short
-- enough that the next attempt starts clean.
create or replace function public.expire_stale_calls(p_booking_id uuid default null)
returns int
language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  update call_sessions
     set status = 'missed', ended_at = now(), end_reason = 'abandoned'
   where status = 'ringing'
     and connected_at is null
     and started_at < now() - interval '2 minutes'
     and (p_booking_id is null or booking_id = p_booking_id);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.expire_stale_calls(uuid) from public, anon;
grant execute on function public.expire_stale_calls(uuid) to authenticated, service_role;

-- Ending your own abandoned attempt immediately, before the two minutes
-- are up — what the client calls when the microphone is refused.
create or replace function public.abandon_call(p_call_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public as $$
declare v_call record;
begin
  select * into v_call from call_sessions where id = p_call_id for update;
  if not found then return; end if;
  perform assert_call_participant(v_call.customer_id, v_call.provider_id);
  if v_call.status <> 'ringing' or v_call.connected_at is not null then
    return;
  end if;
  update call_sessions
     set status = 'missed', ended_at = now(), end_reason = coalesce(p_reason, 'abandoned')
   where id = p_call_id;
end;
$$;

revoke execute on function public.abandon_call(uuid, text) from public, anon;
grant execute on function public.abandon_call(uuid, text) to authenticated, service_role;
