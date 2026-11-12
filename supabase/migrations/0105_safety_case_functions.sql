-- CLASS: pre-deploy
-- =========================================================================
-- 0105 — working a safety case: the queue, the file, and the decisions
--
-- 0104 built the record. This is what staff do to it, and the rules
-- are in here rather than in the console because a rule a screen
-- enforces is a rule the next screen forgets.
--
-- THE FOUR THAT MATTER:
--
--   1. NOBODY OVERWRITES ANYBODY. Every function that changes a case
--      takes the updated_at the caller was looking at. If the row has
--      moved since, it raises HW080 with who changed it and when,
--      instead of writing over somebody's finding.
--
--   2. CLOSING A CASE MOVES NOTHING. admin_dispute_resolve writes an
--      outcome, a reason and a timeline entry. It does not refund, it
--      does not restrict an account, it does not touch a payment. Those
--      are separate actions with their own confirmations, and the panel
--      says so where the button is.
--
--   3. LOOKING AT EVIDENCE IS AN EVENT. The console tells an operator
--      "access is logged", so the function that hands out a file writes
--      the access row and the timeline entry BEFORE it answers.
--
--   4. A DEADLINE IS ONLY EVER ONE SOMEBODY SET. There is no default
--      review interval. "Overdue reviews" counts cases with a
--      next_review_at in the past and nothing else.
-- =========================================================================

do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'disputes' and column_name = 'updated_at') then
    raise exception 'REFUSING: disputes.updated_at is missing. Apply 0104 first.';
  end if;
end $$;

-- -------------------------------------------------------------------------
-- 1. The clash check, in one place.
-- -------------------------------------------------------------------------
create or replace function public.dispute_guard(p_id uuid, p_expected timestamptz)
returns disputes
language plpgsql stable set search_path = public as $$
declare
  v_d disputes;
  v_who text;
begin
  select * into v_d from disputes where id = p_id;
  if not found then
    raise exception 'No such case.' using errcode = 'HW081';
  end if;

  /*
    A null expectation means "I have not read this case" and is only
    accepted from functions that append rather than change — notes and
    tasks. Everything that edits the case itself passes what it saw.
  */
  /*
    COMPARED AT MILLISECOND PRECISION. timestamptz keeps microseconds;
    JavaScript's Date — and therefore half the clients that will ever
    hold this token — keeps milliseconds. Comparing raw would refuse
    every legitimate save with a message about a colleague who never
    touched the case, which is a worse failure than the one the token
    exists to prevent. Two saves inside the same millisecond are not a
    realistic queue.
  */
  if p_expected is not null
     and date_trunc('milliseconds', v_d.updated_at) <> date_trunc('milliseconds', p_expected) then
    select coalesce(p.full_name, 'Another reviewer') into v_who
      from dispute_events e left join profiles p on p.id = e.actor_id
     where e.dispute_id = p_id order by e.created_at desc limit 1;
    raise exception '% changed this case at %. Reload before saving so nothing is overwritten.',
      coalesce(v_who, 'Somebody'), to_char(v_d.updated_at, 'HH24:MI:SS')
      using errcode = 'HW080';
  end if;

  return v_d;
end $$;

