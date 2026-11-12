-- CLASS: pre-deploy
-- =========================================================================
-- 0104 — safety & disputes becomes a case file
--
-- What exists today is a row with a paragraph in it and a Resolve
-- button. What a safety review actually needs is the difference
-- between three things that row cannot tell apart:
--
--   THE ALLEGATION — what somebody reported, in their words, at a
--   time, through a channel. It is never edited afterwards.
--   THE EVIDENCE — attachments and conversations, held privately,
--   where looking is itself recorded.
--   THE FINDING — what we concluded, by whom, with a reason, kept
--   even if the case is later reopened.
--
-- Collapsing those into one `description` and one `resolution` is how
-- an investigation ends up unable to say who said what, or why a
-- decision was made six weeks ago.
--
-- WHAT THIS MIGRATION REFUSES TO DO:
--
--   * Invent a deadline. next_review_at is only ever a time somebody
--     set. There is no default, and "overdue" counts only cases that
--     carry one (0105).
--   * Let closing a case move money or touch an account. The resolve
--     function writes an outcome and nothing else, and says so.
--   * Lose a previous finding. Reopening files the old resolution in
--     dispute_resolutions with the reason for reopening.
--   * Let two reviewers overwrite each other. Every mutation takes the
--     updated_at it believes it is working from, and the ones that
--     change the case refuse when it has moved underneath them (0105).
--
-- A STRIPE CHARGEBACK IS NOT A SERVICE DISPUTE. The bank decides one
-- and we decide the other, so stripe_dispute_id is a link between two
-- records rather than a way of turning one into the other.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 0. Assumptions.
-- -------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'disputes' and column_name = 'owner_id') then
    raise exception 'REFUSING: disputes.owner_id is missing. Apply 0101 first.';
  end if;
  if not exists (select 1 from information_schema.tables
                  where table_schema = 'public' and table_name = 'support_cases') then
    raise exception 'REFUSING: support_cases is missing. Apply 0102 first.';
  end if;
end $$;

