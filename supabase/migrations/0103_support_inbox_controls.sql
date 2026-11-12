-- CLASS: pre-deploy
-- =========================================================================
-- 0103 — the support inbox grows up: a configured target, snooze,
--        unread, attachments, related cases
--
-- 0102 shipped the spine. The brief that followed asks for the parts
-- that make a shared inbox survive two people working it at once, and
-- it asks for one thing specifically:
--
--   "Use 'Reply due' only when you have configured a response target."
--
-- WHICH 0102 GOT WRONG. It hardcoded four hours in the trigger, so
-- every case was born owing a reply against a promise nobody had made.
-- A target is now a SETTING. With none configured, due_at is null,
-- nothing is overdue, and the console says the target is unset instead
-- of inventing one. Setting it recomputes the open cases; clearing it
-- wipes the clocks rather than leaving stale ones behind.
--
-- THE REST OF THE BRIEF, each because of what goes wrong without it:
--
--   snoozed_until   "Waiting / Snooze / Resolve" — a case that needs
--                   chasing on Thursday should not be in Tuesday's
--                   queue. A customer writing in ends the snooze, so
--                   nothing is hidden while somebody is waiting.
--   support_case_reads
--                   Unread, per staff member. A shared inbox where
--                   everyone sees the same bold row teaches people to
--                   ignore bold.
--   support_attachments
--                   The thing customers actually send: a photo of the
--                   damage, a receipt. Without it they are told to
--                   email a mailbox nobody here can see.
--
-- Related cases come from the same two tables the customers page
-- already counts, so "this is their third message about this booking"
-- is visible without leaving the conversation.
-- =========================================================================

do $$
begin
  if not exists (select 1 from information_schema.tables
                  where table_schema = 'public' and table_name = 'support_cases') then
    raise exception 'REFUSING: support_cases is missing. Apply 0102 first.';
  end if;
  if not exists (select 1 from information_schema.tables
                  where table_schema = 'public' and table_name = 'operational_settings') then
    raise exception 'REFUSING: operational_settings is missing.';
  end if;
end $$;

-- -------------------------------------------------------------------------
-- 1. The response target: a setting, not a constant.
-- -------------------------------------------------------------------------
create or replace function public.support_reply_target_minutes()
returns int
language sql stable set search_path = public as $$
  select case
           when coalesce(btrim(value), '') ~ '^[0-9]+$' then btrim(value)::int
           else null
         end
    from operational_settings
   where key = 'support_reply_target_minutes';
$$;

comment on function public.support_reply_target_minutes is
  'Minutes allowed for a first reply, or NULL when nobody has configured one. NULL means no case has a due_at and nothing is ever called overdue.';

