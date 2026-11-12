-- CLASS: pre-deploy
-- =========================================================================
-- 0107 — one meaning for "an open case", now that cases changed shape
--
-- 0104 did two things that the rest of the console had assumptions
-- about:
--
--   * A dispute can now sit in 'awaiting_response' or
--     'evidence_requested'. Every query that asked for
--     status in ('open','investigating','escalated') silently stopped
--     counting those — a case waiting on a reply would have vanished
--     from the customers page and from the operational alerts while
--     being the most active thing in the building.
--
--   * A dispute can now have no booking. Every query that reached the
--     customer through `join bookings` dropped those entirely.
--
-- So the three functions that count cases are replaced here, reading
-- status <> 'resolved' and the case's own party columns. The customer
-- list and the case list now come from ONE function, so they cannot
-- disagree again.
-- =========================================================================

do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'disputes' and column_name = 'kind') then
    raise exception 'REFUSING: disputes.kind is missing. Apply 0104 first.';
  end if;
end $$;

-- -------------------------------------------------------------------------
-- 1. One list of a customer's open cases, of either sort.
-- -------------------------------------------------------------------------
create or replace function public.customer_open_cases(p_user_id uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by (x->>'created_at') desc), '[]'::jsonb) from (
    select jsonb_build_object(
             'kind', 'dispute',
             'id', d.id,
             'ref', case when d.kind = 'safety' then 'SF-' else 'DS-' end
                    || upper(substr(d.id::text, 1, 4)),
             'category', d.category,
             'description', d.description,
             'status', d.status,
             'created_at', d.created_at,
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
             'kind', 'support',
             'id', s.id,
             'ref', 'CS-' || upper(substr(s.id::text, 1, 4)),
             'category', s.channel,
             'description', s.subject,
             'status', s.status,
             'created_at', s.created_at,
             'age_seconds', extract(epoch from now() - s.created_at),
             'owner_id', s.assignee_id,
             'owner_name', (select full_name from profiles where id = s.assignee_id),
             'booking_id', s.booking_id,
             'booking_ref', case when s.booking_id is null then null
                                 else 'BK-' || upper(substr(s.booking_id::text, 1, 4)) end)
      from support_cases s
     where s.customer_id = p_user_id and s.status <> 'resolved'
       and coalesce(s.party_role, 'customer') = 'customer'
  ) rows;
$$;

revoke execute on function public.customer_open_cases(uuid) from public;
grant execute on function public.customer_open_cases(uuid) to authenticated;

-- -------------------------------------------------------------------------
-- 2. Attention, counting every unresolved case of either sort.
-- -------------------------------------------------------------------------
create or replace function public.customer_attention(p_user_id uuid)
returns text
language sql stable set search_path = public as $$
  select case
    when exists (
      select 1 from disputes d
      left join bookings b on b.id = d.booking_id
       where d.status <> 'resolved'
         and (d.customer_id = p_user_id or b.customer_id = p_user_id))
      or exists (
      select 1 from support_cases c
       where c.customer_id = p_user_id and c.status <> 'resolved'
         and coalesce(c.party_role, 'customer') = 'customer')
      then 'support_case'
    when exists (
      select 1 from bookings b
       where b.customer_id = p_user_id
         and b.captured_at is null
         and (b.payment_status = 'failed' or coalesce(b.payment_error, '') <> '')
         and b.status <> 'cancelled')
      then 'payment_issue'
    when (select restricted_at from profiles where id = p_user_id) is not null
      then 'account_review'
    when exists (select 1 from account_deletion_requests d
                  where d.user_id = p_user_id and d.status in ('pending', 'executing'))
      or exists (select 1 from data_export_requests e
                  where e.user_id = p_user_id and e.status in ('pending', 'processing'))
      then 'privacy_request'
    else 'none'
  end;
$$;

