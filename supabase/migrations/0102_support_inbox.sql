-- CLASS: pre-deploy
-- =========================================================================
-- 0102 — the support inbox: conversations and operational issues together
--
-- The page this replaces was eight count cards linking to eight other
-- pages. It could tell you that four disputes were open; it could not
-- hold a conversation, because there was nowhere for one to live. A
-- customer writing to support@helpward.com reached a Google mailbox
-- that the console has never been able to see.
--
-- SO THIS GIVES SUPPORT A SPINE: a case, its thread, and the three
-- facts an operator needs on every row — who owns it, what it is
-- waiting on, and when a reply is due.
--
-- FOUR THINGS IT REFUSES TO FAKE:
--
--   1. DELIVERY. An outbound message carries its own delivery_status.
--      Writing a reply records it; the send happens afterwards and
--      stamps 'sent', 'failed' with the provider's reason, or
--      'not_configured' when no mail key is present. Nothing in the
--      thread may look sent because somebody clicked Send.
--
--   2. THE CLOCK. due_at is set BY THE TRIGGER from the last inbound
--      message, four hours on — a target we state rather than an SLA we
--      invented. An outbound reply clears it, because the wait is then
--      theirs. Overdue is therefore arithmetic nobody can fudge.
--
--   3. THE IN-APP CHANNEL. A reply on an in_app case becomes a
--      notification AND a thread the customer can open and answer, with
--      RLS that lets them read their own case and never an internal
--      note. A channel the customer cannot read is not a channel.
--
--   4. ONE MEANING FOR "OPEN SUPPORT CASE". 0101 counted disputes.
--      This adds cases, so customer_attention and admin_customer_detail
--      are replaced here to count both — a customer with an unanswered
--      email is not "nothing outstanding" on the customers page while
--      the inbox is shouting about them.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 0. Assumptions, checked out loud.
-- -------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'customer_attention') then
    raise exception 'REFUSING: customer_attention() is missing. Apply 0101 first.';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'disputes' and column_name = 'owner_id') then
    raise exception 'REFUSING: disputes.owner_id is missing. Apply 0101 first.';
  end if;
end $$;

-- -------------------------------------------------------------------------
-- 1. The case.
-- -------------------------------------------------------------------------
create table if not exists public.support_cases (
  id              uuid primary key default gen_random_uuid(),
  subject         text not null check (length(btrim(subject)) > 0 and length(subject) <= 200),
  status          text not null default 'open' check (status in ('open', 'waiting', 'resolved')),
  priority        text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  channel         text not null check (channel in ('email', 'in_app')),
  customer_id     uuid references public.profiles(id) on delete set null,
  -- Somebody can write in from an address we do not know. A case with no
  -- account is still a case; it is not an error to be dropped.
  contact_email   text,
  booking_id      uuid references public.bookings(id) on delete set null,
  dispute_id      uuid references public.disputes(id) on delete set null,
  assignee_id     uuid references public.profiles(id) on delete set null,
  tags            text[] not null default '{}',
  due_at          timestamptz,
  last_message_at timestamptz not null default now(),
  last_inbound_at timestamptz,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  resolved_at     timestamptz,
  resolved_by     uuid references public.profiles(id) on delete set null,
  constraint support_cases_reachable check (customer_id is not null or contact_email is not null)
);

create index if not exists support_cases_open_idx
  on public.support_cases (status, due_at nulls last) where status <> 'resolved';
create index if not exists support_cases_customer_idx
  on public.support_cases (customer_id, created_at desc);
create index if not exists support_cases_assignee_idx
  on public.support_cases (assignee_id) where status <> 'resolved';

comment on column public.support_cases.due_at is
  'When a reply is due: four hours from the last inbound message, set by trg_support_message_rolls_case. An outbound reply clears it.';

