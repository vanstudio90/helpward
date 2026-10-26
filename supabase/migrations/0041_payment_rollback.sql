-- =========================================================================
-- 0041 — undo an acceptance whose payment could not be authorized
--
-- CLASS: pre-deploy safe. Adds one function; changes nothing existing.
--
-- accept_request creates the booking, and only then can Helpward place a
-- hold: the total and the helper are not known until the booking row
-- exists. So there is a window where a booking has been accepted but the
-- card has not been authorized, and if the authorization fails the
-- acceptance has to come back out.
--
-- cancel_booking is not the right tool. It leaves the request consumed, so
-- a job that failed for a reason specific to THIS helper — payouts not set
-- up yet — would die rather than going to the next helper. It also refuses
-- to run for the service role, since it authorises by auth.uid().
-- =========================================================================

create or replace function public.release_unpaid_booking(
  p_booking_id uuid,
  p_reason     text,
  -- true  → the problem was this helper; put the job back out to others.
  -- false → the problem was the customer's card; no other helper can fix
  --         it, so the request is cancelled and the customer is told.
  p_requeue    boolean
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_booking record;
begin
  -- Service role only. This function cancels a booking without the
  -- consent of either party, which is correct for a payment failure and
  -- wrong for anything a user initiates.
  if coalesce(current_setting('request.jwt.claims', true), '') <> ''
     and jwt_role() <> 'service_role' then
    raise exception 'release_unpaid_booking: service role only';
  end if;

  select * into v_booking from bookings where id = p_booking_id for update;
  if not found then raise exception 'Booking not found'; end if;

  if v_booking.payment_status = 'captured' then
    raise exception 'Booking % has already been charged; refund it instead', p_booking_id;
  end if;

  update bookings
     set status        = 'cancelled',
         cancelled_at  = now(),
         cancel_reason = p_reason,
         payment_status = 'failed'
   where id = p_booking_id;

  if p_requeue then
    -- Back into the pool, and drop this helper's offer so the next
    -- broadcast does not hand it straight back to them.
    update requests set status = 'matching' where id = v_booking.request_id;
    delete from match_attempts
     where request_id = v_booking.request_id
       and provider_id = v_booking.provider_id;

    insert into notifications (user_id, type, payload)
    values (v_booking.provider_id, 'booking_released',
            jsonb_build_object('booking_id', p_booking_id, 'reason', p_reason));
  else
    update requests set status = 'cancelled' where id = v_booking.request_id;

    insert into notifications (user_id, type, payload)
    values (v_booking.customer_id, 'payment_failed',
            jsonb_build_object('booking_id', p_booking_id, 'reason', p_reason));
  end if;
end;
$$;

revoke execute on function public.release_unpaid_booking(uuid, text, boolean) from public;
grant execute on function public.release_unpaid_booking(uuid, text, boolean) to service_role;
