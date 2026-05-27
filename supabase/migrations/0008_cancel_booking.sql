-- Customer (or provider, or admin) can cancel a booking after it's been matched.
-- Different from cancel_request which only works pre-match.

create or replace function public.cancel_booking(
  p_booking_id uuid,
  p_reason text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_booking record;
  v_who text;
begin
  select * into v_booking from bookings where id = p_booking_id for update;
  if not found then
    raise exception 'Booking not found';
  end if;

  if v_booking.status not in ('scheduled','in_progress') then
    raise exception 'Booking cannot be cancelled at status %', v_booking.status;
  end if;

  -- Allow customer, provider, or admin to cancel
  if auth.uid() = v_booking.customer_id then
    v_who := 'customer';
  elsif auth.uid() = v_booking.provider_id then
    v_who := 'provider';
  elsif coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin' then
    v_who := 'admin';
  else
    raise exception 'Not authorised to cancel this booking';
  end if;

  update bookings
    set status = 'cancelled',
        cancelled_at = now(),
        cancel_reason = coalesce(p_reason, 'Cancelled by ' || v_who)
    where id = p_booking_id;

  -- Notify the other party
  insert into notifications (user_id, type, payload)
  values (
    case when v_who = 'customer' then v_booking.provider_id else v_booking.customer_id end,
    'booking_cancelled',
    jsonb_build_object('booking_id', p_booking_id, 'by', v_who, 'reason', p_reason)
  );
end;
$$;
grant execute on function public.cancel_booking(uuid, text) to authenticated, service_role;