-- -------------------------------------------------------------------------
-- 3. The customer record reads the same list the chip counts.
-- -------------------------------------------------------------------------
create or replace function public.admin_customer_detail(p_user_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_p profiles;
  v_latest bookings;
begin
  if not is_admin() then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;

  select * into v_p from profiles where id = p_user_id and role = 'customer';
  if not found then return null; end if;

  select * into v_latest from bookings
   where customer_id = p_user_id order by created_at desc limit 1;

  return jsonb_build_object(
    'id', v_p.id,
    'ref', 'CU-' || upper(substr(v_p.id::text, 1, 4)),
    'name', v_p.full_name,
    'avatar_url', v_p.avatar_url,
    'created_at', v_p.created_at,
    'account_state', customer_account_state(v_p.id),
    'attention', customer_attention(v_p.id),
    'is_review_account', coalesce(v_p.is_review_account, false),
    'restriction', case when v_p.restricted_at is null then null else (
      select jsonb_build_object(
               'at', v_p.restricted_at,
               'reason', r.reason,
               'by', (select full_name from profiles where id = r.set_by))
        from customer_restrictions r
       where r.user_id = v_p.id and r.lifted_at is null
       order by r.created_at desc limit 1) end,

    /*
      CONTACT, MASKED. The real values are not in this document at all —
      admin_reveal_customer_contact returns them, with a reason, and
      writes who asked to the audit log. A panel that ships the address
      in the payload and hides it in CSS has revealed it.
    */
    'contact', jsonb_build_object(
      'email_masked', mask_email((select email from auth.users where id = v_p.id)),
      'has_email', (select email from auth.users where id = v_p.id) is not null,
      'phone_masked', mask_phone((select phone from profile_contacts where user_id = v_p.id)),
      'has_phone', exists (select 1 from profile_contacts c
                            where c.user_id = v_p.id and coalesce(c.phone, '') <> ''),
      'phone_verified', coalesce((select phone_verified from profile_contacts where user_id = v_p.id), false),
      'country', v_p.country::text,
      'account_currency', v_p.default_currency,
      'locale', v_p.default_locale,
      'timezone', v_p.default_timezone
    ),

    -- Three counts, each of rows, none of them a rate or a score.
    'stats', jsonb_build_object(
      'completed_jobs', (select count(*) from bookings
                          where customer_id = v_p.id and status = 'completed'),
      'active_bookings', (select count(*) from bookings
                           where customer_id = v_p.id and status in ('scheduled', 'in_progress')),
      'open_cases', jsonb_array_length(customer_open_cases(v_p.id)),
      'cancelled_bookings', (select count(*) from bookings
                              where customer_id = v_p.id and status = 'cancelled'),
      'total_bookings', (select count(*) from bookings where customer_id = v_p.id)
    ),

    'latest_booking', case when v_latest.id is null then null else jsonb_build_object(
      'id', v_latest.id,
      'ref', 'BK-' || upper(substr(v_latest.id::text, 1, 4)),
      'service', (select title from services where id = v_latest.service_id),
      'status', v_latest.status,
      'payment_status', v_latest.payment_status,
      'currency', v_latest.currency,
      'total_cents', v_latest.total_cents,
      'scheduled_for', v_latest.scheduled_for,
      'created_at', v_latest.created_at,
      'helper', (select full_name from profiles where id = v_latest.provider_id),
      'helper_id', v_latest.provider_id) end,

    /*
      BOTH KINDS OF CASE, from one function. This block used to be
      inlined here and again in the count above, which is how the chip
      on the row and the list in the panel drifted apart the first
      time a dispute could exist without a booking.
    */
    'cases', customer_open_cases(v_p.id),

    /*
      MONEY, PER CURRENCY AND PER STATE. Captured counts the capture
      EVENT (captured_at), not the current payment_status — a later
      refund does not unmake the charge, and 0098 learned that the hard
      way when a day's takings shrank retroactively. Refunded is its own
      number from its own table. Never netted, never added across
      currencies, and holds that were authorized but not captured are
      excluded: a hold is not money we took.
    */
    'money', coalesce((
      select jsonb_agg(row_to_json(m) order by m.currency) from (
        select
          b.currency,
          count(*) filter (where b.captured_at is not null and b.payment_status <> 'failed') as captured_count,
          coalesce(sum(b.total_cents) filter (
            where b.captured_at is not null and b.payment_status <> 'failed'), 0) as captured_cents,
          coalesce((select sum(r.amount_cents) from refunds r
                     join bookings b2 on b2.id = r.booking_id
                    where b2.customer_id = v_p.id and b2.currency = b.currency
                      and r.status in ('succeeded', 'pending')), 0) as refunded_cents,
          count(*) filter (where b.authorized_at is not null and b.captured_at is null
                             and b.status <> 'cancelled') as holds_open
        from bookings b
        where b.customer_id = v_p.id and b.currency is not null
        group by b.currency
      ) m
    ), '[]'::jsonb),

    'notes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'body', n.body, 'at', n.created_at,
               'author', coalesce(a.full_name, 'Staff')) order by n.created_at desc)
      from admin_notes n left join profiles a on a.id = n.author_id
      where n.subject_kind = 'customer' and n.subject_id = v_p.id
    ), '[]'::jsonb),

    'privacy', jsonb_build_object(
      'deletion', (select jsonb_build_object('status', d.status, 'requested_at', d.requested_at,
                            'grace_until', d.grace_until, 'reason', d.reason)
                     from account_deletion_requests d
                    where d.user_id = v_p.id order by d.requested_at desc limit 1),
      'export', (select jsonb_build_object('status', e.status, 'requested_at', e.requested_at,
                          'completed_at', e.completed_at, 'expires_at', e.expires_at)
                   from data_export_requests e
                  where e.user_id = v_p.id order by e.requested_at desc limit 1)
    ),

    /*
      THE BOOKINGS TAB. The last ten, newest first — enough to see a
      pattern without loading a history nobody scrolls.
    */
    'bookings', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', b.id,
               'ref', 'BK-' || upper(substr(b.id::text, 1, 4)),
               'service', (select title from services where id = b.service_id),
               'status', b.status,
               'payment_status', b.payment_status,
               'currency', b.currency,
               'total_cents', b.total_cents,
               'scheduled_for', b.scheduled_for,
               'created_at', b.created_at,
               'helper', (select full_name from profiles where id = b.provider_id))
             order by b.created_at desc)
      from (select * from bookings where customer_id = v_p.id
             order by created_at desc limit 10) b
    ), '[]'::jsonb),

    /*
      THE PAYMENTS TAB, AS EVENTS rather than a balance. Authorized,
      captured, refunded and failed are four things that happened at
      four different times; one "paid" figure would hide the hold that
      never captured and the refund that came after.
    */
    'payments', coalesce((
      select jsonb_agg(e order by (e->>'at') desc) from (
        select e from (
          select jsonb_build_object('at', b.authorized_at, 'kind', 'authorized',
                   'currency', b.currency, 'amount_cents', b.total_cents,
                   'booking_ref', 'BK-' || upper(substr(b.id::text, 1, 4)),
                   'detail', null) as e
            from bookings b where b.customer_id = v_p.id and b.authorized_at is not null
          union all
          select jsonb_build_object('at', b.captured_at, 'kind', 'captured',
                   'currency', b.currency, 'amount_cents', b.total_cents,
                   'booking_ref', 'BK-' || upper(substr(b.id::text, 1, 4)),
                   'detail', null)
            from bookings b where b.customer_id = v_p.id and b.captured_at is not null
          union all
          select jsonb_build_object('at', r.created_at, 'kind', 'refunded',
                   'currency', b.currency, 'amount_cents', r.amount_cents,
                   'booking_ref', 'BK-' || upper(substr(b.id::text, 1, 4)),
                   'detail', coalesce(r.reason, r.status))
            from refunds r join bookings b on b.id = r.booking_id
            where b.customer_id = v_p.id
          union all
          select jsonb_build_object('at', b.created_at, 'kind', 'failed',
                   'currency', b.currency, 'amount_cents', b.total_cents,
                   'booking_ref', 'BK-' || upper(substr(b.id::text, 1, 4)),
                   'detail', coalesce(nullif(b.payment_error, ''), 'Payment failed'))
            from bookings b where b.customer_id = v_p.id
              and b.captured_at is null
              and (b.payment_status = 'failed' or coalesce(b.payment_error, '') <> '')
        ) u
        order by (e->>'at') desc
        limit 20
      ) ev
    ), '[]'::jsonb),

    /*
      THE ACTIVITY TAB, built from the rows themselves — every entry is
      a column somebody stamped when the thing happened, so the tab
      cannot show a step that did not occur. Staff actions are in it
      too, revealing contact details included: the person who looked is
      part of this customer's history, not hidden from it.
    */
    'activity', coalesce((
      select jsonb_agg(e order by (e->>'at') desc) from (
        select e from (
          select jsonb_build_object('at', v_p.created_at, 'label', 'Account created',
                   'detail', null, 'actor', null) as e
          union all
          select jsonb_build_object('at', b.created_at, 'label', 'Booking created',
                   'detail', coalesce((select title from services where id = b.service_id), ''),
                   'actor', null)
            from bookings b where b.customer_id = v_p.id
          union all
          select jsonb_build_object('at', d.created_at, 'label', 'Support case opened',
                   'detail', d.category, 'actor', null)
            from disputes d join bookings b on b.id = d.booking_id
            where b.customer_id = v_p.id
          union all
          select jsonb_build_object('at', dr.requested_at, 'label', 'Account deletion requested',
                   'detail', dr.status, 'actor', null)
            from account_deletion_requests dr where dr.user_id = v_p.id
          union all
          select jsonb_build_object('at', er.requested_at, 'label', 'Data export requested',
                   'detail', er.status, 'actor', null)
            from data_export_requests er where er.user_id = v_p.id
          union all
          select jsonb_build_object('at', n.created_at, 'label', 'Internal note',
                   'detail', n.body,
                   'actor', coalesce((select full_name from profiles where id = n.author_id), 'Staff'))
            from admin_notes n
            where n.subject_kind = 'customer' and n.subject_id = v_p.id
          union all
          select jsonb_build_object('at', al.created_at, 'label',
                   case al.action
                     when 'customer.restrict' then 'Account restricted'
                     when 'customer.unrestrict' then 'Restriction lifted'
                     when 'admin.customer_contact_revealed' then 'Contact details revealed'
                     else al.action end,
                   'detail', al.payload->>'reason',
                   'actor', coalesce((select full_name from profiles where id = al.actor_id), 'Staff'))
            from audit_log al
            where al.target_table = 'profiles' and al.target_id = v_p.id::text
              and al.action in ('customer.restrict', 'customer.unrestrict',
                                'admin.customer_contact_revealed')
        ) u
        order by (e->>'at') desc
        limit 40
      ) ev
    ), '[]'::jsonb),

    /*
      WHAT MAY BE DONE, and the reason when it may not. A case has to
      hang off a booking (disputes.booking_id is NOT NULL), so for a
      customer who has never booked there is nothing to attach one to —
      better the button says so than the insert fails.
    */
    'actions', jsonb_build_object(
      'restrict', v_p.restricted_at is null,
      'lift_restriction', v_p.restricted_at is not null,
      'open_case', v_latest.id is not null,
      'open_case_booking_ref', case when v_latest.id is null then null
                                    else 'BK-' || upper(substr(v_latest.id::text, 1, 4)) end,
      'open_case_blocked_reason', case when v_latest.id is null
        then 'A support case attaches to a booking, and this customer has none yet.' else null end,
      'reveal_contact', (select email from auth.users where id = v_p.id) is not null
        or exists (select 1 from profile_contacts c where c.user_id = v_p.id and coalesce(c.phone, '') <> '')
    )
  );
