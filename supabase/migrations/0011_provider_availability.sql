-- Provider availability — weekly recurring rules + dated overrides.
--
-- Model:
--   * weekly_rules: 0-N rows per (provider_id, weekday). A weekday with zero
--     rows is "not normally available". Multiple rows on the same weekday
--     allow split shifts (e.g. 09:00-12:00 + 17:00-21:00).
--   * overrides:   per-date exceptions. They WIN over the weekly rule for
--     that calendar date. is_unavailable=true marks a day off (vacation /
--     sick day) regardless of times. is_unavailable=false + a time range
--     marks an extra shift only for that date.
--
-- All times are stored as `time` (no timezone) and interpreted in the
-- provider's local timezone (profiles.default_timezone). The matching
-- engine doesn't read these tables yet — this round is informational on
-- the public profile + an editor on the provider side. Wiring matching
-- to the schedule is a follow-up.

-- =========================================================================
-- Weekly rules
-- =========================================================================
create table if not exists provider_availability_rules (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid references provider_profiles(user_id) on delete cascade not null,
  -- 0=Sunday..6=Saturday to match JS Date.getDay() so client/server agree
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  created_at timestamptz default now(),
  -- end after start, else the row is meaningless
  check (end_time > start_time)
);
create index if not exists par_provider_weekday_idx
  on provider_availability_rules(provider_id, weekday, start_time);

alter table provider_availability_rules enable row level security;

-- Provider manages own rows
do $$ begin
  create policy "par_select_own" on provider_availability_rules
    for select using (provider_id = auth.uid());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "par_modify_own" on provider_availability_rules
    for all using (provider_id = auth.uid())
    with check (provider_id = auth.uid());
exception when duplicate_object then null; end $$;

-- Public read for approved providers so customers can see schedules + the
-- matching engine can filter on availability in a future round.
do $$ begin
  create policy "par_public_read_approved" on provider_availability_rules
    for select using (
      exists (
        select 1 from provider_profiles pp
        where pp.user_id = provider_availability_rules.provider_id
          and pp.status = 'approved'
      )
    );
exception when duplicate_object then null; end $$;

-- =========================================================================
-- Dated overrides — one row per date+kind, max 1 unavailable row per date
-- (we don't need to model "I'm partially off + adding extra shift" — keep
--  the model simple; if a provider truly needs that they can use weekly
--  rules + a single unavailable override).
-- =========================================================================
create table if not exists provider_availability_overrides (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid references provider_profiles(user_id) on delete cascade not null,
  date date not null,
  -- When true, provider is off that day — start_time/end_time ignored.
  -- When false, this is an extra shift on top of weekly rules for that date.
  is_unavailable boolean not null default true,
  start_time time,
  end_time time,
  label text, -- "Vacation", "Sick day", "Wedding", etc. — surfaced in admin/audit
  created_at timestamptz default now(),
  -- If providing a shift (not unavailable), require both times in order
  check (
    is_unavailable = true
    or (start_time is not null and end_time is not null and end_time > start_time)
  )
);
create index if not exists pao_provider_date_idx
  on provider_availability_overrides(provider_id, date);

-- One unavailable-marker per date, max
create unique index if not exists pao_one_unavailable_per_date
  on provider_availability_overrides(provider_id, date)
  where is_unavailable = true;

alter table provider_availability_overrides enable row level security;

do $$ begin
  create policy "pao_select_own" on provider_availability_overrides
    for select using (provider_id = auth.uid());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "pao_modify_own" on provider_availability_overrides
    for all using (provider_id = auth.uid())
    with check (provider_id = auth.uid());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "pao_public_read_approved" on provider_availability_overrides
    for select using (
      exists (
        select 1 from provider_profiles pp
        where pp.user_id = provider_availability_overrides.provider_id
          and pp.status = 'approved'
      )
    );
exception when duplicate_object then null; end $$;

-- =========================================================================
-- Vacation-mode flag on the provider profile — flips the public profile
-- badge to "Away" without forcing the helper to delete weekly rules.
-- =========================================================================
alter table provider_profiles
  add column if not exists vacation_mode boolean not null default false,
  add column if not exists vacation_returns_on date;

grant select, insert, update, delete on provider_availability_rules to authenticated, service_role;
grant select, insert, update, delete on provider_availability_overrides to authenticated, service_role;
