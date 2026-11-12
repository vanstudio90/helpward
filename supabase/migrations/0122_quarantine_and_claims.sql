-- CLASS: pre-deploy
-- =========================================================================
-- 0122 — a quarantine that stays, an identity checked everywhere, a claim
--        that actually claims
-- =========================================================================
/*
  0121 stopped a bad event corrupting a record. It did not stop the NEXT
  event quietly undoing that protection, it checked identity on only one
  of the two matching paths, and its "claim" claimed nothing.

  1. THE QUARANTINE CLEARED ITSELF. A mismatched event created a
     quarantined row with needs_reconciliation set. The very next event
     for that same Stripe refund matched by processor id and cleared
     the flag — quarantine_note still sitting there, unread — and the
     booking-wide block, which only ever looked at
     needs_reconciliation, let a different approved refund through.
     Nobody resolved anything; the protection simply expired on its
     own.

     A quarantine is now STICKY. It blocks until a person clears it,
     through a function that demands a reason and records who did it,
     and every gate — requesting, approving, sending — treats an
     unresolved quarantine on ANY refund of that booking as blocking,
     independently of needs_reconciliation.

  2. IDENTITY WAS CHECKED ON ONE PATH ONLY. An event naming a
     different booking, leg and amount, but carrying a processor id we
     had already recorded, updated the stored refund and recomputed
     the booking the EVENT named rather than the one the refund
     belongs to. The check existed; it was in the operation-id branch
     and not in the processor-id branch beside it. It now runs on
     every path, and a mismatch changes nothing except to raise a
     quarantine on the row it was aimed at.

  3. THE CLAIM WAS A TIMESTAMP. admin_refund_ready_to_send "claimed" a
     row by bumping updated_at, which nothing read. Two callers in
     separate transactions both got permission to send. A lease
     replaces it: a token and an expiry, checked by whoever comes
     next. Stripe's idempotency key remains the backstop — but a
     backstop is not a design, and "the processor would have caught
     it" is not a thing this console should be relying on.
*/

alter table public.refunds
  add column if not exists send_claim_token uuid,
  add column if not exists send_claimed_at timestamptz,
  add column if not exists quarantine_cleared_at timestamptz,
  add column if not exists quarantine_cleared_by uuid references public.profiles(id) on delete set null;

comment on column public.refunds.send_claim_token is
  'A lease on sending this refund. While it is live, a second caller is refused — two callers both being told to send is how one refund is sent twice.';
comment on column public.refunds.quarantine_cleared_at is
  'When a person resolved the quarantine. Until then it blocks every refund action on the booking: an event disagreeing about whose money this is means we do not know what is true.';

/* How long a send lease is good for. Long enough for a slow processor
   call, short enough that a crashed sender does not block for ever —
   and a re-send after it expires is still protected by the idempotency
   key derived from the refund's own id. */
create or replace function public.refund_send_lease()
returns interval language sql immutable as $$ select interval '10 minutes' $$;

/* ------------------------------------------------------------------ *
 * IS ANYTHING ON THIS BOOKING UNRESOLVED?                             *
 * ------------------------------------------------------------------ */