end $$;


revoke execute on function public.admin_customer_detail(uuid) from public;
grant execute on function public.admin_customer_detail(uuid) to authenticated;

-- -------------------------------------------------------------------------
-- 4. The alerts learn the same lesson, and gain two about safety.
--
-- disputes_stale asked for three named statuses, so a case waiting on
-- a reply stopped being counted the moment 0104 gave it somewhere else
-- to be. It now counts everything that is not resolved — and two new
-- checks cover the things a safety queue actually goes wrong on: a
-- report nobody owns, and a review time that has passed.
-- -------------------------------------------------------------------------
create or replace function public.admin_operational_alerts(p_include_review boolean default false)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;

  return (
    select coalesce(jsonb_agg(a order by a.rank, a.count desc), '[]'::jsonb)
    from (
      select 1 as rank, 'payments_failed' as key, 'critical' as severity,
             'Captures that failed' as title,
             'The job is done and the money did not move. Each one is a customer who thinks they have paid.' as detail,
             '/admin/bookings?flag=payment' as href,
             count(*) as count
        from bookings b join profiles p on p.id = b.customer_id
       where b.captured_at is null and b.status <> 'cancelled'
         and (b.payment_status = 'failed' or coalesce(b.payment_error, '') <> '')
         and (p_include_review or not coalesce(p.is_review_account, false))
      having count(*) > 0

      union all
      select 2, 'cases_overdue', 'critical',
             'Support replies overdue',
             'Past the four-hour reply target, counted from the customer''s last message.',
             '/admin/inbox?sort=due',
             count(*)
        from support_cases c left join profiles p on p.id = c.customer_id
       where c.status <> 'resolved' and c.due_at is not null and c.due_at < now()
         and (p_include_review or not coalesce(p.is_review_account, false))
      having count(*) > 0

      union all
      select 3, 'disputes_stale', 'critical',
             'Disputes untouched over 24h',
             'Silence is the thing that turns a dispute into a chargeback.',
             '/admin/disputes',
             count(*)
        from disputes d
       where d.status <> 'resolved'
         and d.created_at < now() - interval '24 hours'
      having count(*) > 0

      union all
      select 4, 'jobs_running_over', 'warning',
             'Jobs running over four hours',
             'Started and never completed. Usually a helper who forgot to close it.',
             '/admin/bookings?tab=bookings',
             count(*)
        from bookings b join profiles p on p.id = b.customer_id
       where b.status = 'in_progress' and b.started_at < now() - interval '4 hours'
         and (p_include_review or not coalesce(p.is_review_account, false))
      having count(*) > 0

      union all
      select 5, 'requests_matching', 'warning',
             'Requests still looking for a helper',
             'Over thirty minutes in matching. Nobody has accepted and the customer is watching a spinner.',
             '/admin/bookings?tab=requests',
             count(*)
        from requests r join profiles p on p.id = r.customer_id
       where r.status = 'matching' and r.created_at < now() - interval '30 minutes'
         and (p_include_review or not coalesce(p.is_review_account, false))
      having count(*) > 0

      union all
      select 6, 'helpers_waiting', 'warning',
             'Helper applications waiting over 48h',
             'They applied and nobody has looked. Every one is capacity we do not have.',
             '/admin/helpers',
             count(*)
        from provider_profiles pp
       where pp.status = 'pending' and pp.created_at < now() - interval '48 hours'
         and (p_include_review or not coalesce(pp.is_review_helper, false))
      having count(*) > 0

      union all
      select 7, 'cases_unassigned', 'info',
             'Conversations with no owner',
             'Nobody is on these. An unowned case is one nobody is wrong about.',
             '/admin/inbox?owner=unassigned',
             count(*)
        from support_cases c left join profiles p on p.id = c.customer_id
       where c.status <> 'resolved' and c.assignee_id is null
         and (p_include_review or not coalesce(p.is_review_account, false))
      having count(*) > 0

      union all
      select 8, 'deletions_due', 'info',
             'Account deletions past their grace period',
             'The customer asked, the grace window has closed, and the deletion has not run.',
             '/admin/data-requests',
             count(*)
        from account_deletion_requests d
       where d.status = 'pending' and d.grace_until < now()
      having count(*) > 0

      union all
      select 9, 'privacy_failed', 'info',
             'Data requests that failed',
             'An export or deletion that errored. These do not retry themselves.',
             '/admin/data-requests',
             (select count(*) from data_export_requests where status = 'failed')
             + (select count(*) from account_deletion_requests where status = 'failed')
      having (select count(*) from data_export_requests where status = 'failed')
             + (select count(*) from account_deletion_requests where status = 'failed') > 0

      union all
      select 3, 'safety_unassigned', 'critical',
             'Safety reports with no owner',
             'Nobody is responsible for these yet. A safety report without an owner is one nobody is accountable for.',
             '/admin/disputes?owner=unassigned',
             count(*)
        from disputes d
       where d.status <> 'resolved' and d.kind = 'safety' and d.owner_id is null
      having count(*) > 0

      union all
      select 4, 'reviews_overdue', 'warning',
             'Case reviews past their time',
             'A reviewer set a follow-up time on these and it has passed. Only cases with a time somebody set are counted.',
             '/admin/disputes?flag=overdue',
             count(*)
        from disputes d
       where d.status <> 'resolved' and d.next_review_at is not null and d.next_review_at < now()
      having count(*) > 0

      union all
      select 10, 'dispatch_refusals', 'info',
             'Dispatch refusals in the last 24 hours',
             'Requests the matcher would not send to anybody. The reasons are in the table.',
             '/admin/bookings',
             count(*)
        from dispatch_refusals dr
       where dr.created_at > now() - interval '24 hours'
      having count(*) > 0
    ) a
  );
