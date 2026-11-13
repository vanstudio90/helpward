-- CLASS: pre-deploy
-- =========================================================================
-- 0129 — a capture nobody heard back from, and a read I broke
-- =========================================================================
/*
  TWO THINGS A REAL JOURNEY FOUND THAT NO FAULT INJECTION HAD.

  1. A LOST CAPTURE RESPONSE LEFT THE BOOKING HALF-WRITTEN. Stripe
     took the CA$22.45 cancellation fee; the response never arrived.
     The customer was told, correctly, that we could not confirm it.
     Then the webhook arrived and set payment_status = captured and
     NOTHING ELSE — so the booking read captured with captured_at
     null, cancellation_fee_cents null, and the stale "Payment failed.
     Please try again." still sitting in payment_error.

     Every one of those fields is written on the RESPONSE path inside
     captureBookingPayment, which is precisely the path that was lost.
     The webhook is the durable path and it was only writing one
     column of the four.

     AND IT MUST NOT ASSUME THE ACCEPTED AMOUNT WAS WHAT MOVED. The
     fee we recorded has to come from what the processor says it
     received, not from what the customer agreed to — those are the
     same number when everything works, and the difference is the
     whole reason for reconciling.

  2. I BROKE A HELPER'S OWN SCREEN. 0127 made crew_shortfall
     service-role only. It is read by the native helper app, with the
     helper's own session, to warn that the crew is not full — and
     the Swift catch keeps the last value, which starts at zero. So a
     denied read showed "ready" for a job the server would refuse to
     start. The function was genuinely too open: it answered about any
     booking id. The fix is not to reopen it but to give the people on
     the job a door of their own.
*/

/* ------------------------------------------------------------------ *
 * 1. RECONCILING A CAPTURE FROM THE PROCESSOR'S OWN EVENT             *
 * ------------------------------------------------------------------ */
