-- CLASS: pre-deploy
-- =========================================================================
-- 0128 — the siblings a nine-name test could not catch
-- =========================================================================
/*
  0127 closed nine functions by name. Naming nine is not a policy, and
  the very next look found one worse than any of them.

  CUSTOMER_OPEN_CASES READ ANYBODY'S SUPPORT CASES. It is SECURITY
  DEFINER, it takes a customer id as an ARGUMENT, it returns dispute
  descriptions, support subjects and which staff member is handling
  them — and it never asks who is calling. EXECUTE was granted to
  `authenticated` in 0107 and the grant was never needed: its only
  caller is another function, which reaches it in definer context.
  Anonymous and signed-in callers both read a stranger's private case
  in rehearsal.

  THE SHAPE OF THE MISTAKE, which is the useful part: a definer
  function that takes an identifier and trusts it. The caller says
  which customer, which booking, which call — and the function
  answers, because the only thing it checks is that the argument
  exists. Grants are what stand between that and the internet, and
  grants were what I got wrong.

  So this closes the siblings, and then installs a check that fails
  when another one appears, rather than relying on somebody looking.
*/

/* ------------------------------------------------------------------ *
 * THE ONE THAT LEAKED                                                 *
 * ------------------------------------------------------------------ */
revoke all on function public.customer_open_cases(uuid) from public, anon, authenticated;

/*
  AND A CHECK INSIDE IT, because a future grant should not reopen this.
  It is read by the admin customer panel through the service key and
  by one other function in definer context; neither is affected.
*/
create or replace function public.customer_open_cases(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
declare
  v_result jsonb;
begin
  /*
    auth.uid() is null for the service role and for a definer caller,
    which is exactly who is meant to use this. A SESSION asking for
    somebody else's cases is the case that must not be served.
  */
  if auth.uid() is not null
     and auth.uid() <> p_user_id
     and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin' then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(x order by (x->>'created_at') desc), '[]'::jsonb) into v_result from (
    select jsonb_build_object(
             'kind', 'dispute', 'id', d.id,
             'ref', case when d.kind = 'safety' then 'SF-' else 'DS-' end
                    || upper(substr(d.id::text, 1, 4)),
             'category', d.category, 'description', d.description,
             'status', d.status, 'created_at', d.created_at,
             'age_seconds', extract(epoch from now() - d.created_at),
             'owner_id', d.owner_id,
             'owner_name', (select full_name from profiles where id = d.owner_id),
             'booking_id', d.booking_id,
             'booking_ref', case when d.booking_id is null then null
                                 else 'BK-' || upper(substr(d.booking_id::text, 1, 4)) end) as x
      from disputes d
      left join bookings b on b.id = d.booking_id
     where d.status <> 'resolved'
       and (d.customer_id = p_user_id or b.customer_id = p_user_id)
    union all
    select jsonb_build_object(
             'kind', 'support', 'id', s.id,
             'ref', 'CS-' || upper(substr(s.id::text, 1, 4)),
             'category', s.channel, 'description', s.subject,
             'status', s.status, 'created_at', s.created_at,
             'age_seconds', extract(epoch from now() - s.created_at),
             'owner_id', s.assignee_id,
             'owner_name', (select full_name from profiles where id = s.assignee_id),
             'booking_id', s.booking_id,
             'booking_ref', case when s.booking_id is null then null
                                 else 'BK-' || upper(substr(s.booking_id::text, 1, 4)) end) as x
      from support_cases s
     where s.status <> 'resolved' and s.customer_id = p_user_id
  ) t;

  return v_result;
end $$;

revoke all on function public.customer_open_cases(uuid) from public, anon, authenticated;
grant execute on function public.customer_open_cases(uuid) to service_role;

/* ------------------------------------------------------------------ *
 * THE REST OF THE SIBLINGS                                            *
 * ------------------------------------------------------------------ */
/*
  Each of these takes an identifier, trusts it, and has no caller in
  any browser: they are reached by cron routes, server libraries or
  other functions, all of which use the service key or run as definer.
  abandon_call and update_call_status are NOT here — they look the
  same from the outside but call assert_call_participant, so they
  check the caller and stay reachable from the app that needs them.
*/
revoke all on function public.expand_broadcast_to_pool(uuid, integer) from public, anon, authenticated;
revoke all on function public.expire_stale_calls(uuid) from public, anon, authenticated;
revoke all on function public.set_boundary_enforcement(text, text, text) from public, anon, authenticated;
revoke all on function public.assert_helper_payable(uuid) from public, anon, authenticated;
revoke all on function public.booking_refunds_blocked(uuid) from public, anon, authenticated;
revoke all on function public.requested_crew_size(uuid) from public, anon, authenticated;
revoke all on function public.compute_request_fingerprint(uuid) from public, anon, authenticated;
revoke all on function public.dispatch_health(interval) from public, anon, authenticated;
revoke all on function public.crew_shortfall(uuid) from public, anon, authenticated;
revoke all on function public.my_offer(uuid) from public, anon, authenticated;

/* ------------------------------------------------------------------ *
 * THE OLD CANCELLATION DOOR                                           *
 * ------------------------------------------------------------------ */
