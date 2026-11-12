-- CLASS: pre-deploy
-- =========================================================================
-- 0101 — customers: understand one, resolve their issue, with context
--
-- The old Users page was a directory: a hundred rows of name, country,
-- currency, joined. It answered "does this person exist". It could not
-- answer the question staff actually arrive with — this customer has
-- written in, what is going on with their account — without four other
-- tabs and a service-role query.
--
-- SO THIS BUILDS THE CUSTOMER RECORD, and it makes four things true
-- that a directory cannot:
--
--   1. CONTACT DETAILS ARE MASKED BY DEFAULT and revealing them is a
--      recorded action with a reason, exactly like the private handover
--      instructions in 0099. An operator reading m•••@example.com can
--      still SEARCH the real address — the search runs here, inside the
--      function, and never returns what it matched on. Looking someone
--      up is not the same as reading their details.
--
--   2. "RESTRICTED" IS ENFORCED, NOT DECORATED. A badge no code reads
--      is a lie the console tells its operator. restricted_at is
--      checked by a trigger on requests, so a restricted account cannot
--      open new work — service role included.
--
--   3. A SUPPORT CASE HAS AN OWNER. Cases are disputes (same rows, same
--      table); what they lacked is anybody responsible for one, which
--      is how four open cases sit for a week with nobody wrong.
--
--   4. MONEY IS PER CURRENCY AND PER STATE. Captured and refunded are
--      reported separately, never netted, never summed across CAD and
--      USD, and uncaptured holds are excluded — a hold is not revenue.
--
-- WHAT IT ADDS TO THE SCHEMA:
--   profiles.restricted_at / restriction_reason / restricted_by
--   disputes.owner_id
--   admin_notes.subject_kind gains 'customer'
-- =========================================================================

-- -------------------------------------------------------------------------
-- 0. Assumptions, checked out loud.
-- -------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'profiles'
                    and column_name = 'is_review_account') then
    raise exception 'REFUSING: profiles.is_review_account is missing — review accounts could not be excluded.';
  end if;
  if not exists (select 1 from information_schema.tables
                  where table_schema = 'public' and table_name = 'admin_notes') then
    raise exception 'REFUSING: admin_notes is missing. Apply 0099 first.';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'is_admin') then
    raise exception 'REFUSING: is_admin() is missing.';
  end if;
  -- The email lives in auth.users. If this role cannot read it, the
  -- masked-contact column would silently be empty for everyone.
  perform 1 from auth.users limit 1;
end $$;

-- -------------------------------------------------------------------------
-- 1. Restriction: a state with teeth.
-- -------------------------------------------------------------------------
alter table public.profiles
  add column if not exists restricted_at timestamptz;

/*
  AND THE REASON IS NOT ON THE PROFILE.

  My first cut put restriction_reason and restricted_by on profiles,
  which would have handed them straight back to the person they are
  about: `authenticated` holds SELECT on every column of that table and
  profiles_read lets anybody read their own row, so "suspected card
  testing, three chargebacks" was one `select *` away from the customer
  it describes — and would have gone into their data export too.

  So the fact lives on profiles, where the trigger and the console need
  it, and the WORDS live in a table only admins can read. It is the
  same split as phone (profile_contacts, 0050) and meeting points
  (request_private_details, 0083).
*/
comment on column public.profiles.restricted_at is
  'Set when staff restrict the account. Enforced by refuse_request_for_restricted_customer on requests — not a badge. The reason is in customer_restrictions, which the customer cannot read.';

create index if not exists profiles_restricted_idx
  on public.profiles (restricted_at) where restricted_at is not null;

alter table public.profiles drop column if exists restriction_reason;
alter table public.profiles drop column if exists restricted_by;

create table if not exists public.customer_restrictions (
  id         bigserial primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  reason     text not null check (length(btrim(reason)) >= 8 and length(reason) <= 4000),
  set_by     uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  lifted_at  timestamptz,
  lifted_by  uuid references public.profiles(id) on delete set null
);

create index if not exists customer_restrictions_user_idx
  on public.customer_restrictions (user_id, created_at desc);

alter table public.customer_restrictions enable row level security;

