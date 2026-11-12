-- CLASS: pre-deploy
-- =========================================================================
-- 0121 — events in the wrong order, and events about somebody else
-- =========================================================================
/*
  0120 made the webhook record refunds instead of guessing at them. It
  then trusted two things it had no business trusting: that events
  arrive in the order they happened, and that an operation id in an
  event's metadata belongs to the refund the event is about.

  FOUR FAILURES, all reproduced by running the function:

  1. AN OLDER EVENT UNDID A FINISHED ONE. pending → succeeded left a
     booking partial_refund, correctly. Delivering the OLDER pending
     snapshot afterwards — which Stripe will do, because delivery is
     at-least-once and unordered — set the refund back to processing
     and the booking back to captured. Money that had been returned
     stopped being recorded as returned.

  2. A REPEAT DELIVERY WROTE ANOTHER AUDIT EVENT. Idempotent in the
     ledger, noisy in the trail, and the trail is the thing somebody
     reads to find out what happened.

  3. AN OPERATION ID WAS TAKEN AT FACE VALUE. An event for booking A,
     service leg, CA$1.00 carrying booking B's tip-refund operation id
     marked B's CA$5.00 request succeeded, cleared its reconciliation
     flag, and recomputed A. Three records wrong from one bad field.

  4. A VALID STATUS WAS REFUSED. Stripe documents `requires_action` on
     a refund. Ingestion raised on it, so that event failed for ever
     while the refund sat in a state nobody could see.

  THE RULES THIS FILE ADDS:

  * AN EVENT IS APPLIED ONCE, AND ONLY IF IT IS NEWER than the last
    one applied to that refund. The processor's own event id and
    timestamp are kept on the row.
  * A NON-FINAL STATUS NEVER OVERWRITES A FINAL ONE. Even with
    timestamps agreeing, `pending` cannot unwind `succeeded`. A
    genuine reversal arrives as `failed` or `canceled`, which is a
    final state and is allowed.
  * AN IDENTITY CLAIM MUST AGREE WITH ITSELF. A matched request has to
    be the same booking, the same leg and the same amount. Anything
    else is quarantined — recorded, flagged, and NOT allowed to clear
    anybody's reconciliation flag.
  * MATCHING BY AMOUNT ALONE IS GONE. Every refund this console sends
    carries its operation id, so an amount-only match can only ever be
    a refund issued somewhere else — and matching one to an approved
    request that was never sent would make us believe we had sent it.
*/

alter table public.refunds
  add column if not exists last_event_at timestamptz,
  add column if not exists last_event_id text,
  add column if not exists quarantine_note text;

comment on column public.refunds.last_event_at is
  'When the processor generated the most recent event applied to this row. An older event is ignored: delivery is at-least-once and unordered.';
comment on column public.refunds.quarantine_note is
  'Set when an event claimed to be about this refund but disagreed about the booking, leg or amount. Somebody has to look.';

/* ------------------------------------------------------------------ *
 * WHICH STATES ARE FINAL                                              *
 * ------------------------------------------------------------------ */
create or replace function public.refund_status_is_final(p_status text)
returns boolean
language sql
immutable
as $$
  select p_status in ('succeeded', 'failed', 'canceled');
$$;

/* ------------------------------------------------------------------ *
 * INGEST, WITH ORDER AND IDENTITY                                     *
 * ------------------------------------------------------------------ */