/*
  0126 put the policy inside cancel_booking_with_fee. It left
  cancel_booking(uuid, text) exactly where it was: callable by
  `authenticated`, mutating the booking directly, asking nothing about
  consent. A customer could preview a CA$22.45 fee and then cancel
  through the old door for nothing, leaving both fee columns null.

  Adding a rule in one place and leaving the old entrance open is not
  adding a rule. This becomes a wrapper: same name, same signature, so
  nothing that calls it breaks — and it now goes through the policy
  like everybody else.
*/
create or replace function public.cancel_booking(p_booking_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  /*
    No accepted amount is passed, so a fee-bearing cancellation is
    refused here exactly as it is at the front door — with the figure
    in the message, so a caller can show it and come back through
    cancel_booking_with_fee.
  */
  perform public.cancel_booking_with_fee(p_booking_id, p_reason, null);
end $$;

revoke all on function public.cancel_booking(uuid, text) from public, anon;
grant execute on function public.cancel_booking(uuid, text) to authenticated, service_role;

/* ------------------------------------------------------------------ *
 * A CHECK THAT FINDS THE NEXT ONE                                     *
 * ------------------------------------------------------------------ */
/*
  Nine names, then one more. The answer is not a longer list of names:
  it is a rule that holds for functions nobody has written yet.

  THE RULE: a SECURITY DEFINER function in `public` that takes
  arguments and is reachable by anon or authenticated must consult the
  caller — auth.uid(), auth.jwt() or is_admin(), directly or through
  something that does. If it does not, it is trusting whatever it was
  handed, and it needs either a check or a revoke.

  Anything genuinely meant to answer strangers is listed below WITH A
  REASON, so the exception is a decision somebody made rather than an
  oversight nobody noticed.
*/
create table if not exists public.open_function_allowlist (
  signature text primary key,
  why       text not null,
  added_at  timestamptz not null default clock_timestamp()
);

alter table public.open_function_allowlist enable row level security;
revoke all on public.open_function_allowlist from anon, authenticated;
grant select on public.open_function_allowlist to authenticated;
drop policy if exists open_function_allowlist_read on public.open_function_allowlist;
create policy open_function_allowlist_read on public.open_function_allowlist
  for select using (public.is_admin());

insert into public.open_function_allowlist (signature, why) values
  ('is_point_serviceable(p_point geography)',
   'Asked by the website before anybody has an account, to say whether we work in an area. Reveals only our own coverage.'),
  ('point_service_area(p_point geography)',
   'The same question with the area name. Our coverage, not anybody''s data.'),
  ('price_service_cents(p_service_id text, p_intake jsonb)',
   'Quotes a price from the public catalogue for figures the pricing page already shows.'),
  ('join_helper_waitlist(p_email text, p_city text, p_region text, p_country text)',
   'A public sign-up form. It writes only the row it was given and reads nothing.'),
  ('st_estimatedextent(text, text)', 'PostGIS internals.'),
  ('st_estimatedextent(text, text, text)', 'PostGIS internals.'),
  ('st_estimatedextent(text, text, text, boolean)', 'PostGIS internals.')
on conflict (signature) do update set why = excluded.why;

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
    /* Directly, or through a helper that does it for them. */
    /* Directly, or by handing the question to something that does:
       a wrapper whose whole job is to route callers through the
       authoritative operation is not trusting its arguments. */
    and pg_get_functiondef(p.oid) !~ 'auth\.uid\(\)|auth\.jwt\(\)|is_admin\(\)|assert_call_participant|cancel_booking_with_fee'
    and p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
        not in (select signature from public.open_function_allowlist);
$$;

revoke all on function public.functions_trusting_their_arguments() from public, anon, authenticated;
grant execute on function public.functions_trusting_their_arguments() to service_role;

comment on function public.functions_trusting_their_arguments() is
  'Every SECURITY DEFINER function a browser can call that never asks who is calling. Should always be empty; anything legitimate belongs in open_function_allowlist with a reason.';

/* ------------------------------------------------------------------ *
 * SELF-TEST                                                           *
 * ------------------------------------------------------------------ */
do $selftest$
declare
  v_open text[];
begin
  select coalesce(array_agg(signature), '{}')
  into v_open from public.functions_trusting_their_arguments();

  if array_length(v_open, 1) > 0 then
    raise exception 'these can be called by a browser and never ask who is calling: %',
      array_to_string(v_open, ', ');
  end if;

  /* The ones that were open are shut. */
  if has_function_privilege('anon', 'public.customer_open_cases(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.customer_open_cases(uuid)', 'execute') then
    raise exception 'another customer''s support cases are still readable';
  end if;
  if not has_function_privilege('service_role', 'public.customer_open_cases(uuid)', 'execute') then
    raise exception 'the admin customer panel can no longer read open cases';
  end if;

  /* The call controls the app genuinely needs are untouched. */
  if not has_function_privilege('authenticated', 'public.update_call_status(uuid, call_status, text)', 'execute') then
    raise exception 'a customer can no longer update their own call';
  end if;

  /* And the old cancellation door now goes through the policy. */
  if pg_get_functiondef('public.cancel_booking(uuid, text)'::regprocedure)
     not like '%cancel_booking_with_fee%' then
    raise exception 'the legacy cancellation still bypasses the policy';
  end if;

  raise notice 'siblings: a stranger''s support cases are closed, ten argument-trusting functions are off the browser, the legacy cancellation goes through the policy, and functions_trusting_their_arguments() will fail this test if another one appears';
end $selftest$;
