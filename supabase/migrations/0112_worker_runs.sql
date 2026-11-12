-- CLASS: pre-deploy
-- =========================================================================
-- 0112 — a worker that woke up and found nothing to do says so
-- =========================================================================
/*
  THE QUESTION THIS DATABASE COULD NOT ANSWER.

  /admin/data-requests reports "Deletion worker — never run". That
  sentence was an inference, not a record: nothing anywhere logged a
  run, so the page dated the worker by the most recent deletion it had
  carried out. With no deletions ever requested, a worker that has run
  faultlessly every night for a month and a worker whose cron was
  never registered produce the identical screen.

  Three states were collapsed into one, and they call for three
  different responses:

    1. NO RUN RECORDED — nothing has ever pinged the route. Either the
       schedule is missing or the deploy that added it never shipped.
    2. RAN, NOTHING TO DO — the worker woke, looked, found an empty
       queue and finished. This is the healthy steady state of a
       deletion worker, and it must not look like silence.
    3. RAN AND FAILED — including the two failures that look like
       silence from the outside: a rejected secret (the cron is firing
       but we refuse it) and missing configuration (the route cannot
       reach Supabase at all).

  So runs are recorded. One row per invocation, written by the route
  itself with the service key, holding what it considered, what it
  processed, what failed, and why.

  WHAT THIS TABLE IS NOT. It is not an audit log — these are not acts
  by a person, and mixing machine ticks into audit_log would bury the
  trail somebody actually has to read. audit_log keeps recording the
  CONSEQUENCES (cron.account_deleted); this records the attempts.
*/

create table if not exists public.worker_runs (
  id            bigserial primary key,
  worker        text not null,
  started_at    timestamptz not null default clock_timestamp(),
  finished_at   timestamptz not null default clock_timestamp(),
  outcome       text not null,
  /*
    CONSIDERED AND PROCESSED ARE DIFFERENT NUMBERS. A run that looked
    at 50 and processed 0 is not a run that found nothing — it is a run
    that could not do anything, and that difference is the whole point
    of keeping both.
  */
  items_considered integer not null default 0,
  items_processed  integer not null default 0,
  items_failed     integer not null default 0,
  detail        text,
  constraint worker_runs_outcome_check check (
    outcome in ('succeeded', 'failed', 'unauthorized', 'misconfigured')
  ),
  constraint worker_runs_counts_check check (
    items_considered >= 0 and items_processed >= 0 and items_failed >= 0
  )
);

/* The only query this table serves: the newest run for one worker. */
create index if not exists worker_runs_latest_idx
  on public.worker_runs (worker, id desc);

alter table public.worker_runs enable row level security;

/*
  ADMINS READ IT. NOBODY WRITES IT FROM A BROWSER.

  The rows are written by the cron routes with the service key, which
  bypasses RLS, so there is no insert policy to grant — and no grant
  means a signed-in session cannot forge a run that never happened.
  is_admin() reads the JWT claim rather than profiles.role, for the
  same reason every other admin policy here does.
*/
drop policy if exists worker_runs_admin_read on public.worker_runs;
create policy worker_runs_admin_read on public.worker_runs
  for select using (public.is_admin());

revoke all on public.worker_runs from anon, authenticated;
grant select on public.worker_runs to authenticated;
revoke all on sequence public.worker_runs_id_seq from anon, authenticated;

comment on table public.worker_runs is
  'One row per background-worker invocation. Separates "never ran" from "ran and found nothing" from "ran and failed" — three states the data requests page previously could not tell apart.';

/* ------------------------------------------------------------------ *
 * SELF-TEST                                                           *
 * ------------------------------------------------------------------ */
do $$
declare
  v_id bigint;
  v_rows integer;
begin
  /* An empty successful run is representable, and is not a failure. */
  insert into public.worker_runs (worker, outcome, items_considered, items_processed, detail)
  values ('__selftest__', 'succeeded', 0, 0, 'woke up, queue was empty')
  returning id into v_id;

  select count(*) into v_rows from public.worker_runs
  where worker = '__selftest__' and outcome = 'succeeded' and items_considered = 0;
  if v_rows <> 1 then
    raise exception 'an empty successful run could not be recorded';
  end if;

  /* A rejected secret is a recordable outcome, not a silence. */
  insert into public.worker_runs (worker, outcome, detail)
  values ('__selftest__', 'unauthorized', 'CRON_SECRET did not match');

  /* And nothing outside the four outcomes is accepted. */
  begin
    insert into public.worker_runs (worker, outcome) values ('__selftest__', 'probably fine');
    raise exception 'the outcome constraint did not hold';
  exception when check_violation then
    null;
  end;

  /* A negative count is not a count. */
  begin
    insert into public.worker_runs (worker, outcome, items_processed)
    values ('__selftest__', 'succeeded', -1);
    raise exception 'the counts constraint did not hold';
  exception when check_violation then
    null;
  end;

  delete from public.worker_runs where worker = '__selftest__';
  raise notice 'worker_runs: empty success, rejected secret and bad input all behave';
end $$;
