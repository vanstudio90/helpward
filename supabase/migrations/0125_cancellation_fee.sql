-- CLASS: pre-deploy
-- =========================================================================
-- 0125 — what a cancellation cost, recorded with what the customer agreed to
-- =========================================================================
/*
  A FEE NOBODY CAN POINT AT IS A CHARGEBACK WAITING TO HAPPEN.

  Cancelling a booking a helper has taken now costs 10%. The money
  side is a partial capture — Stripe takes the fee and releases the
  rest of the hold in the same call — but the money moving is only
  half of it. If a customer later asks "why was I charged CA$22.45
  for a job that never happened", the answer has to be a record, not
  a recollection: the amount, the rate it came from, and the fact that
  they were shown it and agreed before anything was taken.

  WHY THE ACCEPTED AMOUNT IS STORED SEPARATELY from the charged one:
  they are two different claims. One is what we told the customer; the
  other is what we took. Storing only the second makes the first
  unprovable, and storing one number for both hides the case where
  they differ — which is the case that matters.
*/

alter table public.bookings
  add column if not exists cancellation_fee_cents integer,
  add column if not exists cancellation_fee_rate numeric(5,4),
  add column if not exists cancellation_fee_accepted_cents integer,
  add column if not exists cancellation_fee_accepted_at timestamptz,
  add column if not exists cancelled_by uuid references public.profiles(id) on delete set null;

comment on column public.bookings.cancellation_fee_cents is
  'What was actually captured as a cancellation fee. Null means none was charged.';
comment on column public.bookings.cancellation_fee_accepted_cents is
  'The figure the customer was shown and agreed to before cancelling. Kept apart from what was charged so the two can be compared rather than assumed equal.';

/* ------------------------------------------------------------------ *
 * RECORDING ONE                                                       *
 * ------------------------------------------------------------------ */
/*
  Called after the capture succeeds. It does not move money and it
  does not decide the fee — it writes down what happened, including
  the agreement, so the booking can answer for itself later.
*/
create or replace function public.record_cancellation_fee(
  p_booking   uuid,
  p_fee_cents integer,
  p_rate      numeric,
  p_accepted_cents integer,
  p_actor     uuid default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_b public.bookings;
begin
  select * into v_b from public.bookings where id = p_booking for update;
  if not found then
    raise exception 'No such booking.' using errcode = 'HW150';
  end if;

  update public.bookings set
    cancellation_fee_cents = p_fee_cents,
    cancellation_fee_rate = p_rate,
    cancellation_fee_accepted_cents = p_accepted_cents,
    cancellation_fee_accepted_at = clock_timestamp(),
    cancelled_by = coalesce(p_actor, cancelled_by)
  where id = p_booking;

  insert into public.audit_log
    (actor_id, action, target_table, target_id, payload, outcome, changes)
  values (
    p_actor, 'booking.cancellation_fee_charged', 'bookings', p_booking::text,
    jsonb_build_object(
      'fee_cents', p_fee_cents,
      'rate', p_rate,
      'accepted_cents', p_accepted_cents,
      'booking_total_cents', v_b.total_cents,
      /* The two figures side by side, so a disagreement is visible
         rather than needing to be worked out from two columns. */
      'matched_what_was_shown', p_fee_cents = p_accepted_cents),
    'succeeded',
    jsonb_build_array(jsonb_build_object(
      'field', 'Cancellation fee', 'before', 'none',
      'after', (p_fee_cents::numeric / 100)::text))
  );
end $$;

revoke all on function public.record_cancellation_fee(uuid, integer, numeric, integer, uuid) from public;
grant execute on function public.record_cancellation_fee(uuid, integer, numeric, integer, uuid) to service_role;

/* ------------------------------------------------------------------ *
 * SELF-TEST                                                           *
 * ------------------------------------------------------------------ */
do $selftest$
declare
  v_c uuid; v_h uuid; v_s text; v_bk uuid; v_events int;
begin
  begin
    select p.id into v_c from public.profiles p limit 1;
    select pp.user_id into v_h from public.provider_profiles pp limit 1;
    select sv.id into v_s from public.services sv limit 1;
    if v_c is null or v_h is null or v_s is null then
      raise exception 'this test needs a profile, a provider and a service.';
    end if;

    insert into public.bookings (customer_id, provider_id, service_id, status,
      base_price_cents, total_cents, platform_fee_cents, payout_cents, currency, payment_status)
    values (v_c, v_h, v_s, 'cancelled', 22000, 22450, 4850, 17600, 'CAD', 'captured')
    returning id into v_bk;

    perform public.record_cancellation_fee(v_bk, 2245, 0.10, 2245, null);

    if (select cancellation_fee_cents from public.bookings where id = v_bk) <> 2245 then
      raise exception 'the fee was not recorded';
    end if;
    if (select cancellation_fee_accepted_at from public.bookings where id = v_bk) is null then
      raise exception 'the agreement was not timestamped';
    end if;

    /* The disagreement case is visible, not hidden. */
    perform public.record_cancellation_fee(v_bk, 2245, 0.10, 2000, null);
    if (select payload ->> 'matched_what_was_shown' from public.audit_log
        where target_id = v_bk::text order by id desc limit 1) <> 'false' then
      raise exception 'a fee that differed from what was shown was recorded as matching';
    end if;

    raise exception using errcode = 'HW999', message = 'self-test complete';
  exception
    when sqlstate 'HW999' then
      raise notice 'cancellation fee: the charged amount, the rate and the amount the customer agreed to are all recorded, and a mismatch between the last two is visible in the trail';
    when others then
      raise;
  end;
end $selftest$;