-- -------------------------------------------------------------------------
-- 2. The thread.
-- -------------------------------------------------------------------------
create table if not exists public.support_messages (
  id                  uuid primary key default gen_random_uuid(),
  case_id             uuid not null references public.support_cases(id) on delete cascade,
  kind                text not null check (kind in ('inbound', 'outbound', 'note')),
  channel             text check (channel in ('email', 'in_app')),
  author_id           uuid references public.profiles(id) on delete set null,
  from_address        text,
  to_address          text,
  body                text not null check (length(btrim(body)) > 0 and length(body) <= 20000),
  /*
    WHAT ACTUALLY HAPPENED TO IT. 'recorded' is the honest state of a
    message that has been written down and not yet handed to anybody —
    which is also the state it stays in if the send throws. Only the
    send may write 'sent'.
  */
  delivery_status     text not null default 'recorded'
                      check (delivery_status in ('recorded', 'sent', 'delivered', 'not_configured', 'failed')),
  delivery_error      text,
  provider_message_id text,
  created_at          timestamptz not null default now()
);

create index if not exists support_messages_case_idx
  on public.support_messages (case_id, created_at);

-- -------------------------------------------------------------------------
-- 3. The clock, kept by the database.
--
-- Every screen that shows "overdue" reads due_at, and due_at is only
-- ever written here — from the message that moved the case. An operator
-- cannot make a case look answered by editing a field, and a reply
-- cannot forget to stop the clock.
-- -------------------------------------------------------------------------
create or replace function public.support_message_rolls_case()
returns trigger
language plpgsql set search_path = public as $$
begin
  if new.kind = 'inbound' then
    update support_cases set
      last_message_at = new.created_at,
      last_inbound_at = new.created_at,
      due_at          = new.created_at + interval '4 hours',
      -- A resolved case that is written to again is open again. The
      -- alternative is a reply nobody is counted as owing.
      status          = 'open',
      resolved_at     = null,
      resolved_by     = null
    where id = new.case_id;
  elsif new.kind = 'outbound' then
    update support_cases set
      last_message_at = new.created_at,
      due_at          = null,
      status          = case when status = 'resolved' then 'resolved' else 'waiting' end
    where id = new.case_id;
  else
    update support_cases set last_message_at = new.created_at where id = new.case_id;
  end if;
  return new;
end $$;

drop trigger if exists trg_support_message_rolls_case on public.support_messages;
create trigger trg_support_message_rolls_case
  after insert on public.support_messages
  for each row execute function public.support_message_rolls_case();

-- -------------------------------------------------------------------------
-- 4. Who may see what.
--
-- The customer may read their own case and the messages in it — except
-- the internal notes, which exist to be honest between staff. They may
-- not write directly; support_customer_reply does it, so the clock and
-- the status cannot be set by the person waiting on them.
-- -------------------------------------------------------------------------
alter table public.support_cases enable row level security;
alter table public.support_messages enable row level security;

drop policy if exists support_cases_admin on public.support_cases;
create policy support_cases_admin on public.support_cases
  for all using (is_admin()) with check (is_admin());

drop policy if exists support_cases_own on public.support_cases;
create policy support_cases_own on public.support_cases
  for select using (customer_id = auth.uid());

drop policy if exists support_messages_admin on public.support_messages;
create policy support_messages_admin on public.support_messages
  for all using (is_admin()) with check (is_admin());

drop policy if exists support_messages_own on public.support_messages;
create policy support_messages_own on public.support_messages
  for select using (
    kind <> 'note'
    and exists (select 1 from support_cases c
                 where c.id = support_messages.case_id and c.customer_id = auth.uid())
  );

revoke all on public.support_cases from anon, authenticated;
revoke all on public.support_messages from anon, authenticated;
grant select, insert, update on public.support_cases to authenticated;
grant select, insert, update on public.support_messages to authenticated;

/*
  AND THE CONSOLE IS TOLD WHEN THEY CHANGE. The inbox subscribes to
  these two tables so a customer's reply appears without anybody
  pressing refresh; a table outside the publication simply never
  reports, which looks exactly like a quiet afternoon.
*/
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.support_cases;
    exception when duplicate_object then null;
    end;
    begin
      alter publication supabase_realtime add table public.support_messages;
    exception when duplicate_object then null;
    end;
  else
    raise notice '0102: no supabase_realtime publication here; the inbox will poll instead.';
  end if;
end $$;

