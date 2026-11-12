-- CLASS: pre-deploy
-- =========================================================================
-- 0124 — NULL is not a valid answer
-- =========================================================================
/*
  A NULL SLIPS PAST `not in`, AND EVERY GUARD I WROTE USED IT.

  In SQL, `null not in ('a','b')` is not TRUE, it is NULL — so an `if`
  built on it does not fire, and the function carries on as though the
  input were fine. Calling admin_refund_resolve_unknown with
  p_found = NULL therefore passed validation and cleared an unknown
  payment outcome: the row came back processing, with no processor
  status, no processor id, needs_reconciliation false, and the booking
  unblocked. Nothing had been found at the processor; the block had
  simply been erased by an empty answer.

  THE SAME HOLE WAS IN EVERY SIBLING. The reported case was one of
  nine: refund legs, processor statuses, settlement statuses, venue
  permissions — all written the same way, all with the same gap. This
  migration closes the class rather than the instance, because the
  next one written from the same habit is the next incident.

  AND A NULL BOOLEAN WAS READING AS "NO". `if p_approve then` treats
  NULL as false, so a decision arriving with a missing answer was
  silently recorded as a DECLINE — a refusal nobody chose, attributed
  to whoever happened to be signed in. It now refuses to guess.

  THE BODIES BELOW ARE THE INSTALLED ONES, read back from the database
  with pg_get_functiondef and patched at the guard. They are not
  retyped: a hand-copied reimplementation of six live functions is a
  worse risk than the bug being fixed.
*/

CREATE OR REPLACE FUNCTION public.admin_refund_decide(p_refund uuid, p_expected timestamp with time zone, p_approve boolean, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_r public.refunds;
  v_now timestamptz := clock_timestamp();
  v_available int;
  v_blocked text;
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

  /* Booking first, then the row — the same order everywhere. */
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
    DECLINING IS ALWAYS ALLOWED. A blocked booking is a reason not to
    send money, never a reason to force somebody to keep a request
    open — refusing a decline would leave the queue stuck behind the
    very thing somebody is trying to tidy up.
  */
  if p_approve is null then
    raise exception 'Say whether this is an approval or a decline. A missing answer is not a decline.'
      using errcode = 'HW148';
  end if;

  if p_approve then
    v_blocked := public.booking_refunds_blocked(v_r.booking_id);
    if v_blocked is not null then
      raise exception '%', v_blocked using errcode = 'HW139';
    end if;

    v_available := public.refund_available_cents(v_r.booking_id, v_r.leg) + v_r.amount_cents;
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
    'approved', p_approve, 'amount_cents', v_r.amount_cents, 'leg', v_r.leg,
    'booking_id', v_r.booking_id,
    'absorb_helper_share', coalesce(v_r.absorb_helper_share, false),
    'updated_at', v_now,
    'note', case when p_approve
      then 'Approved. No money has moved yet — the refund is sent next, and this row records what comes back.'
      else 'Declined, and the request stays on the record with your reason.' end);
end $function$;


