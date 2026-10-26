-- CLASS: deploy-coupled
-- =========================================================================
-- 0056 — a property inspection is not complete without its report
--
-- complete_booking took any in-progress booking and marked it done. For
-- an inspection that meant the customer paid for a report and received
-- the word "completed". The report is the deliverable; completion has to
-- depend on it.
--
-- Scoped to services that produce one, so nothing else changes. Deploy-
-- coupled because the release that lets a helper WRITE a report must
-- already be live, or inspections become uncompletable.
-- =========================================================================

-- Which services owe the customer an artefact before they can be closed.
create table if not exists service_completion_requirements (
  service_id       text primary key references services(id) on delete cascade,
  requires_report  boolean not null default false
);

insert into service_completion_requirements (service_id, requires_report)
values ('property-inspection', true)
on conflict (service_id) do update set requires_report = excluded.requires_report;

alter table service_completion_requirements enable row level security;
drop policy if exists scr_read on service_completion_requirements;
create policy scr_read on service_completion_requirements for select using (true);
revoke insert, update, delete on service_completion_requirements from authenticated, anon;

create or replace function public.complete_booking(p_booking_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_booking record;
  v_needs_report boolean;
  v_submitted timestamptz;
begin
  select * into v_booking from bookings where id = p_booking_id for update;
  if not found then
    raise exception 'Booking not found';
  end if;
  if auth.uid() <> v_booking.provider_id
    and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin'
  then
    raise exception 'Only the provider can complete this booking';
  end if;
  if v_booking.status <> 'in_progress' then
    raise exception 'Booking is not in progress';
  end if;

  perform assert_booking_paid(v_booking);

  -- The deliverable, where there is one.
  select requires_report into v_needs_report
    from service_completion_requirements where service_id = v_booking.service_id;

  if coalesce(v_needs_report, false) then
    select submitted_at into v_submitted
      from inspection_reports where booking_id = p_booking_id;
    if v_submitted is null then
      raise exception
        'Send the inspection report before marking this complete — it is what the customer is paying for.'
        using errcode = 'HW032';
    end if;
  end if;

  update bookings
    set status = 'completed', completed_at = now()
    where id = p_booking_id;

  update provider_profiles
    set tasks_completed = tasks_completed + 1
    where user_id = v_booking.provider_id;

  insert into notifications (user_id, type, payload)
  values (v_booking.customer_id, 'task_completed', jsonb_build_object('booking_id', p_booking_id));
end;
$$;

revoke execute on function public.complete_booking(uuid) from public;
grant execute on function public.complete_booking(uuid) to authenticated, service_role;
