-- CLASS: pre-deploy
-- =========================================================================
-- 0126 — who cancelled, what it costs, and all of it in one place
-- =========================================================================
/*
  THE FEE WAS DECIDED OUTSIDE THE OPERATION THAT CANCELS, and that one
  mistake produced most of the following:

  * A HELPER ABANDONING A JOB CHARGED THE CUSTOMER. cancel_booking has
    always permitted the customer, the provider or an admin, and
    returned void — so the caller never learned which of them it was.
    The fee was worked out in TypeScript from the booking alone, and a
    helper cancelling triggered the customer's 10%, recorded with the
    helper as the actor.

  * THE ACCEPTED AMOUNT WAS CHECKED SOMEWHERE ELSE AGAIN. Status,
    actor, policy and consent were enforced in three different places,
    none of them holding the row lock that decides the outcome.

  So the decision moves here, inside the function that already locks
  the booking and already knows who is asking. One call settles all
  four questions at the same instant, and returns what the caller
  needs rather than making it guess.

  COMPLETION WINS, ALWAYS. complete_booking takes the same row lock and
  requires `in_progress`; cancel requires `scheduled` or `in_progress`.
  Whichever commits first makes the other impossible — so a job that
  has been finished cannot then be cancelled into a 90% refund, and a
  cancelled booking cannot subsequently be completed and charged. That
  was already true and is now relied upon rather than worked around.

  WHO PAYS, AND WHEN:

    customer, after a helper accepted      10% of the booking
    customer, within the grace window      nothing
    customer, booking predates the policy  nothing, for ever
    helper                                 nothing — they are not the
                                           customer, and abandoning a
                                           job is a reliability matter,
                                           not a billing one
    admin                                  nothing
*/

/* Five minutes from acceptance. Long enough to undo a misclick,
   short enough that a helper's time is still worth something. */
create or replace function public.cancellation_grace()
returns interval language sql immutable as $$ select interval '5 minutes' $$;

/*
  WHEN THE FEE WAS ACTUALLY DISCLOSED.

  /terms promised no fee would be introduced retrospectively for a
  booking made before it was clearly disclosed. The first version of
  this used midnight on the day of the change, which is not when
  anything was published — the pricing page, the terms and the cancel
  screen went live at 22:21:13 UTC on 12 November 2026. A booking made
  at 09:00 that morning was made under the old terms and is free to
  cancel for ever.
*/
create or replace function public.cancellation_fee_disclosed_from()
returns timestamptz language sql immutable as $$
  select timestamptz '2026-11-12 22:21:13+00'
$$;

/* ------------------------------------------------------------------ *
 * THE POLICY, ONCE                                                    *
 * ------------------------------------------------------------------ */