-- -------------------------------------------------------------------------
-- 1. The case record.
-- -------------------------------------------------------------------------
alter table public.disputes
  add column if not exists kind text not null default 'service',
  add column if not exists priority text not null default 'normal',
  add column if not exists next_review_at timestamptz,
  add column if not exists source text not null default 'in_app',
  add column if not exists reported_by_name text,
  add column if not exists customer_id uuid references public.profiles(id) on delete set null,
  add column if not exists helper_id uuid references public.profiles(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists outcome text,
  add column if not exists escalated_to uuid references public.profiles(id) on delete set null,
  add column if not exists escalated_at timestamptz,
  add column if not exists escalation_reason text,
  add column if not exists escalation_ack_at timestamptz,
  add column if not exists escalation_ack_by uuid references public.profiles(id) on delete set null,
  add column if not exists stripe_dispute_id text,
  add column if not exists reopened_count int not null default 0;

comment on column public.disputes.kind is
  'safety or service. A conduct report and a late helper are both "disputes" in the schema and nothing alike in the queue.';
comment on column public.disputes.next_review_at is
  'A follow-up time somebody set. There is no default: a deadline nobody agreed to is not a deadline.';
comment on column public.disputes.stripe_dispute_id is
  'The bank''s chargeback, when this case relates to one. Deliberately a link and not a status: Stripe decides that one, we decide this one.';

-- A report that arrived by phone is about a person, not necessarily a
-- booking. The column stays for the thousands of cases that have one.
alter table public.disputes alter column booking_id drop not null;

/*
  WIDER STATUSES, because "open" was hiding four different situations:
  nobody has looked yet, somebody is working it, we are waiting on a
  person, we are waiting on a file. The queue is sorted by what it is
  waiting on, so the status has to say.

  'open' KEEPS ITS NAME and means "new". Renaming it would have broken
  every query in 0098-0103 that already counts open disputes, and a
  migration that quietly changes what a value means is worse than a
  slightly awkward word.
*/
do $$
declare
  v_name text;
begin
  for v_name in
    select conname from pg_constraint
     where conrelid = 'public.disputes'::regclass and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.disputes drop constraint %I', v_name);
  end loop;

  alter table public.disputes add constraint disputes_status_check
    check (status in ('open', 'investigating', 'awaiting_response',
                      'evidence_requested', 'resolved', 'escalated'));
end $$;

alter table public.disputes drop constraint if exists disputes_kind_check;
alter table public.disputes add constraint disputes_kind_check
  check (kind in ('safety', 'service'));

alter table public.disputes drop constraint if exists disputes_priority_check;
alter table public.disputes add constraint disputes_priority_check
  check (priority in ('low', 'normal', 'high', 'urgent'));

alter table public.disputes drop constraint if exists disputes_source_check;
alter table public.disputes add constraint disputes_source_check
  check (source in ('in_app', 'email', 'phone', 'staff', 'other'));

alter table public.disputes drop constraint if exists disputes_outcome_check;
alter table public.disputes add constraint disputes_outcome_check
  check (outcome is null or outcome in
    ('upheld', 'partly_upheld', 'not_upheld', 'no_action', 'duplicate', 'withdrawn'));

-- Backfill: a safety category is a safety case, everything else is a
-- service case. Both parties are read off the booking where there is one.
update public.disputes d set
  kind = case when d.category = 'safety' then 'safety' else 'service' end
where d.kind = 'service' and d.category = 'safety';

update public.disputes d set
  customer_id = coalesce(d.customer_id, b.customer_id),
  helper_id   = coalesce(d.helper_id, b.provider_id)
from public.bookings b
where b.id = d.booking_id
  and (d.customer_id is null or d.helper_id is null);

create index if not exists disputes_queue_idx
  on public.disputes (status, priority, created_at desc) where status <> 'resolved';
create index if not exists disputes_review_idx
  on public.disputes (next_review_at) where next_review_at is not null and status <> 'resolved';
create index if not exists disputes_customer_idx on public.disputes (customer_id);
create index if not exists disputes_helper_idx on public.disputes (helper_id);

/*
  updated_at IS THE CONCURRENCY TOKEN. Two reviewers on one case is the
  normal state of a safety queue at 9am, and the failure is silent: one
  of them writes a finding over the other's and neither knows. Every
  change stamps this column; the write functions in 0105 refuse a
  caller whose copy is older than what is in the row.
*/
create or replace function public.touch_dispute()
returns trigger
language plpgsql set search_path = public as $$
begin
  /*
    clock_timestamp(), NOT now(). now() is the transaction's start
    time, so two changes inside one transaction would stamp an
    identical value and a concurrency check built on it would see no
    movement — which is exactly how a token like this fails silently.
  */
  new.updated_at := clock_timestamp();
  return new;
end $$;

drop trigger if exists trg_touch_dispute on public.disputes;
create trigger trg_touch_dispute
  before update on public.disputes
  for each row execute function public.touch_dispute();

-- -------------------------------------------------------------------------
-- 2. The timeline.
--
-- Every entry names an actor and a time. The investigation panel reads
-- this and nothing else, so a step that nobody recorded cannot appear
-- in it — including the ones this migration's own functions take.
-- -------------------------------------------------------------------------
create table if not exists public.dispute_events (
  id          bigserial primary key,
  dispute_id  uuid not null references public.disputes(id) on delete cascade,
  kind        text not null check (kind in (
                'reported', 'assigned', 'status_changed', 'priority_changed',
                'note', 'task_added', 'task_completed', 'task_reopened',
                'evidence_added', 'evidence_viewed', 'party_contacted',
                'review_scheduled', 'resolved', 'reopened', 'escalated',
                'escalation_acknowledged', 'linked')),
  body        text check (length(body) <= 4000),
  payload     jsonb not null default '{}'::jsonb,
  actor_id    uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists dispute_events_case_idx
  on public.dispute_events (dispute_id, created_at);

alter table public.dispute_events enable row level security;

drop policy if exists dispute_events_admin on public.dispute_events;
create policy dispute_events_admin on public.dispute_events
  for all using (is_admin()) with check (is_admin());

revoke all on public.dispute_events from anon, authenticated;
grant select, insert on public.dispute_events to authenticated;
grant usage, select on sequence public.dispute_events_id_seq to authenticated;

-- -------------------------------------------------------------------------
-- 3. Next steps.
--
-- Tasks, with an owner and a time they were finished. The brief is
-- explicit that ticking one must not message anybody, so nothing here
-- writes a notification — the only way to contact somebody from a case
-- is the function that says so in its name.
-- -------------------------------------------------------------------------
create table if not exists public.dispute_tasks (
  id          uuid primary key default gen_random_uuid(),
  dispute_id  uuid not null references public.disputes(id) on delete cascade,
  label       text not null check (length(btrim(label)) > 0 and length(label) <= 200),
  owner_id    uuid references public.profiles(id) on delete set null,
  done_at     timestamptz,
  done_by     uuid references public.profiles(id) on delete set null,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists dispute_tasks_case_idx on public.dispute_tasks (dispute_id, created_at);

alter table public.dispute_tasks enable row level security;

drop policy if exists dispute_tasks_admin on public.dispute_tasks;
create policy dispute_tasks_admin on public.dispute_tasks
  for all using (is_admin()) with check (is_admin());

revoke all on public.dispute_tasks from anon, authenticated;
grant select, insert, update on public.dispute_tasks to authenticated;

-- -------------------------------------------------------------------------
-- 4. Evidence, and the record of who looked at it.
--
-- "Access is logged" is a sentence the console is about to show an
-- operator, so it has to be true before it is drawn: every signed URL
-- minted for an attachment writes a row here and an event on the
-- timeline.
-- -------------------------------------------------------------------------
create table if not exists public.dispute_evidence (
  id            uuid primary key default gen_random_uuid(),
  dispute_id    uuid not null references public.disputes(id) on delete cascade,
  kind          text not null check (kind in ('file', 'conversation', 'booking_photo', 'note')),
  filename      text,
  mime_type     text,
  size_bytes    bigint check (size_bytes is null or (size_bytes >= 0 and size_bytes <= 26214400)),
  storage_path  text unique,
  reference_id  uuid,
  description   text check (length(description) <= 1000),
  added_by      uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  constraint dispute_evidence_has_a_body check (
    (kind = 'file' and storage_path is not null)
    or (kind in ('conversation', 'booking_photo') and reference_id is not null)
    or (kind = 'note' and description is not null))
);

create index if not exists dispute_evidence_case_idx on public.dispute_evidence (dispute_id, created_at);

create table if not exists public.dispute_evidence_access (
  id          bigserial primary key,
  evidence_id uuid not null references public.dispute_evidence(id) on delete cascade,
  actor_id    uuid references public.profiles(id) on delete set null,
  reason      text,
  created_at  timestamptz not null default now()
);

create index if not exists dispute_evidence_access_idx
  on public.dispute_evidence_access (evidence_id, created_at desc);

alter table public.dispute_evidence enable row level security;
alter table public.dispute_evidence_access enable row level security;

drop policy if exists dispute_evidence_admin on public.dispute_evidence;
create policy dispute_evidence_admin on public.dispute_evidence
  for all using (is_admin()) with check (is_admin());

drop policy if exists dispute_evidence_access_admin on public.dispute_evidence_access;
create policy dispute_evidence_access_admin on public.dispute_evidence_access
  for all using (is_admin()) with check (is_admin());

revoke all on public.dispute_evidence from anon, authenticated;
revoke all on public.dispute_evidence_access from anon, authenticated;
grant select, insert on public.dispute_evidence to authenticated;
grant select, insert on public.dispute_evidence_access to authenticated;
grant usage, select on sequence public.dispute_evidence_access_id_seq to authenticated;

insert into storage.buckets (id, name, public, file_size_limit)
values ('dispute-evidence', 'dispute-evidence', false, 26214400)
on conflict (id) do update set public = false, file_size_limit = 26214400;

/*
  As with support attachments: no storage policy for browser tokens at
  all. Evidence is handed out by the server, one signed minute at a
  time, and the handing out is what gets logged.
*/
drop policy if exists dispute_evidence_no_public_read on storage.objects;
create policy dispute_evidence_no_public_read on storage.objects
  for select using (bucket_id <> 'dispute-evidence');

-- -------------------------------------------------------------------------
-- 5. Findings, kept.
--
-- A resolution is a row, not a column, because reopening a case must
-- not erase what was decided the first time — "we found no fault" from
-- March is exactly what somebody needs to read in June.
-- -------------------------------------------------------------------------
create table if not exists public.dispute_resolutions (
  id             uuid primary key default gen_random_uuid(),
  dispute_id     uuid not null references public.disputes(id) on delete cascade,
  outcome        text not null check (outcome in
                   ('upheld', 'partly_upheld', 'not_upheld', 'no_action', 'duplicate', 'withdrawn')),
  reason         text not null check (length(btrim(reason)) >= 20 and length(reason) <= 4000),
  resolved_by    uuid references public.profiles(id) on delete set null,
  resolved_at    timestamptz not null default now(),
  notified       jsonb not null default '{}'::jsonb,
  open_tasks     int not null default 0,
  reopened_at    timestamptz,
  reopened_by    uuid references public.profiles(id) on delete set null,
  reopen_reason  text
);

create index if not exists dispute_resolutions_case_idx
  on public.dispute_resolutions (dispute_id, resolved_at desc);

alter table public.dispute_resolutions enable row level security;

drop policy if exists dispute_resolutions_admin on public.dispute_resolutions;
create policy dispute_resolutions_admin on public.dispute_resolutions
  for all using (is_admin()) with check (is_admin());

revoke all on public.dispute_resolutions from anon, authenticated;
grant select, insert, update on public.dispute_resolutions to authenticated;

-- -------------------------------------------------------------------------
-- 6. The support inbox learns that a party can be a helper.
--
-- "Contact parties" reuses the conversation machinery from 0102 rather
-- than inventing a second way to message somebody — but a case is as
-- often about reaching the HELPER, and a column called customer_id
-- labelled "Customer" in the inbox would have quietly mislabelled
-- every one of those threads.
-- -------------------------------------------------------------------------
alter table public.support_cases
  add column if not exists party_role text not null default 'customer',
  add column if not exists dispute_id_link uuid references public.disputes(id) on delete set null;

alter table public.support_cases drop constraint if exists support_cases_party_role_check;
alter table public.support_cases add constraint support_cases_party_role_check
  check (party_role in ('customer', 'helper'));

comment on column public.support_cases.party_role is
  'Whether customer_id is the customer or the helper on this conversation. Set when a safety case contacts a party.';

-- -------------------------------------------------------------------------
-- 7. Proven.
-- -------------------------------------------------------------------------
do $$
declare
  v_staff uuid;
  v_dispute uuid;
  v_before timestamptz;
  v_after timestamptz;
begin
  select id into v_staff from profiles limit 1;
  if v_staff is null then
    raise notice '0104: no profile fixture; the case guards were not exercised.';
    return;
  end if;

  /*
    A case with no booking is now possible: a phone report is a case.
    opened_by stays NOT NULL and holds the STAFF MEMBER who wrote it
    down — the person who rang in is named in reported_by_name, because
    they may well not have an account at all.
  */
  insert into disputes (booking_id, opened_by, category, description, kind, source, status,
                        reported_by_name)
  values (null, v_staff, 'safety', '0104 self-test: reported by telephone', 'safety', 'phone', 'open',
          'A caller who gave no account')
  returning id into v_dispute;

  -- updated_at moves on every change, which is what makes it usable as
  -- a concurrency token.
  select updated_at into v_before from disputes where id = v_dispute;
  perform pg_sleep(0.01);
  update disputes set priority = 'urgent' where id = v_dispute;
  select updated_at into v_after from disputes where id = v_dispute;
  if v_after <= v_before then
    raise exception '0104: updated_at did not move on a change, so nothing can detect a clash.';
  end if;

  -- The new statuses are accepted and nonsense is refused.
  update disputes set status = 'evidence_requested' where id = v_dispute;
  begin
    update disputes set status = 'nonsense' where id = v_dispute;
    raise exception '0104: the status column accepted a value nobody defined.';
  exception when check_violation then null;
  end;

  -- A resolution needs a real reason, not a shrug.
  begin
    insert into dispute_resolutions (dispute_id, outcome, reason)
    values (v_dispute, 'upheld', 'ok');
    raise exception '0104: a finding was accepted with no reasoning in it.';
  exception when check_violation then null;
  end;

  delete from disputes where id = v_dispute;
end $$;