-- -------------------------------------------------------------------------
-- 5. The inbox list.
-- -------------------------------------------------------------------------
create or replace function public.admin_inbox_list(
  p_status text default 'open',       -- open | waiting | resolved | all
  p_owner text default null,          -- 'me' | 'unassigned' | an admin's uuid
  p_priority text default null,
  p_channel text default null,
  p_search text default null,
  p_sort text default 'oldest',       -- oldest | newest | due
  p_include_review boolean default false,
  p_limit int default 8,
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
        c.*,
        p.full_name as customer_name,
        p.avatar_url as customer_avatar,
        a.full_name as assignee_name,
        (select m.body from support_messages m
          where m.case_id = c.id and m.kind <> 'note'
          order by m.created_at desc limit 1) as snippet,
        (select count(*) from support_messages m where m.case_id = c.id and m.kind <> 'note') as message_count
      from support_cases c
      left join profiles p on p.id = c.customer_id
      left join profiles a on a.id = c.assignee_id
      where (p_include_review or not coalesce(p.is_review_account, false))
    ),
    filtered as (
      select * from base
      where case p_status
              when 'open' then status in ('open', 'waiting')
              when 'waiting' then status = 'waiting'
              when 'resolved' then status = 'resolved'
              else true
            end
        and (p_owner is null
             or (p_owner = 'unassigned' and assignee_id is null)
             or (p_owner = 'me' and assignee_id = auth.uid())
             or (p_owner not in ('me', 'unassigned') and assignee_id = p_owner::uuid))
        and (p_priority is null or priority = p_priority)
        and (p_channel is null or channel = p_channel)
        and (v_search is null
             or subject ilike '%' || v_search || '%'
             or customer_name ilike '%' || v_search || '%'
             or contact_email ilike '%' || v_search || '%'
             or snippet ilike '%' || v_search || '%'
             or id::text like lower(regexp_replace(v_search, '^(cs|CS)-', '')) || '%')
    )
    select jsonb_build_object(
      'as_of', now(),
      'total', (select count(*) from filtered),
      'limit', p_limit,
      'offset', p_offset,

      /*
        THE FOUR COUNTERS, over every unresolved case rather than the
        filtered page: a counter that moves when you click a chip is a
        counter nobody can act on. They overlap by design — an overdue
        case can also be unassigned — and none of them is a total.
      */
      'counts', (
        select jsonb_build_object(
          'unassigned', count(*) filter (where status <> 'resolved' and assignee_id is null),
          'due_soon', count(*) filter (
            where status <> 'resolved' and due_at is not null
              and due_at > now() and due_at <= now() + interval '1 hour'),
          'overdue', count(*) filter (where status <> 'resolved' and due_at is not null and due_at < now()),
          'waiting_on_customer', count(*) filter (where status = 'waiting'),
          'mine', count(*) filter (where status <> 'resolved' and assignee_id = auth.uid()),
          'urgent', count(*) filter (where status <> 'resolved' and priority = 'urgent'),
          'open_total', count(*) filter (where status <> 'resolved')
        ) from base
      ),

      'rows', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', id,
                 'ref', 'CS-' || upper(substr(id::text, 1, 4)),
                 'subject', subject,
                 'snippet', left(regexp_replace(coalesce(snippet, ''), '\s+', ' ', 'g'), 140),
                 'customer_id', customer_id,
                 'customer_name', coalesce(customer_name, contact_email, 'Unknown sender'),
                 'customer_avatar', customer_avatar,
                 'channel', channel,
                 'status', status,
                 'priority', priority,
                 'assignee_id', assignee_id,
                 'assignee_name', assignee_name,
                 'due_at', due_at,
                 'last_message_at', last_message_at,
                 'message_count', message_count,
                 'age_seconds', extract(epoch from now() - last_message_at))
               order by page.ord)
        from (
          select *,
            row_number() over (order by
              case p_sort when 'newest' then last_message_at end desc nulls last,
              case when p_sort = 'due' then due_at end asc nulls last,
              case when p_sort = 'oldest' then last_message_at end asc nulls last
            ) as ord
          from filtered
          order by ord
          limit p_limit offset p_offset
        ) page
      ), '[]'::jsonb)
    )
  );
end $$;

revoke execute on function public.admin_inbox_list(text, text, text, text, text, text, boolean, int, int) from public;
grant execute on function public.admin_inbox_list(text, text, text, text, text, text, boolean, int, int) to authenticated;

