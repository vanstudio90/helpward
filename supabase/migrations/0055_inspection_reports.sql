-- CLASS: pre-deploy
-- =========================================================================
-- 0055 — property inspections produce a report
--
-- The intake asks what the report should cover — condition, damage,
-- appliances, safety, meters, exterior — and then the helper got the same
-- generic "Start task / Mark complete" buttons as a dog walk. There was
-- nowhere to record a finding and nothing for the customer to receive. An
-- inspection whose output is "it's done" is not an inspection.
--
-- Structure: one report per booking, one item per thing inspected. Items
-- are generated from the scope the customer chose, so a helper who was
-- asked about meters is asked about meters.
--
-- Completion gates on the report (see complete_booking in 0056): a
-- property inspection marked complete with nothing recorded is the exact
-- failure this exists to prevent.
-- =========================================================================

do $$ begin
  create type inspection_condition as enum ('good', 'fair', 'poor', 'not_checked', 'not_present');
exception when duplicate_object then null; end $$;

create table if not exists inspection_reports (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null unique references bookings(id) on delete cascade,
  -- Copied from the request so the report records the scope it was
  -- written against, even if the catalogue changes later.
  scope       text[] not null default array[]::text[],
  summary     text,
  submitted_at timestamptz,
  created_at  timestamptz not null default now()
);

create table if not exists inspection_items (
  id          uuid primary key default gen_random_uuid(),
  report_id   uuid not null references inspection_reports(id) on delete cascade,
  position    int not null,
  area        text not null,
  -- not_checked is the honest default: a blank row is "nobody looked",
  -- and an inspection should be able to say so rather than implying good.
  condition   inspection_condition not null default 'not_checked',
  note        text,
  photo_path  text,
  created_at  timestamptz not null default now(),
  unique (report_id, position)
);

create index if not exists inspection_items_report_idx on inspection_items (report_id);

alter table inspection_reports enable row level security;
alter table inspection_items   enable row level security;

-- Both parties to the booking can read the report; only the assigned
-- helper can write it, and only while the job is live.
drop policy if exists ir_read on inspection_reports;
create policy ir_read on inspection_reports
  for select using (
    is_admin() or exists (
      select 1 from bookings b where b.id = inspection_reports.booking_id
        and (b.customer_id = auth.uid() or b.provider_id = auth.uid())
    )
  );

drop policy if exists ir_write_helper on inspection_reports;
create policy ir_write_helper on inspection_reports
  for all using (
    is_admin() or exists (
      select 1 from bookings b where b.id = inspection_reports.booking_id
        and b.provider_id = auth.uid() and b.status in ('scheduled', 'in_progress')
    )
  ) with check (
    is_admin() or exists (
      select 1 from bookings b where b.id = inspection_reports.booking_id
        and b.provider_id = auth.uid() and b.status in ('scheduled', 'in_progress')
    )
  );

drop policy if exists ii_read on inspection_items;
create policy ii_read on inspection_items
  for select using (
    is_admin() or exists (
      select 1 from inspection_reports r join bookings b on b.id = r.booking_id
       where r.id = inspection_items.report_id
         and (b.customer_id = auth.uid() or b.provider_id = auth.uid())
    )
  );

drop policy if exists ii_write_helper on inspection_items;
create policy ii_write_helper on inspection_items
  for all using (
    is_admin() or exists (
      select 1 from inspection_reports r join bookings b on b.id = r.booking_id
       where r.id = inspection_items.report_id
         and b.provider_id = auth.uid() and b.status in ('scheduled', 'in_progress')
    )
  ) with check (
    is_admin() or exists (
      select 1 from inspection_reports r join bookings b on b.id = r.booking_id
       where r.id = inspection_items.report_id
         and b.provider_id = auth.uid() and b.status in ('scheduled', 'in_progress')
    )
  );

-- submitted_at is the helper's statement that the report is finished, and
-- complete_booking reads it. Only the server may set it, through
-- submit_inspection_report() below.
revoke update (submitted_at, booking_id, scope) on inspection_reports from authenticated;

-- -------------------------------------------------------------------------
-- Build the checklist from what the customer asked for
-- -------------------------------------------------------------------------
create or replace function public.ensure_inspection_report(p_booking_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_booking record;
  v_report_id uuid;
  v_scope text[];
  v_area text;
  v_pos int := 0;
begin
  select * into v_booking from bookings where id = p_booking_id;
  if not found then raise exception 'Booking not found'; end if;

  if auth.uid() is not null and auth.uid() <> v_booking.provider_id
     and coalesce(jwt_role(), '') not in ('admin', 'service_role') then
    raise exception 'Only the assigned helper can open this report';
  end if;

  select id into v_report_id from inspection_reports where booking_id = p_booking_id;
  if found then return v_report_id; end if;

  -- The scope the customer chose, as stored on the booking's intake.
  select coalesce(
           array(select jsonb_array_elements_text(v_booking.intake -> 'scope')),
           array[]::text[])
    into v_scope;
  if array_length(v_scope, 1) is null then
    v_scope := array['condition'];
  end if;

  insert into inspection_reports (booking_id, scope)
  values (p_booking_id, v_scope) returning id into v_report_id;

  foreach v_area in array v_scope loop
    v_pos := v_pos + 1;
    insert into inspection_items (report_id, position, area)
    values (v_report_id, v_pos, v_area);
  end loop;

  return v_report_id;
end;
$$;

revoke execute on function public.ensure_inspection_report(uuid) from public;
grant execute on function public.ensure_inspection_report(uuid) to authenticated, service_role;

-- -------------------------------------------------------------------------
-- Submitting
-- -------------------------------------------------------------------------
-- Refuses a report where nothing was actually looked at. "Complete" has
-- to mean someone checked.
create or replace function public.submit_inspection_report(
  p_booking_id uuid,
  p_summary    text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_booking record;
  v_report record;
  v_unchecked int;
begin
  select * into v_booking from bookings where id = p_booking_id;
  if not found then raise exception 'Booking not found'; end if;

  if auth.uid() is not null and auth.uid() <> v_booking.provider_id
     and coalesce(jwt_role(), '') not in ('admin', 'service_role') then
    raise exception 'Only the assigned helper can submit this report';
  end if;

  select * into v_report from inspection_reports where booking_id = p_booking_id;
  if not found then
    raise exception 'There is no report on this booking yet' using errcode = 'HW030';
  end if;

  select count(*) into v_unchecked
    from inspection_items
   where report_id = v_report.id and condition = 'not_checked';

  if v_unchecked > 0 then
    raise exception
      'Every area has to be answered before the report can be sent — % still unchecked', v_unchecked
      using errcode = 'HW031';
  end if;

  update inspection_reports
     set submitted_at = now(), summary = coalesce(p_summary, summary)
   where id = v_report.id;

  insert into notifications (user_id, type, payload)
  values (v_booking.customer_id, 'inspection_report_ready',
          jsonb_build_object('booking_id', p_booking_id, 'report_id', v_report.id));
end;
$$;

revoke execute on function public.submit_inspection_report(uuid, text) from public;
grant execute on function public.submit_inspection_report(uuid, text) to authenticated, service_role;
