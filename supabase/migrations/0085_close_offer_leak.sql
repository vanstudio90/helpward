-- CLASS: deploy-coupled
-- =========================================================================
-- 0085 — an offered helper stops reading the whole request
--
-- `req_read` (0002) ends with:
--
--     or exists (select 1 from match_attempts m
--                 where m.request_id = requests.id
--                   and m.provider_id = auth.uid())
--
-- which means every candidate helper can SELECT the entire row over
-- PostgREST — `intake` included. The helper inbox withholds the sensitive
-- answers when it renders them, but that is a decision made in a React
-- component, and the row is one HTTP request away from anyone holding a
-- helper token. Verified on rehearsal: a helper who had accepted nothing
-- read a delivery's `deliver_to` and `recipient` in full.
--
-- This replaces that clause. A candidate now reads offers through
-- `my_offers()` (0084), which returns approved columns only. An ASSIGNED
-- helper keeps full access, through the booking, exactly as before.
--
-- DEPLOY-COUPLED, and strictly so: the release that reads offers through
-- my_offers() must already be live. Applied first, the helper inbox goes
-- blank.
--
-- OLD REQUESTS ARE THE REASON THIS IS WORTH DOING. Every request created
-- before 0084 still has its destination, recipient and access notes
-- sitting inside `intake`. No backfill can un-send them; the only fix is
-- to stop serving the column, which is what this does.
-- =========================================================================

drop policy if exists req_read on requests;
create policy req_read on requests
  for select using (
    customer_id = auth.uid()
    or is_admin()
    /*
      The helper who TOOK the job, not the ones who were offered it.

      Their access comes from the booking — the same rule b_read uses —
      and is not limited to a live booking, because a helper reviewing
      their own completed job should still see what they agreed to do.
    */
    or is_booked_helper_for_request(id)
  );

comment on policy req_read on requests is
  'Customer, admin, or the helper assigned through a booking. A merely OFFERED helper reads my_offers() instead, which returns approved columns only.';
