-- CLASS: pre-deploy
-- =========================================================================
-- 0120 — the processor's own events, recorded once and acted on correctly
-- =========================================================================
/*
  THREE FAILURES IN THE WEBHOOK, all of the same family: it believed
  something about money without checking, and then said "ok".

  1. A PARTIAL REFUND WAS WRITTEN DOWN AS A FULL ONE. Stripe fires
     `charge.refunded` for ANY refund, partial included. The handler
     set payment_status = 'refunded' unconditionally, so CA$5 back on
     a CA$224.50 charge marked the whole booking refunded — and
     depending on which arrived first, overwrote the correct
     'partial_refund' that 0119 had just written.

  2. A PENDING REFUND NEVER FINISHED. There was no `refund.updated`
     branch at all, so a refund that completed hours later was
     acknowledged with 200 and never recorded. Reconciliation did not
     rescue it either: that script skips any processor id it has
     already seen, which is exactly the id of the pending row waiting
     to be advanced.

  3. A FAILED WRITE WAS ACKNOWLEDGED. Every call ignored its error and
     the catch returned 200, so an event that could not be recorded
     was told to Stripe as handled and never retried.

  WHAT THIS FILE PROVIDES.

  A table that records each event before it is acted on, so a retry is
  safe and an unprocessed event is visible; and one function that takes
  a refund as the processor describes it and makes the ledger agree
  with it — matching an existing request where there is one, inserting
  a row where somebody refunded from the Stripe dashboard, and
  recomputing the booking from the LEDGER rather than from the event in
  hand.

  THE BOOKING IS NEVER DECIDED BY ONE EVENT. A booking has two charges
  — the service and the tip — and an event knows about one. "Fully
  refunded" is a statement about both, so it is computed from the sum
  of what has actually succeeded against the total of what was
  actually captured.
*/

create table if not exists public.stripe_webhook_events (
  id           text primary key,          -- Stripe's own event id
  type         text not null,
  livemode     boolean,
  received_at  timestamptz not null default clock_timestamp(),
  processed_at timestamptz,
  attempts     integer not null default 0,
  last_error   text,
  payload      jsonb
);

create index if not exists stripe_webhook_events_unprocessed_idx
  on public.stripe_webhook_events (received_at)
  where processed_at is null;

alter table public.stripe_webhook_events enable row level security;
drop policy if exists stripe_webhook_events_admin on public.stripe_webhook_events;
create policy stripe_webhook_events_admin on public.stripe_webhook_events
  for select using (public.is_admin());
revoke all on public.stripe_webhook_events from anon, authenticated;
grant select on public.stripe_webhook_events to authenticated;

comment on table public.stripe_webhook_events is
  'Every verified Stripe event, recorded before it is acted on. processed_at is null for anything that failed — those are retried rather than forgotten.';

/* ------------------------------------------------------------------ *
 * THE BOOKING FOLLOWS THE LEDGER                                      *
 * ------------------------------------------------------------------ */