create or replace function public.ingest_refund_event(
  p_processor_id text,
  p_booking      uuid,
  p_leg          text,
  p_amount_cents integer,
  p_status       text,
  p_operation    text default null,
  p_reason       text default null,
  p_event_id     text default null,
  p_event_at     timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_r public.refunds;
  v_candidate public.refunds;
  v_match text;
  v_new_status text;
  v_booking_status text;
  v_quarantine text;
begin
  if p_booking is null then
    return jsonb_build_object('matched', 'no_booking', 'changed', false);
  end if;

  /*
    RULE 4: every status Stripe can send is handled. `requires_action`
    is a real, non-final state — it means somebody has to do something
    — and refusing it made the event fail for ever.
  */
  if p_status not in ('succeeded', 'pending', 'requires_action', 'failed', 'canceled') then
    raise exception 'Unknown processor refund status "%".', p_status using errcode = 'HW140';
  end if;

  perform 1 from public.bookings where id = p_booking for update;

  /* 1. The processor id, if we have already recorded it. */
  select * into v_r from public.refunds where stripe_refund_id = p_processor_id limit 1;
  if v_r.id is not null then v_match := 'processor_id'; end if;

  /* 2. The operation id we put in the refund's metadata — CHECKED. */
  if v_r.id is null and p_operation is not null then
    begin
      select * into v_candidate from public.refunds where id = p_operation::uuid limit 1;
    exception when invalid_text_representation then
      v_candidate := null;
    end;

    if v_candidate.id is not null then
      /*
        RULE 3. An operation id is a claim, not a fact. If it does not
        agree about the booking, the leg and the amount, the event is
        about something else — or somebody's metadata is wrong — and
        touching that request would corrupt a record that is currently
        correct.
      */
      if v_candidate.booking_id = p_booking
         and v_candidate.leg = p_leg
         and v_candidate.amount_cents = p_amount_cents then
        v_r := v_candidate;
        v_match := 'operation';
      else
        v_quarantine := format(
          'Event %s (refund %s) carried operation id %s, but that request is booking %s / %s / %s cents — this event is for booking %s / %s / %s cents.',
          coalesce(p_event_id, '?'), p_processor_id, p_operation,
          v_candidate.booking_id, v_candidate.leg, v_candidate.amount_cents,
          p_booking, p_leg, p_amount_cents);
        v_match := 'quarantined';
      end if;
    end if;
  end if;

  /*
    RULE: no amount-only matching. Everything this console sends
    carries its operation id, so a match on amount alone could only be
    a refund issued elsewhere — and binding one to an approved request
    that was never sent would convince us we had already sent it.
  */

  v_new_status := case p_status
    when 'succeeded' then 'succeeded'
    when 'failed' then 'failed'
    when 'canceled' then 'failed'
    else 'processing'
  end;

  if v_r.id is null then
    /* Issued outside this console, or quarantined. Recorded either
       way — and a quarantined one says so on its own row. */
    insert into public.refunds
      (booking_id, leg, amount_cents, reason, status, processor_status,
       stripe_refund_id, requested_at, decided_at, internal_note,
       absorb_helper_share, needs_reconciliation, quarantine_note,
       last_event_id, last_event_at, updated_at)
    values (p_booking, p_leg, p_amount_cents, coalesce(p_reason, 'goodwill'),
            v_new_status, p_status, p_processor_id,
            clock_timestamp(), clock_timestamp(),
            'Recorded from a processor event. This refund was not requested in this console.',
            null, v_quarantine is not null, v_quarantine,
            p_event_id, p_event_at, clock_timestamp())
    returning * into v_r;
    v_match := coalesce(nullif(v_match, 'quarantined'), 'quarantined_created');
    if v_match = 'quarantined_created' then
      v_match := 'quarantined';
    else
      v_match := 'created';
    end if;
  else
    /*
      RULE 1. The same delivery twice is a financial no-op AND a trail
      no-op: no write, no audit row, nothing.
    */
    if p_event_id is not null and v_r.last_event_id = p_event_id then
      return jsonb_build_object(
        'matched', v_match, 'refund_id', v_r.id, 'status', v_r.status,
        'changed', false, 'reason', 'already_applied');
    end if;

    /* An event older than the last one applied is a stale snapshot. */
    if p_event_at is not null and v_r.last_event_at is not null
       and p_event_at < v_r.last_event_at then
      return jsonb_build_object(
        'matched', v_match, 'refund_id', v_r.id, 'status', v_r.status,
        'changed', false, 'reason', 'stale_event');
    end if;

    /*
      RULE 2. A non-final status cannot unwind a final one, whatever
      the clocks say. succeeded → pending is not something that
      happens; it is an old snapshot arriving late.
    */
    if public.refund_status_is_final(coalesce(v_r.processor_status, ''))
       and not public.refund_status_is_final(p_status) then
      return jsonb_build_object(
        'matched', v_match, 'refund_id', v_r.id, 'status', v_r.status,
        'changed', false, 'reason', 'would_regress_final_state');
    end if;

    update public.refunds set
      status = v_new_status,
      processor_status = p_status,
      stripe_refund_id = coalesce(p_processor_id, stripe_refund_id),
      /* Cleared only on a match we actually verified. */
      needs_reconciliation = case
        when v_match in ('processor_id', 'operation') then false
        else needs_reconciliation end,
      reconcile_note = case
        when v_match in ('processor_id', 'operation') then null
        else reconcile_note end,
      failure_reason = case when p_status in ('failed', 'canceled')
        then coalesce(failure_reason, format('The processor returned %s.', p_status))
        else null end,
      last_event_id = coalesce(p_event_id, last_event_id),
      last_event_at = coalesce(p_event_at, last_event_at),
      updated_at = clock_timestamp()
    where id = v_r.id
    returning * into v_r;
  end if;

  v_booking_status := public.recompute_booking_payment_status(p_booking);

  insert into public.audit_log
    (actor_id, action, target_table, target_id, payload, outcome)
  values (
    null,
    case
      when v_match = 'quarantined' then 'refund.event_quarantined'
      when p_status = 'succeeded' then 'refund.confirmed'
      when p_status in ('failed', 'canceled') then 'refund.failed'
      else 'refund.pending'
    end,
    'refunds', v_r.id::text,
    jsonb_build_object('source', 'stripe_webhook', 'matched_by', v_match,
                       'processor_refund_id', p_processor_id,
                       'processor_status', p_status,
                       'event_id', p_event_id,
                       'amount_cents', p_amount_cents, 'leg', p_leg,
                       'booking_payment_status', v_booking_status,
                       'quarantine', v_quarantine),
    case
      when v_match = 'quarantined' then 'denied'
      when p_status = 'succeeded' then 'succeeded'
      when p_status in ('failed', 'canceled') then 'failed'
      else 'submitted'
    end
  );

  return jsonb_build_object(
    'matched', v_match,
    'refund_id', v_r.id,
    'status', v_new_status,
    'booking_payment_status', v_booking_status,
    'quarantine', v_quarantine,
    'changed', true
  );
end $$;

drop function if exists public.ingest_refund_event(text, uuid, text, integer, text, text, text);
revoke all on function public.ingest_refund_event(text, uuid, text, integer, text, text, text, text, timestamptz) from public;
grant execute on function public.ingest_refund_event(text, uuid, text, integer, text, text, text, text, timestamptz) to service_role;

/* ------------------------------------------------------------------ *
 * SETTLEMENT AND INGESTION CONVERGE                                   *
 * ------------------------------------------------------------------ */
/*
  A FAST WEBHOOK MADE THE SENDER REPORT A FAILURE.

  The action sends, Stripe answers, and the action records the result.
  But the webhook can arrive first — it often will — and once it has
  set the row to `succeeded`, settlement refused it because it demands
  `processing`. The action then told the operator "the refund WAS sent
  but recording it failed", which is alarming, wrong, and invites
  somebody to go looking for a problem that does not exist.

  The two now converge. A repeated CONSISTENT terminal result is
  accepted as already recorded. A CONTRADICTORY one is refused loudly,
  because that is a real disagreement about money and must not be
  smoothed over.
*/
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
  v_booking_status text;
begin
  if not public.is_admin() then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;
  if p_status not in ('succeeded', 'pending', 'requires_action', 'failed', 'canceled', 'unknown') then
    raise exception 'A processor status is succeeded, pending, requires_action, failed, canceled or unknown. "%" is none of those.',
      p_status using errcode = 'HW138';
  end if;

  select * into v_r from public.refunds where id = p_refund for update;
  if not found then
    raise exception 'No such refund request.' using errcode = 'HW135';
  end if;

  v_new_status := case p_status
    when 'succeeded' then 'succeeded'
    when 'failed' then 'failed'
    when 'canceled' then 'failed'
    else 'processing'
  end;

  /*
    ALREADY THERE. The webhook got here first and said the same thing,
    so there is nothing to do and nothing to apologise for.
  */
  if v_r.status <> 'processing' then
    if v_r.status = v_new_status
       and (p_processor_id is null or v_r.stripe_refund_id is null
            or v_r.stripe_refund_id = p_processor_id) then
      return jsonb_build_object(
        'status', v_r.status,
        'processor_status', coalesce(v_r.processor_status, p_status),
        'needs_reconciliation', v_r.needs_reconciliation,
        'already_recorded', true,
        'updated_at', v_r.updated_at,
        'note', 'Already recorded — the processor''s own event arrived first and said the same thing.'
      );
    end if;
    raise exception 'This refund is already %, and the processor now reports %. That disagreement has to be looked at rather than overwritten.',
      v_r.status, p_status using errcode = 'HW136';
  end if;

  if p_status in ('failed', 'canceled') and coalesce(trim(p_detail), '') = '' then
    raise exception 'A failed refund needs the reason the processor gave.'
      using errcode = 'HW131';
  end if;

  update public.refunds set
    status = case when p_status = 'unknown' then 'processing' else v_new_status end,
    processor_status = case when p_status = 'unknown' then processor_status else p_status end,
    stripe_refund_id = coalesce(p_processor_id, stripe_refund_id),
    needs_reconciliation = (p_status = 'unknown'),
    reconcile_note = case when p_status = 'unknown' then p_detail else null end,
    failure_reason = case when p_status in ('failed', 'canceled')
      then left(trim(p_detail), 500) else null end,
    updated_at = v_now
  where id = p_refund;

  /* The booking follows the ledger, through the one function. */
  v_booking_status := public.recompute_booking_payment_status(v_r.booking_id);

  insert into public.audit_log
    (actor_id, action, target_table, target_id, payload, outcome, changes)
  values (
    v_actor,
    case p_status
      when 'succeeded' then 'refund.confirmed'
      when 'unknown'   then 'refund.outcome_unknown'
      when 'failed'    then 'refund.failed'
      when 'canceled'  then 'refund.failed'
      else 'refund.pending'
    end,
    'refunds', p_refund::text,
    jsonb_build_object('processor_refund_id', p_processor_id,
                       'processor_status', p_status, 'detail', p_detail,
                       'amount_cents', v_r.amount_cents,
                       'booking_payment_status', v_booking_status),
    case p_status
      when 'succeeded' then 'succeeded'
      when 'failed'    then 'failed'
      when 'canceled'  then 'failed'
      else 'submitted'
    end,
    jsonb_build_array(jsonb_build_object('field', 'Status',
      'before', 'processing',
      'after', case when p_status = 'unknown' then 'processing' else v_new_status end))
  );

  return jsonb_build_object(
    'status', case when p_status = 'unknown' then 'processing' else v_new_status end,
    'processor_status', p_status,
    'needs_reconciliation', p_status = 'unknown',
    'already_recorded', false,
    'updated_at', v_now,
    'note', case p_status
      when 'succeeded' then 'Recorded as refunded.'
      when 'unknown'   then 'The outcome is unknown and the money may have moved. This request is flagged for reconciliation and nothing further may be sent against it until somebody has checked.'
      when 'failed'    then 'Recorded as failed, with what the processor said.'
      when 'canceled'  then 'Recorded as cancelled by the processor.'
      else 'The processor has it and has not finished. The customer does not have the money yet.'
    end
  );
end $$;

revoke all on function public.admin_refund_settle(uuid, text, text, text) from public;
grant execute on function public.admin_refund_settle(uuid, text, text, text) to authenticated;

/* ------------------------------------------------------------------ *
 * SENDING CHECKS WHAT APPROVAL CHECKED                                *
 * ------------------------------------------------------------------ */
/*
  Send now looked only at its own row's reconciliation flag, while
  requesting and approving both refuse while ANY refund on the booking
  has an unknown outcome. So two rows approved together, one of which
  then became uncertain, left the other sendable — against a booking
  whose real balance nobody knew.

  It now takes the booking lock, re-checks everything approval checks,
  and CLAIMS the row in the same transaction by stamping it, so two
  callers cannot both be handed the same refund to send.
*/
create or replace function public.admin_refund_ready_to_send(p_refund uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_r public.refunds;
  v_available int;
begin
  if not public.is_admin() then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;

  select * into v_r from public.refunds where id = p_refund;
  if not found then
    raise exception 'No such refund request.' using errcode = 'HW135';
  end if;

  /* Booking first, then the row — the same order as approval, so two
     sends cannot deadlock each other. */
  perform 1 from public.bookings where id = v_r.booking_id for update;
  select * into v_r from public.refunds where id = p_refund for update;

  if v_r.status <> 'processing' then
    raise exception 'Only an approved refund can be sent. This one is %.', v_r.status
      using errcode = 'HW136';
  end if;
  if v_r.stripe_refund_id is not null then
    raise exception 'This refund has already been handed to the processor (%). Sending it again would refund the money twice.',
      v_r.stripe_refund_id using errcode = 'HW141';
  end if;
  if v_r.quarantine_note is not null then
    raise exception 'This request has a quarantined processor event against it and must be looked at before anything is sent.'
      using errcode = 'HW142';
  end if;

  /* THE BOOKING-WIDE BLOCK, the same one approval enforces. */
  if exists (select 1 from public.refunds
             where booking_id = v_r.booking_id and needs_reconciliation) then
    raise exception 'A refund on this booking has an unknown outcome and is waiting to be reconciled. Nothing may be sent against it until somebody has checked the processor.'
      using errcode = 'HW139';
  end if;

  /* And the money still has to be there. */
  v_available := public.refund_available_cents(v_r.booking_id, v_r.leg) + v_r.amount_cents;
  if v_r.amount_cents > v_available then
    raise exception 'Only % cents are left on the % charge now — less than when this was approved.',
      v_available, v_r.leg using errcode = 'HW134';
  end if;

  /* CLAIMED. Two callers cannot be handed the same refund to send. */
  update public.refunds set updated_at = clock_timestamp() where id = p_refund;

  return jsonb_build_object(
    'booking_id', v_r.booking_id,
    'leg', v_r.leg,
    'amount_cents', v_r.amount_cents,
    'absorb_helper_share', coalesce(v_r.absorb_helper_share, false)
  );
end $$;

revoke all on function public.admin_refund_ready_to_send(uuid) from public;
grant execute on function public.admin_refund_ready_to_send(uuid) to authenticated;

/* ------------------------------------------------------------------ *
 * SELF-TEST                                                           *
 * ------------------------------------------------------------------ */
/* Brings its own bookings. Rolled back in full. */
do $$
declare
  v_c uuid; v_h uuid; v_s text;
  v_a uuid; v_b uuid;           -- two bookings, so identity can be tested
  v_r jsonb; v_id uuid; v_u timestamptz; v_other uuid;
  v_t0 timestamptz := now() - interval '10 minutes';
  v_t1 timestamptz := now() - interval '5 minutes';
begin
  begin
    perform set_config('request.jwt.claims', '{"app_metadata":{"role":"admin"}}', true);

    select p.id into v_c from public.profiles p limit 1;
    select pp.user_id into v_h from public.provider_profiles pp limit 1;
    select sv.id into v_s from public.services sv limit 1;
    if v_c is null or v_h is null or v_s is null then
      raise exception 'the identity test needs a profile, a provider and a service.';
    end if;

    insert into public.bookings (customer_id, provider_id, service_id, status,
      base_price_cents, total_cents, tip_cents, platform_fee_cents, payout_cents,
      currency, payment_status, captured_at, stripe_payment_intent_id, tip_payment_intent_id)
    values (v_c, v_h, v_s, 'completed', 22000, 22450, 1000, 4850, 17600,
            'CAD', 'captured', now(), 'pi_A_svc', 'pi_A_tip')
    returning id into v_a;
    insert into public.bookings (customer_id, provider_id, service_id, status,
      base_price_cents, total_cents, tip_cents, platform_fee_cents, payout_cents,
      currency, payment_status, captured_at, stripe_payment_intent_id, tip_payment_intent_id)
    values (v_c, v_h, v_s, 'completed', 9000, 9450, 500, 2250, 7200,
            'CAD', 'captured', now(), 'pi_B_svc', 'pi_B_tip')
    returning id into v_b;

    /* ---- 1. AN OLDER EVENT MUST NOT UNDO A FINISHED ONE ---- */
    perform public.ingest_refund_event('re_order', v_a, 'service', 500, 'pending',
      null, null, 'evt_1', v_t0);
    v_r := public.ingest_refund_event('re_order', v_a, 'service', 500, 'succeeded',
      null, null, 'evt_2', v_t1);
    if (v_r ->> 'booking_payment_status') <> 'partial_refund' then
      raise exception 'the succeeded event did not record the refund';
    end if;

    /* The stale snapshot, arriving late. */
    v_r := public.ingest_refund_event('re_order', v_a, 'service', 500, 'pending',
      null, null, 'evt_1_again', v_t0);
    if (v_r ->> 'changed')::boolean then
      raise exception 'an older pending event was applied over a succeeded one';
    end if;
    if (select status from public.refunds where stripe_refund_id = 're_order') <> 'succeeded' then
      raise exception 'a stale event unwound a completed refund';
    end if;
    if (select payment_status::text from public.bookings where id = v_a) <> 'partial_refund' then
      raise exception 'a stale event took the booking back to captured';
    end if;

    /* Even with no timestamp, pending cannot unwind succeeded. */
    v_r := public.ingest_refund_event('re_order', v_a, 'service', 500, 'pending');
    if (v_r ->> 'reason') <> 'would_regress_final_state' then
      raise exception 'pending overwrote a final state without a timestamp to stop it: %', v_r ->> 'reason';
    end if;

    /* ---- 2. THE SAME DELIVERY TWICE WRITES NOTHING ---- */
    declare v_events int; begin
      select count(*) into v_events from public.audit_log
      where target_id = (select id::text from public.refunds where stripe_refund_id = 're_order');
      v_r := public.ingest_refund_event('re_order', v_a, 'service', 500, 'succeeded',
        null, null, 'evt_2', v_t1);
      if (v_r ->> 'reason') <> 'already_applied' then
        raise exception 'a repeat delivery was processed again: %', v_r ->> 'reason';
      end if;
      if (select count(*) from public.audit_log
          where target_id = (select id::text from public.refunds where stripe_refund_id = 're_order')) <> v_events then
        raise exception 'a repeat delivery appended another audit event';
      end if;
    end;

    /* ---- 3. AN OPERATION ID THAT DISAGREES IS QUARANTINED ---- */
    v_r := public.admin_refund_request(v_b, 'tip', 500, 'goodwill');
    v_other := (v_r ->> 'refund_id')::uuid;
    select updated_at into v_u from public.refunds where id = v_other;
    perform public.admin_refund_decide(v_other, v_u, true, 'Agreed.');
    perform public.admin_refund_settle(v_other, 'unknown', null, 'No answer.');

    /* booking A, service leg, CA$1 — carrying B's tip operation id. */
    v_r := public.ingest_refund_event('re_wrong', v_a, 'service', 100, 'succeeded',
      v_other::text, null, 'evt_wrong', now());
    if (v_r ->> 'matched') <> 'quarantined' then
      raise exception 'a mismatched operation id was accepted: %', v_r ->> 'matched';
    end if;
    if (select status from public.refunds where id = v_other) <> 'processing' then
      raise exception 'the wrong request was marked succeeded';
    end if;
    if not (select needs_reconciliation from public.refunds where id = v_other) then
      raise exception 'a mismatched event cleared somebody else''s reconciliation flag';
    end if;
    if (v_r ->> 'quarantine') is null then
      raise exception 'the quarantine was not explained';
    end if;

    /* A matching operation id IS accepted. */
    v_r := public.ingest_refund_event('re_right', v_b, 'tip', 500, 'succeeded',
      v_other::text, null, 'evt_right', now());
    if (v_r ->> 'matched') <> 'operation' then
      raise exception 'a correct operation id was not accepted: %', v_r ->> 'matched';
    end if;
    if (select needs_reconciliation from public.refunds where id = v_other) then
      raise exception 'the flag was not cleared on a verified match';
    end if;

    /* ---- 4. requires_action IS A STATE, NOT AN ERROR ---- */
    v_r := public.ingest_refund_event('re_action', v_b, 'service', 100, 'requires_action',
      null, null, 'evt_action', now());
    if (select status from public.refunds where stripe_refund_id = 're_action') <> 'processing' then
      raise exception 'requires_action was not held open as processing';
    end if;

    /* The quarantined row on booking A blocks requests against it —
       which is the guard working. Somebody has now looked at it. */
    update public.refunds set needs_reconciliation = false, quarantine_note = null
    where stripe_refund_id = 're_wrong';

    /* ---- 5. SENDING RESPECTS THE BOOKING-WIDE BLOCK ---- */
    v_r := public.admin_refund_request(v_a, 'tip', 200, 'goodwill');
    v_id := (v_r ->> 'refund_id')::uuid;
    select updated_at into v_u from public.refunds where id = v_id;
    perform public.admin_refund_decide(v_id, v_u, true, 'Agreed.');
    /* Another refund on the SAME booking becomes uncertain. */
    update public.refunds set needs_reconciliation = true
    where stripe_refund_id = 're_order';
    begin
      perform public.admin_refund_ready_to_send(v_id);
      raise exception 'a send was allowed while another refund on the booking was uncertain';
    exception when sqlstate 'HW139' then null;
    end;
    update public.refunds set needs_reconciliation = false where stripe_refund_id = 're_order';
    perform public.admin_refund_ready_to_send(v_id);   -- now allowed

    /* ---- 6. THE WEBHOOK WINNING THE RACE IS NOT AN ERROR ---- */
    perform public.ingest_refund_event('re_race', v_a, 'tip', 200, 'succeeded',
      v_id::text, null, 'evt_race', now());
    v_r := public.admin_refund_settle(v_id, 'succeeded', 're_race');
    if not (v_r ->> 'already_recorded')::boolean then
      raise exception 'settlement after a matching webhook reported a failure instead of agreeing';
    end if;

    /* But a CONTRADICTION is still refused. */
    begin
      perform public.admin_refund_settle(v_id, 'failed', 're_race', 'Processor says no.');
      raise exception 'a contradictory settlement was accepted';
    exception when sqlstate 'HW136' then null;
    end;

    raise exception using errcode = 'HW999', message = 'self-test complete';
  exception
    when sqlstate 'HW999' then
      raise notice 'refund event identity: stale events ignored, repeats silent, mismatched operation ids quarantined, requires_action held open, booking-wide block enforced on send, and a fast webhook agrees with settlement instead of failing it';
    when others then
      raise;
  end;
end $$;
