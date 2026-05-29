-- Recurring bookings — a customer schedules a series ("every Tuesday at
-- 10am, dog walking") which materialises into individual `requests` (and
-- then bookings) via a daily cron.
--
-- Design choices:
--  * One series owns N occurrences. Each occurrence is a normal `requests`
--    row with a `series_id` back-pointer. The matching engine doesn't
--    change — it still routes per-request.
--  * Cron materialises 1 occurrence at a time, only when the next-due date
--    falls within the next 48 hours. Keeps materialisation safe to re-run
--    (idempotent via unique series_id+occurrence_date constraint).
--  * Times are stored as `time` (no TZ); interpreted in the series'
--    timezone column. Materialisation does the conversion.

-- =========================================================================
-- booking_series — the recurrence rule
-- =========================================================================
do $$ begin
  create type series_cadence as enum ('weekly', 'biweekly', 'monthly');
exception when duplicate_object then null; end $$;

do $$ begin
  create type series_status as enum ('active', 'paused', 'cancelled', 'completed');
exception when duplicate_object then null; end $$;

create table if not exists booking_series (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references profiles(id) on delete cascade not null,
  service_id text references services(id) on delete restrict not null,
  pickup_address_id uuid references addresses(id),

  cadence series_cadence not null,
  -- Weekly + biweekly: 0=Sun..6=Sat (matches JS getDay() so client/server agree)
  weekday smallint check (weekday between 0 and 6),
  -- Monthly: 1..31. If the month doesn't have that day (e.g. 31 in February),
  -- materialisation clamps to the last day of the month.
  day_of_month smallint check (day_of_month between 1 and 31),

  -- Local-time-of-day in the customer's timezone.
  time_of_day time not null,
  -- Customer's local timezone, captured at creation. If they later change
  -- it on their profile we don't auto-update existing series — the schedule
  -- they explicitly set should be stable.
  timezone text not null default 'America/Vancouver',
  -- Helper-side duration estimate, in minutes. Carried through to each
  -- materialised request as estimated_duration_min.
  estimated_duration_min int not null default 45,
  -- Snapshot of the service price at creation time. Future price changes on
  -- the catalogue don't retroactively reprice an existing series — we'd
  -- rather surface "price changed" to the customer than silently bill more.
  estimated_price_cents int not null,

  notes text,

  start_date date not null,
  end_date date,                              -- nullable = ongoing
  max_occurrences int,                        -- nullable = unlimited
  occurrences_created int not null default 0,

  -- Independent of any one occurrence's status — the series itself can be
  -- paused while occurrences keep flowing through their own lifecycle.
  status series_status not null default 'active',
  paused_at timestamptz,
  cancelled_at timestamptz,

  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  -- Weekly + biweekly need a weekday; monthly needs a day_of_month.
  check (
    (cadence in ('weekly','biweekly') and weekday is not null and day_of_month is null)
    or (cadence = 'monthly' and day_of_month is not null and weekday is null)
  )
);

create index if not exists bs_customer_idx on booking_series(customer_id, status);
create index if not exists bs_active_idx on booking_series(status, start_date) where status = 'active';

alter table booking_series enable row level security;

do $$ begin
  create policy "bs_read_own" on booking_series for select
    using (customer_id = auth.uid());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "bs_modify_own" on booking_series for all
    using (customer_id = auth.uid())
    with check (customer_id = auth.uid());
exception when duplicate_object then null; end $$;

-- Admin can see all series for support workflows.
do $$ begin
  create policy "bs_read_admin" on booking_series for select
    using (coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin');
exception when duplicate_object then null; end $$;

-- =========================================================================
-- requests.series_id — link a materialised occurrence back to its series
-- =========================================================================
alter table requests
  add column if not exists series_id uuid references booking_series(id) on delete set null,
  -- The date the materialisation cron generated this request for. Stored
  -- separately from scheduled_for because scheduled_for is a timestamptz
  -- (with time) and we want a unique constraint on (series, date) for
  -- idempotency without timezone-edge headaches.
  add column if not exists series_occurrence_date date;

create index if not exists requests_series_idx on requests(series_id, series_occurrence_date);

-- Prevent the materialisation cron from double-creating the same
-- occurrence if it runs twice in a window.
create unique index if not exists requests_series_occurrence_unique
  on requests(series_id, series_occurrence_date)
  where series_id is not null;

grant select, insert, update, delete on booking_series to authenticated, service_role;
