-- CLASS: pre-deploy
-- =========================================================================
-- 0046 — overdue bookings are flagged, not auto-completed
--
-- The complete-stale-in-progress cron marked any booking left
-- 'in_progress' for six hours as 'completed', with no evidence the work
-- had happened. With payments wired that also desynchronised money from
-- state: the cron wrote the status directly, so it skipped both the
-- payment invariant in 0043 and the capture that completion performs. A
-- booking would read 'completed' while an uncaptured authorization sat on
-- the customer's card until it expired, around seven days later — helper
-- worked, nobody charged.
--
-- The column lets the cron flag once rather than notify on every run.
-- =========================================================================

alter table bookings
  add column if not exists overdue_flagged_at timestamptz;

create index if not exists bookings_overdue_idx
  on bookings (status, started_at)
  where status = 'in_progress' and overdue_flagged_at is null;

revoke update (overdue_flagged_at) on bookings from authenticated;
