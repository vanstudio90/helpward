-- CLASS: pre-deploy
-- =========================================================================
-- 0123 — who may release a claim, which claim, and what a reason proves
-- =========================================================================
/*
  Four faults, two of them introduced by 0122 while fixing something
  else. All four were found by running the functions rather than
  reading them, and three are about the same mistake in different
  places: trusting that the caller is who the UI assumed.

  1. ANY SIGNED-IN USER COULD RELEASE A SEND CLAIM. The release
     function was `security definer`, granted to `authenticated`, and
     had no admin check at all — because it was written as a tidy-up
     helper for an action that had already checked. An exposed RPC is
     not protected by the screen that usually calls it. Reproduced
     under SET ROLE authenticated against the real database.

  2. AN EXPIRED SENDER COULD RELEASE A NEWER SENDER'S LEASE. Release
     took only a refund id, so sender A — whose lease had expired and
     whose work was finished — cleared sender B's live token on its
     way out. The lease stopped being exclusive at exactly the moment
     exclusivity mattered. Release now requires the token it was
     given, and clears nothing if it no longer holds it.

  3. RESOLVING AN IDENTITY PROBLEM ERASED AN UNRESOLVED PAYMENT ONE.
     0122 made clearing a quarantine also clear needs_reconciliation,
     on the reasoning that resolving a quarantine means checking the
     processor. That is true of the IDENTITY question and says nothing
     about the OUTCOME: a row can have a quarantined identity AND an
     unknown result, and a free-text note — even one that says in
     words that the outcome is unknown — cleared the block anyway.

     They are separate now. Clearing a quarantine clears a quarantine.
     An unknown outcome is resolved by recording WHAT WAS FOUND at the
     processor: an id and a status, not a sentence.

  4. APPROVAL WAS LEFT BEHIND. 0122 moved requesting and sending onto
     booking_refunds_blocked() and did not move approving, whose last
     definition was in 0119. So a booking with an unresolved
     quarantine blocked a request and a send, and approved anyway —
     which is the exact drift that predicate exists to prevent.
*/

/* ------------------------------------------------------------------ *
 * 1 AND 2 — RELEASING A CLAIM                                         *
 * ------------------------------------------------------------------ */
drop function if exists public.admin_refund_release_claim(uuid);

