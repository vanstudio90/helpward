-- CLASS: pre-deploy
-- =========================================================================
-- 0059 — remote services need a call
--
-- Listening service, sleep-call companion and the remote half of elder
-- assistance are delivered ENTIRELY by talking. The intake offers an
-- in-app call; the active task had a generic "Start task" button and no
-- way to make one. The service could not be delivered as described.
--
-- WebRTC is peer-to-peer once connected; what it needs from a server is
-- somewhere to exchange offers, answers and ICE candidates. This is that
-- somewhere, reusing Supabase realtime, which the app already uses for
-- chat and dispatch.
--
-- call_signals is deliberately a TABLE rather than a broadcast channel:
-- a candidate that arrives while the other side is still loading has to
-- wait for them, and a dropped connection has to be able to re-read what
-- it missed. Rows are short-lived and swept by their own cron.
-- =========================================================================

do $$ begin
  create type call_status as enum ('ringing', 'connected', 'ended', 'missed', 'declined');
exception when duplicate_object then null; end $$;

create table if not exists call_sessions (
  id           uuid primary key default gen_random_uuid(),
  booking_id   uuid not null references bookings(id) on delete cascade,
  -- Both parties are recorded so a signal can be addressed, and so an
  -- ended call still says who was on it.
  customer_id  uuid not null references profiles(id) on delete restrict,
  provider_id  uuid not null references provider_profiles(user_id) on delete restrict,
  started_by   uuid not null references profiles(id) on delete restrict,
  status       call_status not null default 'ringing',
  started_at   timestamptz not null default now(),
  connected_at timestamptz,
  ended_at     timestamptz,
  /** Seconds actually connected. Written when the call ends. */
  duration_sec int,
  end_reason   text
);

create index if not exists call_sessions_booking_idx on call_sessions (booking_id, started_at desc);
create index if not exists call_sessions_live_idx
  on call_sessions (booking_id) where status in ('ringing', 'connected');

create table if not exists call_signals (
  id         bigserial primary key,
  call_id    uuid not null references call_sessions(id) on delete cascade,
  sender_id  uuid not null references profiles(id) on delete cascade,
  kind       text not null check (kind in ('offer', 'answer', 'ice', 'bye')),
  payload    jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists call_signals_call_idx on call_signals (call_id, id);

alter table call_sessions enable row level security;
alter table call_signals  enable row level security;

-- Only the two people on the call. Not the admin either: a support
-- account that can read call signalling is a support account that can
-- join a private call.
drop policy if exists cs_participants on call_sessions;
create policy cs_participants on call_sessions
  for select using (customer_id = auth.uid() or provider_id = auth.uid());

drop policy if exists sig_participants on call_signals;
create policy sig_participants on call_signals
  for select using (
    exists (
      select 1 from call_sessions s
       where s.id = call_signals.call_id
         and (s.customer_id = auth.uid() or s.provider_id = auth.uid())
    )
  );

drop policy if exists sig_send on call_signals;
create policy sig_send on call_signals
  for insert with check (
    sender_id = auth.uid()
    and exists (
      select 1 from call_sessions s
       where s.id = call_signals.call_id
         and (s.customer_id = auth.uid() or s.provider_id = auth.uid())
         and s.status in ('ringing', 'connected')
    )
  );

revoke update, delete on call_signals from authenticated, anon;
revoke insert, update, delete on call_sessions from authenticated, anon;

-- Guarded: `alter publication ... add table` has no IF NOT EXISTS and
-- errors on a re-run. See 0060, which exists because this mistake had
-- already been made three times before this file made it a fourth.
do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'add_to_realtime') then
    perform add_to_realtime('call_signals');
    perform add_to_realtime('call_sessions');
  else
    -- 0060 has not been applied yet (first run, in file order).
    if not exists (select 1 from pg_publication_tables
                    where pubname = 'supabase_realtime' and tablename = 'call_signals') then
      alter publication supabase_realtime add table call_signals;
    end if;
    if not exists (select 1 from pg_publication_tables
                    where pubname = 'supabase_realtime' and tablename = 'call_sessions') then
      alter publication supabase_realtime add table call_sessions;
    end if;
  end if;
end $$;

-- -------------------------------------------------------------------------
-- Starting a call
-- -------------------------------------------------------------------------
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

  if auth.uid() not in (v_booking.customer_id, v_booking.provider_id)
     and coalesce(jwt_role(), '') not in ('admin', 'service_role') then
    raise exception 'You are not on this booking';
  end if;

  -- A call belongs to work that is happening. Outside that window there
  -- is no service being delivered, and a standing line between two
  -- strangers is not one either.
  if v_booking.status not in ('scheduled', 'in_progress') then
    raise exception 'This booking is not active' using errcode = 'HW050';
  end if;

  -- Re-joining an existing call rather than starting a second one: both
  -- sides pressing Call at once must land in the same place.
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

revoke execute on function public.start_call(uuid) from public;
grant execute on function public.start_call(uuid) to authenticated, service_role;

create or replace function public.update_call_status(
  p_call_id uuid,
  p_status  call_status,
  p_reason  text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare v_call record;
begin
  select * into v_call from call_sessions where id = p_call_id for update;
  if not found then raise exception 'Call not found'; end if;

  if auth.uid() not in (v_call.customer_id, v_call.provider_id)
     and coalesce(jwt_role(), '') not in ('admin', 'service_role') then
    raise exception 'You are not on this call';
  end if;

  -- An ended call stays ended. Without this, a late "connected" from a
  -- reconnecting client would reopen a call both people had hung up.
  if v_call.status in ('ended', 'missed', 'declined') then
    return;
  end if;

  update call_sessions
     set status = p_status,
         connected_at = case
           when p_status = 'connected' then coalesce(connected_at, now())
           else connected_at end,
         ended_at = case
           when p_status in ('ended', 'missed', 'declined') then now()
           else ended_at end,
         duration_sec = case
           when p_status in ('ended', 'missed', 'declined') and connected_at is not null
           then greatest(0, extract(epoch from (now() - connected_at))::int)
           else duration_sec end,
         end_reason = coalesce(p_reason, end_reason)
   where id = p_call_id;
end;
$$;

revoke execute on function public.update_call_status(uuid, call_status, text) from public;
grant execute on function public.update_call_status(uuid, call_status, text) to authenticated, service_role;

-- Signalling is chatter, not a record. Keeping it would accumulate
-- millions of rows describing network paths that no longer exist.
create or replace function public.sweep_call_signals()
returns int
language plpgsql security definer set search_path = public as $$
declare v_deleted int;
begin
  delete from call_signals
   where created_at < now() - interval '2 hours'
      or call_id in (select id from call_sessions
                      where status in ('ended', 'missed', 'declined')
                        and ended_at < now() - interval '10 minutes');
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke execute on function public.sweep_call_signals() from public, anon, authenticated;
grant execute on function public.sweep_call_signals() to service_role;

-- -------------------------------------------------------------------------
-- Which services ARE a call
-- -------------------------------------------------------------------------
-- A flag rather than a hardcoded list in the UI: the next remote service
-- is a row, and the set stays visible in one place.
alter table service_completion_requirements
  add column if not exists delivered_by_call boolean not null default false;

insert into service_completion_requirements (service_id, delivered_by_call)
values ('listening-service', true),
       ('sleep-call-companion', true)
on conflict (service_id) do update set delivered_by_call = excluded.delivered_by_call;
