-- CLASS: pre-deploy
-- =========================================================================
-- 0086 — editing handover instructions, as one guarded write
--
-- The edit has to touch three rows: the booking (which both the customer's
-- page and the helper's active task read, and whose UPDATE event is what
-- refreshes the helper's screen), the request (so a re-accept or an admin
-- view agrees), and request_private_details.
--
-- A customer cannot do that from the client, and should not be able to.
-- There is no UPDATE policy on `bookings` for a customer — verified: a
-- PATCH returns 42501 — and adding one would be worse than the problem.
-- RLS is row level, so "the customer may update bookings" is also "the
-- customer may set total_cents", and the price is the one thing this
-- feature must not be able to move.
--
-- So the write is a SECURITY DEFINER function with an explicit guard. It
-- changes instructions and nothing else: no address, no stops, no
-- duration, no quantities, no service, no money. Those go through the
-- quote-change process, which is a different conversation.
-- =========================================================================

create or replace function public.set_booking_handover(
  p_booking_id uuid,
  p_shared     jsonb,
  p_private    jsonb
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_booking record;
begin
  select id, customer_id, provider_id, request_id, status
    into v_booking
    from bookings
   where id = p_booking_id;

  if not found then
    raise exception 'Booking not found' using errcode = 'HW030';
  end if;

  -- The CUSTOMER only. b_read also passes the assigned helper, who may
  -- read these instructions and must never rewrite them: they are the
  -- customer's words, and an edit by the other party is the dispute this
  -- feature exists to prevent.
  if auth.uid() is distinct from v_booking.customer_id
     and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin'
  then
    raise exception 'Only the customer who made this booking can change its instructions'
      using errcode = 'HW031';
  end if;

  if v_booking.status not in ('scheduled', 'in_progress') then
    raise exception 'This booking has finished, so its instructions cannot be changed'
      using errcode = 'HW032';
  end if;

  -- Shape only. The KEYS belong to lib/handover.ts and travel with the
  -- version number; this refuses something that is not a versioned object.
  if p_shared is not null and not (
       jsonb_typeof(p_shared) = 'object' and jsonb_typeof(p_shared -> 'version') = 'number')
  then
    raise exception 'Handover details are not in the expected shape' using errcode = 'HW033';
  end if;

  update bookings set handover_details = p_shared where id = p_booking_id;

  if v_booking.request_id is not null then
    update requests set handover_details = p_shared where id = v_booking.request_id;

    if p_private is null or (
         select count(*) = 0 from jsonb_object_keys(p_private) k where k <> 'version')
    then
      -- Emptied, not blanked: "no instructions" has to be a state the
      -- helper can actually arrive at, or removing a meeting point would
      -- silently leave the old one in place.
      delete from request_private_details where request_id = v_booking.request_id;
    else
      insert into request_private_details (request_id, details)
      values (v_booking.request_id, p_private)
      on conflict (request_id) do update set details = excluded.details;
    end if;
  end if;

  -- Tell the helper, and the rest of the crew on a crewed job.
  if v_booking.provider_id is not null then
    insert into notifications (user_id, type, payload)
    values (v_booking.provider_id, 'handover_updated',
            jsonb_build_object('booking_id', p_booking_id));
  end if;

  insert into notifications (user_id, type, payload)
  select c.provider_id, 'handover_updated', jsonb_build_object('booking_id', p_booking_id)
    from booking_crew c
   where c.booking_id = p_booking_id
     and c.status in ('accepted', 'arrived')
     and c.provider_id is distinct from v_booking.provider_id;
end;
$$;

revoke execute on function public.set_booking_handover(uuid, jsonb, jsonb) from public;
grant execute on function public.set_booking_handover(uuid, jsonb, jsonb) to authenticated, service_role;
