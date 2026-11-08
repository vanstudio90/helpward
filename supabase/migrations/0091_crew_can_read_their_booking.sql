-- CLASS: pre-deploy
--
-- A crew member could not read the booking they were on.
--
-- 0057 gave booking_crew a crew-aware read policy (bc_read, via the
-- security-definer is_on_crew) but left bookings on b_read from 0002,
-- which has only ever allowed the customer and bookings.provider_id —
-- the LEAD. So the second helper on a crewed job could see their own
-- crew row and not the job it belonged to.
--
-- What that meant in practice: /helper/active queries bookings with the
-- caller's session, gets nothing, and shows "no active job". A helper
-- invited onto a Moving Help crew had no way to see the address, accept
-- their invite from that screen, or mark themselves arrived. The
-- feature read as broken rather than forbidden, because nothing errors
-- — RLS simply returns no rows.
--
-- It went unnoticed because the only crewed bookings in production are
-- the review ones, and those accept through accept_crew_invite called
-- server-side with the service key, which no policy applies to. All
-- four non-lead crew rows are 'accepted' and not one of them was
-- accepted by a person.
--
-- Verified against production before writing this: as the non-lead
-- helper, booking_crew returned 2 rows and bookings returned 0 for the
-- same booking id.
--
-- is_on_crew is already security definer and already used by bc_read,
-- so it is evaluated outside RLS and this cannot recurse into the
-- policy it is part of.
--
-- READ ONLY. Being on the crew does not confer b_update: starting and
-- completing stay with the lead, which is what start_booking and
-- complete_booking already enforce on their own.

drop policy if exists b_read on bookings;
create policy b_read on bookings
  for select using (
    customer_id = auth.uid()
    or provider_id = auth.uid()
    or is_on_crew(id)
    or is_admin()
  );