end $$;

revoke execute on function public.admin_operational_alerts(boolean) from public;
grant execute on function public.admin_operational_alerts(boolean) to authenticated;

-- -------------------------------------------------------------------------
-- 5. Proven: a case in one of the new statuses, and one with no
--    booking at all, still reach the customer's record.
-- -------------------------------------------------------------------------
do $$
declare
  v_customer uuid;
  v_case uuid;
  v_before int;
  v_after int;
begin
  select id into v_customer from profiles where role = 'customer' limit 1;
  if v_customer is null then
    raise notice '0107: no customer fixture; the counting guards were not exercised.';
    return;
  end if;

  v_before := jsonb_array_length(customer_open_cases(v_customer));

  insert into disputes (booking_id, opened_by, category, description, status, kind,
                        customer_id, source)
  values (null, v_customer, 'safety',
          '0107 self-test: a report with no booking, waiting on a reply.',
          'awaiting_response', 'safety', v_customer, 'phone')
  returning id into v_case;

  v_after := jsonb_array_length(customer_open_cases(v_customer));
  if v_after <> v_before + 1 then
    raise exception '0107: a booking-less case in awaiting_response did not reach the customer record (% -> %).',
      v_before, v_after;
  end if;
  if customer_attention(v_customer) <> 'support_case' then
    raise exception '0107: a customer with an open safety case reads as %.', customer_attention(v_customer);
  end if;

  delete from disputes where id = v_case;
end $$;