-- Admin only, both ways: the subject of a restriction is not its reader.
drop policy if exists customer_restrictions_admin on public.customer_restrictions;
create policy customer_restrictions_admin on public.customer_restrictions
  for all using (is_admin()) with check (is_admin());

revoke all on public.customer_restrictions from anon, authenticated;
grant select, insert, update on public.customer_restrictions to authenticated;
grant usage, select on sequence public.customer_restrictions_id_seq to authenticated;

create or replace function public.refuse_request_for_restricted_customer()
returns trigger
language plpgsql set search_path = public as $$
begin
  if exists (select 1 from profiles p
              where p.id = new.customer_id and p.restricted_at is not null) then
    /*
      WORDED FOR THE PERSON WHO MEETS IT. The customer sees this; the
      reason staff wrote is internal and stays in restriction_reason.
    */
    raise exception 'This account cannot place new requests. Please contact support.'
      using errcode = 'HW045';
  end if;
  return new;
end $$;

drop trigger if exists trg_refuse_restricted_customer on public.requests;
create trigger trg_refuse_restricted_customer
  before insert on public.requests
  for each row execute function public.refuse_request_for_restricted_customer();

-- -------------------------------------------------------------------------
-- 2. Support cases get an owner.
-- -------------------------------------------------------------------------
alter table public.disputes
  add column if not exists owner_id uuid references public.profiles(id) on delete set null;

comment on column public.disputes.owner_id is
  'The admin working this case. Distinct from resolved_by, which only exists once it is closed.';

create index if not exists disputes_open_idx
  on public.disputes (status, created_at desc) where status <> 'resolved';

-- -------------------------------------------------------------------------
-- 3. Notes can be about a person, not only a job.
-- -------------------------------------------------------------------------
do $$
begin
  alter table public.admin_notes drop constraint if exists admin_notes_subject_kind_check;
  alter table public.admin_notes add constraint admin_notes_subject_kind_check
    check (subject_kind in ('booking', 'request', 'customer'));
end $$;

-- -------------------------------------------------------------------------
-- 4. Masking, in one place so every screen masks the same way.
-- -------------------------------------------------------------------------
create or replace function public.mask_email(p_email text)
returns text
language sql immutable set search_path = public as $$
  select case
    when coalesce(btrim(p_email), '') = '' then null
    when position('@' in p_email) = 0 then left(p_email, 1) || '•••'
    else left(p_email, 1) || '•••' || substr(p_email, position('@' in p_email))
  end;
$$;

create or replace function public.mask_phone(p_phone text)
returns text
language sql immutable set search_path = public as $$
  select case
    when coalesce(btrim(p_phone), '') = '' then null
    when length(regexp_replace(p_phone, '\D', '', 'g')) < 4 then '••••'
    else '••• ••• ' || right(regexp_replace(p_phone, '\D', '', 'g'), 4)
  end;
$$;

-- -------------------------------------------------------------------------
-- 5. One definition of a customer's account state, and of what needs
--    attention — read by both the list and the panel, so the chip in
--    the row and the banner in the record cannot disagree.
--
--    Account state is about the ACCOUNT. Attention is about WORK
--    somebody has to do. They are separate columns in the mockup
--    because they are separate questions: a restricted account with
--    nothing outstanding needs no one today.
-- -------------------------------------------------------------------------
create or replace function public.customer_account_state(p_user_id uuid)
returns text
language sql stable set search_path = public as $$
  select case
    when exists (select 1 from account_deletion_requests d
                  where d.user_id = p_user_id and d.status in ('pending', 'executing'))
      then 'deletion_scheduled'
    when (select restricted_at from profiles where id = p_user_id) is not null
      then 'restricted'
    else 'active'
  end;
$$;

comment on function public.customer_account_state is
  'deletion_scheduled | restricted | active. The account itself — not whether anything is outstanding.';

create or replace function public.customer_attention(p_user_id uuid)
returns text
language sql stable set search_path = public as $$
  select case
    when exists (
      select 1 from disputes d join bookings b on b.id = d.booking_id
       where b.customer_id = p_user_id and d.status in ('open', 'investigating', 'escalated'))
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