create or replace function public.admin_set_reply_target(
  p_minutes int,
  p_reason text default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;
  if p_minutes is not null and (p_minutes < 5 or p_minutes > 10080) then
    raise exception 'A reply target is between 5 minutes and 7 days.' using errcode = 'HW072';
  end if;

  if p_minutes is null then
    delete from operational_settings where key = 'support_reply_target_minutes';
  else
    insert into operational_settings (key, value, reason, set_by, set_at)
    values ('support_reply_target_minutes', p_minutes::text,
            nullif(btrim(coalesce(p_reason, '')), ''), coalesce(auth.uid()::text, 'admin'), now())
    on conflict (key) do update set
      value = excluded.value, reason = excluded.reason,
      set_by = excluded.set_by, set_at = excluded.set_at;
  end if;

  /*
    THE CLOCKS FOLLOW THE SETTING. Changing a target that only applied
    to new messages would leave two populations of case measured
    against different promises, and clearing it would leave old due_at
    values reading as overdue forever.

    A case we have already answered has no clock: the wait is theirs.
  */
  update support_cases set due_at = case
    when p_minutes is null then null
    when status <> 'open' then null
    when last_inbound_at is null then null
    else last_inbound_at + make_interval(mins => p_minutes)
  end
  where status <> 'resolved' or due_at is not null;

  insert into audit_log (actor_id, action, target_table, target_id, payload)
  values (auth.uid(), 'support.reply_target_set', 'operational_settings',
          'support_reply_target_minutes',
          jsonb_build_object('minutes', p_minutes, 'reason', nullif(btrim(coalesce(p_reason, '')), '')));
end $$;

revoke execute on function public.admin_set_reply_target(int, text) from public;
grant execute on function public.admin_set_reply_target(int, text) to authenticated;

-- -------------------------------------------------------------------------
-- 2. Snooze.
-- -------------------------------------------------------------------------
alter table public.support_cases
  add column if not exists snoozed_until timestamptz;

comment on column public.support_cases.snoozed_until is
  'Out of the queue until this time. Cleared the moment the customer writes again — a snooze must never hide somebody who is waiting.';

create index if not exists support_cases_snoozed_idx
  on public.support_cases (snoozed_until) where snoozed_until is not null;

create or replace function public.admin_support_snooze(
  p_case_id uuid,
  p_until timestamptz
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;
  if p_until is not null and p_until <= now() then
    raise exception 'A snooze has to be in the future.' using errcode = 'HW073';
  end if;

  update support_cases set snoozed_until = p_until where id = p_case_id;
  if not found then raise exception 'No such case.' using errcode = 'HW061'; end if;

  insert into audit_log (actor_id, action, target_table, target_id, payload)
  values (auth.uid(), 'support.snoozed', 'support_cases', p_case_id::text,
          jsonb_build_object('until', p_until));
end $$;

revoke execute on function public.admin_support_snooze(uuid, timestamptz) from public;
grant execute on function public.admin_support_snooze(uuid, timestamptz) to authenticated;

-- -------------------------------------------------------------------------
-- 3. The clock, rewritten to obey the setting.
-- -------------------------------------------------------------------------
create or replace function public.support_message_rolls_case()
returns trigger
language plpgsql set search_path = public as $$
declare
  v_target int := support_reply_target_minutes();
begin
  if new.kind = 'inbound' then
    update support_cases set
      last_message_at = new.created_at,
      last_inbound_at = new.created_at,
      -- No configured target, no clock. Nothing invents one.
      due_at          = case when v_target is null then null
                             else new.created_at + make_interval(mins => v_target) end,
      status          = 'open',
      -- Somebody is waiting, so a snooze is over.
      snoozed_until   = null,
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

-- -------------------------------------------------------------------------
-- 4. Unread, per staff member.
-- -------------------------------------------------------------------------
create table if not exists public.support_case_reads (
  case_id      uuid not null references public.support_cases(id) on delete cascade,
  admin_id     uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (case_id, admin_id)
);

alter table public.support_case_reads enable row level security;

drop policy if exists support_case_reads_own on public.support_case_reads;
create policy support_case_reads_own on public.support_case_reads
  for all using (is_admin() and admin_id = auth.uid())
  with check (is_admin() and admin_id = auth.uid());

revoke all on public.support_case_reads from anon, authenticated;
grant select, insert, update on public.support_case_reads to authenticated;

create or replace function public.admin_support_mark_read(p_case_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;
  insert into support_case_reads (case_id, admin_id, last_read_at)
  values (p_case_id, auth.uid(), now())
  on conflict (case_id, admin_id) do update set last_read_at = now();
end $$;

revoke execute on function public.admin_support_mark_read(uuid) from public;
grant execute on function public.admin_support_mark_read(uuid) to authenticated;

-- -------------------------------------------------------------------------
-- 5. Attachments.
--
-- The file itself goes in a PRIVATE bucket and is only ever handed out
-- through a signed URL minted by the server. A support attachment is a
-- photograph of somebody's doorstep or a receipt with their address on
-- it; a public bucket would make every one of them a guessable URL.
-- -------------------------------------------------------------------------
create table if not exists public.support_attachments (
  id           uuid primary key default gen_random_uuid(),
  case_id      uuid not null references public.support_cases(id) on delete cascade,
  message_id   uuid references public.support_messages(id) on delete cascade,
  filename     text not null check (length(btrim(filename)) > 0 and length(filename) <= 200),
  mime_type    text,
  size_bytes   bigint check (size_bytes >= 0 and size_bytes <= 10485760),
  storage_path text not null unique,
  uploaded_by  uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists support_attachments_case_idx
  on public.support_attachments (case_id, created_at);

alter table public.support_attachments enable row level security;

drop policy if exists support_attachments_admin on public.support_attachments;
create policy support_attachments_admin on public.support_attachments
  for all using (is_admin()) with check (is_admin());

/*
  The customer sees what is attached to a message they are allowed to
  read — which, by support_messages_own, is never an internal note.
*/
drop policy if exists support_attachments_own on public.support_attachments;
create policy support_attachments_own on public.support_attachments
  for select using (
    exists (
      select 1 from support_messages m
        join support_cases c on c.id = m.case_id
       where m.id = support_attachments.message_id
         and m.kind <> 'note'
         and c.customer_id = auth.uid())
  );

revoke all on public.support_attachments from anon, authenticated;
grant select, insert on public.support_attachments to authenticated;

insert into storage.buckets (id, name, public, file_size_limit)
values ('support-attachments', 'support-attachments', false, 10485760)
on conflict (id) do update set public = false, file_size_limit = 10485760;

/*
  No storage policy for `authenticated` at all: uploads and downloads
  both go through the server, which checks the admin claim and mints a
  short-lived signed URL. The service role bypasses RLS here, so the
  absence of a policy is the policy — nobody reaches these objects with
  a browser token.
*/
drop policy if exists support_attachments_no_public_read on storage.objects;
create policy support_attachments_no_public_read on storage.objects
  for select using (bucket_id <> 'support-attachments');

-- -------------------------------------------------------------------------
-- 6. The list, with the new facts in it.
-- -------------------------------------------------------------------------
create or replace function public.admin_inbox_list(
  p_status text default 'open',       -- open | waiting | resolved | snoozed | all
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
  v_target int := support_reply_target_minutes();
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
        (select m.kind from support_messages m
          where m.case_id = c.id and m.kind <> 'note'
          order by m.created_at desc limit 1) as last_kind,
        (select count(*) from support_messages m where m.case_id = c.id and m.kind <> 'note') as message_count,
        (select count(*) from support_attachments at where at.case_id = c.id) as attachment_count,
        -- Unread is PER PERSON. A shared bold row is a bold row
        -- everybody learns to ignore.
        c.last_message_at > coalesce(
          (select r.last_read_at from support_case_reads r
            where r.case_id = c.id and r.admin_id = auth.uid()), '-infinity'::timestamptz) as unread,
        (c.snoozed_until is not null and c.snoozed_until > now()) as snoozed,
        /*
          NO TARGET, NO CLOCK — in the data, not only on the screen.
          Cases carry due_at values written while an older target was
          configured; reading those back with no target set would have
          this function reporting things overdue against a promise that
          no longer exists. The stored column stays, so restoring a
          target restores the deadlines; what this list reports is
          null until one is.
        */
        case when v_target is null then null else c.due_at end as effective_due_at
      from support_cases c
      left join profiles p on p.id = c.customer_id
      left join profiles a on a.id = c.assignee_id
      where (p_include_review or not coalesce(p.is_review_account, false))
    ),
    filtered as (
      select * from base
      where case p_status
              when 'open' then status in ('open', 'waiting') and not snoozed
              when 'waiting' then status = 'waiting' and not snoozed
              when 'resolved' then status = 'resolved'
              when 'snoozed' then snoozed
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
        The configured target travels with the list, so no screen has
        to guess whether "Reply due" means anything today.
      */
      'reply_target_minutes', v_target,

      'counts', (
        select jsonb_build_object(
          'unassigned', count(*) filter (where status <> 'resolved' and assignee_id is null and not snoozed),
          'due_soon', count(*) filter (
            where status <> 'resolved' and not snoozed and effective_due_at is not null
              and effective_due_at > now() and effective_due_at <= now() + interval '1 hour'),
          'overdue', count(*) filter (
            where status <> 'resolved' and not snoozed and effective_due_at is not null and effective_due_at < now()),
          'waiting_on_customer', count(*) filter (where status = 'waiting' and not snoozed),
          'awaiting_reply', count(*) filter (where status = 'open' and not snoozed),
          'snoozed', count(*) filter (where snoozed),
          'unread', count(*) filter (where unread and status <> 'resolved' and not snoozed),
          'mine', count(*) filter (where status <> 'resolved' and assignee_id = auth.uid() and not snoozed),
          'urgent', count(*) filter (where status <> 'resolved' and priority = 'urgent' and not snoozed),
          'open_total', count(*) filter (where status <> 'resolved')
        ) from base
      ),

      'rows', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', id,
                 'ref', 'CS-' || upper(substr(id::text, 1, 4)),
                 'subject', subject,
                 'snippet', left(regexp_replace(coalesce(snippet, ''), '\s+', ' ', 'g'), 140),
                 'last_kind', last_kind,
                 'customer_id', customer_id,
                 'customer_name', coalesce(customer_name, contact_email, 'Unknown sender'),
                 'customer_avatar', customer_avatar,
                 'channel', channel,
                 'status', status,
                 'priority', priority,
                 'assignee_id', assignee_id,
                 'assignee_name', assignee_name,
                 'due_at', effective_due_at,
                 'snoozed_until', snoozed_until,
                 'unread', unread,
                 'attachment_count', attachment_count,
                 'last_message_at', last_message_at,
                 'message_count', message_count,
                 'age_seconds', extract(epoch from now() - last_message_at))
               order by page.ord)
        from (
          select *,
            row_number() over (order by
              case p_sort when 'newest' then last_message_at end desc nulls last,
              case when p_sort = 'due' then effective_due_at end asc nulls last,
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
-- 7. The conversation, with attachments and the customer's other cases.
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
    -- Same rule as the list: a deadline is only reported while a
    -- target exists to have set it.
    'due_at', case when support_reply_target_minutes() is null then null else v_c.due_at end,
    'snoozed_until', v_c.snoozed_until,
    'reply_target_minutes', support_reply_target_minutes(),
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
               'is_review_account', coalesce(p.is_review_account, false),
               'joined_at', p.created_at,
               'bookings_total', (select count(*) from bookings b where b.customer_id = p.id))
        from profiles p where p.id = v_c.customer_id) end,
    'contact_email', v_c.contact_email,

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
               'at', m.created_at,
               'attachments', coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'id', at.id, 'filename', at.filename,
                          'mime_type', at.mime_type, 'size_bytes', at.size_bytes)
                        order by at.created_at)
                 from support_attachments at where at.message_id = m.id
               ), '[]'::jsonb))
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
      RELATED CASES — their other conversations and any dispute on the
      same booking. "This is their third message about this job" is the
      fact that changes how a reply is written, and it was previously
      only visible by leaving the conversation.
    */
    'related', case when v_c.customer_id is null and v_c.booking_id is null then '[]'::jsonb else (
      select coalesce(jsonb_agg(x order by (x->>'at') desc), '[]'::jsonb) from (
        -- Each branch is parenthesised because each carries its own
        -- LIMIT; without the brackets the limit binds to the union.
        (select jsonb_build_object(
                  'kind', 'support', 'id', s.id,
                  'ref', 'CS-' || upper(substr(s.id::text, 1, 4)),
                  'title', s.subject, 'status', s.status,
                  'at', s.last_message_at,
                  'href', '/admin/inbox?open=' || s.id::text) as x
           from support_cases s
          where s.id <> v_c.id
            and ((v_c.customer_id is not null and s.customer_id = v_c.customer_id)
                 or (v_c.booking_id is not null and s.booking_id = v_c.booking_id))
          order by s.last_message_at desc
          limit 5)
        union all
        (select jsonb_build_object(
                  'kind', 'dispute', 'id', d.id,
                  'ref', 'DS-' || upper(substr(d.id::text, 1, 4)),
                  'title', d.category || ' dispute', 'status', d.status,
                  'at', d.created_at,
                  'href', '/admin/disputes')
           from disputes d join bookings b on b.id = d.booking_id
          where d.id is distinct from v_c.dispute_id
            and ((v_c.customer_id is not null and b.customer_id = v_c.customer_id)
                 or (v_c.booking_id is not null and d.booking_id = v_c.booking_id))
          order by d.created_at desc
          limit 5)
      ) related_rows
    ) end,

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
      'resolve', v_c.status <> 'resolved',
      'reopen', v_c.status = 'resolved',
      'snooze', v_c.status <> 'resolved',
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
-- 8. Recording an attachment against the message it was sent with.
-- -------------------------------------------------------------------------
create or replace function public.admin_support_attach(
  p_message_id uuid,
  p_filename text,
  p_mime text,
  p_size bigint,
  p_path text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_case uuid;
  v_id uuid;
begin
  if not is_admin() then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;

  select case_id into v_case from support_messages where id = p_message_id;
  if v_case is null then raise exception 'No such message.' using errcode = 'HW074'; end if;

  insert into support_attachments (case_id, message_id, filename, mime_type, size_bytes, storage_path, uploaded_by)
  values (v_case, p_message_id, btrim(p_filename), p_mime, p_size, p_path, auth.uid())
  returning id into v_id;

  return v_id;
end $$;

revoke execute on function public.admin_support_attach(uuid, text, text, bigint, text) from public;
grant execute on function public.admin_support_attach(uuid, text, text, bigint, text) to authenticated;

-- -------------------------------------------------------------------------
-- 9. The guards, proven.
-- -------------------------------------------------------------------------
do $$
declare
  v_customer uuid;
  v_case uuid;
  v_due timestamptz;
  v_refused int := 0;
  v_had text;
begin
  select value into v_had from operational_settings where key = 'support_reply_target_minutes';
  select id into v_customer from profiles where role = 'customer' limit 1;
  if v_customer is null then
    raise notice '0103: no customer fixture; guards not exercised.';
    return;
  end if;

  delete from operational_settings where key = 'support_reply_target_minutes';

  insert into support_cases (subject, channel, customer_id, status)
  values ('0103 self-test', 'in_app', v_customer, 'open') returning id into v_case;

  -- NO TARGET: an inbound message must not create a deadline.
  insert into support_messages (case_id, kind, channel, body, author_id)
  values (v_case, 'inbound', 'in_app', 'no target configured', v_customer);
  select due_at into v_due from support_cases where id = v_case;
  if v_due is not null then
    raise exception '0103: a reply deadline was invented with no target configured (%).', v_due;
  end if;

  -- AND THE LIST AGREES: a stale due_at from an older target must not
  -- be reported as overdue while no target is configured.
  update support_cases set due_at = now() - interval '1 hour' where id = v_case;
  -- admin_inbox_list checks the claim itself, so the test has to carry
  -- one. Borrowing the fixture's id keeps the foreign keys happy.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_customer::text, 'role', 'authenticated',
                      'app_metadata', json_build_object('role', 'admin'))::text, true);
  if ((select admin_inbox_list('all') -> 'counts' ->> 'overdue')::int) <> 0 then
    raise exception '0103: a stale deadline was reported as overdue with no target configured.';
  end if;
  perform set_config('request.jwt.claims', '', true);
  update support_cases set due_at = null where id = v_case;

  -- A TARGET: the same message now has one, and setting it backfills.
  insert into operational_settings (key, value, set_by, set_at)
  values ('support_reply_target_minutes', '240', 'migration 0103', now());
  update support_cases set due_at = last_inbound_at + make_interval(mins => 240) where id = v_case;

  insert into support_messages (case_id, kind, channel, body, author_id)
  values (v_case, 'inbound', 'in_app', 'target configured now', v_customer);
  select due_at into v_due from support_cases where id = v_case;
  if v_due is null then
    raise exception '0103: a configured target did not produce a deadline.';
  end if;

  -- A SNOOZE MUST NOT HIDE SOMEBODY WHO IS WAITING.
  update support_cases set snoozed_until = now() + interval '2 days' where id = v_case;
  insert into support_messages (case_id, kind, channel, body, author_id)
  values (v_case, 'inbound', 'in_app', 'are you there?', v_customer);
  if (select snoozed_until from support_cases where id = v_case) is not null then
    raise exception '0103: a customer wrote in and the case stayed snoozed.';
  end if;

  -- The new functions refuse a customer, like the rest.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_customer::text, 'role', 'authenticated',
                      'app_metadata', json_build_object('role', 'customer'))::text, true);

  begin perform admin_set_reply_target(60, 'trying it on'); exception when insufficient_privilege then v_refused := v_refused + 1; end;
  begin perform admin_support_snooze(v_case, now() + interval '1 day'); exception when insufficient_privilege then v_refused := v_refused + 1; end;
  begin perform admin_support_mark_read(v_case); exception when insufficient_privilege then v_refused := v_refused + 1; end;
  begin perform admin_support_attach(gen_random_uuid(), 'x.png', 'image/png', 10, 'p'); exception when insufficient_privilege then v_refused := v_refused + 1; end;

  perform set_config('request.jwt.claims', '', true);

  if v_refused <> 4 then
    raise exception '0103: a customer reached % of the four new admin functions.', 4 - v_refused;
  end if;

  delete from support_cases where id = v_case;

  -- Leave the setting exactly as it was found.
  delete from operational_settings where key = 'support_reply_target_minutes';
  if v_had is not null then
    insert into operational_settings (key, value, set_by, set_at)
    values ('support_reply_target_minutes', v_had, 'migration 0103 restore', now());
  end if;
end $$;
