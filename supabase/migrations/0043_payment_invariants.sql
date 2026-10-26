-- =========================================================================
-- 0043 — payment state as a database invariant
--
-- CLASS: deploy-coupled. start_booking and complete_booking begin refusing
-- bookings that have no authorization, so the release that authorizes at
-- acceptance must already be running.
--
-- Independent testing, 2026-10-26: with a helper explicitly marked
-- not-payable, accept_request, start_booking and complete_booking all
-- succeeded in sequence. The booking finished `completed` with
-- payment_status = 'pending' and no Stripe intent. The helper had done a
-- job nobody had been charged for.
--
-- The authorization call added in the previous release lives in a server
-- action. A server action is a code path, not a rule: PostgREST exposes
-- every one of these functions directly to any authenticated user, so a
-- helper who calls the RPC themselves skips it entirely. The invariant has
-- to live where the state changes.
--
-- Same finding for tips: `authenticated` still held EXECUTE on
-- set_booking_tip, so a customer could record a tip — raising their own
-- payout_cents — without any money being charged.
-- =========================================================================

-- -------------------------------------------------------------------------
-- A booking may not start or finish unless it has been paid for
-- -------------------------------------------------------------------------
create or replace function public.assert_booking_paid(p_booking record)
returns void
language plpgsql immutable set search_path = public as $$
begin
  if p_booking.payment_status in ('authorized', 'captured') then
    return;
  end if;

  -- Named states get named errors, because these reach a helper standing
  -- on a doorstep and "constraint violation" helps nobody.
  if p_booking.payment_status = 'failed' then
    raise exception 'This job cannot start: the payment was declined. Ask the customer to update their card.'
      using errcode = 'HW010';
  end if;
  raise exception 'This job cannot start: it has not been paid for yet.'
    using errcode = 'HW011';
end;
$$;

revoke execute on function public.assert_booking_paid(record) from public;
grant execute on function public.assert_booking_paid(record) to authenticated, service_role;