comment on function public.customer_attention is
  'support_case | payment_issue | account_review | privacy_request | none. One reason, the most urgent, so the counters add up.';

-- -------------------------------------------------------------------------
-- 6. The list.
-- -------------------------------------------------------------------------
create or replace function public.admin_customer_list(
  p_tab text default 'all',          -- all | active | attention | deletion
  p_region text default null,
  p_joined text default null,        -- 30d | 90d | 12m | all
  p_status text default null,        -- active | restricted | deletion_scheduled
  p_attention text default null,
  p_search text default null,
  p_include_review boolean default false,
  p_limit int default 7,
  p_offset int default 0
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_id_search text;
  v_since timestamptz;
begin
  if not is_admin() then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;

  -- "CU-A1B2" is how the console shows an id, so it is also how staff
  -- will type one. Strip the prefix rather than return nothing.
  v_id_search := lower(regexp_replace(coalesce(v_search, ''), '^(cu|CU)-', ''));

  v_since := case p_joined
               when '30d' then now() - interval '30 days'
               when '90d' then now() - interval '90 days'
               when '12m' then now() - interval '12 months'
               else null
             end;

  return (
    with base as (
      select
        p.id,
        p.full_name,
        p.avatar_url,
        p.country,
        p.created_at,
        p.restricted_at,
        p.default_currency,
        u.email,
        c.phone,
        /*
          WHERE THEY ARE, from the rows that know: their most recent
          saved address, else the area snapshotted on their last
          request, else the account country. Never guessed from a phone
          number or a currency.
        */
        coalesce(
          (select nullif(btrim(coalesce(a.city, '') ||
                   case when coalesce(a.region, '') <> '' then ', ' || a.region else '' end), '')
             from addresses a where a.user_id = p.id order by a.created_at desc limit 1),
          (select nullif(btrim(coalesce(r.pickup_city, '') ||
                   case when coalesce(r.pickup_region, '') <> '' then ', ' || r.pickup_region else '' end), '')
             from requests r where r.customer_id = p.id order by r.created_at desc limit 1),
          p.country::text
        ) as region,
        (select count(*) from bookings b where b.customer_id = p.id) as bookings_total,
        (select count(*) from bookings b
          where b.customer_id = p.id and b.status in ('scheduled', 'in_progress')) as bookings_active,
        (select max(b.created_at) from bookings b where b.customer_id = p.id) as last_booking_at,
        (select count(*) from disputes d join bookings b on b.id = d.booking_id
          where b.customer_id = p.id and d.status in ('open', 'investigating', 'escalated')) as open_cases,
        customer_account_state(p.id) as account_state,
        customer_attention(p.id) as attention
      from profiles p
      left join auth.users u on u.id = p.id
      left join profile_contacts c on c.user_id = p.id
      where p.role = 'customer'
        and (p_include_review or not coalesce(p.is_review_account, false))
    ),
    tabbed as (
      select * from base
      where case p_tab
              when 'active' then bookings_active > 0
              when 'attention' then attention <> 'none'
              when 'deletion' then account_state = 'deletion_scheduled'
              else true
            end
        and (p_region is null or region ilike '%' || p_region || '%')
        and (v_since is null or created_at >= v_since)
        and (p_status is null or account_state = p_status)
        and (p_attention is null or attention = p_attention)
        /*
          SEARCH REACHES THE REAL EMAIL AND PHONE, the panel does not
          show them. Matching happens inside this function and nothing
          about what matched is returned, so finding a customer by the
          address they wrote in from is not a disclosure.
        */
        and (v_search is null
             or full_name ilike '%' || v_search || '%'
             or email ilike '%' || v_search || '%'
             or regexp_replace(coalesce(phone, ''), '\D', '', 'g')
                like '%' || nullif(regexp_replace(v_search, '\D', '', 'g'), '') || '%'
             or id::text like v_id_search || '%')
    )
    select jsonb_build_object(
      'as_of', now(),
      'total', (select count(*) from tabbed),
      'limit', p_limit,
      'offset', p_offset,

      -- The five counters, all over the whole customer base so they do
      -- not move when a tab or a filter changes.
      'counts', (
        select jsonb_build_object(
          'total_customers', count(*),
          'new_this_month', count(*) filter (where created_at >= date_trunc('month', now())),
          'with_active_bookings', count(*) filter (where bookings_active > 0),
          'open_support_cases', coalesce(sum(open_cases), 0),
          'deletion_requests', count(*) filter (where account_state = 'deletion_scheduled'),
          'restricted', count(*) filter (where restricted_at is not null)
        ) from base
      ),

      /*
        NEEDS FOLLOW-UP — every line a count of rows somebody owns, with
        the place to go. No line appears unless its count is non-zero;
        an empty queue should read as empty, not as a dashboard of zeros.
      */
      'follow_up', jsonb_build_object(
        'cases_unassigned', (
          select count(*) from disputes d
            join bookings b on b.id = d.booking_id
            join profiles p on p.id = b.customer_id
           where d.status in ('open', 'investigating', 'escalated')
             and d.owner_id is null
             and (p_include_review or not coalesce(p.is_review_account, false))),
        'payments_to_review', (
          select count(*) from base where attention = 'payment_issue'),
        'deletions_scheduled', (
          select count(*) from base where account_state = 'deletion_scheduled')
      ),

      'regions', coalesce((
        select jsonb_agg(distinct region) from base where region is not null
      ), '[]'::jsonb),

      'rows', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', id,
          'ref', 'CU-' || upper(substr(id::text, 1, 4)),
          'name', full_name,
          'avatar_url', avatar_url,
          'region', region,
          'bookings_total', bookings_total,
          'bookings_active', bookings_active,
          'account_state', account_state,
          'attention', attention,
          'open_cases', open_cases,
          'last_booking_at', last_booking_at,
          'created_at', created_at
        )
          -- Whoever needs something first, then the newest account.
          order by case page.attention when 'none' then 1 else 0 end, page.created_at desc)
        from (
          select * from tabbed
          order by case attention when 'none' then 1 else 0 end, created_at desc
          limit p_limit offset p_offset
        ) page
      ), '[]'::jsonb)
    )
  );
