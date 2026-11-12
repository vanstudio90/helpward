-- CLASS: pre-deploy
-- =========================================================================
-- 0119 — settling a refund truthfully, and one at a time
-- =========================================================================
/*
  FOUR THINGS 0118 GOT WRONG, each found by running the code rather than
  reading it.

  1. SETTLEMENT TOOK A BOOLEAN. Stripe answers `succeeded`, `pending`,
     `failed` or `canceled`, and a refund it is still working on was
     being written down as succeeded — a customer told their money is
     back while the bank still has it. The status is now carried
     through, and `pending` leaves the request PROCESSING.

  2. THERE WAS NO WAY TO SAY "WE DO NOT KNOW". A connection that drops
     after the request leaves Stripe may or may not have moved money.
     Recording that as a failure invites somebody to send it again. It
     now has its own terminal-until-checked state: the request stays
     processing and is flagged for reconciliation.

  3. NOTHING UPDATED THE BOOKING. The refund row moved and
     bookings.payment_status did not, so the payments screen went on
     calling a refunded booking captured. It is done here, in the same
     transaction as the settlement, from the sum of what actually
     succeeded.

  4. TWO REQUESTS COULD RESERVE THE SAME MONEY. admin_refund_request
     read the available balance and inserted without locking anything,
     so two transactions could both see CA$224.50 and both reserve it.
     Both the request and the decision now take a lock on the BOOKING,
     which is the thing the money belongs to, and re-check under it.
*/

alter table public.refunds
  add column if not exists processor_status text,
  add column if not exists needs_reconciliation boolean not null default false,
  add column if not exists reconcile_note text;

comment on column public.refunds.processor_status is
  'Stripe''s own status for this refund, carried through rather than interpreted. A pending refund is not a completed one.';
comment on column public.refunds.needs_reconciliation is
  'True when the processor outcome is unknown. The money may or may not have moved; nothing further may be sent until somebody has checked.';

/* ------------------------------------------------------------------ *
 * SETTLE                                                              *
 * ------------------------------------------------------------------ */
drop function if exists public.admin_refund_settle(uuid, boolean, text, text);

