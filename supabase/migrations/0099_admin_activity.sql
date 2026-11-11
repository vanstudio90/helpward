-- CLASS: pre-deploy
-- =========================================================================
-- 0099 — requests and bookings, as one list and one detail panel
--
-- THE LIST HAS TO HOLD BOTH, and they are different rows in different
-- tables. A request that nobody has accepted is not a booking: it has no
-- helper, no payment and no money moved. Operators do not think that
-- way — they think "where is RQ-1081" — so admin_activity returns one
-- stream with a `kind` on every row, and the console never pretends a
-- request is a booking or loses one because it was looking in the wrong
-- table.
--
-- THE DETAIL PANEL IS THE POINT. Clicking anything opens the same panel:
-- who, where, the timeline from request to settlement, the money in its
-- separate states, and the actions that are ACTUALLY AVAILABLE. That
-- last part is the rule this migration exists to enforce — the panel
-- asks the database what may be done rather than deciding for itself,
-- because a console that offers Cancel on a completed booking is a
-- console that teaches its operators to distrust it.
--
-- PRIVATE INSTRUCTIONS STAY PRIVATE UNTIL SOMEBODY SAYS WHY. 0083 split
-- the handover so a meeting point and a recipient's name reach the
-- assigned helper and nobody else. An admin can see them — support
-- cannot resolve a dispute about a doorstep they are not allowed to read
-- — but the reveal is a recorded act with a reason attached, not a
-- field that renders by default in everybody's browser.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 0. Somewhere to put what staff write down.
--
-- The console's Notes tab had nowhere to live. Internal notes are not
-- messages: the customer must never see them, so they are not going in
-- `messages`, where one wrong join would publish them.
-- -------------------------------------------------------------------------
create table if not exists public.admin_notes (
  id           bigserial primary key,
  subject_kind text not null check (subject_kind in ('booking', 'request')),
  subject_id   uuid not null,
  body         text not null check (length(btrim(body)) > 0 and length(body) <= 4000),
  author_id    uuid references profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists admin_notes_subject_idx
  on public.admin_notes (subject_kind, subject_id, created_at desc);

alter table public.admin_notes enable row level security;

drop policy if exists admin_notes_admin_only on public.admin_notes;
create policy admin_notes_admin_only on public.admin_notes
  for all using (is_admin()) with check (is_admin());

grant select, insert on public.admin_notes to authenticated;
grant usage, select on sequence public.admin_notes_id_seq to authenticated;

comment on table public.admin_notes is
  'Internal staff notes about a booking or request. Admin-only by policy; never shown to a customer or helper, which is why they are not messages.';

-- -------------------------------------------------------------------------
-- 1. The list.
-- -------------------------------------------------------------------------
create or replace function public.admin_activity(
  p_window interval default interval '7 days',
  p_include_review boolean default false,
  p_region text default null,
  p_service text default null,
  p_kind text default 'all',          -- all | requests | bookings
  p_flag text default null,           -- attention | payment | unassigned
  p_search text default null,
  p_currency text default null,
  p_limit int default 25,
  p_offset int default 0
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_from timestamptz := now() - p_window;
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_bare text := lower(regexp_replace(coalesce(v_search, ''), '^(BK|RQ)-', '', 'i'));
  v_result jsonb;
begin
  if not is_admin() then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;

  return (
    with rows as (
      /*
        REQUESTS. `updated_at` is the last thing that happened to it,
        which for a request still matching is simply when it arrived —
        and that is the number the operator is reading as "how long has
        this person been waiting".
      */
      select
        'request'::text as kind,
        r.id,
        'RQ-' || upper(substr(r.id::text, 1, 6)) as ref,
        r.service_id,
        coalesce(s.title, r.service_id) as service_title,
        cp.full_name as customer_name,
        null::text as helper_name,
        r.status::text as status,
        null::text as payment_status,
        r.estimated_price_cents as total_cents,
        coalesce(r.intake->>'_currency', case when cp.country = 'CA' then 'CAD' else 'USD' end) as currency,
        r.created_at as updated_at,
        r.created_at,
        r.pickup_city,
        -- A request waiting more than three minutes with nobody on it.
        (r.status = 'matching' and r.created_at < now() - interval '3 minutes') as needs_attention,
        (r.status = 'matching') as unassigned,
        false as payment_issue
      from requests r
      join profiles cp on cp.id = r.customer_id
      left join services s on s.id = r.service_id
      where r.created_at >= v_from
        and (p_include_review or not coalesce(cp.is_review_account, false))
        and (p_region is null or r.pickup_city = p_region)
        and (p_service is null or r.service_id = p_service)
        and p_kind in ('all', 'requests')
        -- A request that became a booking is shown as the booking.
        and not exists (select 1 from bookings b where b.request_id = r.id)

      union all

      select
        'booking'::text,
        b.id,
        'BK-' || upper(substr(b.id::text, 1, 6)),
        b.service_id,
        coalesce(s.title, b.service_id),
        cp.full_name,
        hp.full_name,
        b.status::text,
        b.payment_status::text,
        b.total_cents,
        b.currency,
        greatest(
          b.created_at, coalesce(b.started_at, b.created_at),
          coalesce(b.completed_at, b.created_at), coalesce(b.cancelled_at, b.created_at),
          coalesce(b.captured_at, b.created_at)
        ),
        b.created_at,
        rq.pickup_city,
        (
          b.payment_status = 'failed'
          or (b.status = 'scheduled' and b.scheduled_for < now() - interval '15 minutes')
        ),
        b.provider_id is null,
        b.payment_status in ('failed', 'pending')
      from bookings b
      join profiles cp on cp.id = b.customer_id
      left join profiles hp on hp.id = b.provider_id
      left join services s on s.id = b.service_id
      left join requests rq on rq.id = b.request_id
      where b.created_at >= v_from
        and (p_include_review or not coalesce(cp.is_review_account, false))
        and (p_region is null or rq.pickup_city = p_region)
        and (p_service is null or b.service_id = p_service)
        and p_kind in ('all', 'bookings')
    ),
    filtered as (
      select * from rows
      where (p_currency is null or upper(currency) = upper(p_currency))
        and (p_flag is null
             or (p_flag = 'attention' and needs_attention)
             or (p_flag = 'payment' and payment_issue)
             or (p_flag = 'unassigned' and unassigned))
        and (v_search is null
             or lower(id::text) like v_bare || '%'
             or customer_name ilike '%' || v_search || '%'
             or helper_name ilike '%' || v_search || '%'
             or service_title ilike '%' || v_search || '%')
    )
    select jsonb_build_object(
      'as_of', now(),
      'total', (select count(*) from filtered),
      'limit', p_limit,
      'offset', p_offset,
      /*
        The five counters above the table count the SAME filtered set
        the table is showing, minus the status facet itself. A summary
        that ignores the filters is a summary of a different page.
      */
      'counts', (
        select jsonb_build_object(
          'needs_attention', count(*) filter (where needs_attention),
          'matching', count(*) filter (where status = 'matching'),
          'scheduled', count(*) filter (where status = 'scheduled'),
          'in_progress', count(*) filter (where status = 'in_progress'),
          'completed', count(*) filter (where status = 'completed'),
          'cancelled', count(*) filter (where status in ('cancelled', 'expired'))
        ) from rows
      ),
      'rows', coalesce((
        select jsonb_agg(jsonb_build_object(
          'kind', kind, 'id', id, 'ref', ref,
          'service_id', service_id, 'service_title', service_title,
          'customer_name', customer_name, 'helper_name', helper_name,
          'status', status, 'payment_status', payment_status,
          'total_cents', total_cents, 'currency', currency,
          'updated_at', updated_at, 'created_at', created_at,
          'needs_attention', needs_attention
        ) order by updated_at desc)
        from (select * from filtered order by updated_at desc limit p_limit offset p_offset) page
      ), '[]'::jsonb)
    )
  );
end $$;

revoke execute on function public.admin_activity(interval, boolean, text, text, text, text, text, text, int, int) from public;
grant execute on function public.admin_activity(interval, boolean, text, text, text, text, text, text, int, int) to authenticated;

-- -------------------------------------------------------------------------
-- 2. One record, in full.
-- -------------------------------------------------------------------------
create or replace function public.admin_activity_detail(
  p_kind text,
  p_id uuid
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_booking bookings;
  v_request requests;
  v_result jsonb;
begin
  if not is_admin() then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;

  if p_kind = 'booking' then
    select * into v_booking from bookings where id = p_id;
    if not found then return null; end if;
    select * into v_request from requests where id = v_booking.request_id;
  else
    select * into v_request from requests where id = p_id;
    if not found then return null; end if;
    select * into v_booking from bookings where request_id = v_request.id limit 1;
  end if;

  select jsonb_build_object(
    'kind', case when v_booking.id is not null then 'booking' else 'request' end,
    'id', coalesce(v_booking.id, v_request.id),
    'ref', case when v_booking.id is not null
                then 'BK-' || upper(substr(v_booking.id::text, 1, 6))
                else 'RQ-' || upper(substr(v_request.id::text, 1, 6)) end,
    'request_id', v_request.id,
    'booking_id', v_booking.id,
    'service_id', coalesce(v_booking.service_id, v_request.service_id),
    'service_title', (select title from services where id = coalesce(v_booking.service_id, v_request.service_id)),
    'status', coalesce(v_booking.status::text, v_request.status::text),
    'created_at', coalesce(v_request.created_at, v_booking.created_at),
    'scheduled_for', coalesce(v_booking.scheduled_for, v_request.scheduled_for),
    'crew_size', v_booking.crew_size,

    'customer', (
      select jsonb_build_object('id', p.id, 'name', p.full_name, 'country', p.country,
                                'is_review_account', coalesce(p.is_review_account, false))
      from profiles p where p.id = coalesce(v_booking.customer_id, v_request.customer_id)
    ),
    'helper', (
      select jsonb_build_object('id', p.id, 'name', p.full_name,
                                'status', pp.status, 'is_review_helper', coalesce(pp.is_review_helper, false))
      from profiles p
      left join provider_profiles pp on pp.user_id = p.id
      where p.id = v_booking.provider_id
    ),

    'pickup', (
      select jsonb_build_object('formatted', a.formatted, 'city', a.city,
                                'lat', st_y(a.location::geometry), 'lng', st_x(a.location::geometry),
                                'verified', a.geocode_verified)
      from addresses a where a.id = v_request.pickup_address_id
    ),
    'dropoff', (
      select jsonb_build_object('formatted', a.formatted, 'city', a.city,
                                'lat', st_y(a.location::geometry), 'lng', st_x(a.location::geometry))
      from addresses a where a.id = v_request.dropoff_address_id
    ),

    /*
      The intake as asked and answered, with the SENSITIVE KEYS REMOVED.
      Those are the ones an offer withholds from candidates (0085), and
      an admin panel is not a reason to render somebody's door code
      beside their name by default — they come back through
      admin_reveal_private_details, with a reason.
    */
    'intake', (
      select jsonb_object_agg(key, value)
      from jsonb_each(coalesce(v_request.intake, '{}'::jsonb))
      where key not like '\_%'
        and key not in ('order_ref', 'order_name', 'recipient', 'meeting_point', 'instructions')
    ),
    'handover_shared', coalesce(v_booking.handover_details, v_request.handover_details),
    'has_private_details', exists (
      select 1 from request_private_details d where d.request_id = v_request.id
    ),

    -- Money, in its separate states, never added together.
    'money', jsonb_build_object(
      'currency', v_booking.currency,
      'quote_cents', coalesce(v_booking.total_cents, v_request.estimated_price_cents),
      'base_cents', v_booking.base_price_cents,
      'service_fee_cents', v_booking.service_fee_cents,
      'tip_cents', v_booking.tip_cents,
      'platform_fee_cents', v_booking.platform_fee_cents,
      'payout_cents', v_booking.payout_cents,
      'payment_status', v_booking.payment_status,
      'authorized_at', v_booking.authorized_at,
      'captured_at', v_booking.captured_at,
      'payment_error', v_booking.payment_error,
      'refunds', coalesce((
        select jsonb_agg(jsonb_build_object('amount_cents', amount_cents, 'status', status,
                                            'reason', reason, 'created_at', created_at)
               order by created_at)
        from refunds where booking_id = v_booking.id
      ), '[]'::jsonb)
    ),

    /*
      THE TIMELINE, BUILT FROM THE ROWS THEMSELVES rather than from an
      event log nobody writes. Every entry below is a column that was
      stamped when the thing happened, so the panel cannot show a step
      that did not occur.
    */
    'timeline', (
      select jsonb_agg(e order by (e->>'at'))
      from (
        select jsonb_build_object('at', v_request.created_at, 'label', 'Request created',
                                  'detail', coalesce(v_request.pickup_city, '')) as e
        where v_request.created_at is not null
        union all
        select jsonb_build_object('at', min(ma.notified_at), 'label', 'Offered to helpers',
                 'detail', count(*)::text || ' notified')
        from match_attempts ma where ma.request_id = v_request.id
        having count(*) > 0
        union all
        select jsonb_build_object('at', ma.responded_at, 'label', 'Offer accepted',
                 'detail', coalesce((select full_name from profiles where id = ma.provider_id), ''))
        from match_attempts ma
        where ma.request_id = v_request.id and ma.response = 'accept' and ma.responded_at is not null
        union all
        select jsonb_build_object('at', v_booking.authorized_at, 'label', 'Card authorized', 'detail', '')
        where v_booking.authorized_at is not null
        union all
        select jsonb_build_object('at', v_booking.started_at, 'label', 'Job started', 'detail', '')
        where v_booking.started_at is not null
        union all
        select jsonb_build_object('at', v_booking.completed_at, 'label', 'Job completed',
                 'detail', coalesce(v_booking.completion_outcome, ''))
        where v_booking.completed_at is not null
        union all
        select jsonb_build_object('at', v_booking.captured_at, 'label', 'Payment captured', 'detail', '')
        where v_booking.captured_at is not null
        union all
        select jsonb_build_object('at', v_booking.cancelled_at, 'label', 'Cancelled',
                 'detail', coalesce(v_booking.cancel_reason, ''))
        where v_booking.cancelled_at is not null
        union all
        select jsonb_build_object('at', rf.created_at, 'label', 'Refund ' || rf.status,
                 'detail', coalesce(rf.reason, ''))
        from refunds rf where rf.booking_id = v_booking.id
      ) events
      where (e->>'at') is not null
    ),

    'offers', coalesce((
      select jsonb_agg(jsonb_build_object(
               'helper_name', p.full_name, 'response', coalesce(ma.response, 'no answer'),
               'distance_km', ma.distance_km, 'notified_at', ma.notified_at,
               'responded_at', ma.responded_at) order by ma.notified_at)
      from match_attempts ma
      left join profiles p on p.id = ma.provider_id
      where ma.request_id = v_request.id
    ), '[]'::jsonb),

    'notes', coalesce((
      select jsonb_agg(jsonb_build_object('body', n.body, 'at', n.created_at,
                                          'author', coalesce(a.full_name, 'Staff'))
             order by n.created_at desc)
      from admin_notes n
      left join profiles a on a.id = n.author_id
      where n.subject_id = coalesce(v_booking.id, v_request.id)
    ), '[]'::jsonb),

    'disputes', coalesce((
      select jsonb_agg(jsonb_build_object('category', d.category, 'status', d.status,
                                          'created_at', d.created_at))
      from disputes d where d.booking_id = v_booking.id
    ), '[]'::jsonb),

    'conversation_id', (select c.id from conversations c where c.booking_id = v_booking.id limit 1),

    /*
      WHAT MAY ACTUALLY BE DONE, decided here against the same rules the
      write functions enforce, so the panel never offers a button the
      server will refuse:

        cancel_request   a request nobody has accepted (0004)
        cancel_booking   scheduled or in progress (0004/0043)
        refund           money that was actually captured
    */
    'actions', jsonb_build_object(
      -- Admin-permitted by cancel_request (0004), and free of money:
      -- nothing is authorized until a helper accepts.
      'cancel_request', v_booking.id is null and v_request.status in ('draft', 'matching'),
      /*
        NOT OFFERED, DELIBERATELY. cancel_booking (0008) authorises the
        customer and the assigned helper and nobody else — an admin
        calling it is refused, and the fix is NOT to widen it: the hold
        release and the cancellation fee live in the API route the apps
        use, so flipping the status here would mark a booking cancelled
        while the customer's money stayed reserved.

        The reason travels with the flag so the panel can say why the
        button is missing instead of leaving a gap somebody reads as a
        bug.
      */
      'cancel_booking', false,
      'cancel_booking_reason', case
        when v_booking.id is null then null
        when v_booking.status not in ('scheduled', 'in_progress')
          then 'This booking has already ended.'
        else 'Cancelling a live booking releases the hold and may charge a fee, '
             || 'which only the customer or helper flow does safely. Use the dispute '
             || 'and refund tools for an operator-led cancellation.'
      end,
      'refund', v_booking.id is not null and v_booking.captured_at is not null
                and v_booking.payment_status in ('captured', 'partial_refund'),
      'reveal_private', exists (select 1 from request_private_details d where d.request_id = v_request.id)
    )
  ) into v_result;

  return v_result;
end $$;

revoke execute on function public.admin_activity_detail(text, uuid) from public;
grant execute on function public.admin_activity_detail(text, uuid) to authenticated;

-- -------------------------------------------------------------------------
-- 3. Reading somebody's door code is an act, not a page load.
-- -------------------------------------------------------------------------
create or replace function public.admin_reveal_private_details(
  p_request_id uuid,
  p_reason text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_details jsonb;
begin
  if not is_admin() then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 8 then
    raise exception 'A reason is required before private instructions are shown.'
      using errcode = 'HW040';
  end if;

  select details into v_details from request_private_details where request_id = p_request_id;
  if v_details is null then
    return jsonb_build_object('details', null, 'note', 'This request has no private instructions.');
  end if;

  -- Recorded before it is returned: who looked, at what, and why.
  insert into audit_log (actor_id, action, target_table, target_id, payload)
  values (auth.uid(), 'admin.private_details_revealed', 'request_private_details',
          p_request_id, jsonb_build_object('reason', btrim(p_reason)));

  return jsonb_build_object('details', v_details, 'note', null);
end $$;

revoke execute on function public.admin_reveal_private_details(uuid, text) from public;
grant execute on function public.admin_reveal_private_details(uuid, text) to authenticated;

comment on function public.admin_reveal_private_details is
  'Returns the handover answers RLS keeps for the assigned helper, and writes an audit_log entry naming the reason. An admin may read them; nobody reads them silently.';

-- -------------------------------------------------------------------------
-- 4. Notes.
-- -------------------------------------------------------------------------
create or replace function public.admin_add_note(
  p_subject_kind text,
  p_subject_id uuid,
  p_body text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_id bigint;
begin
  if not is_admin() then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;
  if p_subject_kind not in ('booking', 'request') then
    raise exception 'A note belongs to a booking or a request.' using errcode = 'HW041';
  end if;

  insert into admin_notes (subject_kind, subject_id, body, author_id)
  values (p_subject_kind, p_subject_id, btrim(p_body), auth.uid())
  returning id into v_id;

  return jsonb_build_object('id', v_id);
end $$;

revoke execute on function public.admin_add_note(text, uuid, text) from public;
grant execute on function public.admin_add_note(text, uuid, text) to authenticated;

-- -------------------------------------------------------------------------
-- 5. The guards, proven rather than asserted.
-- -------------------------------------------------------------------------
do $$
declare
  v_customer uuid;
  v_request uuid;
  v_refused int := 0;
begin
  select id into v_customer from profiles where role = 'customer' limit 1;
  select id into v_request from requests limit 1;
  if v_customer is null then
    raise notice '0099: no customer to test the guards with; skipped.';
    return;
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_customer::text, 'role', 'authenticated',
                      'app_metadata', json_build_object('role', 'customer'))::text, true);

  begin perform admin_activity(); exception when insufficient_privilege then v_refused := v_refused + 1; end;
  begin perform admin_activity_detail('request', v_request); exception when insufficient_privilege then v_refused := v_refused + 1; end;
  begin perform admin_reveal_private_details(v_request, 'because I said so');
  exception when insufficient_privilege then v_refused := v_refused + 1; end;

  perform set_config('request.jwt.claims', '', true);

  if v_refused <> 3 then
    raise exception '0099: a customer reached % of the three admin functions.', 3 - v_refused;
  end if;
end $$;

-- A reason is not optional, and that is worth proving too.
do $$
declare
  v_request uuid;
  v_refused boolean := false;
begin
  select request_id into v_request from request_private_details limit 1;
  if v_request is null then
    raise notice '0099: no private details to test the reason requirement against; skipped.';
    return;
  end if;
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-000000000000","role":"authenticated","app_metadata":{"role":"admin"}}', true);
  begin
    perform admin_reveal_private_details(v_request, 'oops');
  exception when others then
    if sqlerrm like '%reason is required%' then v_refused := true; else raise; end if;
  end;
  perform set_config('request.jwt.claims', '', true);
  if not v_refused then
    raise exception '0099: private details were revealed without a reason.';
  end if;
end $$;