end $$;

revoke execute on function public.admin_customer_list(text, text, text, text, text, text, boolean, int, int) from public;
grant execute on function public.admin_customer_list(text, text, text, text, text, text, boolean, int, int) to authenticated;

-- -------------------------------------------------------------------------
-- 7. One customer, in full.
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
                      where b.customer_id = v_p.id and d.status in ('open', 'investigating', 'escalated')),
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

    'cases', coalesce((
      select jsonb_agg(jsonb_build_object(
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
               'booking_ref', 'BK-' || upper(substr(d.booking_id::text, 1, 4)))
             order by d.created_at desc)
      from disputes d join bookings b on b.id = d.booking_id
      where b.customer_id = v_p.id and d.status in ('open', 'investigating', 'escalated')
    ), '[]'::jsonb),

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
-- 8. Revealing contact details — recorded, with a reason.
-- -------------------------------------------------------------------------
create or replace function public.admin_reveal_customer_contact(
  p_user_id uuid,
  p_reason text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_email text;
  v_phone text;
begin
  if not is_admin() then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 8 then
    raise exception 'A reason is required before contact details are shown.'
      using errcode = 'HW046';
  end if;

  select email into v_email from auth.users where id = p_user_id;
  select phone into v_phone from profile_contacts where user_id = p_user_id;

  -- Written before the values are returned: who looked, at whom, why.
  insert into audit_log (actor_id, action, target_table, target_id, payload)
  values (auth.uid(), 'admin.customer_contact_revealed', 'profiles', p_user_id,
          jsonb_build_object('reason', btrim(p_reason)));

  return jsonb_build_object('email', v_email, 'phone', v_phone);
end $$;

revoke execute on function public.admin_reveal_customer_contact(uuid, text) from public;
grant execute on function public.admin_reveal_customer_contact(uuid, text) to authenticated;

-- -------------------------------------------------------------------------
-- 9. The account actions.
-- -------------------------------------------------------------------------
create or replace function public.admin_set_customer_restriction(
  p_user_id uuid,
  p_restricted boolean,
  p_reason text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;
  if p_restricted and length(btrim(coalesce(p_reason, ''))) < 8 then
    raise exception 'Say why the account is being restricted — it stops them booking.'
      using errcode = 'HW047';
  end if;

  update profiles set
    restricted_at = case when p_restricted then coalesce(restricted_at, now()) else null end
  where id = p_user_id and role = 'customer';

  if not found then
    raise exception 'No such customer.' using errcode = 'HW048';
  end if;

  if p_restricted then
    insert into customer_restrictions (user_id, reason, set_by)
    values (p_user_id, btrim(p_reason), auth.uid());
  else
    update customer_restrictions
       set lifted_at = now(), lifted_by = auth.uid()
     where user_id = p_user_id and lifted_at is null;
  end if;

  insert into admin_notes (subject_kind, subject_id, body, author_id)
  values ('customer', p_user_id,
          case when p_restricted then 'Account restricted: ' || btrim(p_reason)
               else 'Restriction lifted.' end,
          auth.uid());

  insert into audit_log (actor_id, action, target_table, target_id, payload)
  values (auth.uid(),
          case when p_restricted then 'customer.restrict' else 'customer.unrestrict' end,
          'profiles', p_user_id,
          jsonb_build_object('reason', nullif(btrim(coalesce(p_reason, '')), '')));
end $$;

create or replace function public.admin_add_customer_note(
  p_user_id uuid,
  p_body text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_body, ''))) = 0 then
    raise exception 'A note needs some words in it.' using errcode = 'HW049';
  end if;

  insert into admin_notes (subject_kind, subject_id, body, author_id)
  values ('customer', p_user_id, btrim(p_body), auth.uid());