/*
  One predicate, used by request, approve and send, so the three can
  never disagree about what blocks. An unknown outcome and an
  unresolved quarantine are different problems with the same answer:
  nothing more moves on this booking until a person has looked.
*/
create or replace function public.booking_refunds_blocked(p_booking uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select case
    when exists (
      select 1 from public.refunds
      where booking_id = p_booking and quarantine_cleared_at is null
        and quarantine_note is not null
    ) then 'A processor event about this booking disagreed with our record and is quarantined. Nothing may be requested, approved or sent against it until somebody resolves that.'
    when exists (
      select 1 from public.refunds
      where booking_id = p_booking and needs_reconciliation
    ) then 'A refund on this booking has an unknown outcome and is waiting to be reconciled. Nothing may be requested, approved or sent against it until somebody has checked the processor.'
    else null
  end;
$$;

revoke all on function public.booking_refunds_blocked(uuid) from public;
grant execute on function public.booking_refunds_blocked(uuid) to authenticated, service_role;

/* ------------------------------------------------------------------ *
 * RESOLVING A QUARANTINE IS A PERSON'S JOB                            *
 * ------------------------------------------------------------------ */
create or replace function public.admin_refund_clear_quarantine(
  p_refund uuid, p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  v_r public.refunds;
begin
  if not public.is_admin() then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Say what you checked and what you found. A quarantine cleared with no explanation is one nobody can audit.'
      using errcode = 'HW131';
  end if;

  select * into v_r from public.refunds where id = p_refund for update;
  if not found then
    raise exception 'No such refund.' using errcode = 'HW135';
  end if;
  if v_r.quarantine_note is null or v_r.quarantine_cleared_at is not null then
    raise exception 'There is no open quarantine on this refund.' using errcode = 'HW144';
  end if;

  /*
    RESOLVING A QUARANTINE IS CHECKING THE PROCESSOR, which is also
    what reconciling an unknown outcome asks for — and the function
    demands that the person say what they checked and found. Leaving
    needs_reconciliation set afterwards would keep the booking blocked
    on a question that has just been answered, with no way to answer
    it twice.
  */
  update public.refunds set
    quarantine_cleared_at = clock_timestamp(),
    quarantine_cleared_by = v_actor,
    needs_reconciliation = false,
    reconcile_note = null,
    updated_at = clock_timestamp()
  where id = p_refund;

  insert into public.audit_log
    (actor_id, action, target_table, target_id, payload, outcome)
  values (v_actor, 'refund.quarantine_cleared', 'refunds', p_refund::text,
          jsonb_build_object('reason', p_reason, 'quarantine', v_r.quarantine_note,
                             'also_cleared_reconciliation', v_r.needs_reconciliation),
          'succeeded');

  return jsonb_build_object('cleared', true,
    'note', 'Cleared. The booking is no longer blocked by this quarantine.');
end $$;

revoke all on function public.admin_refund_clear_quarantine(uuid, text) from public;
grant execute on function public.admin_refund_clear_quarantine(uuid, text) to authenticated;

/* ------------------------------------------------------------------ *
 * IDENTITY ON EVERY PATH                                              *
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
  if p_status not in ('succeeded', 'pending', 'requires_action', 'failed', 'canceled') then
    raise exception 'Unknown processor refund status "%".', p_status using errcode = 'HW140';
  end if;

  perform 1 from public.bookings where id = p_booking for update;

  /*
    THE SAME CHECK ON BOTH PATHS. It used to live only in the
    operation-id branch, so an event naming a different booking, leg
    and amount but carrying a processor id we already knew updated the
    stored refund and recomputed the booking the EVENT named — not the
    one the refund belongs to.
  */
  select * into v_candidate from public.refunds where stripe_refund_id = p_processor_id limit 1;
  if v_candidate.id is not null then
    if v_candidate.booking_id = p_booking
       and v_candidate.leg = p_leg
       and v_candidate.amount_cents = p_amount_cents then
      v_r := v_candidate;
      v_match := 'processor_id';
    else
      v_quarantine := format(
        'Event %s named booking %s / %s / %s cents, but processor refund %s is recorded against booking %s / %s / %s cents.',
        coalesce(p_event_id, '?'), p_booking, p_leg, p_amount_cents, p_processor_id,
        v_candidate.booking_id, v_candidate.leg, v_candidate.amount_cents);
      /*
        NOTHING IS CHANGED AND NOTHING IS RECOMPUTED. The stored row
        keeps its status; the booking the event named is not touched,
        because this event has not established anything about it. The
        quarantine goes on the row the claim was aimed at.
      */
      update public.refunds set
        quarantine_note = v_quarantine,
        quarantine_cleared_at = null,
        quarantine_cleared_by = null,
        needs_reconciliation = true,
        updated_at = clock_timestamp()
      where id = v_candidate.id;

      insert into public.audit_log
        (actor_id, action, target_table, target_id, payload, outcome)
      values (null, 'refund.event_quarantined', 'refunds', v_candidate.id::text,
              jsonb_build_object('source', 'stripe_webhook', 'matched_by', 'processor_id_mismatch',
                                 'processor_refund_id', p_processor_id, 'event_id', p_event_id,
                                 'quarantine', v_quarantine),
              'denied');

      return jsonb_build_object(
        'matched', 'quarantined', 'refund_id', v_candidate.id,
        'status', v_candidate.status, 'quarantine', v_quarantine, 'changed', false);
    end if;
  end if;

  if v_r.id is null and p_operation is not null then
    begin
      select * into v_candidate from public.refunds where id = p_operation::uuid limit 1;
    exception when invalid_text_representation then
      v_candidate := null;
    end;

    if v_candidate.id is not null then
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

  v_new_status := case p_status
    when 'succeeded' then 'succeeded'
    when 'failed' then 'failed'
    when 'canceled' then 'failed'
    else 'processing'
  end;

  if v_r.id is null then
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
    v_match := case when v_quarantine is not null then 'quarantined' else 'created' end;
  else
    if p_event_id is not null and v_r.last_event_id = p_event_id then
      return jsonb_build_object('matched', v_match, 'refund_id', v_r.id,
        'status', v_r.status, 'changed', false, 'reason', 'already_applied');
    end if;
    if p_event_at is not null and v_r.last_event_at is not null
       and p_event_at < v_r.last_event_at then
      return jsonb_build_object('matched', v_match, 'refund_id', v_r.id,
        'status', v_r.status, 'changed', false, 'reason', 'stale_event');
    end if;
    if public.refund_status_is_final(coalesce(v_r.processor_status, ''))
       and not public.refund_status_is_final(p_status) then
      return jsonb_build_object('matched', v_match, 'refund_id', v_r.id,
        'status', v_r.status, 'changed', false, 'reason', 'would_regress_final_state');
    end if;

    update public.refunds set
      status = v_new_status,
      processor_status = p_status,
      stripe_refund_id = coalesce(p_processor_id, stripe_refund_id),
      /*
        A QUARANTINE IS NOT CLEARED BY THE NEXT EVENT. Learning what
        the processor thinks does not resolve a disagreement about
        WHOSE money this is — only a person who has looked can do
        that, through admin_refund_clear_quarantine.
      */
      needs_reconciliation = case
        when quarantine_note is not null and quarantine_cleared_at is null then true
        when v_match in ('processor_id', 'operation') then false
        else needs_reconciliation end,
      reconcile_note = case
        when quarantine_note is not null and quarantine_cleared_at is null then reconcile_note
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
                       'processor_status', p_status, 'event_id', p_event_id,
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

  return jsonb_build_object('matched', v_match, 'refund_id', v_r.id,
    'status', v_new_status, 'booking_payment_status', v_booking_status,
    'quarantine', v_quarantine, 'changed', true);
end $$;

revoke all on function public.ingest_refund_event(text, uuid, text, integer, text, text, text, text, timestamptz) from public;
grant execute on function public.ingest_refund_event(text, uuid, text, integer, text, text, text, text, timestamptz) to service_role;

/* ------------------------------------------------------------------ *
 * A LEASE, NOT A TIMESTAMP                                            *
 * ------------------------------------------------------------------ */
create or replace function public.admin_refund_ready_to_send(p_refund uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_r public.refunds;
  v_available int;
  v_blocked text;
  v_token uuid := gen_random_uuid();
  v_now timestamptz := clock_timestamp();
begin
  if not public.is_admin() then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;

  select * into v_r from public.refunds where id = p_refund;
  if not found then
    raise exception 'No such refund request.' using errcode = 'HW135';
  end if;

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

  /* The one predicate, so sending blocks on exactly what requesting
     and approving block on — quarantines included. */
  v_blocked := public.booking_refunds_blocked(v_r.booking_id);
  if v_blocked is not null then
    raise exception '%', v_blocked using errcode = 'HW139';
  end if;

  v_available := public.refund_available_cents(v_r.booking_id, v_r.leg) + v_r.amount_cents;
  if v_r.amount_cents > v_available then
    raise exception 'Only % cents are left on the % charge now — less than when this was approved.',
      v_available, v_r.leg using errcode = 'HW134';
  end if;

  /*
    THE CLAIM. Bumping updated_at claimed nothing: two callers in
    separate transactions both walked away with permission to send.
    A live lease refuses the second one.

    IT EXPIRES, because a sender that crashed between claiming and
    sending must not block the refund for ever. Re-claiming after the
    lease is the recovery path, and it is safe because the idempotency
    key is derived from this refund's own id — so a duplicate send
    collapses at the processor rather than becoming a second refund.
    That is a backstop behind this check, not instead of it.
  */
  if v_r.send_claimed_at is not null
     and v_r.send_claimed_at > v_now - public.refund_send_lease() then
    raise exception 'Somebody is sending this refund right now (claimed %s ago). Wait for it to finish rather than sending it twice.',
      date_trunc('second', v_now - v_r.send_claimed_at)
      using errcode = 'HW143';
  end if;

  update public.refunds set
    send_claim_token = v_token,
    send_claimed_at = v_now,
    updated_at = v_now
  where id = p_refund;

  return jsonb_build_object(
    'booking_id', v_r.booking_id,
    'leg', v_r.leg,
    'amount_cents', v_r.amount_cents,
    'absorb_helper_share', coalesce(v_r.absorb_helper_share, false),
    'claim_token', v_token,
    'claim_expires_at', v_now + public.refund_send_lease()
  );
end $$;

revoke all on function public.admin_refund_ready_to_send(uuid) from public;
grant execute on function public.admin_refund_ready_to_send(uuid) to authenticated;

/* Requesting and approving use the one predicate too. */
create or replace function public.admin_refund_request(
  p_booking uuid, p_leg text, p_amount_cents integer, p_reason text, p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  v_available int; v_id uuid; v_absorb boolean; v_locked uuid; v_blocked text;
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

  select id into v_locked from public.bookings
  where id = p_booking and captured_at is not null for update;
  if v_locked is null then
    raise exception 'This booking was never charged, so there is nothing to refund. Releasing a hold is a different act.'
      using errcode = 'HW133';
  end if;

  v_blocked := public.booking_refunds_blocked(p_booking);
  if v_blocked is not null then
    raise exception '%', v_blocked using errcode = 'HW139';
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

  return jsonb_build_object('refund_id', v_id, 'absorb_helper_share', v_absorb,
    'available_after_cents', v_available - p_amount_cents,
    'note', case when v_absorb
      then 'Requested. On these grounds the helper keeps their share and Helpward carries the refund.'
      else 'Requested. On these grounds the helper''s share goes back with the refund.' end);
end $$;

revoke all on function public.admin_refund_request(uuid, text, integer, text, text) from public;
grant execute on function public.admin_refund_request(uuid, text, integer, text, text) to authenticated;

/* And settling releases the lease. */
create or replace function public.admin_refund_release_claim(p_refund uuid)
returns void
language sql
security definer
set search_path = public, pg_catalog
as $$
  update public.refunds
  set send_claim_token = null, send_claimed_at = null
  where id = p_refund;
$$;
revoke all on function public.admin_refund_release_claim(uuid) from public;
grant execute on function public.admin_refund_release_claim(uuid) to authenticated;

/* ------------------------------------------------------------------ *
 * SELF-TEST                                                           *
 * ------------------------------------------------------------------ */
do $$
declare
  v_c uuid; v_h uuid; v_s text; v_bk uuid;
  v_r jsonb; v_q uuid; v_other uuid; v_u timestamptz; v_tok uuid;
begin
  begin
    perform set_config('request.jwt.claims', '{"app_metadata":{"role":"admin"}}', true);
    select p.id into v_c from public.profiles p limit 1;
    select pp.user_id into v_h from public.provider_profiles pp limit 1;
    select sv.id into v_s from public.services sv limit 1;
    if v_c is null or v_h is null or v_s is null then
      raise exception 'the quarantine test needs a profile, a provider and a service.';
    end if;

    insert into public.bookings (customer_id, provider_id, service_id, status,
      base_price_cents, total_cents, tip_cents, platform_fee_cents, payout_cents,
      currency, payment_status, captured_at, stripe_payment_intent_id, tip_payment_intent_id)
    values (v_c, v_h, v_s, 'completed', 22000, 22450, 1000, 4850, 17600,
            'CAD', 'captured', now(), 'pi_q_svc', 'pi_q_tip')
    returning id into v_bk;

    /* ---- 1. A QUARANTINE DOES NOT CLEAR ITSELF ---- */
    /* An external refund lands, then an event claims it belongs to a
       different leg and amount — quarantining the stored row. */
    perform public.ingest_refund_event('re_q', v_bk, 'service', 500, 'succeeded',
      null, null, 'evt_q1', now() - interval '2 minutes');
    select id into v_q from public.refunds where stripe_refund_id = 're_q';

    v_r := public.ingest_refund_event('re_q', v_bk, 'tip', 900, 'succeeded',
      null, null, 'evt_q2', now() - interval '1 minute');
    if (v_r ->> 'matched') <> 'quarantined' then
      raise exception 'a processor-id event with the wrong leg/amount was accepted: %', v_r ->> 'matched';
    end if;
    if not (select needs_reconciliation from public.refunds where id = v_q) then
      raise exception 'the mismatch did not flag the row';
    end if;
    /* RULE 2: nothing changed and the supplied booking was not recomputed. */
    if (select leg from public.refunds where id = v_q) <> 'service'
       or (select amount_cents from public.refunds where id = v_q) <> 500 then
      raise exception 'a mismatched event rewrote the stored refund';
    end if;

    /* The NEXT, consistent event must not clear the quarantine. */
    v_r := public.ingest_refund_event('re_q', v_bk, 'service', 500, 'succeeded',
      null, null, 'evt_q3', now());
    if not (select needs_reconciliation from public.refunds where id = v_q) then
      raise exception 'the next event cleared a quarantine nobody resolved';
    end if;
    if public.booking_refunds_blocked(v_bk) is null then
      raise exception 'the booking was not blocked by an unresolved quarantine';
    end if;

    /* And another refund on that booking cannot be requested or sent. */
    begin
      perform public.admin_refund_request(v_bk, 'tip', 100, 'goodwill');
      raise exception 'a refund was requested against a quarantined booking';
    exception when sqlstate 'HW139' then null;
    end;

    /* Only a person clears it, with a reason. */
    begin
      perform public.admin_refund_clear_quarantine(v_q, '   ');
      raise exception 'a quarantine was cleared with no explanation';
    exception when sqlstate 'HW131' then null;
    end;
    perform public.admin_refund_clear_quarantine(v_q, 'Checked Stripe: re_q is the CA$5.00 service refund. The tip event was a replay of a different charge.');
    if public.booking_refunds_blocked(v_bk) is not null then
      raise exception 'the booking stayed blocked after the quarantine was resolved';
    end if;

    /* ---- 3. THE SEND CLAIM IS EXCLUSIVE ---- */
    v_r := public.admin_refund_request(v_bk, 'tip', 200, 'goodwill');
    v_other := (v_r ->> 'refund_id')::uuid;
    select updated_at into v_u from public.refunds where id = v_other;
    perform public.admin_refund_decide(v_other, v_u, true, 'Agreed.');

    v_r := public.admin_refund_ready_to_send(v_other);
    v_tok := (v_r ->> 'claim_token')::uuid;
    if v_tok is null then
      raise exception 'sending was permitted without a claim';
    end if;

    begin
      perform public.admin_refund_ready_to_send(v_other);
      raise exception 'a second caller was also told to send the same refund';
    exception when sqlstate 'HW143' then null;
    end;

    /* An expired lease is re-claimable, so a crashed sender does not
       block the refund for ever. */
    update public.refunds
    set send_claimed_at = clock_timestamp() - public.refund_send_lease() - interval '1 minute'
    where id = v_other;
    v_r := public.admin_refund_ready_to_send(v_other);
    if (v_r ->> 'claim_token')::uuid = v_tok then
      raise exception 'a re-claim reused the old token';
    end if;

    raise exception using errcode = 'HW999', message = 'self-test complete';
  exception
    when sqlstate 'HW999' then
      raise notice 'quarantine and claims: a mismatched processor id changes nothing and quarantines, the next event does not clear it, the booking stays blocked until a person resolves it with a reason, and a send lease refuses a second caller while expiring for recovery';
    when others then
      raise;
  end;
end $$;
