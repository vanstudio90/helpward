-- CLASS: pre-deploy
-- =========================================================================
-- 0057 — a job can need more than one helper
--
-- Moving help asks "how many helpers do you need?" and 0053 now charges
-- for the answer. Nothing staffed it: bookings.provider_id is one column,
-- so a customer paying $145 for four helpers was dispatched one, and the
-- other three were charged for and never sent.
--
-- MODEL. The booking keeps its provider_id — the LEAD helper, who accepts
-- first and is accountable for the job. booking_crew holds every helper
-- including the lead, each with their own acceptance, arrival and share.
--
-- WHY THE LEAD STAYS ON THE BOOKING. Everything downstream — the chat,
-- the payment's destination, the review, dispatch — assumes one
-- counterparty. Replacing that with a join everywhere would touch the
-- payment path, which is the last thing that should change to add
-- staffing. The lead is the party of record; the crew is how the work and
-- the money are divided.
--
-- PAYOUT. A destination charge has ONE destination, so the lead's account
-- receives the whole payout and each additional crew member is paid by a
-- separate transfer (lib/payments.ts, payCrewMember). Their share is
-- recorded here when they accept, so what they are owed is fixed at
-- acceptance rather than recomputed later.
-- =========================================================================

do $$ begin
  create type crew_status as enum ('invited', 'accepted', 'declined', 'arrived', 'released');
exception when duplicate_object then null; end $$;

create table if not exists booking_crew (
  id              uuid primary key default gen_random_uuid(),
  booking_id      uuid not null references bookings(id) on delete cascade,
  provider_id     uuid not null references provider_profiles(user_id) on delete restrict,
  -- The lead is the helper on bookings.provider_id. Exactly one per
  -- booking, enforced below.
  is_lead         boolean not null default false,
  status          crew_status not null default 'invited',
  -- Fixed when they accept, so a later rate change cannot alter what an
  -- already-committed helper is owed.
  share_cents     int not null default 0,
  stripe_transfer_id text,
  paid_at         timestamptz,
  invited_at      timestamptz not null default now(),
  responded_at    timestamptz,
  arrived_at      timestamptz,
  unique (booking_id, provider_id)
);

create unique index if not exists booking_crew_one_lead
  on booking_crew (booking_id) where is_lead;

create index if not exists booking_crew_provider_idx
  on booking_crew (provider_id, status);

-- How many helpers a booking needs, so staffing can tell when it is full.
alter table bookings
  add column if not exists crew_size int not null default 1;

alter table booking_crew enable row level security;

-- "Is the caller on this crew?" — as a SECURITY DEFINER function, not as
-- a subquery inside the policy.
--
-- The policy below needs to answer that to let one crew member see the
-- rest, and a policy on booking_crew that SELECTs booking_crew re-enters
-- itself: Postgres reports "infinite recursion detected in policy for
-- relation booking_crew" and every read fails. A definer function is
-- evaluated outside RLS, so the question can be asked once.
create or replace function public.is_on_crew(p_booking_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from booking_crew c
     where c.booking_id = p_booking_id and c.provider_id = auth.uid()
  );
$$;

revoke execute on function public.is_on_crew(uuid) from public;
grant execute on function public.is_on_crew(uuid) to authenticated, service_role;

-- A crew member sees their own row and the rest of the crew on a job they
-- are on; the customer sees who is coming.
drop policy if exists bc_read on booking_crew;
create policy bc_read on booking_crew
  for select using (
    is_admin()
    or provider_id = auth.uid()
    or exists (
      select 1 from bookings b where b.id = booking_crew.booking_id
        and (b.customer_id = auth.uid() or b.provider_id = auth.uid())
    )
    or is_on_crew(booking_id)
  );

-- Writes go through the functions below. Money columns in particular are
-- claims about transfers, and only the server may make one.
revoke insert, update, delete on booking_crew from authenticated, anon;

-- -------------------------------------------------------------------------
-- Joining a crew
-- -------------------------------------------------------------------------
create or replace function public.accept_crew_invite(
  p_booking_id uuid,
  p_provider_id uuid
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_booking record;
  v_row record;
  v_accepted int;
  v_share int;
begin
  if auth.uid() is not null and auth.uid() <> p_provider_id
     and coalesce(jwt_role(), '') not in ('admin', 'service_role') then
    raise exception 'You can only accept your own invitations';
  end if;

  select * into v_booking from bookings where id = p_booking_id for update;
  if not found then raise exception 'Booking not found'; end if;
  if v_booking.status not in ('scheduled', 'in_progress') then
    raise exception 'This job is no longer open';
  end if;

  -- Same rule as a solo job: a helper who cannot be paid cannot take work.
  perform assert_helper_payable(p_provider_id);

  select * into v_row from booking_crew
   where booking_id = p_booking_id and provider_id = p_provider_id for update;
  if not found then raise exception 'You were not invited to this job'; end if;
  if v_row.status = 'accepted' then return; end if;
  if v_row.status <> 'invited' then
    raise exception 'That invitation is no longer open';
  end if;

  select count(*) into v_accepted from booking_crew
   where booking_id = p_booking_id and status in ('accepted', 'arrived');
  if v_accepted >= v_booking.crew_size then
    raise exception 'This job is already fully staffed' using errcode = 'HW040';
  end if;

  -- An even split of the payout across the crew the customer paid for.
  -- The lead takes the remainder so the sum is exact and no cent is lost.
  v_share := v_booking.payout_cents / greatest(v_booking.crew_size, 1);
  if v_row.is_lead then
    v_share := v_booking.payout_cents - (v_share * (greatest(v_booking.crew_size, 1) - 1));
  end if;

  update booking_crew
     set status = 'accepted', responded_at = now(), share_cents = v_share
   where id = v_row.id;

  insert into notifications (user_id, type, payload)
  values (v_booking.customer_id, 'crew_member_accepted',
          jsonb_build_object('booking_id', p_booking_id, 'provider_id', p_provider_id));
end;
$$;

revoke execute on function public.accept_crew_invite(uuid, uuid) from public;
grant execute on function public.accept_crew_invite(uuid, uuid) to authenticated, service_role;

create or replace function public.mark_crew_arrived(p_booking_id uuid, p_provider_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and auth.uid() <> p_provider_id
     and coalesce(jwt_role(), '') not in ('admin', 'service_role') then
    raise exception 'You can only mark yourself arrived';
  end if;

  update booking_crew
     set status = 'arrived', arrived_at = coalesce(arrived_at, now())
   where booking_id = p_booking_id and provider_id = p_provider_id and status = 'accepted';

  if not found then raise exception 'You are not on this job, or have not accepted yet'; end if;
end;
$$;

revoke execute on function public.mark_crew_arrived(uuid, uuid) from public;
grant execute on function public.mark_crew_arrived(uuid, uuid) to authenticated, service_role;

-- How many more helpers this job still needs.
create or replace function public.crew_shortfall(p_booking_id uuid)
returns int
language sql stable security definer set search_path = public as $$
  select greatest(0, b.crew_size - (
           select count(*) from booking_crew c
            where c.booking_id = b.id and c.status in ('accepted', 'arrived')))
    from bookings b where b.id = p_booking_id;
$$;

revoke execute on function public.crew_shortfall(uuid) from public;
grant execute on function public.crew_shortfall(uuid) to authenticated, service_role;