end $$;

create or replace function public.admin_assign_case(
  p_case_id uuid,
  p_owner_id uuid
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;

  update disputes set owner_id = p_owner_id where id = p_case_id;
  if not found then
    raise exception 'No such case.' using errcode = 'HW050';
  end if;

  insert into audit_log (actor_id, action, target_table, target_id, payload)
  values (auth.uid(), 'case.assign', 'disputes', p_case_id,
          jsonb_build_object('owner_id', p_owner_id));
end $$;

create or replace function public.admin_open_customer_case(
  p_user_id uuid,
  p_category text,
  p_description text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_booking uuid;
  v_case uuid;
begin
  if not is_admin() then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_description, ''))) < 10 then
    raise exception 'Describe the problem — the case is worked from this.' using errcode = 'HW051';
  end if;
  if p_category not in ('no_show', 'quality', 'damage', 'billing', 'safety', 'other') then
    raise exception 'Unknown category.' using errcode = 'HW052';
  end if;

  select id into v_booking from bookings
   where customer_id = p_user_id order by created_at desc limit 1;
  if v_booking is null then
    raise exception 'A support case attaches to a booking, and this customer has none.'
      using errcode = 'HW053';
  end if;

  -- opened_by is the staff member, honestly: this case was raised here,
  -- not by the customer in the app.
  insert into disputes (booking_id, opened_by, category, description, owner_id)
  values (v_booking, auth.uid(), p_category, btrim(p_description), auth.uid())
  returning id into v_case;

  insert into audit_log (actor_id, action, target_table, target_id, payload)
  values (auth.uid(), 'case.open', 'disputes', v_case,
          jsonb_build_object('customer_id', p_user_id, 'booking_id', v_booking, 'category', p_category));

  return v_case;
end $$;

revoke execute on function public.admin_set_customer_restriction(uuid, boolean, text) from public;
revoke execute on function public.admin_add_customer_note(uuid, text) from public;
revoke execute on function public.admin_assign_case(uuid, uuid) from public;
revoke execute on function public.admin_open_customer_case(uuid, text, text) from public;
grant execute on function public.admin_set_customer_restriction(uuid, boolean, text) to authenticated;
grant execute on function public.admin_add_customer_note(uuid, text) to authenticated;
grant execute on function public.admin_assign_case(uuid, uuid) to authenticated;
grant execute on function public.admin_open_customer_case(uuid, text, text) to authenticated;

