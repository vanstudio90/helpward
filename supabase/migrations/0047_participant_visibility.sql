-- CLASS: pre-deploy
-- =========================================================================
-- 0047 — a helper can see who and where the job is
--
-- Browser testing, 2026-10-26: the assigned helper saw "Pickup —" and
-- "Customer" instead of the address and the customer's name. The pages
-- query both correctly; RLS returned nothing.
--
--   addresses.addr_self   user_id = auth.uid() — the address belongs to
--                         the CUSTOMER, so the helper matched no row.
--   profiles.profiles_read  own row, admin, or role = 'provider'. A
--                         customer's row is none of those, so an assigned
--                         helper could not read the name of the person
--                         they were going to meet.
--
-- Scoped to the booking, not opened generally. Neither "all addresses" nor
-- "all customer profiles" becomes readable.
--
-- OFFER STAGE IS DELIBERATELY DIFFERENT. A helper who has only been
-- OFFERED a job gets the area, not the doorstep: an exact address visible
-- to everyone a request was broadcast to is an address given to people who
-- then decline. The full address unlocks on acceptance, when there is a
-- booking and an accountable helper. offer_area() below is what the inbox
-- shows instead.
--
-- PRIVACY CONSEQUENCE, stated plainly: profiles rows carry `phone`, and
-- RLS is row-level, so the counterpart rule below lets an assigned helper
-- read their customer's phone number for the duration of an active
-- booking. That is defensible — they may need to call about access — and
-- it ends when the booking does.
--
-- SEPARATE PRE-EXISTING LEAK, not fixed here: the `role = 'provider'`
-- clause in profiles_read exposes EVERY helper's phone number to EVERY
-- authenticated user, permanently. Narrowing it would break helper
-- browsing, and the correct fix is to move `phone` to its own table with
-- its own policy. Flagged rather than bodged.
-- =========================================================================

-- -------------------------------------------------------------------------
-- The pickup address of a job you are actually doing
-- -------------------------------------------------------------------------
create or replace function public.is_assigned_pickup_address(p_address_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from bookings b
      join requests r on r.id = b.request_id
     where r.pickup_address_id = p_address_id
       and b.provider_id = auth.uid()
       -- Not after the job ends. A completed booking is a record, not a
       -- standing licence to re-read where someone lives.
       and b.status in ('scheduled', 'in_progress')
  );
$$;

revoke execute on function public.is_assigned_pickup_address(uuid) from public;
grant execute on function public.is_assigned_pickup_address(uuid) to authenticated, service_role;

drop policy if exists addr_assigned_helper_read on addresses;
create policy addr_assigned_helper_read on addresses
  for select using (is_assigned_pickup_address(id));

-- -------------------------------------------------------------------------
-- The name of the person you are meeting
-- -------------------------------------------------------------------------
create or replace function public.shares_active_booking(p_other_user_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from bookings b
     where b.status in ('scheduled', 'in_progress')
       and (
         (b.provider_id = auth.uid() and b.customer_id = p_other_user_id)
         or (b.customer_id = auth.uid() and b.provider_id = p_other_user_id)
       )
  );
$$;

revoke execute on function public.shares_active_booking(uuid) from public;
grant execute on function public.shares_active_booking(uuid) to authenticated, service_role;

drop policy if exists profiles_read on profiles;
create policy profiles_read on profiles
  for select using (
    id = auth.uid()
    or is_admin()
    -- Providers visible to all authed users (public-ish profile). See the
    -- phone note in this file's header.
    or role = 'provider'
    -- The other party on a booking that is happening right now.
    or shares_active_booking(id)
  );

-- -------------------------------------------------------------------------
-- What an OFFERED helper sees instead of an address
-- -------------------------------------------------------------------------
-- City and region only, plus how far it is. Enough to decide whether to
-- take the job; not enough to turn up at.
create or replace function public.offer_area(p_request_id uuid)
returns table (city text, region text, distance_km numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  -- Only a helper this request was actually offered to.
  if not exists (
    select 1 from match_attempts m
     where m.request_id = p_request_id and m.provider_id = auth.uid()
  ) and coalesce(jwt_role(), '') not in ('admin', 'service_role') then
    raise exception 'offer_area: this request was not offered to you';
  end if;

  return query
    select a.city, a.region,
           round((m.distance_km)::numeric, 1)
      from requests r
      join addresses a on a.id = r.pickup_address_id
      left join match_attempts m
        on m.request_id = r.id and m.provider_id = auth.uid()
     where r.id = p_request_id;
end;
$$;

revoke execute on function public.offer_area(uuid) from public;
grant execute on function public.offer_area(uuid) to authenticated, service_role;