-- -------------------------------------------------------------------------
-- 2. The queue.
-- -------------------------------------------------------------------------
create or replace function public.admin_dispute_queue(
  p_tab text default 'all',          -- all | safety | service | resolved
  p_region text default null,
  p_owner text default null,         -- 'me' | 'unassigned' | uuid
  p_priority text default null,
  p_status text default null,
  p_search text default null,
  p_include_review boolean default false,
  p_limit int default 5,
  p_offset int default 0
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
begin
  if not is_admin() then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;

  return (
    with base as (
      select
        d.*,
        'SF-' || upper(substr(d.id::text, 1, 4)) as safety_ref,
        'DS-' || upper(substr(d.id::text, 1, 4)) as service_ref,
        owner.full_name as owner_name,
        cust.full_name as customer_name,
        help.full_name as helper_name,
        b.id as booking_uuid,
        coalesce(
          (select r.pickup_region from requests r where r.id = b.request_id),
          (select r.pickup_city from requests r where r.id = b.request_id),
          cust.country::text
        ) as area,
        (select count(*) from dispute_tasks t where t.dispute_id = d.id and t.done_at is null) as open_tasks,
        (select count(*) from dispute_evidence ev where ev.dispute_id = d.id) as evidence_count,
        extract(epoch from now() - d.created_at) as age_seconds,
        (d.next_review_at is not null and d.next_review_at < now() and d.status <> 'resolved') as review_overdue
      from disputes d
      left join profiles owner on owner.id = d.owner_id
      left join bookings b on b.id = d.booking_id
      left join profiles cust on cust.id = coalesce(d.customer_id, b.customer_id)
      left join profiles help on help.id = coalesce(d.helper_id, b.provider_id)
      where (p_include_review
             or not coalesce(cust.is_review_account, false))
    ),
    filtered as (
      select * from base
      where case p_tab
              when 'safety' then kind = 'safety' and status <> 'resolved'
              when 'service' then kind = 'service' and status <> 'resolved'
              when 'resolved' then status = 'resolved'
              else status <> 'resolved'
            end
        and (p_region is null or area ilike '%' || p_region || '%')
        and (p_owner is null
             or (p_owner = 'unassigned' and owner_id is null)
             or (p_owner = 'me' and owner_id = auth.uid())
             or (p_owner not in ('me', 'unassigned') and owner_id = p_owner::uuid))
        and (p_priority is null or priority = p_priority)
        and (p_status is null or status = p_status)
        and (v_search is null
             or description ilike '%' || v_search || '%'
             or customer_name ilike '%' || v_search || '%'
             or helper_name ilike '%' || v_search || '%'
             or reported_by_name ilike '%' || v_search || '%'
             or id::text like lower(regexp_replace(v_search, '^(sf|ds|SF|DS)-', '')) || '%'
             or coalesce(booking_uuid::text, '') like
                lower(regexp_replace(v_search, '^(bk|BK)-', '')) || '%')
    )
    select jsonb_build_object(
      'as_of', now(),
      'total', (select count(*) from filtered),
      'limit', p_limit,
      'offset', p_offset,

      /*
        The five summary cards. Each is a count of cases that exist
        right now, over every case rather than the filtered page, and
        "overdue reviews" counts only the ones somebody gave a review
        time — an absent deadline is not a missed one.
      */
      'counts', (
        select jsonb_build_object(
          'open', count(*) filter (where status <> 'resolved'),
          'urgent', count(*) filter (where status <> 'resolved' and priority = 'urgent'),
          'unassigned', count(*) filter (where status <> 'resolved' and owner_id is null),
          'overdue_reviews', count(*) filter (where review_overdue),
          'resolved_this_month', count(*) filter (
            where status = 'resolved' and resolved_at >= date_trunc('month', now())),
          'safety_open', count(*) filter (where status <> 'resolved' and kind = 'safety'),
          'service_open', count(*) filter (where status <> 'resolved' and kind = 'service')
        ) from base
      ),

      -- Who is carrying what, including the pile nobody owns.
      'workload', (
        select coalesce(jsonb_agg(w order by w.n desc), '[]'::jsonb) from (
          select owner_id as id, coalesce(owner_name, 'Unassigned') as name, count(*) as n
            from base where status <> 'resolved'
           group by owner_id, owner_name
        ) w
      ),

      'regions', coalesce((select jsonb_agg(distinct area) from base where area is not null), '[]'::jsonb),

      'rows', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', id,
                 'ref', case when kind = 'safety' then safety_ref else service_ref end,
                 'kind', kind,
                 'category', category,
                 'title', initcap(replace(category, '_', ' ')) ||
                          case when kind = 'safety' then ' concern' else ' issue' end,
                 'summary', left(regexp_replace(coalesce(description, ''), '\s+', ' ', 'g'), 120),
                 'priority', priority,
                 'status', status,
                 'owner_id', owner_id,
                 'owner_name', owner_name,
                 'customer_name', customer_name,
                 'helper_name', helper_name,
                 'booking_id', booking_uuid,
                 'area', area,
                 'open_tasks', open_tasks,
                 'evidence_count', evidence_count,
                 'next_review_at', next_review_at,
                 'review_overdue', review_overdue,
                 'stripe_dispute_id', stripe_dispute_id,
                 'created_at', created_at,
                 'updated_at', updated_at,
                 'age_seconds', age_seconds)
               order by page.ord)
        from (
          select *,
            row_number() over (order by
              -- URGENT FIRST, then high, then oldest. A safety queue
              -- sorted by date alone buries the one that matters.
              case priority when 'urgent' then 0 when 'high' then 1
                            when 'normal' then 2 else 3 end,
              case when review_overdue then 0 else 1 end,
              created_at asc
            ) as ord
          from filtered
          order by ord
          limit p_limit offset p_offset
        ) page
      ), '[]'::jsonb)
    )
  );