create or replace function public.admin_refund_settle(
  p_refund uuid,
  p_status text,
  p_processor_id text default null,
  p_detail text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  v_r public.refunds;
  v_now timestamptz := clock_timestamp();
  v_new_status text;
  v_booking public.bookings;
  v_refunded int;
  v_captured int;
begin
  if not public.is_admin() then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;
  if p_status not in ('succeeded', 'pending', 'failed', 'canceled', 'unknown') then
    raise exception 'A processor status is succeeded, pending, failed, canceled or unknown. "%" is none of those.',
      p_status using errcode = 'HW138';
  end if;

  select * into v_r from public.refunds where id = p_refund for update;
  if not found then
    raise exception 'No such refund request.' using errcode = 'HW135';
  end if;
  if v_r.status <> 'processing' then
    raise exception 'Only a refund that was approved and sent can be settled. This one is %.',
      v_r.status using errcode = 'HW136';
  end if;
  if p_status in ('failed', 'canceled') and coalesce(trim(p_detail), '') = '' then
    raise exception 'A failed refund needs the reason the processor gave.'
      using errcode = 'HW131';
  end if;

  /*
    RULE 1 AND 2. Pending stays processing — it is not done. Unknown
    stays processing AND is flagged, because the one thing that must
    not follow an unknown outcome is another refund.
  */
  v_new_status := case p_status
    when 'succeeded' then 'succeeded'
    when 'pending'   then 'processing'
    when 'unknown'   then 'processing'
    else 'failed'
  end;

  update public.refunds set
    status = v_new_status,
    processor_status = p_status,
    /* The id is kept the moment we have one, whatever the outcome:
       it is how anybody finds out what really happened. */
    stripe_refund_id = coalesce(p_processor_id, stripe_refund_id),
    needs_reconciliation = (p_status = 'unknown'),
    reconcile_note = case when p_status = 'unknown' then p_detail else null end,
    failure_reason = case when p_status in ('failed', 'canceled')
      then left(trim(p_detail), 500) else null end,
    updated_at = v_now
  where id = p_refund;

  /*
    RULE 3. The booking follows the money, from what has actually
    succeeded — not from what was asked for, and not from this one row.
  */
  if p_status = 'succeeded' then
    select * into v_booking from public.bookings where id = v_r.booking_id for update;
    if found then
      select coalesce(sum(amount_cents), 0) into v_refunded
      from public.refunds
      where booking_id = v_r.booking_id and status = 'succeeded';
      v_captured := coalesce(v_booking.total_cents, 0) + coalesce(v_booking.tip_cents, 0);
      /*
        THE CAST IS NOT DECORATION. payment_status is an enum, and a
        CASE whose branches are bare literals resolves to text, which
        Postgres will not assign to an enum column. Without it this
        statement fails at run time — and it did, on production, after
        passing on rehearsal because the self-test below had quietly
        skipped itself.
      */
      update public.bookings
      set payment_status = (case when v_refunded >= v_captured
        then 'refunded' else 'partial_refund' end)::public.payment_status
      where id = v_r.booking_id;
    end if;
  end if;

  insert into public.audit_log
    (actor_id, action, target_table, target_id, payload, outcome, changes)
  values (
    v_actor,
    case p_status
      when 'succeeded' then 'refund.confirmed'
      when 'pending'   then 'refund.pending'
      when 'unknown'   then 'refund.outcome_unknown'
      else 'refund.failed'
    end,
    'refunds', p_refund::text,
    jsonb_build_object('processor_refund_id', p_processor_id,
                       'processor_status', p_status, 'detail', p_detail,
                       'amount_cents', v_r.amount_cents),
    case p_status
      when 'succeeded' then 'succeeded'
      when 'pending'   then 'submitted'
      when 'unknown'   then 'submitted'
      else 'failed'
    end,
    jsonb_build_array(jsonb_build_object('field', 'Status',
      'before', 'processing', 'after', v_new_status))
  );

  return jsonb_build_object(
    'status', v_new_status,
    'processor_status', p_status,
    'needs_reconciliation', p_status = 'unknown',
    'updated_at', v_now,
    'note', case p_status
      when 'succeeded' then 'Recorded as refunded.'
      when 'pending'   then 'The processor has it and has not finished. The request stays open until it does — the customer does not have the money yet.'
      when 'unknown'   then 'The outcome is unknown and the money may have moved. This request is flagged for reconciliation and nothing further may be sent against it until somebody has checked Stripe.'
      else 'Recorded as failed, with what the processor said.'
    end
  );
end $$;

revoke all on function public.admin_refund_settle(uuid, text, text, text) from public;
grant execute on function public.admin_refund_settle(uuid, text, text, text) to authenticated;

/* ------------------------------------------------------------------ *
 * RULE 4 — ONE RESERVATION AT A TIME                                  *
 * ------------------------------------------------------------------ */
/*
  Both of these now lock the BOOKING row first. It is the thing the
  money belongs to, so it is the thing two refunds against the same
  charge contend for; locking the refund row only serialises edits to
  one request, which is not the race.
*/
create or replace function public.admin_refund_request(
  p_booking uuid,
  p_leg text,
  p_amount_cents integer,
  p_reason text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  v_available int;
  v_id uuid;
  v_absorb boolean;
  v_locked uuid;
begin
  if not public.is_admin() then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;
  if p_leg not in ('service', 'tip') then
    raise exception 'A refund is against the service charge or the tip. Those are different charges.'
      using errcode = 'HW130';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'A refund needs a reason. It decides who carries the cost as well as what the customer is told.'
      using errcode = 'HW131';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'A refund amount must be more than zero.' using errcode = 'HW132';
  end if;

  /* The lock comes FIRST, so the balance read below cannot be racing
     another request reading the same number. */
  select id into v_locked from public.bookings
  where id = p_booking and captured_at is not null for update;
  if v_locked is null then
    raise exception 'This booking was never charged, so there is nothing to refund. Releasing a hold is a different act.'
      using errcode = 'HW133';
  end if;

  if not exists (select 1 from public.refunds where booking_id = p_booking and needs_reconciliation) then
    null;
  else
    raise exception 'A refund on this booking has an unknown outcome and is waiting to be reconciled. Nothing further may be requested against it until somebody has checked Stripe.'
      using errcode = 'HW139';
  end if;

  v_available := public.refund_available_cents(p_booking, p_leg);
  if p_amount_cents > v_available then
    raise exception 'Only % cents are left on the % charge, counting refunds already in flight. Asking for % would overdraw it.',
      v_available, p_leg, p_amount_cents using errcode = 'HW134';
  end if;

  v_absorb := public.refund_absorbs_helper_share(p_reason);
  if v_absorb is null then
    raise exception 'No settlement rule exists for the reason "%". Who carries this refund has to be decided before it is requested, not guessed at.',
      p_reason using errcode = 'HW137';
  end if;

  insert into public.refunds
    (booking_id, leg, amount_cents, reason, status, initiated_by,
     requested_by, requested_at, internal_note, absorb_helper_share)
  values (p_booking, p_leg, p_amount_cents, p_reason, 'awaiting_review', v_actor,
          v_actor, clock_timestamp(), p_note, v_absorb)
  returning id into v_id;

  insert into public.audit_log (actor_id, action, target_table, target_id, payload, outcome)
  values (v_actor, 'refund.requested', 'refunds', v_id::text,
          jsonb_build_object('booking_id', p_booking, 'leg', p_leg,
                             'amount_cents', p_amount_cents, 'reason', p_reason,
                             'absorb_helper_share', v_absorb),
          'submitted');

  return jsonb_build_object(
    'refund_id', v_id,
    'absorb_helper_share', v_absorb,
    'available_after_cents', v_available - p_amount_cents,
    'note', case when v_absorb
      then 'Requested. On these grounds the helper keeps their share and Helpward carries the refund.'
      else 'Requested. On these grounds the helper''s share goes back with the refund.'
    end
  );
end $$;

create or replace function public.admin_refund_decide(
  p_refund uuid,
  p_expected timestamptz,
  p_approve boolean,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  v_r public.refunds;
  v_now timestamptz := clock_timestamp();
  v_available int;
begin
  if not public.is_admin() then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'A decision needs a reason, whichever way it goes.' using errcode = 'HW131';
  end if;

  select * into v_r from public.refunds where id = p_refund;
  if not found then
    raise exception 'No such refund request.' using errcode = 'HW135';
  end if;

  /* RULE 4: lock the booking before the refund, and in that order
     everywhere, so two approvals cannot deadlock each other. */
  perform 1 from public.bookings where id = v_r.booking_id for update;
  select * into v_r from public.refunds where id = p_refund for update;

  if v_r.status <> 'awaiting_review' then
    raise exception 'This refund is %, so there is nothing to decide. Reload to see where it got to.',
      v_r.status using errcode = 'HW136';
  end if;
  if p_expected is not null
     and date_trunc('milliseconds', v_r.updated_at) <> date_trunc('milliseconds', p_expected) then
    raise exception 'Somebody else decided this refund while you were looking at it. Reload before deciding.'
      using errcode = 'HW080';
  end if;

  /*
    RE-CHECKED AT APPROVAL, under the lock. A refund that was within
    the balance when it was asked for may not be by the time somebody
    approves it — another one may have settled in between.
  */
  if p_approve then
    if exists (select 1 from public.refunds
               where booking_id = v_r.booking_id and needs_reconciliation) then
      raise exception 'A refund on this booking has an unknown outcome and is waiting to be reconciled. Nothing may be sent against it until somebody has checked Stripe.'
        using errcode = 'HW139';
    end if;
    v_available := public.refund_available_cents(v_r.booking_id, v_r.leg)
      /* This request's own reservation is already inside that figure. */
      + v_r.amount_cents;
    if v_r.amount_cents > v_available then
      raise exception 'Only % cents are left on the % charge now — less than when this was requested. It would be refused by the processor.',
        v_available, v_r.leg using errcode = 'HW134';
    end if;
  end if;

  update public.refunds set
    status = case when p_approve then 'processing' else 'cancelled' end,
    decided_by = v_actor,
    decided_at = v_now,
    decision_reason = p_reason,
    updated_at = v_now
  where id = p_refund;

  insert into public.audit_log
    (actor_id, action, target_table, target_id, payload, outcome, changes)
  values (
    v_actor,
    case when p_approve then 'refund.approved' else 'refund.declined' end,
    'refunds', p_refund::text,
    jsonb_build_object('reason', p_reason, 'amount_cents', v_r.amount_cents,
                       'leg', v_r.leg, 'booking_id', v_r.booking_id,
                       'absorb_helper_share', v_r.absorb_helper_share),
    case when p_approve then 'submitted' else 'succeeded' end,
    jsonb_build_array(jsonb_build_object('field', 'Status',
      'before', v_r.status, 'after', case when p_approve then 'processing' else 'cancelled' end))
  );

  return jsonb_build_object(
    'approved', p_approve,
    'amount_cents', v_r.amount_cents,
    'leg', v_r.leg,
    'booking_id', v_r.booking_id,
    'absorb_helper_share', coalesce(v_r.absorb_helper_share, false),
    'updated_at', v_now,
    'note', case when p_approve
      then 'Approved. No money has moved yet — the refund is sent next, and this row records what comes back.'
      else 'Declined, and the request stays on the record with your reason.'
    end
  );
end $$;

revoke all on function public.admin_refund_request(uuid, text, integer, text, text) from public;
revoke all on function public.admin_refund_decide(uuid, timestamptz, boolean, text) from public;
grant execute on function public.admin_refund_request(uuid, text, integer, text, text) to authenticated;
grant execute on function public.admin_refund_decide(uuid, timestamptz, boolean, text) to authenticated;

/* ------------------------------------------------------------------ *
 * SELF-TEST                                                           *
 * ------------------------------------------------------------------ */
/* Rolled back in full, like the rest. */
do $$
declare
  v_booking uuid; v_total int; v_r jsonb; v_id uuid; v_u timestamptz;
  v_avail int; v_before text;
  v_customer uuid; v_helper uuid; v_service text;
begin
  begin
    perform set_config('request.jwt.claims', '{"app_metadata":{"role":"admin"}}', true);

    /*
      A SELF-TEST THAT CAN SKIP ITSELF IS NOT A SELF-TEST.

      The first version of this needed a captured booking over
      CA$20.00 with no refunds against it. Rehearsal had none, so every
      assertion below was skipped with a notice nobody reads, the
      migration reported "ok", and the enum cast above — which is wrong
      without the cast — reached production and failed there.

      So the conditions are as weak as they can be, the amounts are
      derived from whatever booking is found, and finding NOTHING is an
      error rather than a shrug.
    */
    /*
      IT BRINGS ITS OWN BOOKING.

      Searching for a usable one is how this test skipped itself:
      rehearsal's captured bookings are all fully refunded by seed
      data, and production's are all test accounts. Creating one
      inside a transaction that is thrown away depends on nothing and
      can never quietly not run. Only the foreign keys are borrowed,
      and nothing is attributed to anybody.
    */
    select p.id into v_customer from public.profiles p limit 1;
    select pp.user_id into v_helper from public.provider_profiles pp limit 1;
    select sv.id into v_service from public.services sv limit 1;
    if v_customer is null or v_helper is null or v_service is null then
      raise exception 'the settlement test needs a profile, a provider and a service to hang a booking on, and one of them is missing.';
    end if;

    insert into public.bookings
      (customer_id, provider_id, service_id, status, base_price_cents, total_cents,
       platform_fee_cents, payout_cents, currency, payment_status, captured_at,
       stripe_payment_intent_id)
    values (v_customer, v_helper, v_service, 'completed', 9000, 9450,
            2250, 7200, 'CAD', 'captured', now(), 'pi_selftest_0119')
    returning id, total_cents into v_booking, v_total;
    v_avail := public.refund_available_cents(v_booking, 'service');
    if v_avail <> v_total then
      raise exception 'a fresh booking should have its whole charge available, not %', v_avail;
    end if;

    /* A pending refund is NOT a completed one. */
    select payment_status::text into v_before from public.bookings where id = v_booking;
    v_r := public.admin_refund_request(v_booking, 'service', 100, 'goodwill');
    v_id := (v_r ->> 'refund_id')::uuid;
    select updated_at into v_u from public.refunds where id = v_id;
    perform public.admin_refund_decide(v_id, v_u, true, 'Agreed.');
    v_r := public.admin_refund_settle(v_id, 'pending', 're_pending_1');
    if (select status from public.refunds where id = v_id) <> 'processing' then
      raise exception 'a pending refund was recorded as finished';
    end if;
    if (select payment_status::text from public.bookings where id = v_booking) is distinct from v_before then
      raise exception 'a pending refund moved the booking payment status';
    end if;
    /* And the id is kept even though it is not done. */
    if (select stripe_refund_id from public.refunds where id = v_id) is null then
      raise exception 'the processor id was not kept on a pending refund';
    end if;

    /* The same row then settles for real, and the booking follows. */
    v_r := public.admin_refund_settle(v_id, 'succeeded', 're_pending_1');
    if (select status from public.refunds where id = v_id) <> 'succeeded' then
      raise exception 'settling did not complete the refund';
    end if;
    /* THE STATEMENT THAT FAILED ON PRODUCTION. If the enum cast is
       missing this raises 42804 right here, which is the point. */
    if (select payment_status::text from public.bookings where id = v_booking) <> 'partial_refund' then
      raise exception 'the booking did not follow a partial refund: %',
        (select payment_status::text from public.bookings where id = v_booking);
    end if;

    /* An unknown outcome is not a failure and not a success. */
    v_r := public.admin_refund_request(v_booking, 'service', 100, 'goodwill');
    v_id := (v_r ->> 'refund_id')::uuid;
    select updated_at into v_u from public.refunds where id = v_id;
    perform public.admin_refund_decide(v_id, v_u, true, 'Agreed.');
    v_r := public.admin_refund_settle(v_id, 'unknown', 're_unknown_1', 'The processor did not answer.');
    if (select status from public.refunds where id = v_id) <> 'processing' then
      raise exception 'an unknown outcome was given a terminal status';
    end if;
    if not (select needs_reconciliation from public.refunds where id = v_id) then
      raise exception 'an unknown outcome was not flagged for reconciliation';
    end if;
    if not (v_r ->> 'needs_reconciliation')::boolean then
      raise exception 'the caller was not told reconciliation is needed';
    end if;

    /* And nothing further may be sent against that booking. */
    begin
      perform public.admin_refund_request(v_booking, 'service', 100, 'goodwill');
      raise exception 'a refund was requested while an outcome was unknown';
    exception when sqlstate 'HW139' then null;
    end;

    /* A bad status word is refused rather than coerced. */
    begin
      perform public.admin_refund_settle(v_id, 'probably fine');
      raise exception 'an invented processor status was accepted';
    exception when sqlstate 'HW138' then null;
    when sqlstate 'HW136' then null;
    end;

    raise exception using errcode = 'HW999', message = 'self-test complete';
  exception
    when sqlstate 'HW999' then
      raise notice 'refund settlement: pending stays open, the id is kept, the booking follows a real settlement, an unknown outcome blocks further sends — and nothing left behind';
    when others then
      raise;
  end;
end $$;
