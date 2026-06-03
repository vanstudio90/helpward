-- bookings.reminder_sent_at — timestamp set by the T-30 reminder cron when
-- it has notified both parties about an upcoming booking, so repeat ticks
-- of the cron dont fire duplicate notifications. Null means "never sent",
-- non-null means already handled.
--
-- Indexed on (scheduled_for) WHERE status = scheduled AND reminder_sent_at
-- IS NULL so the cron query is cheap even with thousands of historical
-- bookings; only the small set of pending future ones gets walked.

alter table bookings
  add column if not exists reminder_sent_at timestamptz;

create index if not exists bookings_reminder_due_idx
  on bookings(scheduled_for)
  where status = 'scheduled' and reminder_sent_at is null;
