-- CLASS: deploy-coupled
-- =========================================================================
-- 0063 — three corrections to how calls are recorded, gated and described
--
-- 1. AN ANSWER SIGNAL IS NOT A CONNECTION.
--
--    0062 recovered a missing connected_at from the earliest `answer`
--    signal, calling that "evidence the peers negotiated". It is — but
--    negotiation is not connection. The answer is sent immediately after
--    setLocalDescription, BEFORE ICE has found a path, and the peers can
--    still fail afterwards. So a call that negotiated and never connected
--    gained a positive duration: exactly the invented fact that fallback
--    was written to avoid.
--
--    The answer time is worth keeping — it separates "never got going" from
--    "negotiated then failed", which is the difference between a broken
--    signalling path and a blocked network. It is kept as negotiated_at,
--    which is what it actually is. connected_at comes only from a real
--    connection event, and stays NULL when nothing reported one, because
--    unknown is the truth about such a call.
--
-- 2. A PAID CALL IS THE SERVICE.
--
--    For listening-service and sleep-call-companion the call IS what the
--    customer bought, and start_call allowed one on a booking whose card
--    had never been authorized — the service delivered for free while
--    Start task sat disabled for exactly that reason. Owner decision:
--    gate it, matching assert_booking_paid. Messaging stays open, because
--    coordinating is not the service.
--
-- 3. The catalogue promises video. The implementation is audio only.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. negotiated_at, and an honest connected_at
-- -------------------------------------------------------------------------
alter table call_sessions
  add column if not exists negotiated_at timestamptz;

comment on column call_sessions.negotiated_at is
  'When the peers exchanged an answer. NOT a connection: the answer is sent before ICE completes and the call can still fail. Diagnostic only — it separates "never got going" from "negotiated then failed".';

comment on column call_sessions.connected_at is
  'When media actually flowed, reported by a real connection event. NULL means nobody reported one, which is the truth about that call — never inferred.';

-- Backfill: 0062 may have written answer times into connected_at. Move
-- them to the column they belong in and clear the duration they implied.
-- Only rows where the ONLY possible source was that inference.
update call_sessions s
   set negotiated_at = s.connected_at,
       connected_at  = null,
       duration_sec  = null
 where s.connected_at is not null
   and s.negotiated_at is null
   and exists (
     select 1 from call_signals g
      where g.call_id = s.id and g.kind = 'answer'
        and abs(extract(epoch from (g.created_at - s.connected_at))) < 1
   );

create or replace function public.update_call_status(
  p_call_id uuid,
  p_status  call_status,
  p_reason  text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_call record;
  v_connected timestamptz;
  v_negotiated timestamptz;
begin
  select * into v_call from call_sessions where id = p_call_id for update;
  if not found then raise exception 'Call not found'; end if;

  perform assert_call_participant(v_call.customer_id, v_call.provider_id);

  -- An ended call stays ended.
  if v_call.status in ('ended', 'missed', 'declined') then
    return;
  end if;

  v_connected := v_call.connected_at;

  -- Only a real connection event sets this. There is no inference path
  -- any more: a call nobody reported as connected has no connection time
  -- and no duration, and that is the correct record of it.
  if p_status = 'connected' then
    v_connected := coalesce(v_connected, now());
  end if;

  -- The answer time is recorded for diagnosis, in its own column, and
  -- never stands in for a connection.
  v_negotiated := v_call.negotiated_at;
  if v_negotiated is null then
    select min(created_at) into v_negotiated
      from call_signals where call_id = p_call_id and kind = 'answer';
  end if;

  update call_sessions
     set status = p_status,
         connected_at = v_connected,
         negotiated_at = v_negotiated,
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

-- -------------------------------------------------------------------------
-- 2. A paid call needs the hold in place
-- -------------------------------------------------------------------------
create or replace function public.start_call(p_booking_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_booking record;
  v_by_call boolean;
  v_existing uuid;
  v_call_id uuid;
begin
  select * into v_booking from bookings where id = p_booking_id;
  if not found then raise exception 'Booking not found'; end if;

  perform assert_call_participant(v_booking.customer_id, v_booking.provider_id);

  if v_booking.status not in ('scheduled', 'in_progress') then
    raise exception 'This booking is not active' using errcode = 'HW050';
  end if;

  -- Where the call IS the service, it is subject to the same rule as any
  -- other work: not before the customer's card is held. Messaging is
  -- deliberately NOT gated — coordinating about a booking is not the
  -- thing being sold.
  select delivered_by_call into v_by_call
    from service_completion_requirements where service_id = v_booking.service_id;

  if coalesce(v_by_call, false) then
    if v_booking.payment_status not in ('authorized', 'captured') then
      raise exception
        'This session can''t start until the payment is confirmed.'
        using errcode = 'HW052';
    end if;
  end if;

  -- started_by is NOT NULL and comes from auth.uid(). A caller without
  -- one — the service role, or a cron — would otherwise get a constraint
  -- violation instead of an explanation. A call belongs to a person.
  if auth.uid() is null then
    raise exception 'A call has to be started by one of the two people on the booking'
      using errcode = 'HW053';
  end if;

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
-- 3. The catalogue stops promising video
-- -------------------------------------------------------------------------
-- The in-app call is audio only. "In-person or video" also offered a
-- delivery mode that does not exist for a service which always opens a
-- call.
update services
   set blurb = 'Talk to a trained listener for 30 or 60 minutes — no therapy, no advice, just full attention. Over a voice call.'
 where id = 'listening-service';

update services
   set blurb = 'A companion stays on a quiet voice call while you fall asleep — for anxious sleepers and long-distance comfort.'
 where id = 'sleep-call-companion';

do $$
declare v_left int;
begin
  select count(*) into v_left from services
   where active and (blurb ilike '%video%' or coalesce(eta_label,'') ilike '%video%');
  if v_left > 0 then
    raise exception 'FAIL: % active service(s) still promise video', v_left;
  end if;
  raise notice 'no active service promises video';
end $$;
