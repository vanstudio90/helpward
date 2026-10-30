-- CLASS: pre-deploy
-- =========================================================================
-- 0084 — a server-controlled offer payload
--
-- Today a broadcast offer is "here is the whole request row", and the
-- helper inbox decides what to print. That is not a control: `req_read`
-- (0002) lets any offered helper SELECT the row over PostgREST with their
-- own token, so the destination the UI labels "shared once you accept" is
-- readable by every candidate, including all the ones who decline.
-- Verified on rehearsal — a candidate read `deliver_to` and `recipient` in
-- full.
--
-- This migration builds the replacement. 0085 closes the hole, and must
-- land only after the release that stops reading requests directly.
--
-- WHY THE BRIEF IS A STORED COLUMN AND NOT COMPUTED HERE. Which intake
-- answers are safe to broadcast is decided by `sensitive` in
-- lib/service-intake.ts, and `describeIntake(..., { forOffer: true })`
-- already applies it. Re-deriving that rule in SQL would be a second
-- definition of the same thing, and the two would drift. The server
-- computes the offer brief once, when the request is created, and stores
-- it; this function only serves what it was given.
--
-- OLD REQUESTS. A request created before this has no offer_summary, so
-- the brief comes back empty and a candidate sees the service, the area,
-- the schedule and the payout. That is the SAFE direction: their private
-- answers are still sitting in `intake`, and `intake` is not something
-- this function returns.
-- =========================================================================

alter table requests
  add column if not exists offer_summary jsonb;

comment on column requests.offer_summary is
  'The brief a CANDIDATE may see, computed by describeIntake(forOffer) when the request is created. Never contains an exact address, a recipient or an access instruction.';

do $$ begin
  alter table requests add constraint requests_offer_summary_shape
    check (offer_summary is null or jsonb_typeof(offer_summary) = 'array');
exception when duplicate_object then null; end $$;

-- -------------------------------------------------------------------------
-- The offer list
-- -------------------------------------------------------------------------
-- Every column here is deliberate. What is NOT here is the point: no
-- `intake`, no pickup_address_id, no notes, no destination, no recipient,
-- no access instruction, no customer identity beyond a display name.
--
-- `pickup_city` / `pickup_region` are the approximate area, which is what
-- `offer_area()` (0048) already decided a candidate may have — enough to
-- judge whether the trip is worth taking, not enough to turn up at.
create or replace function public.my_offers()
returns table (
  attempt_id             uuid,
  request_id             uuid,
  notified_at            timestamptz,
  responded_at           timestamptz,
  preferred              boolean,
  distance_km            numeric,
  rank_score             numeric,
  service_id             text,
  service_title          text,
  service_blurb          text,
  service_image_url      text,
  service_eta_label      text,
  status                 text,
  scheduled_for          timestamptz,
  is_bundle              boolean,
  bundle_item_count      int,
  pickup_city            text,
  pickup_region          text,
  estimated_price_cents  int,
  customer_name          text,
  customer_avatar_url    text,
  -- The approved brief, and the shareable half of the handover.
  offer_summary          jsonb,
  handover_details       jsonb
)
language sql stable security definer set search_path = public as $$
  select
    m.id,
    r.id,
    m.notified_at,
    m.responded_at,
    coalesce(m.preferred, false),
    m.distance_km,
    m.rank_score,
    s.id,
    s.title,
    s.blurb,
    s.image_url,
    s.eta_label,
    r.status::text,
    r.scheduled_for,
    coalesce(r.is_bundle, false),
    r.bundle_item_count,
    r.pickup_city,
    r.pickup_region,
    r.estimated_price_cents,
    p.full_name,
    p.avatar_url,
    r.offer_summary,
    r.handover_details
  from match_attempts m
  join requests r on r.id = m.request_id
  left join services s on s.id = r.service_id
  left join profiles p on p.id = r.customer_id
  -- The caller's own offers, and nobody else's.
  where m.provider_id = auth.uid()
    and r.status = 'matching'
    and m.responded_at is null
  order by m.notified_at desc nulls last
  limit 100;
$$;

revoke execute on function public.my_offers() from public;
grant execute on function public.my_offers() to authenticated, service_role;

-- One offer, for a helper deciding on a specific request. Same columns,
-- same omissions.
create or replace function public.my_offer(p_request_id uuid)
returns table (
  attempt_id             uuid,
  request_id             uuid,
  notified_at            timestamptz,
  responded_at           timestamptz,
  preferred              boolean,
  distance_km            numeric,
  rank_score             numeric,
  service_id             text,
  service_title          text,
  service_blurb          text,
  service_image_url      text,
  service_eta_label      text,
  status                 text,
  scheduled_for          timestamptz,
  is_bundle              boolean,
  bundle_item_count      int,
  pickup_city            text,
  pickup_region          text,
  estimated_price_cents  int,
  customer_name          text,
  customer_avatar_url    text,
  offer_summary          jsonb,
  handover_details       jsonb
)
language sql stable security definer set search_path = public as $$
  select * from public.my_offers() o where o.request_id = p_request_id;
$$;

revoke execute on function public.my_offer(uuid) from public;
grant execute on function public.my_offer(uuid) to authenticated, service_role;

-- -------------------------------------------------------------------------
-- Keeping the assigned helper's access when 0085 tightens req_read
-- -------------------------------------------------------------------------
-- A helper who ACCEPTED the job still reads the request row — the active
-- task page joins it for the pickup address and the customer's notes.
-- That access comes from the booking, which is the same rule `b_read`
-- already uses, and unlike the private-details policy it is not limited to
-- a live booking: a helper reviewing their own completed job should still
-- see what they were asked to do.
--
-- SECURITY DEFINER so the policy in 0085 can ask the question without a
-- policy on requests re-entering a policy on bookings.
create or replace function public.is_booked_helper_for_request(p_request_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from bookings b
     where b.request_id = p_request_id
       and (
         b.provider_id = auth.uid()
         or exists (
           select 1 from booking_crew c
            where c.booking_id = b.id
              and c.provider_id = auth.uid()
              and c.status in ('accepted', 'arrived')
         )
       )
  );
$$;

revoke execute on function public.is_booked_helper_for_request(uuid) from public;
grant execute on function public.is_booked_helper_for_request(uuid) to authenticated, service_role;