-- -------------------------------------------------------------------------
-- 6. One case, its thread, and what it is attached to.
-- -------------------------------------------------------------------------
create or replace function public.admin_inbox_detail(p_case_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_c support_cases;
  v_b bookings;
begin
  if not is_admin() then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;

  select * into v_c from support_cases where id = p_case_id;
  if not found then return null; end if;
  select * into v_b from bookings where id = v_c.booking_id;

  return jsonb_build_object(
    'id', v_c.id,
    'ref', 'CS-' || upper(substr(v_c.id::text, 1, 4)),
    'subject', v_c.subject,
    'status', v_c.status,
    'priority', v_c.priority,
    'channel', v_c.channel,
    'tags', to_jsonb(v_c.tags),
    'due_at', v_c.due_at,
    'created_at', v_c.created_at,
    'last_inbound_at', v_c.last_inbound_at,
    'resolved_at', v_c.resolved_at,
    'assignee', (select jsonb_build_object('id', p.id, 'name', p.full_name)
                   from profiles p where p.id = v_c.assignee_id),
    'customer', case when v_c.customer_id is null then null else (
      select jsonb_build_object(
               'id', p.id,
               'name', p.full_name,
               'ref', 'CU-' || upper(substr(p.id::text, 1, 4)),
               'avatar_url', p.avatar_url,
               'is_review_account', coalesce(p.is_review_account, false))
        from profiles p where p.id = v_c.customer_id) end,
    'contact_email', v_c.contact_email,

    /*
      THE THREAD. Internal notes are in it for staff — this document is
      only ever built for an admin — and each outbound message carries
      what actually happened to it rather than the fact somebody pressed
      a button.
    */
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', m.id,
               'kind', m.kind,
               'channel', m.channel,
               'body', m.body,
               'author', coalesce(a.full_name, case when m.kind = 'inbound' then null else 'Staff' end),
               'author_id', m.author_id,
               'from_address', m.from_address,
               'to_address', m.to_address,
               'delivery_status', m.delivery_status,
               'delivery_error', m.delivery_error,
               'at', m.created_at)
             order by m.created_at)
      from support_messages m left join profiles a on a.id = m.author_id
      where m.case_id = v_c.id
    ), '[]'::jsonb),

    'booking', case when v_b.id is null then null else jsonb_build_object(
      'id', v_b.id,
      'ref', 'BK-' || upper(substr(v_b.id::text, 1, 4)),
      'service', (select title from services where id = v_b.service_id),
      'status', v_b.status,
      'scheduled_for', v_b.scheduled_for,
      'helper', (select full_name from profiles where id = v_b.provider_id),
      'currency', v_b.currency,
      'total_cents', v_b.total_cents,
      'payment_status', v_b.payment_status,
      'captured_at', v_b.captured_at,
      'authorized_at', v_b.authorized_at) end,

    'dispute', case when v_c.dispute_id is null then null else (
      select jsonb_build_object('id', d.id, 'ref', 'DS-' || upper(substr(d.id::text, 1, 4)),
                                'status', d.status, 'category', d.category)
        from disputes d where d.id = v_c.dispute_id) end,

    /*
      THE CASE'S OWN HISTORY, built from stamped columns and the thread
      itself rather than an event table nobody writes to.
    */
    'activity', coalesce((
      select jsonb_agg(e order by (e->>'at')) from (
        select jsonb_build_object('at', v_c.created_at, 'label', 'Case created',
                 'detail', case when v_c.channel = 'email' then 'Email' else 'In-app' end) as e
        union all
        select jsonb_build_object('at', m.created_at,
                 'label', case m.kind when 'inbound' then 'Message received'
                                      when 'outbound' then 'Reply sent'
                                      else 'Internal note added' end,
                 'detail', coalesce(a.full_name, ''))
          from support_messages m left join profiles a on a.id = m.author_id
         where m.case_id = v_c.id
        union all
        select jsonb_build_object('at', v_c.resolved_at, 'label', 'Resolved',
                 'detail', coalesce((select full_name from profiles where id = v_c.resolved_by), ''))
         where v_c.resolved_at is not null
      ) events
    ), '[]'::jsonb),

    'actions', jsonb_build_object(
      'reply', v_c.status <> 'resolved' or true,
      'resolve', v_c.status <> 'resolved',
      'reopen', v_c.status = 'resolved',
      'open_safety_case', v_c.booking_id is not null and v_c.dispute_id is null,
      'open_safety_case_blocked_reason', case
        when v_c.dispute_id is not null then 'This case already has a safety case attached.'
        when v_c.booking_id is null then 'A safety case attaches to a booking, and none is linked to this conversation.'
        else null end,
      'email_to', coalesce(v_c.contact_email,
        case when v_c.channel = 'email' then (select email from auth.users where id = v_c.customer_id) end)
    )
  );