CREATE OR REPLACE FUNCTION public.admin_refund_request(p_booking uuid, p_leg text, p_amount_cents integer, p_reason text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_available int; v_id uuid; v_absorb boolean; v_locked uuid; v_blocked text;
begin
  if not public.is_admin() then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;
  if p_leg is null or p_leg not in ('service', 'tip') then
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
end $function$;


CREATE OR REPLACE FUNCTION public.admin_refund_resolve_unknown(p_refund uuid, p_found text, p_processor_id text, p_status text, p_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_r public.refunds;
  v_now timestamptz := clock_timestamp();
  v_status text;
  v_booking_status text;
begin
  if not public.is_admin() then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;
  if p_found is null or p_found not in ('refunded', 'not_refunded') then
    raise exception 'Say which you found: ''refunded'' or ''not_refunded''.' using errcode = 'HW146';
  end if;
  if coalesce(trim(p_note), '') = '' then
    raise exception 'Record how you checked — which processor record you looked at.'
      using errcode = 'HW131';
  end if;
  if p_found = 'refunded' then
    if coalesce(trim(p_processor_id), '') = '' then
      raise exception 'A refund that was taken has a processor id. Record it, or this is not a resolution.'
        using errcode = 'HW147';
    end if;
    if p_status is null or p_status not in ('succeeded', 'pending', 'requires_action') then
      raise exception 'A refund that exists is succeeded, pending or requires_action. "%" is none of those.',
        p_status using errcode = 'HW140';
    end if;
  end if;

  select * into v_r from public.refunds where id = p_refund for update;
  if not found then
    raise exception 'No such refund.' using errcode = 'HW135';
  end if;
  if not v_r.needs_reconciliation then
    raise exception 'This refund has no unknown outcome to resolve.' using errcode = 'HW144';
  end if;

  v_status := case
    when p_found = 'not_refunded' then 'failed'
    when p_status = 'succeeded' then 'succeeded'
    else 'processing'
  end;

  update public.refunds set
    status = v_status,
    processor_status = case when p_found = 'not_refunded' then 'canceled' else p_status end,
    stripe_refund_id = case when p_found = 'refunded' then p_processor_id else stripe_refund_id end,
    needs_reconciliation = false,
    reconcile_note = null,
    failure_reason = case when p_found = 'not_refunded'
      then left(format('Checked at the processor: no refund was taken. %s', p_note), 500)
      else null end,
    updated_at = v_now
  where id = p_refund;

  v_booking_status := public.recompute_booking_payment_status(v_r.booking_id);

  insert into public.audit_log
    (actor_id, action, target_table, target_id, payload, outcome, changes)
  values (
    v_actor, 'refund.outcome_resolved', 'refunds', p_refund::text,
    jsonb_build_object('found', p_found, 'processor_refund_id', p_processor_id,
                       'processor_status', p_status, 'note', p_note,
                       'booking_payment_status', v_booking_status),
    case when p_found = 'refunded' then 'succeeded' else 'failed' end,
    jsonb_build_array(jsonb_build_object('field', 'Status',
      'before', v_r.status, 'after', v_status))
  );

  return jsonb_build_object('resolved', true, 'status', v_status,
    'booking_payment_status', v_booking_status,
    'note', case when p_found = 'refunded'
      then 'Recorded from the processor. The booking is no longer blocked by this.'
      else 'Recorded: the processor never took it. The request is marked failed and the money is still with us.'
    end);
end $function$;


CREATE OR REPLACE FUNCTION public.admin_refund_settle(p_refund uuid, p_status text, p_processor_id text DEFAULT NULL::text, p_detail text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
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
  if p_status is null or p_status not in ('succeeded', 'pending', 'requires_action', 'failed', 'canceled', 'unknown') then
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
end $function$;


CREATE OR REPLACE FUNCTION public.admin_venue_set_permissions(p_id uuid, p_expected timestamp with time zone, p_substitutes_allowed text, p_customer_may_replace text, p_full_party_required text, p_numbers_transferable text, p_source text, p_reason text DEFAULT NULL::text, p_early_turn_policy text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_v public.venues;
  v_changes jsonb := '[]'::jsonb;
  v_any_known boolean;
  v_open int;
  v_now timestamptz := clock_timestamp();
begin
  if not public.is_admin() then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;

  select * into v_v from public.venues where id = p_id for update;
  if not found then
    raise exception 'No such venue.' using errcode = 'HW103';
  end if;

  /* RULE 5. Millisecond precision, because a JS Date carries no more. */
  if p_expected is not null
     and date_trunc('milliseconds', v_v.updated_at) <> date_trunc('milliseconds', p_expected) then
    raise exception 'Somebody else changed this venue while you were editing it. Reload before saving.'
      using errcode = 'HW080';
  end if;

  if p_substitutes_allowed is null or p_substitutes_allowed not in ('allowed', 'refused', 'unknown')
     or p_customer_may_replace is null or p_customer_may_replace not in ('allowed', 'refused', 'unknown')
     or p_full_party_required is null or p_full_party_required not in ('allowed', 'refused', 'unknown')
     or p_numbers_transferable is null or p_numbers_transferable not in ('allowed', 'refused', 'unknown') then
    raise exception 'An answer is allowed, refused, or unknown. Nothing else.'
      using errcode = 'HW104';
  end if;

  v_any_known := p_substitutes_allowed <> 'unknown'
    or p_customer_may_replace <> 'unknown'
    or p_full_party_required <> 'unknown'
    or p_numbers_transferable <> 'unknown';

  /*
    RULE 2. The missing source is checked first because it is the
    operator's own omission and they can fix it; a session with no
    verified identity is reported after, and separately.

    That second check also covers what the table already knew:
    venues_confirmed_attribution (0074) refuses a recorded answer with
    no confirmer, so an unidentified caller would otherwise hit a
    constraint violation — a 500 and a stack trace where the operator
    needed a sentence.
  */
  if v_any_known and coalesce(trim(p_source), '') = '' then
    raise exception 'Recording an answer needs a source: who told us, and how. An answer with no evidence is somebody''s memory of a phone call.'
      using errcode = 'HW105';
  end if;
  if v_any_known and v_actor is null then
    raise exception 'Recording an answer has to be attributable to the person who recorded it, and this session has no verified identity. Sign in again.'
      using errcode = 'HW107';
  end if;

  /* Only the fields that moved, with the value they moved from. */
  if v_v.substitutes_allowed::text <> p_substitutes_allowed then
    v_changes := v_changes || jsonb_build_object('field', 'Stand-ins allowed',
      'before', v_v.substitutes_allowed::text, 'after', p_substitutes_allowed);
  end if;
  if v_v.customer_may_replace::text <> p_customer_may_replace then
    v_changes := v_changes || jsonb_build_object('field', 'Customer may swap in',
      'before', v_v.customer_may_replace::text, 'after', p_customer_may_replace);
  end if;
  if v_v.full_party_required::text <> p_full_party_required then
    v_changes := v_changes || jsonb_build_object('field', 'Full party required',
      'before', v_v.full_party_required::text, 'after', p_full_party_required);
  end if;
  if v_v.numbers_transferable::text <> p_numbers_transferable then
    v_changes := v_changes || jsonb_build_object('field', 'Numbers transferable',
      'before', v_v.numbers_transferable::text, 'after', p_numbers_transferable);
  end if;
  if p_early_turn_policy is not null
     and coalesce(v_v.early_turn_policy, '') <> p_early_turn_policy then
    v_changes := v_changes || jsonb_build_object('field', 'Early turn policy',
      'before', coalesce(v_v.early_turn_policy, 'not recorded'), 'after', p_early_turn_policy);
  end if;

  if jsonb_array_length(v_changes) = 0 then
    raise exception 'Nothing changed.' using errcode = 'HW106';
  end if;

  update public.venues set
    substitutes_allowed  = p_substitutes_allowed::venue_permission,
    customer_may_replace = p_customer_may_replace::venue_permission,
    full_party_required  = p_full_party_required::venue_permission,
    numbers_transferable = p_numbers_transferable::venue_permission,
    early_turn_policy    = coalesce(p_early_turn_policy, early_turn_policy),
    notes                = case when coalesce(trim(p_source), '') = '' then notes
                                else trim(p_source) end,
    /* An attributed confirmation, or none at all. The table's own
       constraint refuses the half-way state. */
    confirmed_by = case when v_any_known then v_actor else null end,
    confirmed_at = case when v_any_known then v_now else null end,
    updated_at   = v_now
  where id = p_id;

  /*
    RULE 3. What this change touches, counted but NOT acted on.

    A request records its venue as free text in the intake, which is
    also how lookup_venue finds it — so the same normalisation answers
    "which open requests are at this venue".
  */
  select count(*) into v_open
  from public.requests r
  where r.service_id = 'wait-in-line'
    and r.status::text in ('pending', 'matched', 'accepted', 'scheduled')
    and public.normalize_municipality(coalesce(r.intake ->> 'venue_name', '')) = v_v.name_key;

  insert into public.audit_log
    (actor_id, action, target_table, target_id, payload, outcome, changes)
  values (
    v_actor, 'venue.permissions_recorded', 'venues', p_id::text,
    jsonb_build_object(
      'name', v_v.name, 'source', p_source, 'reason', p_reason,
      'open_requests_at_venue', v_open),
    'succeeded', v_changes
  );

  return jsonb_build_object(
    'fields_changed', jsonb_array_length(v_changes),
    'open_requests_at_venue', v_open,
    'confirmed', v_any_known,
    'updated_at', v_now,
    'note', case
      when v_open = 0 then 'No open request is waiting at this venue.'
      else format('%s open request(s) name this venue. Nothing has been cancelled and no money has moved — operations should look at them.', v_open)
    end
  );
end $function$;


CREATE OR REPLACE FUNCTION public.ingest_refund_event(p_processor_id text, p_booking uuid, p_leg text, p_amount_cents integer, p_status text, p_operation text DEFAULT NULL::text, p_reason text DEFAULT NULL::text, p_event_id text DEFAULT NULL::text, p_event_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
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
  if p_status is null or p_status not in ('succeeded', 'pending', 'requires_action', 'failed', 'canceled') then
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
end $function$;


/* ------------------------------------------------------------------ *
 * SELF-TEST                                                           *
 * ------------------------------------------------------------------ */
/* The cases that passed before: a NULL answer must change nothing and
   must leave the block exactly where it was. */
do $selftest$
declare
  v_c uuid; v_h uuid; v_s text; v_bk uuid;
  v_r jsonb; v_id uuid; v_u timestamptz; v_before text; v_events int;
begin
  begin
    perform set_config('request.jwt.claims', '{"app_metadata":{"role":"admin"}}', true);
    select p.id into v_c from public.profiles p limit 1;
    select pp.user_id into v_h from public.provider_profiles pp limit 1;
    select sv.id into v_s from public.services sv limit 1;
    if v_c is null or v_h is null or v_s is null then
      raise exception 'this test needs a profile, a provider and a service.';
    end if;

    insert into public.bookings (customer_id, provider_id, service_id, status,
      base_price_cents, total_cents, tip_cents, platform_fee_cents, payout_cents,
      currency, payment_status, captured_at, stripe_payment_intent_id)
    values (v_c, v_h, v_s, 'completed', 22000, 22450, 0, 4850, 17600,
            'CAD', 'captured', now(), 'pi_null_guard')
    returning id into v_bk;

    v_r := public.admin_refund_request(v_bk, 'service', 500, 'goodwill');
    v_id := (v_r ->> 'refund_id')::uuid;
    select updated_at into v_u from public.refunds where id = v_id;
    perform public.admin_refund_decide(v_id, v_u, true, 'Agreed.');
    perform public.admin_refund_settle(v_id, 'unknown', null, 'No answer.');

    select count(*) into v_events from public.audit_log where target_id = v_id::text;
    v_before := (select status || '|' || coalesce(processor_status, '-') || '|' ||
                 coalesce(stripe_refund_id, '-') || '|' || needs_reconciliation::text
                 from public.refunds where id = v_id);

    /* A NULL finding. */
    begin
      perform public.admin_refund_resolve_unknown(v_id, null, 're_x', 'succeeded', 'I checked.');
      raise exception 'a NULL finding resolved an unknown outcome';
    exception when sqlstate 'HW146' then null;
    end;

    /* A NULL processor status, with a finding that needs one. */
    begin
      perform public.admin_refund_resolve_unknown(v_id, 'refunded', 're_x', null, 'I checked.');
      raise exception 'a NULL processor status resolved an unknown outcome';
    exception when sqlstate 'HW140' then null;
    end;

    /* NOTHING MOVED, and no resolution was recorded. */
    if (select status || '|' || coalesce(processor_status, '-') || '|' ||
        coalesce(stripe_refund_id, '-') || '|' || needs_reconciliation::text
        from public.refunds where id = v_id) <> v_before then
      raise exception 'a refused input changed the row anyway';
    end if;
    if public.booking_refunds_blocked(v_bk) is null then
      raise exception 'a refused input unblocked the booking';
    end if;
    if (select count(*) from public.audit_log where target_id = v_id::text) <> v_events then
      raise exception 'a refused input wrote an audit entry';
    end if;

    /* A complete answer still works. */
    v_r := public.admin_refund_resolve_unknown(v_id, 'refunded', 're_real', 'succeeded',
      'Stripe shows re_real against pi_null_guard.');
    if public.booking_refunds_blocked(v_bk) is not null then
      raise exception 'a complete answer did not unblock the booking';
    end if;

    /* A NULL approval is not a decline. */
    v_r := public.admin_refund_request(v_bk, 'service', 100, 'goodwill');
    v_id := (v_r ->> 'refund_id')::uuid;
    select updated_at into v_u from public.refunds where id = v_id;
    begin
      perform public.admin_refund_decide(v_id, v_u, null, 'Agreed.');
      raise exception 'a NULL answer was accepted as a decision';
    exception when sqlstate 'HW148' then null;
    end;
    if (select status from public.refunds where id = v_id) <> 'awaiting_review' then
      raise exception 'a refused decision changed the request anyway';
    end if;

    /* And the siblings reject NULL too. */
    begin
      perform public.admin_refund_request(v_bk, null, 100, 'goodwill');
      raise exception 'a NULL leg was accepted';
    exception when sqlstate 'HW130' then null;
    end;
    begin
      perform public.admin_refund_settle(v_id, null);
      raise exception 'a NULL settlement status was accepted';
    exception when sqlstate 'HW138' then null;
    end;

    raise exception using errcode = 'HW999', message = 'self-test complete';
  exception
    when sqlstate 'HW999' then
      raise notice 'null guards: a missing finding, a missing processor status, a missing leg and a missing decision are all refused, the row and the block are untouched, and nothing is written to the trail';
    when others then
      raise;
  end;
end $selftest$;