/*
  One place, used by settlement and by event ingestion, so the two can
  never disagree. Both charges count: a service refund does not make a
  booking "fully refunded" while its tip is untouched.
*/
create or replace function public.recompute_booking_payment_status(p_booking uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_b public.bookings;
  v_refunded int;
  v_captured int;
  v_status text;
begin
  select * into v_b from public.bookings where id = p_booking for update;
  if not found then return null; end if;
  if v_b.captured_at is null then return v_b.payment_status::text; end if;

  select coalesce(sum(amount_cents), 0) into v_refunded
  from public.refunds
  where booking_id = p_booking and status = 'succeeded';

  v_captured := coalesce(v_b.total_cents, 0) + coalesce(v_b.tip_cents, 0);

  v_status := case
    when v_refunded <= 0 then 'captured'
    when v_refunded >= v_captured then 'refunded'
    else 'partial_refund'
  end;

  update public.bookings
  set payment_status = v_status::public.payment_status
  where id = p_booking;

  return v_status;
end $$;

/* ------------------------------------------------------------------ *
 * INGEST ONE REFUND AS THE PROCESSOR DESCRIBES IT                     *
 * ------------------------------------------------------------------ */
/*
  MATCHING, IN ORDER OF HOW SURE WE ARE:

    1. the processor id, if we have already recorded it;
    2. the operation id we put in the refund's metadata — this is how a
       request whose response never arrived finds its own refund, which
       is the whole point of flagging it rather than guessing;
    3. an approved request of the same booking, leg and amount that is
       still processing;
    4. nothing matches, so this refund was issued somewhere else — the
       Stripe dashboard, most likely — and is recorded as its own row
       rather than dropped.

  A reconciliation flag is cleared ONLY on 1 or 2: those are the cases
  where we have actually identified the refund we were unsure about.
*/
create or replace function public.ingest_refund_event(
  p_processor_id text,
  p_booking      uuid,
  p_leg          text,
  p_amount_cents integer,
  p_status       text,
  p_operation    text default null,
  p_reason       text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_r public.refunds;
  v_match text;
  v_new_status text;
  v_booking_status text;
begin
  if p_booking is null then
    return jsonb_build_object('matched', 'no_booking', 'changed', false);
  end if;
  if p_status not in ('succeeded', 'pending', 'failed', 'canceled') then
    raise exception 'Unknown processor refund status "%".', p_status using errcode = 'HW140';
  end if;

  perform 1 from public.bookings where id = p_booking for update;

  select * into v_r from public.refunds
  where stripe_refund_id = p_processor_id limit 1;
  if found then v_match := 'processor_id'; end if;

  if v_r.id is null and p_operation is not null then
    begin
      select * into v_r from public.refunds where id = p_operation::uuid limit 1;
    exception when invalid_text_representation then
      v_r := null;
    end;
    if v_r.id is not null then v_match := 'operation'; end if;
  end if;

  if v_r.id is null then
    select * into v_r from public.refunds
    where booking_id = p_booking and leg = p_leg and amount_cents = p_amount_cents
      and status = 'processing'
    order by updated_at desc limit 1;
    if v_r.id is not null then v_match := 'amount'; end if;
  end if;

  v_new_status := case p_status
    when 'succeeded' then 'succeeded'
    when 'pending'   then 'processing'
    else 'failed'
  end;

  if v_r.id is null then
    /* Issued outside this console. Recorded, not ignored. */
    insert into public.refunds
      (booking_id, leg, amount_cents, reason, status, processor_status,
       stripe_refund_id, requested_at, decided_at, internal_note,
       absorb_helper_share, updated_at)
    values (p_booking, p_leg, p_amount_cents, coalesce(p_reason, 'goodwill'),
            v_new_status, p_status, p_processor_id,
            clock_timestamp(), clock_timestamp(),
            'Recorded from a processor event. This refund was not requested in this console.',
            null, clock_timestamp())
    returning * into v_r;
    v_match := 'created';
  else
    update public.refunds set
      status = v_new_status,
      processor_status = p_status,
      stripe_refund_id = coalesce(p_processor_id, stripe_refund_id),
      /* Cleared only when we actually identified it. */
      needs_reconciliation = case
        when v_match in ('processor_id', 'operation') then false
        else needs_reconciliation end,
      reconcile_note = case
        when v_match in ('processor_id', 'operation') then null
        else reconcile_note end,
      failure_reason = case when p_status in ('failed', 'canceled')
        then coalesce(failure_reason, format('The processor returned %s.', p_status))
        else null end,
      updated_at = clock_timestamp()
    where id = v_r.id
    returning * into v_r;
  end if;

  /* THE BOOKING IS COMPUTED, NEVER ASSERTED BY ONE EVENT. */
  v_booking_status := public.recompute_booking_payment_status(p_booking);

  insert into public.audit_log
    (actor_id, action, target_table, target_id, payload, outcome)
  values (
    null,
    case p_status when 'succeeded' then 'refund.confirmed'
                  when 'pending' then 'refund.pending'
                  else 'refund.failed' end,
    'refunds', v_r.id::text,
    jsonb_build_object('source', 'stripe_webhook', 'matched_by', v_match,
                       'processor_refund_id', p_processor_id,
                       'processor_status', p_status,
                       'amount_cents', p_amount_cents, 'leg', p_leg,
                       'booking_payment_status', v_booking_status),
    case p_status when 'succeeded' then 'succeeded'
                  when 'pending' then 'submitted'
                  else 'failed' end
  );

  return jsonb_build_object(
    'matched', v_match,
    'refund_id', v_r.id,
    'status', v_new_status,
    'booking_payment_status', v_booking_status,
    'changed', true
  );
end $$;

revoke all on function public.recompute_booking_payment_status(uuid) from public;
revoke all on function public.ingest_refund_event(text, uuid, text, integer, text, text, text) from public;
grant execute on function public.recompute_booking_payment_status(uuid) to service_role;
grant execute on function public.ingest_refund_event(text, uuid, text, integer, text, text, text) to service_role;

/* ------------------------------------------------------------------ *
 * SELF-TEST                                                           *
 * ------------------------------------------------------------------ */
/* It brings its own booking, like 0119's — depending on found data is
   how a self-test skips itself and lets a bug reach production. */
do $$
declare
  v_customer uuid; v_helper uuid; v_service text;
  v_booking uuid; v_r jsonb; v_id uuid; v_u timestamptz;
begin
  begin
    perform set_config('request.jwt.claims', '{"app_metadata":{"role":"admin"}}', true);

    select p.id into v_customer from public.profiles p limit 1;
    select pp.user_id into v_helper from public.provider_profiles pp limit 1;
    select sv.id into v_service from public.services sv limit 1;
    if v_customer is null or v_helper is null or v_service is null then
      raise exception 'the ingest test needs a profile, a provider and a service.';
    end if;

    /* CA$224.50 service plus a CA$10.00 tip. */
    insert into public.bookings
      (customer_id, provider_id, service_id, status, base_price_cents, total_cents,
       tip_cents, platform_fee_cents, payout_cents, currency, payment_status,
       captured_at, stripe_payment_intent_id, tip_payment_intent_id)
    values (v_customer, v_helper, v_service, 'completed', 22000, 22450, 1000,
            4850, 17600, 'CAD', 'captured', now(), 'pi_ingest_svc', 'pi_ingest_tip')
    returning id into v_booking;

    /* THE FAILURE THIS FILE EXISTS FOR: CA$5 back is not a full refund. */
    v_r := public.ingest_refund_event('re_part_1', v_booking, 'service', 500, 'succeeded');
    if (v_r ->> 'booking_payment_status') <> 'partial_refund' then
      raise exception 'CA$5.00 of CA$234.50 was recorded as %', v_r ->> 'booking_payment_status';
    end if;
    if (v_r ->> 'matched') <> 'created' then
      raise exception 'an unknown refund should be recorded, not matched: %', v_r ->> 'matched';
    end if;

    /* The same event again changes nothing and is still partial. */
    v_r := public.ingest_refund_event('re_part_1', v_booking, 'service', 500, 'succeeded');
    if (v_r ->> 'matched') <> 'processor_id' then
      raise exception 'a repeated event did not match its own refund: %', v_r ->> 'matched';
    end if;
    if (select count(*) from public.refunds where booking_id = v_booking) <> 1 then
      raise exception 'a repeated event created a second row';
    end if;

    /* A PENDING REQUEST IS ADVANCED BY ITS OPERATION ID — the case the
       old reconciliation skipped because it already knew the id. */
    v_r := public.admin_refund_request(v_booking, 'tip', 500, 'goodwill');
    v_id := (v_r ->> 'refund_id')::uuid;
    select updated_at into v_u from public.refunds where id = v_id;
    perform public.admin_refund_decide(v_id, v_u, true, 'Agreed.');
    perform public.admin_refund_settle(v_id, 'unknown', null, 'The processor did not answer.');
    if not (select needs_reconciliation from public.refunds where id = v_id) then
      raise exception 'the unknown outcome was not flagged';
    end if;

    v_r := public.ingest_refund_event('re_tip_1', v_booking, 'tip', 500, 'succeeded', v_id::text);
    if (v_r ->> 'matched') <> 'operation' then
      raise exception 'the event did not find its request by operation id: %', v_r ->> 'matched';
    end if;
    if (select needs_reconciliation from public.refunds where id = v_id) then
      raise exception 'the flag was not cleared once the refund was identified';
    end if;
    if (select stripe_refund_id from public.refunds where id = v_id) <> 're_tip_1' then
      raise exception 'the processor id was not recorded on the matched request';
    end if;

    /* CA$10.00 of CA$234.50 is still partial. */
    if (select payment_status::text from public.bookings where id = v_booking) <> 'partial_refund' then
      raise exception 'two partial refunds were read as a full one';
    end if;

    /* Now refund the rest, across BOTH charges, and only then is it full. */
    perform public.ingest_refund_event('re_rest_svc', v_booking, 'service', 21950, 'succeeded');
    perform public.ingest_refund_event('re_rest_tip', v_booking, 'tip', 500, 'succeeded');
    if (select payment_status::text from public.bookings where id = v_booking) <> 'refunded' then
      raise exception 'everything was refunded and the booking does not say so: %',
        (select payment_status::text from public.bookings where id = v_booking);
    end if;

    /* A refund that fails later takes the booking back down with it. */
    perform public.ingest_refund_event('re_rest_tip', v_booking, 'tip', 500, 'failed');
    if (select payment_status::text from public.bookings where id = v_booking) <> 'partial_refund' then
      raise exception 'a reversed failure left the booking fully refunded';
    end if;

    /* An invented status is refused rather than coerced. */
    begin
      perform public.ingest_refund_event('re_x', v_booking, 'service', 100, 'probably fine');
      raise exception 'an invented processor status was accepted';
    exception when sqlstate 'HW140' then null;
    end;

    raise exception using errcode = 'HW999', message = 'self-test complete';
  exception
    when sqlstate 'HW999' then
      raise notice 'refund ingest: partial stays partial, repeats are idempotent, an unknown outcome is matched by its operation id, both charges decide "fully refunded", and a later failure reverses it — nothing left behind';
    when others then
      raise;
  end;
end $$;

/* Attempt counting, so a repeatedly-failing event is visible rather
   than merely absent from the processed list. */
create or replace function public.bump_webhook_attempt(p_event text)
returns void
language sql
security definer
set search_path = public, pg_catalog
as $$
  update public.stripe_webhook_events
  set attempts = attempts + 1
  where id = p_event;
$$;

revoke all on function public.bump_webhook_attempt(text) from public;
grant execute on function public.bump_webhook_attempt(text) to service_role;

/* ------------------------------------------------------------------ *
 * A ROW APPROVED WHILE SENDING WAS OFF                                *
 * ------------------------------------------------------------------ */
/*
  Returns what is needed to send an already-approved refund, and
  refuses anything that is not in that state — including one that has
  already been handed to the processor, which is the case that would
  otherwise become a second refund.
*/
create or replace function public.admin_refund_ready_to_send(p_refund uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_r public.refunds;
begin
  if not public.is_admin() then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;

  select * into v_r from public.refunds where id = p_refund for update;
  if not found then
    raise exception 'No such refund request.' using errcode = 'HW135';
  end if;
  if v_r.status <> 'processing' then
    raise exception 'Only an approved refund can be sent. This one is %.', v_r.status
      using errcode = 'HW136';
  end if;
  if v_r.stripe_refund_id is not null then
    raise exception 'This refund has already been handed to the processor (%). Sending it again would refund the money twice.',
      v_r.stripe_refund_id using errcode = 'HW141';
  end if;
  if v_r.needs_reconciliation then
    raise exception 'This refund has an unknown outcome and must be reconciled against the processor before anything else is sent.'
      using errcode = 'HW139';
  end if;

  return jsonb_build_object(
    'booking_id', v_r.booking_id,
    'leg', v_r.leg,
    'amount_cents', v_r.amount_cents,
    'absorb_helper_share', coalesce(v_r.absorb_helper_share, false)
  );
end $$;

revoke all on function public.admin_refund_ready_to_send(uuid) from public;
grant execute on function public.admin_refund_ready_to_send(uuid) to authenticated;