end $$;

revoke execute on function public.admin_inbox_detail(uuid) from public;
grant execute on function public.admin_inbox_detail(uuid) to authenticated;

-- -------------------------------------------------------------------------
-- 7. Writing: a reply is recorded first and sent afterwards.
-- -------------------------------------------------------------------------
create or replace function public.admin_support_reply(
  p_case_id uuid,
  p_body text,
  p_internal boolean default false
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_c support_cases;
  v_to text;
  v_id uuid;
begin
  if not is_admin() then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_body, ''))) = 0 then
    raise exception 'There is nothing to send.' using errcode = 'HW060';
  end if;

  select * into v_c from support_cases where id = p_case_id;
  if not found then raise exception 'No such case.' using errcode = 'HW061'; end if;

  if p_internal then
    insert into support_messages (case_id, kind, body, author_id)
    values (p_case_id, 'note', btrim(p_body), auth.uid())
    returning id into v_id;
    return jsonb_build_object('id', v_id, 'kind', 'note', 'send', false);
  end if;

  v_to := coalesce(v_c.contact_email, (select email from auth.users where id = v_c.customer_id));
  if v_c.channel = 'email' and coalesce(v_to, '') = '' then
    raise exception 'This case has no address to reply to.' using errcode = 'HW062';
  end if;

  /*
    RECORDED, NOT SENT. delivery_status stays 'recorded' until the
    caller has actually handed it to Resend (email) or written the
    notification (in-app) and come back with the outcome.
  */
  insert into support_messages (case_id, kind, channel, body, author_id, to_address, from_address)
  values (p_case_id, 'outbound', v_c.channel, btrim(p_body), auth.uid(), v_to,
          case when v_c.channel = 'email' then 'support@helpward.com' end)
  returning id into v_id;

  return jsonb_build_object(
    'id', v_id, 'kind', 'outbound', 'send', true,
    'channel', v_c.channel, 'to', v_to,
    'subject', v_c.subject,
    'customer_id', v_c.customer_id);
end $$;

