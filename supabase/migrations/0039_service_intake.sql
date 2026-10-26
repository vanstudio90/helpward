-- Service-specific intake.
--
-- Every service used to share one form: address, when, free-text notes. A
-- designated-driver request had no destination field; a mover was never
-- asked about stairs or crew size; a dog walk had no duration. Helpers were
-- accepting jobs they could not scope, and the quote could not reflect the
-- work.
--
-- Stored as jsonb against the request, because the shape differs per
-- service and is defined in lib/service-intake.ts. Validation happens
-- server-side against that spec before the row is written — the column is
-- deliberately not a free-for-all.
--
-- ADDITIVE and pre-deploy safe: old code never reads or writes it.

alter table requests
  add column if not exists intake jsonb;

alter table booking_series
  add column if not exists intake jsonb;

-- Carried onto the booking at acceptance so the helper keeps the brief even
-- if the request is later tidied away.
alter table bookings
  add column if not exists intake jsonb;

comment on column requests.intake is
  'Service-specific answers, validated server-side against the spec in lib/service-intake.ts. Shown to the helper on the offer and kept on the booking.';

-- A destination is part of intake for driving, delivery and moving, and the
-- helper needs it BEFORE accepting. Indexed so the offer query stays cheap.
create index if not exists requests_intake_gin on requests using gin (intake);
