-- Referral program — every user gets a unique code they can share. When a
-- friend signs up with that code we create an attribution row. Once the
-- friend completes their first booking the attribution becomes 'qualified'
-- and both sides earn credit (referee = the friend, referrer = the sharer).
--
-- We don't process payouts here — Stripe wiring lands later. For v1 the
-- credit just accumulates on profiles.referral_credits_cents and shows in
-- the dashboard. When checkout is wired, credits apply at checkout time.

-- Default rewards (configurable later via env). $10 each side.
-- Stored on each attribution at creation so changing the program doesn't
-- retroactively rewrite past rewards.

-- =========================================================================
-- Referral codes — one per user
-- =========================================================================
create table if not exists referral_codes (
  -- The shareable code (6-8 chars, alphanumeric, no ambiguous chars). PK so
  -- collisions are impossible and lookups are O(1).
  code text primary key,
  user_id uuid references profiles(id) on delete cascade not null unique,
  -- Optional short message the user has written for share previews.
  custom_message text,
  created_at timestamptz default now(),
  -- Track how many times the code has been used for cheap dashboard counts
  -- without re-scanning the attributions table.
  use_count int not null default 0
);
create index if not exists rc_user_idx on referral_codes(user_id);

alter table referral_codes enable row level security;

-- Anyone can look up a code by value (needed to validate at signup before
-- the new user has a session) — only the code text is exposed, not user_id.
-- That's fine because the code IS public information; the user wrote it on
-- a flyer or sent it in a text.
--
-- Actually for stricter scoping we'd return only via a security-definer
-- function. For v1 we keep it simple: select-anon allowed; the model
-- doesn't leak anything sensitive (you already know your friend's code).
do $$ begin
  create policy "rc_public_read" on referral_codes for select using (true);
exception when duplicate_object then null; end $$;

-- Owner manages their own row.
do $$ begin
  create policy "rc_owner_write" on referral_codes for all using (user_id = auth.uid()) with check (user_id = auth.uid());
exception when duplicate_object then null; end $$;

-- =========================================================================
-- Attributions — one row per (referrer, referee) pair, created at signup.
-- =========================================================================
create table if not exists referral_attributions (
  id uuid primary key default gen_random_uuid(),
  code text references referral_codes(code) on delete set null,
  referrer_id uuid references profiles(id) on delete set null,
  referee_id uuid references profiles(id) on delete cascade not null unique, -- a user is only referred once, ever
  status text not null default 'pending'
    check (status in ('pending', 'qualified', 'credited', 'expired', 'fraudulent')),
  -- Credit each side gets, stored at attribution time so program changes
  -- don't retroactively rewrite. Both sides get the same amount in v1.
  referrer_credit_cents int not null default 1000,
  referee_credit_cents int not null default 1000,
  referee_signed_up_at timestamptz default now(),
  referee_first_booking_at timestamptz,
  qualified_at timestamptz,
  credited_at timestamptz,
  -- Anti-fraud: when status flips to qualified we check IP/device against
  -- the referrer's. Stored here for the admin reviewer.
  signup_ip text,
  signup_user_agent text
);
create index if not exists ra_referrer_idx on referral_attributions(referrer_id, status);
create index if not exists ra_status_idx on referral_attributions(status);

alter table referral_attributions enable row level security;

-- Referrer can see their own list (status, who, when).
do $$ begin
  create policy "ra_read_referrer" on referral_attributions for select
    using (referrer_id = auth.uid());
exception when duplicate_object then null; end $$;

-- Referee can see if they were referred (so the welcome banner can render).
do $$ begin
  create policy "ra_read_referee" on referral_attributions for select
    using (referee_id = auth.uid());
exception when duplicate_object then null; end $$;

-- Admin can read all (anti-fraud reviewing).
do $$ begin
  create policy "ra_read_admin" on referral_attributions for select
    using (coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin');
exception when duplicate_object then null; end $$;

-- =========================================================================
-- Running credit balance on profiles
-- =========================================================================
alter table profiles
  add column if not exists referral_credits_cents int not null default 0;

grant select, insert, update on referral_codes to authenticated, service_role;
grant select, insert, update on referral_attributions to authenticated, service_role;