create or replace function public.admin_support_mark_delivery(
  p_message_id uuid,
  p_status text,
  p_provider_id text default null,
  p_error text default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;
  if p_status not in ('sent', 'delivered', 'not_configured', 'failed', 'recorded') then
    raise exception 'Unknown delivery status.' using errcode = 'HW063';
  end if;

  update support_messages
     set delivery_status = p_status,
         provider_message_id = coalesce(p_provider_id, provider_message_id),
         delivery_error = p_error
   where id = p_message_id;
end $$;

-- -------------------------------------------------------------------------
-- 8. The rest of the moves on a case.
-- -------------------------------------------------------------------------
create or replace function public.admin_support_update(
  p_case_id uuid,
  p_status text default null,
  p_priority text default null,
  p_assignee uuid default null,
  p_clear_assignee boolean default false
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;

  update support_cases set
    status      = coalesce(p_status, status),
    priority    = coalesce(p_priority, priority),
    assignee_id = case when p_clear_assignee then null else coalesce(p_assignee, assignee_id) end,
    resolved_at = case when p_status = 'resolved' then coalesce(resolved_at, now())
                       when p_status is not null then null else resolved_at end,
    resolved_by = case when p_status = 'resolved' then coalesce(resolved_by, auth.uid())
                       when p_status is not null then null else resolved_by end,
    -- Resolving stops the clock; reopening restarts it from the last
    -- thing they said, not from the moment somebody clicked.
    due_at      = case when p_status = 'resolved' then null
                       when p_status = 'open' and last_inbound_at is not null
                         then last_inbound_at + interval '4 hours'
                       else due_at end
  where id = p_case_id;

  if not found then raise exception 'No such case.' using errcode = 'HW061'; end if;

  insert into audit_log (actor_id, action, target_table, target_id, payload)
  values (auth.uid(), 'support.case_updated', 'support_cases', p_case_id::text,
          jsonb_build_object('status', p_status, 'priority', p_priority,
                             'assignee', p_assignee, 'cleared', p_clear_assignee));
end $$;

create or replace function public.admin_support_tag(
  p_case_id uuid,
  p_tag text,
  p_remove boolean default false
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_tag text := btrim(coalesce(p_tag, ''));
begin
  if not is_admin() then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;
  if length(v_tag) = 0 or length(v_tag) > 40 then
    raise exception 'A tag is between 1 and 40 characters.' using errcode = 'HW064';
  end if;

  if p_remove then
    update support_cases set tags = array_remove(tags, v_tag) where id = p_case_id;
  else
    update support_cases set tags = (
      select array_agg(distinct t) from unnest(tags || array[v_tag]) t
    ) where id = p_case_id;
  end if;
end $$;

create or replace function public.admin_support_create(
  p_customer_id uuid,
  p_to_email text,
  p_subject text,
  p_body text,
  p_channel text default 'email',
  p_booking_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_to text := nullif(btrim(coalesce(p_to_email, '')), '');
  v_case uuid;
  v_msg jsonb;
begin
  if not is_admin() then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_subject, ''))) = 0 then
    raise exception 'Give the case a subject — it is what the inbox lists.' using errcode = 'HW065';
  end if;
  if p_channel not in ('email', 'in_app') then
    raise exception 'Unknown channel.' using errcode = 'HW066';
  end if;

  /*
    REACHING A CUSTOMER BY THEIR ACCOUNT ADDRESS IS A DISCLOSURE, even
    when the operator never sees it: it is the same act 0101 records
    when somebody reveals a contact. So the address used is written to
    the audit log with the case it was used for.
  */
  if v_to is null and p_customer_id is not null and p_channel = 'email' then
    select email into v_to from auth.users where id = p_customer_id;
    if coalesce(v_to, '') = '' then
      raise exception 'That customer has no email address on file.' using errcode = 'HW067';
    end if;
    insert into audit_log (actor_id, action, target_table, target_id, payload)
    values (auth.uid(), 'support.account_address_used', 'profiles', p_customer_id::text,
            jsonb_build_object('subject', btrim(p_subject)));
  end if;

  if p_channel = 'in_app' and p_customer_id is null then
    raise exception 'An in-app case needs a customer account to reach.' using errcode = 'HW068';
  end if;

  insert into support_cases (subject, channel, customer_id, contact_email, booking_id, created_by, assignee_id, status)
  values (btrim(p_subject), p_channel, p_customer_id,
          case when p_channel = 'email' then v_to end,
          p_booking_id, auth.uid(), auth.uid(), 'open')
  returning id into v_case;

  if length(btrim(coalesce(p_body, ''))) > 0 then
    v_msg := admin_support_reply(v_case, p_body, false);
  end if;

  return jsonb_build_object('case_id', v_case, 'message', v_msg);
end $$;

create or replace function public.admin_support_open_safety_case(
  p_case_id uuid,
  p_category text,
  p_description text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_c support_cases;
  v_dispute uuid;
begin
  if not is_admin() then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_description, ''))) < 10 then
    raise exception 'Describe the problem — the safety case is worked from this.' using errcode = 'HW069';
  end if;
  if p_category not in ('no_show', 'quality', 'damage', 'billing', 'safety', 'other') then
    raise exception 'Unknown category.' using errcode = 'HW070';
  end if;

  select * into v_c from support_cases where id = p_case_id;
  if not found then raise exception 'No such case.' using errcode = 'HW061'; end if;
  if v_c.booking_id is null then
    raise exception 'A safety case attaches to a booking, and none is linked to this conversation.'
      using errcode = 'HW071';
  end if;

  insert into disputes (booking_id, opened_by, category, description, owner_id)
  values (v_c.booking_id, auth.uid(), p_category, btrim(p_description), coalesce(v_c.assignee_id, auth.uid()))
  returning id into v_dispute;

  update support_cases set dispute_id = v_dispute, priority = 'urgent' where id = p_case_id;

  insert into audit_log (actor_id, action, target_table, target_id, payload)
  values (auth.uid(), 'support.safety_case_opened', 'disputes', v_dispute::text,
          jsonb_build_object('case_id', p_case_id, 'booking_id', v_c.booking_id));

  return v_dispute;