/*
  Takes the booking and who is asking; returns the fee and the reason
  for it. Used by the preview the customer is shown and by the
  cancellation itself, so the two cannot disagree — which is the only
  way "nothing is charged that the customer did not accept" can be
  true.
*/
create or replace function public.cancellation_fee_for(
  p_booking uuid,
  p_actor   text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
declare
  v_b public.bookings;
  v_total int;
  v_cents int;
begin
  select * into v_b from public.bookings where id = p_booking;
  if not found then
    return jsonb_build_object('cents', 0, 'rate', 0, 'reason', 'no_booking');
  end if;

  v_total := coalesce(v_b.total_cents, 0);

  /* Only the customer pays to cancel. A helper walking away is a
     reliability problem and is handled as one. */
  if p_actor is distinct from 'customer' then
    return jsonb_build_object('cents', 0, 'rate', 0, 'reason', 'not_the_customer',
      'total_cents', v_total);
  end if;
  if v_b.status not in ('scheduled', 'in_progress') then
    return jsonb_build_object('cents', 0, 'rate', 0, 'reason', 'not_cancellable',
      'total_cents', v_total, 'status', v_b.status);
  end if;
  if v_total <= 0 then
    return jsonb_build_object('cents', 0, 'rate', 0, 'reason', 'nothing_charged',
      'total_cents', v_total);
  end if;
  if v_b.created_at < public.cancellation_fee_disclosed_from() then
    return jsonb_build_object('cents', 0, 'rate', 0, 'reason', 'predates_policy',
      'total_cents', v_total);
  end if;
  if clock_timestamp() < v_b.created_at + public.cancellation_grace() then
    return jsonb_build_object('cents', 0, 'rate', 0, 'reason', 'within_grace',
      'total_cents', v_total,
      'grace_ends_at', v_b.created_at + public.cancellation_grace());
  end if;

  /* Rounded down: half a cent in our favour on every cancellation is
     not worth the sentence it would take to explain. */
  v_cents := floor(v_total * 0.10);

  return jsonb_build_object('cents', v_cents, 'rate', 0.10, 'reason', 'helper_accepted',
    'total_cents', v_total, 'already_captured', v_b.captured_at is not null);
end $$;

revoke all on function public.cancellation_fee_for(uuid, text) from public;
grant execute on function public.cancellation_fee_for(uuid, text) to authenticated, service_role;

/* ------------------------------------------------------------------ *
 * THE CANCELLATION ITSELF                                             *
 * ------------------------------------------------------------------ */
create or replace function public.cancel_booking_with_fee(
  p_booking uuid,
  p_reason  text default null,
  p_accepted_fee_cents integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_b public.bookings;
  v_who text;
  v_fee jsonb;
  v_cents int;
begin
  /* The lock that decides the race with completion. */
  select * into v_b from public.bookings where id = p_booking for update;
  if not found then
    raise exception 'Booking not found.' using errcode = 'HW150';
  end if;

  if v_b.status = 'completed' then
    raise exception 'This job has been completed, so it can no longer be cancelled. If there was a problem with the work, raise that instead.'
      using errcode = 'HW151';
  end if;
  if v_b.status not in ('scheduled', 'in_progress') then
    raise exception 'This booking cannot be cancelled — it is %.', v_b.status
      using errcode = 'HW151';
  end if;

  if auth.uid() = v_b.customer_id then
    v_who := 'customer';
  elsif auth.uid() = v_b.provider_id then
    v_who := 'helper';
  elsif coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin' then
    v_who := 'admin';
  else
    raise exception 'Not authorised to cancel this booking.' using errcode = '42501';
  end if;

  /*
    A CAPTURED BOOKING IS A FINISHED ONE. The status check above makes
    this all but unreachable; it is here because the alternative — a
    cancellation that quietly becomes a 90% refund of a job somebody
    did — is bad enough to be worth a belt as well as braces.
  */
  if v_b.captured_at is not null then
    raise exception 'This booking has already been charged, which means the work was completed. Raise a problem with the job rather than cancelling it.'
      using errcode = 'HW151';
  end if;

  v_fee := public.cancellation_fee_for(p_booking, v_who);
  v_cents := (v_fee ->> 'cents')::int;

  /*
    CONSENT IS CHECKED HERE, under the same lock, against the figure
    computed here. Checking it anywhere else leaves a gap in which the
    booking moves between the check and the charge.
  */
  if v_cents > 0 then
    if p_accepted_fee_cents is null then
      raise exception 'This cancellation costs % cents. Show that to the customer and pass it back to confirm.',
        v_cents using errcode = 'HW152';
    end if;
    if p_accepted_fee_cents <> v_cents then
      raise exception 'The cancellation fee is now % cents, not %. Show the new amount before charging it.',
        v_cents, p_accepted_fee_cents using errcode = 'HW152';
    end if;
  end if;

  update public.bookings
  set status = 'cancelled',
      cancelled_at = now(),
      cancelled_by = auth.uid(),
      cancel_reason = coalesce(p_reason, 'Cancelled by ' || v_who),
      /* What they agreed to, recorded now. What was actually taken is
         written after the processor answers. */
      cancellation_fee_rate = case when v_cents > 0 then 0.10 else null end,
      cancellation_fee_accepted_cents = case when v_cents > 0 then p_accepted_fee_cents else null end,
      cancellation_fee_accepted_at = case when v_cents > 0 then clock_timestamp() else null end
  where id = p_booking;

  insert into public.notifications (user_id, type, payload)
  values (
    case when v_who = 'customer' then v_b.provider_id else v_b.customer_id end,
    'booking_cancelled',
    jsonb_build_object('booking_id', p_booking, 'by', v_who, 'reason', p_reason)
  );

  insert into public.audit_log (actor_id, action, target_table, target_id, payload, outcome)
  values (auth.uid(), 'booking.cancelled', 'bookings', p_booking::text,
          jsonb_build_object('by', v_who, 'reason', p_reason,
                             'fee_cents', v_cents,
                             'fee_reason', v_fee ->> 'reason'),
          'succeeded');

  return jsonb_build_object(
    'cancelled_by', v_who,
    'fee_cents', v_cents,
    'fee_reason', v_fee ->> 'reason',
    'rate', (v_fee ->> 'rate')::numeric,
    'total_cents', coalesce(v_b.total_cents, 0),
    'currency', v_b.currency,
    'hold_exists', v_b.payment_status = 'authorized'
  );
end $$;

revoke all on function public.cancel_booking_with_fee(uuid, text, integer) from public;
grant execute on function public.cancel_booking_with_fee(uuid, text, integer) to authenticated;

/* ------------------------------------------------------------------ *
 * RECOVERING AN OVER-CAPTURE                                          *
 * ------------------------------------------------------------------ */
/*
  The automatic refund used to call admin_refund_request with the
  service key, and that simply does not work: is_admin() reads the
  app_metadata role from the caller's token, and a service-role token
  has no such claim. Bypassing RLS is not the same as being an admin,
  and the call failed with 42501 every time — the whole automatic path
  was dead on arrival.

  The answer is NOT to make service_role an admin. It is a separate,
  narrower door: this creates a refund request for a cancellation that
  took more than it should have, it is granted to service_role ALONE
  (an authenticated user cannot call it at all), and it records what
  raised it so a system-created request is never mistaken for one a
  person asked for.
*/
create or replace function public.system_cancellation_refund(
  p_booking uuid,
  p_amount_cents integer,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_id uuid;
  v_available int;
begin
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'A refund amount must be more than zero.' using errcode = 'HW132';
  end if;
  if coalesce(trim(p_note), '') = '' then
    raise exception 'A system refund has to say what raised it.' using errcode = 'HW131';
  end if;

  perform 1 from public.bookings where id = p_booking for update;

  v_available := public.refund_available_cents(p_booking, 'service');
  if p_amount_cents > v_available then
    raise exception 'Only % cents are left on the service charge.', v_available
      using errcode = 'HW134';
  end if;

  insert into public.refunds
    (booking_id, leg, amount_cents, reason, status,
     requested_at, internal_note, absorb_helper_share)
  values (p_booking, 'service', p_amount_cents, 'service_issue', 'awaiting_review',
          clock_timestamp(), p_note,
          public.refund_absorbs_helper_share('service_issue'))
  returning id into v_id;

  insert into public.audit_log (actor_id, action, target_table, target_id, payload, outcome)
  values (null, 'refund.requested', 'refunds', v_id::text,
          jsonb_build_object('booking_id', p_booking, 'amount_cents', p_amount_cents,
                             'raised_by', 'system', 'note', p_note),
          'submitted');

  return jsonb_build_object('refund_id', v_id, 'amount_cents', p_amount_cents);
end $$;

revoke all on function public.system_cancellation_refund(uuid, integer, text) from public;
/* service_role only. An authenticated session cannot reach this. */
grant execute on function public.system_cancellation_refund(uuid, integer, text) to service_role;

/* ------------------------------------------------------------------ *
 * SELF-TEST                                                           *
 * ------------------------------------------------------------------ */
do $selftest$
declare
  v_c uuid; v_h uuid; v_s text; v_bk uuid; v_r jsonb; v_fee jsonb;
begin
  begin
    select p.id into v_c from public.profiles p limit 1;
    select pp.user_id into v_h from public.provider_profiles pp limit 1;
    select sv.id into v_s from public.services sv limit 1;
    if v_c is null or v_h is null or v_s is null then
      raise exception 'this test needs a profile, a provider and a service.';
    end if;

    insert into public.bookings (customer_id, provider_id, service_id, status,
      base_price_cents, total_cents, platform_fee_cents, payout_cents, currency,
      payment_status, created_at)
    /* After the disclosure AND outside the grace window — "an hour ago"
       alone is not enough, because an hour ago may predate the policy
       on the day it shipped, which is exactly what the rule is for. */
    values (v_c, v_h, v_s, 'scheduled', 22000, 22450, 4850, 17600, 'CAD',
            'authorized',
            greatest(now() - interval '1 hour',
                     public.cancellation_fee_disclosed_from() + interval '1 second'))
    returning id into v_bk;

    /* Every cancel call below needs an identity: the actor is checked
       before the fee is, which is the point of the change. */
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_c, 'app_metadata', json_build_object('role', 'customer'))::text, true);

    /* ---- THE HELPER DOES NOT PAY THE CUSTOMER'S FEE ---- */
    v_fee := public.cancellation_fee_for(v_bk, 'helper');
    if (v_fee ->> 'cents')::int <> 0 then
      raise exception 'a helper cancelling was charged the customer fee';
    end if;
    if (v_fee ->> 'reason') <> 'not_the_customer' then
      raise exception 'the helper exemption was not explained: %', v_fee ->> 'reason';
    end if;
    if (public.cancellation_fee_for(v_bk, 'admin') ->> 'cents')::int <> 0 then
      raise exception 'an admin cancelling was charged a fee';
    end if;

    /* ---- THE CUSTOMER DOES ---- */
    v_fee := public.cancellation_fee_for(v_bk, 'customer');
    if (v_fee ->> 'cents')::int <> 2245 then
      raise exception 'the customer fee was % not 2245', v_fee ->> 'cents';
    end if;

    /* ---- THE GRACE WINDOW ---- */
    update public.bookings set created_at = now() - interval '1 minute' where id = v_bk;
    v_fee := public.cancellation_fee_for(v_bk, 'customer');
    if (v_fee ->> 'cents')::int <> 0 or (v_fee ->> 'reason') <> 'within_grace' then
      raise exception 'a cancellation inside the grace window was charged';
    end if;
    if (v_fee ->> 'grace_ends_at') is null then
      raise exception 'the grace window did not say when it ends';
    end if;

    /* ---- A BOOKING FROM BEFORE THE POLICY ---- */
    update public.bookings
    set created_at = public.cancellation_fee_disclosed_from() - interval '1 second'
    where id = v_bk;
    if (public.cancellation_fee_for(v_bk, 'customer') ->> 'reason') <> 'predates_policy' then
      raise exception 'a booking made before the policy was charged';
    end if;

    /* ---- A COMPLETED JOB CANNOT BE CANCELLED ---- */
    update public.bookings set
      created_at = greatest(now() - interval '1 hour',
                            public.cancellation_fee_disclosed_from() + interval '1 second'),
      status = 'completed' where id = v_bk;
    begin
      perform public.cancel_booking_with_fee(v_bk, 'too late', 2245);
      raise exception 'a completed job was cancelled';
    exception when sqlstate 'HW151' then null;
    end;

    /* ---- A CAPTURED ONE CANNOT EITHER ---- */
    update public.bookings set status = 'in_progress', captured_at = now() where id = v_bk;
    begin
      perform public.cancel_booking_with_fee(v_bk, 'too late', 2245);
      raise exception 'a captured booking was cancelled into a refund';
    exception when sqlstate 'HW151' then null;
    end;

    /* ---- CONSENT IS ENFORCED UNDER THE LOCK ---- */
    update public.bookings set status = 'scheduled', captured_at = null where id = v_bk;
    begin
      perform public.cancel_booking_with_fee(v_bk, 'changed my mind', null);
      raise exception 'a fee-bearing cancellation went through with no acceptance';
    exception when sqlstate 'HW152' then null;
    end;
    begin
      perform public.cancel_booking_with_fee(v_bk, 'changed my mind', 100);
      raise exception 'a cancellation went through on the wrong accepted amount';
    exception when sqlstate 'HW152' then null;
    end;

    v_r := public.cancel_booking_with_fee(v_bk, 'changed my mind', 2245);
    if (v_r ->> 'cancelled_by') <> 'customer' then
      raise exception 'the cancelling party was not identified: %', v_r ->> 'cancelled_by';
    end if;
    if (v_r ->> 'fee_cents')::int <> 2245 then
      raise exception 'the fee was not returned to the caller';
    end if;
    if (select cancellation_fee_accepted_cents from public.bookings where id = v_bk) <> 2245 then
      raise exception 'what the customer accepted was not recorded';
    end if;

    raise exception using errcode = 'HW999', message = 'self-test complete';
  exception
    when sqlstate 'HW999' then
      raise notice 'cancellation policy: a helper or admin cancelling charges the customer nothing, the grace window and the pre-policy rule hold, a completed or captured job cannot be cancelled at all, and consent is checked under the same lock that cancels';
    when others then
      raise;
  end;
end $selftest$;
