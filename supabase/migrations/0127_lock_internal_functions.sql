-- CLASS: pre-deploy
-- =========================================================================
-- 0127 — "revoke from public" did not do what I thought it did
-- =========================================================================
/*
  EVERY INTERNAL FUNCTION I ADDED WAS CALLABLE BY ANYONE.

  The pattern I used throughout — `revoke all on function … from
  public; grant execute … to service_role;` — looks like it locks a
  function down. It does not. Supabase applies DEFAULT PRIVILEGES that
  grant EXECUTE on new functions in `public` to `anon`, `authenticated`
  and `service_role` individually, so the grants are to those ROLES,
  not to PUBLIC. Revoking from PUBLIC removes a grant that was never
  the one letting them in.

  The result, checked against the live catalogue:

    ingest_refund_event              anon = true
    recompute_booking_payment_status anon = true
    record_cancellation_fee          anon = true
    system_cancellation_refund       anon = true
    bump_webhook_attempt             anon = true

  ingest_refund_event is the serious one. It is SECURITY DEFINER, it
  has no is_admin() check — by design, because only the webhook was
  meant to reach it — and it writes refund rows, moves a booking's
  payment_status and appends to the audit log. An anonymous caller
  could have fabricated a refund against any booking id they could
  guess, and the trail would have recorded it as a processor event.

  Nothing suggests anyone did: production holds 9 bookings and 0
  refunds, and every refund row on either database is accounted for.
  This closes it either way.

  THE RULE, for everything after this: an internal function is locked
  by revoking from `anon, authenticated` BY NAME. PUBLIC is not where
  the grant is.
*/

/* ------------------------------------------------------------------ *
 * THE ONES THAT WRITE                                                 *
 * ------------------------------------------------------------------ */
revoke all on function public.ingest_refund_event(text, uuid, text, integer, text, text, text, text, timestamptz) from anon, authenticated;
revoke all on function public.recompute_booking_payment_status(uuid) from anon, authenticated;
revoke all on function public.record_cancellation_fee(uuid, integer, numeric, integer, uuid) from anon, authenticated;
revoke all on function public.system_cancellation_refund(uuid, integer, text) from anon, authenticated;
revoke all on function public.bump_webhook_attempt(text) from anon, authenticated;

/*
  A trigger function is invoked by the trigger, never called. This one
  needs BOTH doors shut: 0110 created it without revoking from PUBLIC,
  so `=X/postgres` was still in its ACL and anon inherited EXECUTE
  through that rather than through its own grant. Revoking the named
  roles alone left it open — which is the mirror image of the mistake
  this whole migration is about.
*/
revoke all on function public.audit_context() from public, anon, authenticated;

/* ------------------------------------------------------------------ *
 * THE ONES THAT LEAK                                                  *
 * ------------------------------------------------------------------ */
/*
  These answer questions about other people's money and other people's
  services. Every caller inside this application reaches them with the
  service key, so none of them needs to be reachable from a browser
  session at all.
*/
revoke all on function public.refund_available_cents(uuid, text) from anon, authenticated;
revoke all on function public.service_live_values(text, text) from anon, authenticated;
revoke all on function public.admin_filter_regions(boolean) from anon, authenticated;

do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'admin_filter_regions_hidden') then
    execute 'revoke all on function public.admin_filter_regions_hidden() from anon, authenticated';
  end if;
end $$;

/* ------------------------------------------------------------------ *
 * AND ONE THAT TOOK THE CALLER'S WORD FOR WHO THEY WERE               *
 * ------------------------------------------------------------------ */
/*
  cancellation_fee_for(booking, actor) let the CALLER say which party
  they are. An authenticated user could ask what a stranger's booking
  would cost "as the customer" and be told the fee and the total.

  It resolves the actor itself now, from the same token the
  cancellation does. Nobody can claim to be the customer of a booking
  that is not theirs, and the answer for somebody with no part in it
  is the answer they are entitled to: none.
*/
create or replace function public.cancellation_fee_for(p_booking uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
declare
  v_b public.bookings;
  v_actor text;
  v_total int;
  v_cents int;
begin
  select * into v_b from public.bookings where id = p_booking;
  if not found then
    return jsonb_build_object('cents', 0, 'rate', 0, 'reason', 'no_booking');
  end if;

  if auth.uid() = v_b.customer_id then
    v_actor := 'customer';
  elsif auth.uid() = v_b.provider_id then
    v_actor := 'helper';
  elsif coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin' then
    v_actor := 'admin';
  else
    /* Not a party to this booking. No figures. */
    return jsonb_build_object('cents', 0, 'rate', 0, 'reason', 'not_your_booking');
  end if;

  v_total := coalesce(v_b.total_cents, 0);

  if v_actor is distinct from 'customer' then
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

  v_cents := floor(v_total * 0.10);
  return jsonb_build_object('cents', v_cents, 'rate', 0.10, 'reason', 'helper_accepted',
    'total_cents', v_total, 'already_captured', v_b.captured_at is not null);
end $$;

revoke all on function public.cancellation_fee_for(uuid) from public;
grant execute on function public.cancellation_fee_for(uuid) to authenticated;

/*
  The two-argument form is what cancel_booking_with_fee calls with the
  actor it has already established under the lock, so it stays — but
  only reachable from inside this database, never from a session.
*/
revoke all on function public.cancellation_fee_for(uuid, text) from anon, authenticated;

/* ------------------------------------------------------------------ *
 * SELF-TEST                                                           *
 * ------------------------------------------------------------------ */
do $selftest$
declare
  v_locked text[] := array[
    'ingest_refund_event', 'recompute_booking_payment_status',
    'record_cancellation_fee', 'system_cancellation_refund',
    'bump_webhook_attempt', 'audit_context',
    'refund_available_cents', 'service_live_values', 'admin_filter_regions'
  ];
  v_name text;
  v_open text[] := '{}';
begin
  foreach v_name in array v_locked loop
    if exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = v_name
        and (has_function_privilege('anon', p.oid, 'execute')
          or has_function_privilege('authenticated', p.oid, 'execute'))
    ) then
      v_open := array_append(v_open, v_name);
    end if;
  end loop;

  if array_length(v_open, 1) > 0 then
    raise exception 'still reachable from a browser session: %', array_to_string(v_open, ', ');
  end if;

  /* The service role still has to be able to do its job. */
  if not has_function_privilege('service_role',
       'public.ingest_refund_event(text, uuid, text, integer, text, text, text, text, timestamptz)', 'execute') then
    raise exception 'the webhook can no longer record refunds';
  end if;
  if not has_function_privilege('authenticated', 'public.cancellation_fee_for(uuid)', 'execute') then
    raise exception 'a customer can no longer ask what cancelling costs';
  end if;

  raise notice 'internal functions: nine that anon and authenticated could reach are closed, the service role keeps what it needs, and the fee preview resolves the caller instead of believing them';
end $selftest$;