end $$;

revoke execute on function public.admin_dispute_queue(text, text, text, text, text, text, boolean, int, int) from public;
grant execute on function public.admin_dispute_queue(text, text, text, text, text, text, boolean, int, int) to authenticated;

-- -------------------------------------------------------------------------
-- 3. The case file.
-- -------------------------------------------------------------------------
create or replace function public.admin_dispute_detail(p_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_d disputes;
  v_b bookings;
  v_customer uuid;
  v_helper uuid;
begin
  if not is_admin() then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;

  select * into v_d from disputes where id = p_id;
  if not found then return null; end if;
  select * into v_b from bookings where id = v_d.booking_id;
  v_customer := coalesce(v_d.customer_id, v_b.customer_id);
  v_helper := coalesce(v_d.helper_id, v_b.provider_id);

  return jsonb_build_object(
    'id', v_d.id,
    'ref', case when v_d.kind = 'safety' then 'SF-' else 'DS-' end || upper(substr(v_d.id::text, 1, 4)),
    'kind', v_d.kind,
    'category', v_d.category,
    'title', initcap(replace(v_d.category, '_', ' ')) ||
             case when v_d.kind = 'safety' then ' concern' else ' issue' end,
    'status', v_d.status,
    'priority', v_d.priority,
    'outcome', v_d.outcome,
    'next_review_at', v_d.next_review_at,
    'created_at', v_d.created_at,
    'resolved_at', v_d.resolved_at,
    'reopened_count', v_d.reopened_count,
    'stripe_dispute_id', v_d.stripe_dispute_id,
    -- The token this panel must send back with any change it makes.
    'updated_at', v_d.updated_at,

    'owner', (select jsonb_build_object('id', p.id, 'name', p.full_name)
                from profiles p where p.id = v_d.owner_id),

    /*
      THE ORIGINAL REPORT, kept apart from everything that came after.
      What was said, by whom, through which channel, at what time —
      never edited. Corrections are notes on the timeline; this stays
      as it was received.
    */
    'report', jsonb_build_object(
      'description', v_d.description,
      'source', v_d.source,
      'reported_at', v_d.created_at,
      'reported_by', coalesce(
        (select full_name from profiles where id = v_d.opened_by),
        v_d.reported_by_name),
      'reported_by_name', v_d.reported_by_name,
      'reporter_is_staff', exists (
        select 1 from profiles p where p.id = v_d.opened_by and p.role = 'admin')),

    'parties', jsonb_build_object(
      'customer', (select jsonb_build_object('id', p.id, 'name', p.full_name,
                            'ref', 'CU-' || upper(substr(p.id::text, 1, 4)))
                     from profiles p where p.id = v_customer),
      'helper', (select jsonb_build_object('id', p.id, 'name', p.full_name,
                          'ref', 'HP-' || upper(substr(p.id::text, 1, 4)))
                   from profiles p where p.id = v_helper)),

    'booking', case when v_b.id is null then null else jsonb_build_object(
      'id', v_b.id,
      'ref', 'BK-' || upper(substr(v_b.id::text, 1, 4)),
      'service', (select title from services where id = v_b.service_id),
      'status', v_b.status,
      'scheduled_for', v_b.scheduled_for,
      'city', (select r.pickup_city from requests r where r.id = v_b.request_id)) end,

    /*
      FINANCIAL CONTEXT, READ ONLY. Captured counts the capture event,
      refunds are their own number, currencies are never added. The
      panel offers a link into the payment and no button that moves it:
      resolving a case and refunding a card are different decisions
      with different authority.
    */
    'money', case when v_b.id is null then null else jsonb_build_object(
      'currency', v_b.currency,
      'total_cents', v_b.total_cents,
      'captured_cents', case when v_b.captured_at is not null and v_b.payment_status <> 'failed'
                             then v_b.total_cents else 0 end,
      'captured_at', v_b.captured_at,
      'refunded_cents', coalesce((select sum(amount_cents) from refunds r
                                   where r.booking_id = v_b.id and r.status in ('succeeded', 'pending')), 0),
      'refund_requested', exists (select 1 from refunds r where r.booking_id = v_b.id),
      'payment_status', v_b.payment_status) end,

    'evidence', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', ev.id, 'kind', ev.kind, 'filename', ev.filename,
               'mime_type', ev.mime_type, 'size_bytes', ev.size_bytes,
               'description', ev.description, 'reference_id', ev.reference_id,
               'added_by', (select full_name from profiles where id = ev.added_by),
               'created_at', ev.created_at,
               'views', (select count(*) from dispute_evidence_access a where a.evidence_id = ev.id))
             order by ev.created_at)
      from dispute_evidence ev where ev.dispute_id = v_d.id
    ), '[]'::jsonb),

    'tasks', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', t.id, 'label', t.label,
               'done', t.done_at is not null, 'done_at', t.done_at,
               'done_by', (select full_name from profiles where id = t.done_by),
               'owner', (select full_name from profiles where id = t.owner_id))
             order by t.created_at)
      from dispute_tasks t where t.dispute_id = v_d.id
    ), '[]'::jsonb),

    'timeline', coalesce((
      select jsonb_agg(jsonb_build_object(
               'kind', e.kind, 'body', e.body, 'payload', e.payload,
               'at', e.created_at,
               'actor', coalesce(p.full_name, 'Staff'))
             order by e.created_at desc)
      from dispute_events e left join profiles p on p.id = e.actor_id
      where e.dispute_id = v_d.id
    ), '[]'::jsonb),

    -- Every previous finding, kept. Reopening files one here.
    'resolutions', coalesce((
      select jsonb_agg(jsonb_build_object(
               'outcome', r.outcome, 'reason', r.reason,
               'resolved_at', r.resolved_at,
               'resolved_by', (select full_name from profiles where id = r.resolved_by),
               'open_tasks_at_close', r.open_tasks,
               'reopened_at', r.reopened_at,
               'reopen_reason', r.reopen_reason)
             order by r.resolved_at desc)
      from dispute_resolutions r where r.dispute_id = v_d.id
    ), '[]'::jsonb),

    'escalation', case when v_d.escalated_at is null then null else jsonb_build_object(
      'to', (select full_name from profiles where id = v_d.escalated_to),
      'to_id', v_d.escalated_to,
      'at', v_d.escalated_at,
      'reason', v_d.escalation_reason,
      'acknowledged_at', v_d.escalation_ack_at,
      'acknowledged_by', (select full_name from profiles where id = v_d.escalation_ack_by)) end,

    -- Conversations opened from this case, with their delivery state.
    'conversations', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', c.id, 'ref', 'CS-' || upper(substr(c.id::text, 1, 4)),
               'subject', c.subject, 'status', c.status,
               'party_role', c.party_role, 'channel', c.channel,
               'last_message_at', c.last_message_at,
               'last_delivery', (select m.delivery_status from support_messages m
                                  where m.case_id = c.id and m.kind = 'outbound'
                                  order by m.created_at desc limit 1))
             order by c.last_message_at desc)
      from support_cases c where c.dispute_id_link = v_d.id
    ), '[]'::jsonb),

    'related', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', o.id,
               'ref', case when o.kind = 'safety' then 'SF-' else 'DS-' end || upper(substr(o.id::text, 1, 4)),
               'title', initcap(replace(o.category, '_', ' ')),
               'status', o.status, 'at', o.created_at)
             order by o.created_at desc)
      from disputes o
      where o.id <> v_d.id
        and ((v_d.booking_id is not null and o.booking_id = v_d.booking_id)
             or (v_customer is not null and coalesce(o.customer_id, o.booking_id) is not null
                 and o.customer_id = v_customer)
             or (v_helper is not null and o.helper_id = v_helper))
    ), '[]'::jsonb),

    'actions', jsonb_build_object(
      'resolve', v_d.status <> 'resolved',
      'reopen', v_d.status = 'resolved',
      'escalate', v_d.status <> 'resolved' and v_d.escalated_at is null,
      'acknowledge_escalation', v_d.escalated_at is not null and v_d.escalation_ack_at is null,
      'contact_customer', v_customer is not null,
      'contact_helper', v_helper is not null,
      'contact_blocked_reason', case
        when v_customer is null and v_helper is null
          then 'This report names nobody with an account, so there is no one to message from here.'
        else null end,
      'open_tasks', (select count(*) from dispute_tasks t where t.dispute_id = v_d.id and t.done_at is null))
  );
end $$;

revoke execute on function public.admin_dispute_detail(uuid) from public;
grant execute on function public.admin_dispute_detail(uuid) to authenticated;