create or replace function public.admin_refund_release_claim(
  p_refund uuid,
  p_token  uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_released boolean;
begin
  /* The screen is not the check. */
  if not public.is_admin() then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;
  if p_token is null then
    raise exception 'Releasing a claim needs the token it was issued with.'
      using errcode = 'HW145';
  end if;

  /*
    FENCED. Only the holder of the CURRENT token may release it, so a
    sender whose lease expired cannot clear the lease of whoever
    picked the work up afterwards.
  */
  update public.refunds
  set send_claim_token = null, send_claimed_at = null
  where id = p_refund and send_claim_token = p_token;

  get diagnostics v_released = row_count;

  return jsonb_build_object(
    'released', v_released,
    'note', case when v_released
      then 'Claim released.'
      else 'Nothing released: this claim is no longer the current one. Somebody else holds it, or it was already given back.'
    end);
end $$;

revoke all on function public.admin_refund_release_claim(uuid, uuid) from public;
grant execute on function public.admin_refund_release_claim(uuid, uuid) to authenticated;

/* ------------------------------------------------------------------ *
 * 3 — IDENTITY AND OUTCOME ARE DIFFERENT QUESTIONS                    *
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
    THIS CLEARS A QUARANTINE AND NOTHING ELSE.

    0122 cleared needs_reconciliation here too. That conflated two
    questions: "is this event about this refund" and "did the money
    move". A row can have a wrong-identity event AND an unknown
    outcome, and a note saying "the outcome is still unknown" would
    have unblocked the booking anyway. Whether money moved is settled
    by recording what the processor says, not by a sentence —
    admin_refund_resolve_unknown does that.
  */
  update public.refunds set
    quarantine_cleared_at = clock_timestamp(),
    quarantine_cleared_by = v_actor,
    updated_at = clock_timestamp()
  where id = p_refund;

  insert into public.audit_log
    (actor_id, action, target_table, target_id, payload, outcome)
  values (v_actor, 'refund.quarantine_cleared', 'refunds', p_refund::text,
          jsonb_build_object('reason', p_reason, 'quarantine', v_r.quarantine_note,
                             'outcome_still_unknown', v_r.needs_reconciliation),
          'succeeded');

  return jsonb_build_object(
    'cleared', true,
    'outcome_still_unknown', v_r.needs_reconciliation,
    'note', case when v_r.needs_reconciliation
      then 'Identity resolved. This refund still has an UNKNOWN PROCESSOR OUTCOME, so the booking stays blocked until what the processor actually did is recorded.'
      else 'Cleared. The booking is no longer blocked by this quarantine.'
    end);
end $$;

revoke all on function public.admin_refund_clear_quarantine(uuid, text) from public;
grant execute on function public.admin_refund_clear_quarantine(uuid, text) to authenticated;

/*
  RESOLVING AN UNKNOWN OUTCOME MEANS SAYING WHAT YOU FOUND.

  The question is "did the processor take this money", and the only
  answers that settle it come FROM the processor: a refund id and a
  status, or a verified finding that no refund exists. A free-text
  note is what somebody writes when they have not looked.
*/
create or replace function public.admin_refund_resolve_unknown(
  p_refund       uuid,
  p_found        text,             -- 'refunded' | 'not_refunded'
  p_processor_id text,
  p_status       text,
  p_note         text
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
  v_status text;
  v_booking_status text;
begin
  if not public.is_admin() then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;
  if p_found not in ('refunded', 'not_refunded') then
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
    if p_status not in ('succeeded', 'pending', 'requires_action') then
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
end $$;

revoke all on function public.admin_refund_resolve_unknown(uuid, text, text, text, text) from public;
grant execute on function public.admin_refund_resolve_unknown(uuid, text, text, text, text) to authenticated;

/* ------------------------------------------------------------------ *
 * 4 — APPROVAL JOINS THE OTHERS                                       *
 * ------------------------------------------------------------------ */
/*
  Requesting and sending moved onto booking_refunds_blocked() in 0122.
  Approving did not, so its last definition — 0119's — still carried
  its own `exists (… needs_reconciliation)` test, and a booking with an
  unresolved quarantine refused a request, refused a send, and
  approved. One predicate exists so the three cannot drift; leaving one
  behind is how they drift.
*/
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
end $$;

revoke all on function public.admin_refund_decide(uuid, timestamptz, boolean, text) from public;
grant execute on function public.admin_refund_decide(uuid, timestamptz, boolean, text) to authenticated;

/* ------------------------------------------------------------------ *
 * SELF-TEST                                                           *
 * ------------------------------------------------------------------ */
do $$
declare
  v_c uuid; v_h uuid; v_s text; v_bk uuid;
  v_r jsonb; v_id uuid; v_u timestamptz; v_tok uuid; v_tok2 uuid; v_q uuid;
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
      currency, payment_status, captured_at, stripe_payment_intent_id, tip_payment_intent_id)
    values (v_c, v_h, v_s, 'completed', 22000, 22450, 1000, 4850, 17600,
            'CAD', 'captured', now(), 'pi_r_svc', 'pi_r_tip')
    returning id into v_bk;

    /* ---- 1. A NON-ADMIN CANNOT RELEASE A CLAIM ---- */
    v_r := public.admin_refund_request(v_bk, 'service', 500, 'goodwill');
    v_id := (v_r ->> 'refund_id')::uuid;
    select updated_at into v_u from public.refunds where id = v_id;
    perform public.admin_refund_decide(v_id, v_u, true, 'Agreed.');
    v_r := public.admin_refund_ready_to_send(v_id);
    v_tok := (v_r ->> 'claim_token')::uuid;

    /* No admin claim at all: the RPC must refuse on its own. */
    perform set_config('request.jwt.claims', '', true);
    begin
      perform public.admin_refund_release_claim(v_id, v_tok);
      raise exception 'a caller with no admin claim released a send claim';
    exception when sqlstate '42501' then null;
    end;
    if (select send_claim_token from public.refunds where id = v_id) is null then
      raise exception 'the claim was cleared by a refused call';
    end if;
    perform set_config('request.jwt.claims', '{"app_metadata":{"role":"admin"}}', true);

    /* ---- 2. AN EXPIRED SENDER CANNOT RELEASE A NEWER LEASE ---- */
    update public.refunds
    set send_claimed_at = clock_timestamp() - public.refund_send_lease() - interval '1 minute'
    where id = v_id;
    v_r := public.admin_refund_ready_to_send(v_id);      -- sender B claims
    v_tok2 := (v_r ->> 'claim_token')::uuid;
    if v_tok2 = v_tok then
      raise exception 'the re-claim reused the old token';
    end if;

    v_r := public.admin_refund_release_claim(v_id, v_tok);   -- sender A, too late
    if (v_r ->> 'released')::boolean then
      raise exception 'an expired sender released a newer sender''s lease';
    end if;
    if (select send_claim_token from public.refunds where id = v_id) <> v_tok2 then
      raise exception 'the newer lease was cleared by the older sender';
    end if;

    /* The holder of the current token releases it. */
    v_r := public.admin_refund_release_claim(v_id, v_tok2);
    if not (v_r ->> 'released')::boolean then
      raise exception 'the current holder could not release its own claim';
    end if;

    /* ---- 3. IDENTITY AND OUTCOME STAY SEPARATE ---- */
    perform public.admin_refund_settle(v_id, 'unknown', null, 'No answer from the processor.');
    update public.refunds set quarantine_note = 'An event disagreed about the leg.',
      quarantine_cleared_at = null where id = v_id;

    v_r := public.admin_refund_clear_quarantine(v_id,
      'Checked Stripe: the event was a replay of another charge. The outcome of THIS refund is still unknown.');
    if not (v_r ->> 'outcome_still_unknown')::boolean then
      raise exception 'the caller was not told the outcome is still unknown';
    end if;
    if not (select needs_reconciliation from public.refunds where id = v_id) then
      raise exception 'resolving an identity problem erased an unresolved payment outcome';
    end if;
    if public.booking_refunds_blocked(v_bk) is null then
      raise exception 'the booking was unblocked while the outcome was still unknown';
    end if;

    /* Resolving the OUTCOME needs what was found, not a sentence. */
    begin
      perform public.admin_refund_resolve_unknown(v_id, 'refunded', '', 'succeeded', 'I looked.');
      raise exception 'an outcome was resolved as refunded with no processor id';
    exception when sqlstate 'HW147' then null;
    end;
    v_r := public.admin_refund_resolve_unknown(v_id, 'refunded', 're_found', 'succeeded',
      'Stripe shows re_found against pi_r_svc.');
    if public.booking_refunds_blocked(v_bk) is not null then
      raise exception 'the booking stayed blocked after both problems were resolved';
    end if;
    if (select stripe_refund_id from public.refunds where id = v_id) <> 're_found' then
      raise exception 'the processor id found during reconciliation was not recorded';
    end if;

    /* ---- 4. APPROVAL USES THE SHARED PREDICATE ---- */
    v_r := public.admin_refund_request(v_bk, 'tip', 200, 'goodwill');
    v_q := (v_r ->> 'refund_id')::uuid;
    select updated_at into v_u from public.refunds where id = v_q;
    /* A quarantine with needs_reconciliation FALSE — the case 0119's
       own check could not see. */
    update public.refunds set quarantine_note = 'Disagreed about the booking.',
      quarantine_cleared_at = null, needs_reconciliation = false where id = v_id;
    begin
      perform public.admin_refund_decide(v_q, v_u, true, 'Agreed.');
      raise exception 'a refund was approved on a booking with an unresolved quarantine';
    exception when sqlstate 'HW139' then null;
    end;
    /* Declining is still allowed: a block is a reason not to send
       money, not a reason to trap the queue. */
    perform public.admin_refund_decide(v_q, v_u, false, 'Not going ahead.');
    if (select status from public.refunds where id = v_q) <> 'cancelled' then
      raise exception 'a decline was refused on a blocked booking';
    end if;

    raise exception using errcode = 'HW999', message = 'self-test complete';
  exception
    when sqlstate 'HW999' then
      raise notice 'claims and outcomes: release needs admin AND the current token, an expired sender cannot clear a newer lease, identity and outcome resolve separately, and approval blocks on the same predicate as request and send while a decline still goes through';
    when others then
      raise;
  end;
end $$;