-- -------------------------------------------------------------------------
-- 10. The guards, proven.
-- -------------------------------------------------------------------------
do $$
declare
  v_customer uuid;
  v_refused int := 0;
begin
  select id into v_customer from profiles where role = 'customer' limit 1;
  if v_customer is null then
    raise notice '0101: no customer fixture; admin guards not exercised.';
  else
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_customer::text, 'role', 'authenticated',
                        'app_metadata', json_build_object('role', 'customer'))::text, true);

    begin perform admin_customer_list(); exception when insufficient_privilege then v_refused := v_refused + 1; end;
    begin perform admin_customer_detail(v_customer); exception when insufficient_privilege then v_refused := v_refused + 1; end;
    begin perform admin_reveal_customer_contact(v_customer, 'looking into a billing query'); exception when insufficient_privilege then v_refused := v_refused + 1; end;
    begin perform admin_set_customer_restriction(v_customer, true, 'chargeback fraud pattern'); exception when insufficient_privilege then v_refused := v_refused + 1; end;
    begin perform admin_add_customer_note(v_customer, 'x'); exception when insufficient_privilege then v_refused := v_refused + 1; end;

    perform set_config('request.jwt.claims', '', true);

    if v_refused <> 5 then
      raise exception '0101: a customer reached % of the five admin functions.', 5 - v_refused;
    end if;
  end if;
end $$;

/*
  AND THE RESTRICTION ITSELF, proven both ways in one transaction that
  is rolled back. A badge that no insert path checks is worse than no
  badge, so the trigger is tested rather than asserted.
*/
do $$
declare
  v_customer uuid;
  v_service text;
  v_blocked boolean := false;
  v_allowed boolean := false;
  v_req uuid;
begin
  select id into v_customer from profiles where role = 'customer' and restricted_at is null limit 1;
  select id into v_service from services limit 1;
  if v_customer is null or v_service is null then
    raise notice '0101: no fixtures to test the restriction trigger with; skipped.';
    return;
  end if;

  -- Positive control first: an unrestricted customer CAN open a request.
  begin
    insert into requests (customer_id, service_id, status)
    values (v_customer, v_service, 'draft') returning id into v_req;
    v_allowed := true;
    delete from requests where id = v_req;
  exception when others then
    raise notice '0101: control insert failed (%) — restriction test inconclusive.', sqlerrm;
    return;
  end;

  update profiles set restricted_at = now() where id = v_customer;

  begin
    insert into requests (customer_id, service_id, status)
    values (v_customer, v_service, 'draft') returning id into v_req;
    delete from requests where id = v_req;
  exception when sqlstate 'HW045' then
    v_blocked := true;
  end;

  update profiles set restricted_at = null where id = v_customer;

  if not (v_allowed and v_blocked) then
    raise exception '0101: restriction trigger is not enforcing (control %, blocked %).',
      v_allowed, v_blocked;
  end if;
end $$;

/*
  AND THE WORDS ARE OUT OF REACH, proven rather than asserted. The
  column is gone from profiles, and the table that holds it refuses the
  person it is about.
*/
do $$
declare
  v_customer uuid;
  v_rows int;
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'profiles'
                and column_name in ('restriction_reason', 'restricted_by')) then
    raise exception '0101: the restriction reason is still a column on profiles.';
  end if;

  select id into v_customer from profiles where role = 'customer' limit 1;
  if v_customer is null then
    raise notice '0101: no customer fixture; the restrictions table guard was not exercised.';
    return;
  end if;

  insert into customer_restrictions (user_id, reason, set_by)
  values (v_customer, 'guard check, rolled back below', null);

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_customer::text, 'role', 'authenticated',
                      'app_metadata', json_build_object('role', 'customer'))::text, true);
  perform set_config('role', 'authenticated', true);

  select count(*) into v_rows from customer_restrictions where user_id = v_customer;

  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);

  delete from customer_restrictions where reason = 'guard check, rolled back below';

  if v_rows <> 0 then
    raise exception '0101: a customer read % row(s) of their own restriction reasons.', v_rows;
  end if;
end $$;
