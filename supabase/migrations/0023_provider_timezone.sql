-- Stored timezone on provider_profiles so server-side helper surfaces
-- (analytics hour histogram, future schedule materialisation, future
-- offer-window alignment notifications) can render in the helpers actual
-- local time instead of UTC.
--
-- Default 'UTC' for the backfill so existing helpers keep the same
-- behavior they have today — the auto-detect prompt on /provider/profile
-- offers a one-tap switch when the browser tz disagrees.

alter table provider_profiles
  add column if not exists timezone text not null default 'UTC';