create or replace function public.start_booking(p_booking_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_booking record;
begin
  select * into v_booking from bookings where id = p_booking_id for update;
  if not found then
    raise exception 'Booking not found';
  end if;
  if auth.uid() <> v_booking.provider_id
    and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin'
  then
    raise exception 'Only the provider can start this booking';
  end if;
  if v_booking.status <> 'scheduled' then
    raise exception 'Booking is not in scheduled state';
  end if;

  -- The new rule. Checked after authorisation so a stranger cannot use the
  -- error message to probe whether a booking has been paid for.
  perform assert_booking_paid(v_booking);

  update bookings
    set status = 'in_progress', started_at = now()
    where id = p_booking_id;

  insert into notifications (user_id, type, payload)
  values (v_booking.customer_id, 'task_started', jsonb_build_object('booking_id', p_booking_id));
end;
$$;
revoke execute on function public.start_booking(uuid) from public;
grant execute on function public.start_booking(uuid) to authenticated, service_role;

create or replace function public.complete_booking(p_booking_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_booking record;
begin
  select * into v_booking from bookings where id = p_booking_id for update;
  if not found then
    raise exception 'Booking not found';
  end if;
  if auth.uid() <> v_booking.provider_id
    and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin'
  then
    raise exception 'Only the provider can complete this booking';
  end if;
  if v_booking.status <> 'in_progress' then
    raise exception 'Booking is not in progress';
  end if;

  perform assert_booking_paid(v_booking);

  update bookings
    set status = 'completed', completed_at = now()
    where id = p_booking_id;

  update provider_profiles
    set tasks_completed = tasks_completed + 1
    where user_id = v_booking.provider_id;

  insert into notifications (user_id, type, payload)
  values (v_booking.customer_id, 'task_completed', jsonb_build_object('booking_id', p_booking_id));
end;
$$;
revoke execute on function public.complete_booking(uuid) from public;
grant execute on function public.complete_booking(uuid) to authenticated, service_role;

-- -------------------------------------------------------------------------
-- A helper who cannot be paid may not accept work
-- -------------------------------------------------------------------------
-- The server action already refuses and rolls the acceptance back, but the
-- same reasoning applies: it is a code path, not a rule. Refusing here also
-- spares the customer an accept-then-cancel they would otherwise see.
create or replace function public.assert_helper_payable(p_provider_id uuid)
returns void
language plpgsql stable security definer set search_path = public as $$
declare v_payable boolean;
begin
  select coalesce(stripe_transfers_active, false) into v_payable
    from provider_profiles where user_id = p_provider_id;

  if not coalesce(v_payable, false) then
    raise exception 'Finish setting up payouts before accepting jobs.'
      using errcode = 'HW012';
  end if;
end;
$$;

revoke execute on function public.assert_helper_payable(uuid) from public;
grant execute on function public.assert_helper_payable(uuid) to authenticated, service_role;

-- -------------------------------------------------------------------------
-- T04 — recording a tip is a statement about money that was collected
-- -------------------------------------------------------------------------
-- set_booking_tip raises payout_cents, so it must only ever run after a
-- successful charge. The server is the only thing that can know a charge
-- succeeded, so the customer loses EXECUTE: the action verifies ownership,
-- charges Stripe, and only then records the tip through the service role.
-- Guarded: this file later DROPs the two-argument form, so a re-run finds
-- nothing to revoke and `revoke ... on function` errors on a missing
-- function. Same idempotency trap as the realtime migrations.
do $$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'set_booking_tip'
      and pg_get_function_identity_arguments(p.oid) = 'uuid, integer'
  ) then
    revoke execute on function public.set_booking_tip(uuid, int) from public;
    revoke execute on function public.set_booking_tip(uuid, int) from authenticated;
  end if;
end $$;

-- A tip that has been charged is final. Editing it was double-charging:
-- the action replaced the stored amount but raised a NEW intent for the
-- full new value, so $5 changed to $10 collected $15 and recorded $10.
-- Removing a tip wrote zero and refunded nothing.
alter table bookings
  add column if not exists tip_charged_at             timestamptz,
  add column if not exists tip_payment_intent_id      text;

create or replace function public.set_booking_tip(
  p_booking_id uuid,
  p_tip_cents int,
  p_payment_intent_id text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_booking record;
  v_tip int := greatest(0, coalesce(p_tip_cents, 0));
begin
  if coalesce(current_setting('request.jwt.claims', true), '') <> ''
     and jwt_role() <> 'service_role' then
    raise exception 'set_booking_tip: service role only' using errcode = 'HW013';
  end if;

  if v_tip > 50000 then
    raise exception 'Tip is capped at $500.';
  end if;

  select * into v_booking from bookings where id = p_booking_id for update;
  if not found then raise exception 'Booking not found'; end if;
  if v_booking.status <> 'completed' then
    raise exception 'You can only tip a completed booking.';
  end if;
  if v_booking.tip_charged_at is not null then
    raise exception 'A tip has already been collected for this booking.'
      using errcode = 'HW014';
  end if;

  update bookings set
    tip_cents    = v_tip,
    total_cents  = coalesce(base_price_cents, 0)
                 + coalesce(service_fee_cents, 0)
                 + coalesce(distance_cents, 0)
                 + v_tip,
    payout_cents = (coalesce(payout_cents, 0) - coalesce(tip_cents, 0)) + v_tip,
    tip_charged_at        = case when v_tip > 0 then now() else null end,
    tip_payment_intent_id = p_payment_intent_id
  where id = p_booking_id;
end;
$$;

-- Revoking from PUBLIC is not sufficient. Supabase's default privileges
-- grant EXECUTE on every function in `public` to anon and authenticated
-- directly, so those grants survive a PUBLIC revoke — the same shape as
-- the table-level GRANT that made 0040's column revokes a no-op. The
-- customer-role test in supabase/tests/payment_invariants.sql reached the
-- function body with only the PUBLIC revoke in place.
revoke execute on function public.set_booking_tip(uuid, int, text) from public;
revoke execute on function public.set_booking_tip(uuid, int, text) from authenticated;
revoke execute on function public.set_booking_tip(uuid, int, text) from anon;
grant  execute on function public.set_booking_tip(uuid, int, text) to service_role;

-- Same treatment for the other privileged writers added here. The in-body
-- role checks stay as defence in depth: the grant is the lock, the check
-- is the bolt, and the test above proves which one is holding.
revoke execute on function public.release_unpaid_booking(uuid, text, boolean) from anon, authenticated;

-- The two-argument form is gone. Dropping it rather than leaving it
-- unprivileged means a stale caller fails loudly instead of silently
-- doing nothing.
drop function if exists public.set_booking_tip(uuid, int);