end $$;

revoke execute on function public.admin_support_reply(uuid, text, boolean) from public;
revoke execute on function public.admin_support_mark_delivery(uuid, text, text, text) from public;
revoke execute on function public.admin_support_update(uuid, text, text, uuid, boolean) from public;
revoke execute on function public.admin_support_tag(uuid, text, boolean) from public;
revoke execute on function public.admin_support_create(uuid, text, text, text, text, uuid) from public;
revoke execute on function public.admin_support_open_safety_case(uuid, text, text) from public;
grant execute on function public.admin_support_reply(uuid, text, boolean) to authenticated;
grant execute on function public.admin_support_mark_delivery(uuid, text, text, text) to authenticated;
grant execute on function public.admin_support_update(uuid, text, text, uuid, boolean) to authenticated;
grant execute on function public.admin_support_tag(uuid, text, boolean) to authenticated;
grant execute on function public.admin_support_create(uuid, text, text, text, text, uuid) to authenticated;
grant execute on function public.admin_support_open_safety_case(uuid, text, text) to authenticated;

-- -------------------------------------------------------------------------
-- 9. The customer's half of an in-app case.
-- -------------------------------------------------------------------------
create or replace function public.support_customer_reply(
  p_case_id uuid,
  p_body text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_c support_cases;
  v_id uuid;
begin
  select * into v_c from support_cases where id = p_case_id;
  if not found or v_c.customer_id is distinct from auth.uid() then
    -- Same answer either way: a case that is not theirs does not exist.
    raise exception 'No such case.' using errcode = 'HW061';
  end if;
  if length(btrim(coalesce(p_body, ''))) = 0 then
    raise exception 'Write something first.' using errcode = 'HW060';
  end if;

  insert into support_messages (case_id, kind, channel, body, author_id)
  values (p_case_id, 'inbound', 'in_app', btrim(p_body), auth.uid())
  returning id into v_id;

  return v_id;
end $$;

revoke execute on function public.support_customer_reply(uuid, text) from public;
grant execute on function public.support_customer_reply(uuid, text) to authenticated;

create or replace function public.support_customer_cases()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', c.id,
             'ref', 'CS-' || upper(substr(c.id::text, 1, 4)),
             'subject', c.subject,
             'status', c.status,
             'channel', c.channel,
             'last_message_at', c.last_message_at,
             'awaiting_us', c.status <> 'resolved' and c.due_at is not null)
           order by c.last_message_at desc)
    from support_cases c where c.customer_id = auth.uid() and c.channel = 'in_app'
  ), '[]'::jsonb);
end $$;

grant execute on function public.support_customer_cases() to authenticated;

-- -------------------------------------------------------------------------
-- 10. Operational alerts — the other half of this page.
--
-- Every row is a count of rows that exist, with the place to go and
-- fix them. Nothing is scored, nothing is predicted, and an alert with
-- nothing in it is not shown.
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
       where d.status in ('open', 'investigating', 'escalated')
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
-- 11. One meaning for "open support case".
--
-- 0101 counted disputes, because disputes were all there was. A
-- customer with an unanswered email must not read as "nothing
-- outstanding" on the customers page while this inbox is shouting
-- about them, so both functions are replaced to count both.
-- -------------------------------------------------------------------------
create or replace function public.customer_attention(p_user_id uuid)
returns text
language sql stable set search_path = public as $$
  select case
    when exists (
      select 1 from disputes d join bookings b on b.id = d.booking_id
       where b.customer_id = p_user_id and d.status in ('open', 'investigating', 'escalated'))
      or exists (
      select 1 from support_cases c
       where c.customer_id = p_user_id and c.status <> 'resolved')
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
-- 12. The guards, proven.
-- -------------------------------------------------------------------------
do $$
declare
  v_customer uuid;
  v_case uuid;
  v_msg uuid;
  v_due timestamptz;
  v_status text;
  v_refused int := 0;
  v_visible int;