create or replace function public.reconcile_capture_from_event(
  p_intent_id text,
  p_amount_received integer,
  p_charge_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_b public.bookings;
  v_fee int;
begin
  select * into v_b from public.bookings
  where stripe_payment_intent_id = p_intent_id for update;
  if not found then
    return jsonb_build_object('matched', false);
  end if;

  /*
    THE WHOLE RECORD, not one column of it. captured_at is what every
    report dates a capture by; payment_error is what an operator reads
    to decide whether something is broken. Leaving either behind makes
    a successful capture look like a failed one for ever.
  */
  update public.bookings set
    payment_status = 'captured',
    captured_at = coalesce(captured_at, now()),
    stripe_charge_id = coalesce(p_charge_id, stripe_charge_id),
    payment_error = null
  where id = v_b.id;

  /*
    A CANCELLED BOOKING THAT CAPTURED MONEY TOOK A CANCELLATION FEE.
    What it actually took is what the processor says, not what the
    customer accepted — and when those disagree, recording the agreed
    figure would hide exactly the discrepancy worth seeing.
  */
  if v_b.status = 'cancelled' and v_b.cancellation_fee_cents is null then
    v_fee := p_amount_received;
    update public.bookings set
      cancellation_fee_cents = v_fee,
      cancellation_fee_rate = coalesce(cancellation_fee_rate, 0.10)
    where id = v_b.id;

    insert into public.audit_log
      (actor_id, action, target_table, target_id, payload, outcome, changes)
    values (
      null, 'booking.cancellation_fee_charged', 'bookings', v_b.id::text,
      jsonb_build_object(
        'fee_cents', v_fee,
        'accepted_cents', v_b.cancellation_fee_accepted_cents,
        'source', 'processor_event',
        'why', 'The capture response never reached us; this is what the processor says it took.',
        'matched_what_was_shown',
          v_b.cancellation_fee_accepted_cents is not null
          and v_fee = v_b.cancellation_fee_accepted_cents),
      'succeeded',
      jsonb_build_array(jsonb_build_object(
        'field', 'Cancellation fee', 'before', 'not recorded',
        'after', (v_fee::numeric / 100)::text))
    );
  end if;

  return jsonb_build_object(
    'matched', true,
    'booking_id', v_b.id,
    'was_cancelled', v_b.status = 'cancelled',
    'fee_recorded', v_fee);
end $$;

revoke all on function public.reconcile_capture_from_event(text, integer, text) from public, anon, authenticated;
grant execute on function public.reconcile_capture_from_event(text, integer, text) to service_role;

/* ------------------------------------------------------------------ *
 * 2. A DOOR FOR THE PEOPLE ON THE JOB                                 *
 * ------------------------------------------------------------------ */
/*
  crew_shortfall answers about any booking id, which is why it had to
  come off the browser. This answers the same question only for
  somebody actually on the job — the helper who took it, or a crew
  member — and refuses everybody else rather than returning a number
  that happens to be zero.
*/
create or replace function public.my_crew_shortfall(p_booking_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
declare
  v_b public.bookings;
begin
  select * into v_b from public.bookings where id = p_booking_id;
  if not found then
    raise exception 'Booking not found.' using errcode = 'HW150';
  end if;

  if auth.uid() is distinct from v_b.provider_id
     and not exists (
       select 1 from public.booking_crew c
       where c.booking_id = p_booking_id and c.provider_id = auth.uid())
     and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin' then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;

  return public.crew_shortfall(p_booking_id);
end $$;

revoke all on function public.my_crew_shortfall(uuid) from public, anon;
grant execute on function public.my_crew_shortfall(uuid) to authenticated, service_role;

/* ------------------------------------------------------------------ *
 * 3. THE SCANNER BELIEVED A COMMENT                                   *
 * ------------------------------------------------------------------ */
/*
  functions_trusting_their_arguments() searched the function's text
  for `auth.uid()`. A function whose only mention of it was in a
  COMMENT passed — the scanner read the explanation and took it for
  the check.

  Comments are stripped before the search now. That closes this hole
  and not the general one: matching text is still a heuristic, it
  cannot prove a check actually runs on every path, and it recognises
  delegation only through names it already knows. It is a net for the
  obvious case, and the comment on the function now says so instead of
  implying a guarantee.
*/
create or replace function public.functions_trusting_their_arguments()
returns table (signature text)
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosecdef
    and p.pronargs > 0
    and (has_function_privilege('anon', p.oid, 'execute')
      or has_function_privilege('authenticated', p.oid, 'execute'))
    and regexp_replace(
          regexp_replace(pg_get_functiondef(p.oid), '/\*.*?\*/', ' ', 'gs'),
          '--[^\n]*', ' ', 'g')
        !~ 'auth\.uid\(\)|auth\.jwt\(\)|is_admin\(\)|assert_call_participant|cancel_booking_with_fee|crew_shortfall\(p_booking_id\)'
    and p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
        not in (select signature from public.open_function_allowlist);
$$;

revoke all on function public.functions_trusting_their_arguments() from public, anon, authenticated;
grant execute on function public.functions_trusting_their_arguments() to service_role;

comment on function public.functions_trusting_their_arguments() is
  'A HEURISTIC, not a guarantee. Lists SECURITY DEFINER functions a browser can call whose executable body (comments stripped) never mentions a caller check. It cannot prove a check runs on every path, and it recognises delegation only through named helpers. Zero here means the obvious mistake is absent — not that the catalogue is safe. Cross-account execution tests are what establish that.';

/* ------------------------------------------------------------------ *
 * SELF-TEST                                                           *
 * ------------------------------------------------------------------ */
do $selftest$
declare
  v_c uuid; v_h uuid; v_s text; v_bk uuid; v_r jsonb; v_found text[];
begin
  begin
    select pp.user_id into v_h from public.provider_profiles pp limit 1;
    /* A DIFFERENT PERSON from the helper. The first profile and the
       first provider can be the same row, and a test where the
       customer IS the helper proves nothing about who may read what. */
    select p.id into v_c from public.profiles p where p.id <> v_h limit 1;
    select sv.id into v_s from public.services sv limit 1;
    if v_c is null or v_h is null or v_s is null then
      raise exception 'this test needs a provider, a different profile and a service.';
    end if;

    /* ---- A CANCELLED BOOKING WHOSE CAPTURE WE NEVER HEARD ABOUT ---- */
    insert into public.bookings (customer_id, provider_id, service_id, status,
      base_price_cents, total_cents, platform_fee_cents, payout_cents, currency,
      payment_status, stripe_payment_intent_id, cancelled_at,
      cancellation_fee_accepted_cents, cancellation_fee_accepted_at, payment_error)
    values (v_c, v_h, v_s, 'cancelled', 22000, 22450, 4850, 17600, 'CAD',
            'authorized', 'pi_lost_response', now(), 2245, now(),
            'Payment failed. Please try again.')
    returning id into v_bk;

    v_r := public.reconcile_capture_from_event('pi_lost_response', 2245, 'ch_lost');

    if (select captured_at from public.bookings where id = v_bk) is null then
      raise exception 'the capture time was still missing after reconciliation';
    end if;
    if (select payment_error from public.bookings where id = v_bk) is not null then
      raise exception 'the stale payment error survived a successful capture';
    end if;
    if (select cancellation_fee_cents from public.bookings where id = v_bk) <> 2245 then
      raise exception 'the cancellation fee was not recorded from the event';
    end if;
    if (select payment_status::text from public.bookings where id = v_bk) <> 'captured' then
      raise exception 'the booking was not marked captured';
    end if;

    /* AND IT RECORDS WHAT MOVED, not what was agreed. */
    update public.bookings set cancellation_fee_cents = null,
      stripe_payment_intent_id = 'pi_lost_two' where id = v_bk;
    perform public.reconcile_capture_from_event('pi_lost_two', 2000, null);
    if (select cancellation_fee_cents from public.bookings where id = v_bk) <> 2000 then
      raise exception 'reconciliation recorded the accepted amount instead of the captured one';
    end if;
    if (select payload ->> 'matched_what_was_shown' from public.audit_log
        where target_id = v_bk::text and action = 'booking.cancellation_fee_charged'
        order by id desc limit 1) <> 'false' then
      raise exception 'a captured amount differing from the accepted one was recorded as matching';
    end if;

    /* Running it twice changes nothing further. */
    perform public.reconcile_capture_from_event('pi_lost_two', 2000, null);
    if (select cancellation_fee_cents from public.bookings where id = v_bk) <> 2000 then
      raise exception 'a repeated event rewrote the recorded fee';
    end if;

    /* ---- THE CREW READ, FOR THE PEOPLE ON THE JOB ---- */
    update public.bookings set status = 'in_progress', crew_size = 3 where id = v_bk;

    perform set_config('request.jwt.claims',
      json_build_object('sub', v_h, 'app_metadata', json_build_object('role', 'helper'))::text, true);
    if public.my_crew_shortfall(v_bk) <> 3 then
      raise exception 'the helper on the job could not read their own crew shortfall';
    end if;

    perform set_config('request.jwt.claims',
      json_build_object('sub', v_c, 'app_metadata', json_build_object('role', 'customer'))::text, true);
    begin
      perform public.my_crew_shortfall(v_bk);
      raise exception 'somebody not on the job read its crew shortfall';
    exception when sqlstate '42501' then null;
    end;
    perform set_config('request.jwt.claims', '', true);

    /* ---- THE SCANNER NO LONGER BELIEVES A COMMENT ---- */
    execute $f$
      create or replace function public.__scanner_bait(p_id uuid)
      returns int language sql stable security definer
      set search_path = public as $b$
        -- this mentions auth.uid() only in a comment
        select 1
      $b$
    $f$;
    execute 'grant execute on function public.__scanner_bait(uuid) to authenticated';

    select coalesce(array_agg(signature), '{}') into v_found
    from public.functions_trusting_their_arguments();
    if not ('__scanner_bait(p_id uuid)' = any(v_found)) then
      raise exception 'the scanner was satisfied by a comment';
    end if;

    execute 'drop function public.__scanner_bait(uuid)';

    /* And nothing real is flagged. */
    select coalesce(array_agg(signature), '{}') into v_found
    from public.functions_trusting_their_arguments();
    if array_length(v_found, 1) > 0 then
      raise exception 'stripping comments flagged something real: %', array_to_string(v_found, ', ');
    end if;

    raise exception using errcode = 'HW999', message = 'self-test complete';
  exception
    when sqlstate 'HW999' then
      raise notice 'lost capture and crew: a capture learned from an event writes the time, the fee and clears the error, records what MOVED rather than what was agreed, is idempotent — the crew read is open to the people on the job and nobody else, and the scanner no longer takes a comment for a check';
    when others then
      raise;
  end;
end $selftest$;