begin
  select id into v_customer from profiles where role = 'customer' limit 1;
  if v_customer is null then
    raise notice '0102: no customer fixture; guards not exercised.';
    return;
  end if;

  -- The clock is kept by the trigger, both ways.
  insert into support_cases (subject, channel, customer_id, status)
  values ('0102 self-test', 'in_app', v_customer, 'open') returning id into v_case;

  insert into support_messages (case_id, kind, channel, body, author_id)
  values (v_case, 'inbound', 'in_app', 'self-test inbound', v_customer);
  select due_at, status into v_due, v_status from support_cases where id = v_case;
  if v_due is null or v_status <> 'open' then
    raise exception '0102: an inbound message did not start the clock (due %, status %).', v_due, v_status;
  end if;

  insert into support_messages (case_id, kind, channel, body, author_id)
  values (v_case, 'outbound', 'in_app', 'self-test reply', null) returning id into v_msg;
  select due_at, status into v_due, v_status from support_cases where id = v_case;
  if v_due is not null or v_status <> 'waiting' then
    raise exception '0102: a reply did not stop the clock (due %, status %).', v_due, v_status;
  end if;

  -- A reply is recorded, never born sent.
  if (select delivery_status from support_messages where id = v_msg) <> 'recorded' then
    raise exception '0102: an outbound message was created already marked as sent.';
  end if;

  -- An internal note is for staff. The customer reads their own thread
  -- and must not find it there.
  insert into support_messages (case_id, kind, body, author_id)
  values (v_case, 'note', 'internal only, self-test', null);

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_customer::text, 'role', 'authenticated',
                      'app_metadata', json_build_object('role', 'customer'))::text, true);
  perform set_config('role', 'authenticated', true);

  select count(*) into v_visible from support_messages where case_id = v_case;

  begin perform admin_inbox_list(); exception when insufficient_privilege then v_refused := v_refused + 1; end;
  begin perform admin_inbox_detail(v_case); exception when insufficient_privilege then v_refused := v_refused + 1; end;
  begin perform admin_support_reply(v_case, 'trying it on'); exception when insufficient_privilege then v_refused := v_refused + 1; end;
  begin perform admin_support_update(v_case, 'resolved'); exception when insufficient_privilege then v_refused := v_refused + 1; end;
  begin perform admin_operational_alerts(); exception when insufficient_privilege then v_refused := v_refused + 1; end;

  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);

  if v_visible <> 2 then
    raise exception '0102: the customer saw % of their thread; expected the 2 messages and not the note.', v_visible;
  end if;
  if v_refused <> 5 then
    raise exception '0102: a customer reached % of the five admin functions.', 5 - v_refused;
  end if;

  delete from support_cases where id = v_case;
end $$;

-- -------------------------------------------------------------------------
-- 13. The customers page learns about conversations.
--
-- Replaces 0101's admin_customer_detail. Two changes and nothing else:
-- stats.open_cases counts conversations as well as disputes, and the
-- cases array carries both kinds, each labelled with where it is worked.
-- Replaced wholesale rather than patched because a function has one
-- body; the version here is the one that runs.
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
      'open_cases', (select count(*) from disputes d join bookings b on b.id = d.booking_id
                      where b.customer_id = v_p.id and d.status in ('open', 'investigating', 'escalated'))
                    + (select count(*) from support_cases s
                        where s.customer_id = v_p.id and s.status <> 'resolved'),
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
      BOTH KINDS OF CASE, each saying which it is. A dispute is worked
      on the safety page and a conversation in the inbox; the panel
      needs to know where to send somebody, and the attention chip on
      the row counts the same two things (0102).
    */
    'cases', (
      select coalesce(jsonb_agg(x order by (x->>'created_at') desc), '[]'::jsonb) from (
        select jsonb_build_object(
                 'kind', 'dispute',
                 'id', d.id,
                 'ref', 'CS-' || upper(substr(d.id::text, 1, 4)),
                 'category', d.category,
                 'description', d.description,
                 'status', d.status,
                 'created_at', d.created_at,
                 'age_seconds', extract(epoch from now() - d.created_at),
                 'owner_id', d.owner_id,
                 'owner_name', (select full_name from profiles where id = d.owner_id),
                 'booking_id', d.booking_id,
                 'booking_ref', 'BK-' || upper(substr(d.booking_id::text, 1, 4))) as x
          from disputes d join bookings b on b.id = d.booking_id
         where b.customer_id = v_p.id and d.status in ('open', 'investigating', 'escalated')
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
         where s.customer_id = v_p.id and s.status <> 'resolved'
      ) all_cases
    ),

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
