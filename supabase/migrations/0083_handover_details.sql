-- CLASS: pre-deploy
-- =========================================================================
-- 0083 — handover instructions become real
--
-- "How do I actually hand this over?" was a row in a design and nothing
-- else. Where a service needed it, it was improvised as a free-text intake
-- answer, so every service invented its own shape and nothing could be read
-- back reliably. This gives it stable, versioned storage that the booking
-- form, the server, the app, the helper offer and the helper's active task
-- all read from.
--
-- TWO PLACES, ON PURPOSE.
--
--   requests.handover_details   what a CANDIDATE may see
--   request_private_details     what only the ASSIGNED helper may see
--
-- A broadcast offer reaches every candidate helper, including every one who
-- declines. Stairs, parking and which handover method is wanted are what a
-- candidate needs to judge the job. A meeting point, a recipient's name or
-- an entry procedure identifies a person or opens a door, and must not be
-- in that payload.
--
-- WHY A SEPARATE TABLE AND NOT A SECOND COLUMN. RLS is ROW level. There is
-- no way to expose handover_details and withhold handover_private on the
-- same row, and column GRANTs are not row-conditional. 0050 learned this
-- with phone numbers and moved them to profile_contacts; this is the same
-- shape for the same reason.
--
-- NOTE ON WHAT THIS DOES NOT FIX. `req_read` (0002) lets every offered
-- helper select the whole requests row, so today a candidate can read
-- `intake` directly — including a destination the UI labels "shared once
-- you accept". That is a separate, pre-existing hole in the INTAKE column
-- and is deliberately not widened here: nothing private is added to
-- requests by this migration.
-- =========================================================================

-- -------------------------------------------------------------------------
-- The shareable half
-- -------------------------------------------------------------------------
alter table requests
  add column if not exists handover_details jsonb;

alter table bookings
  add column if not exists handover_details jsonb;

comment on column requests.handover_details is
  'Versioned handover answers a candidate helper may see (method, stairs, parking). Private answers live in request_private_details.';
comment on column bookings.handover_details is
  'Copied from the request by accept_request, so the booking keeps what was agreed.';

-- A shape guard, not a schema: the keys are owned by lib/handover.ts and
-- change with the version number. This only refuses something that is not
-- a versioned object at all.
do $$ begin
  alter table requests add constraint requests_handover_shape
    check (
      handover_details is null
      or (jsonb_typeof(handover_details) = 'object'
          and jsonb_typeof(handover_details -> 'version') = 'number')
    );
exception when duplicate_object then null; end $$;

do $$ begin
  alter table bookings add constraint bookings_handover_shape
    check (
      handover_details is null
      or (jsonb_typeof(handover_details) = 'object'
          and jsonb_typeof(handover_details -> 'version') = 'number')
    );
exception when duplicate_object then null; end $$;

-- -------------------------------------------------------------------------
-- The restricted half
-- -------------------------------------------------------------------------
create table if not exists request_private_details (
  request_id uuid primary key references requests(id) on delete cascade,
  -- Meeting points, recipients, entry procedures. Same versioned shape.
  details    jsonb not null default jsonb_build_object('version', 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table request_private_details is
  'Handover answers that identify a person or open a door. Readable by the customer and the ASSIGNED helper only — never by a candidate.';

alter table request_private_details enable row level security;

-- -------------------------------------------------------------------------
-- Who may read it
-- -------------------------------------------------------------------------
-- "Is the caller the helper assigned to this request?" — as a SECURITY
-- DEFINER function, because the policy has to look at bookings and
-- booking_crew, and a policy that re-enters its own table recurses (0057
-- hit exactly that).
--
-- ACCESS ENDS WITH THE BOOKING. Only 'scheduled' and 'in_progress' count,
-- which is the same window shares_active_booking() uses for phone numbers.
-- A completed or cancelled booking stops opening the door, literally.
create or replace function public.is_assigned_to_request(p_request_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from bookings b
     where b.request_id = p_request_id
       and b.status in ('scheduled', 'in_progress')
       and (
         b.provider_id = auth.uid()
         -- A crewed job: every accepted member is assigned to it.
         or exists (
           select 1 from booking_crew c
            where c.booking_id = b.id
              and c.provider_id = auth.uid()
              and c.status in ('accepted', 'arrived')
         )
       )
  );
$$;

revoke execute on function public.is_assigned_to_request(uuid) from public;
grant execute on function public.is_assigned_to_request(uuid) to authenticated, service_role;

drop policy if exists rpd_read on request_private_details;
create policy rpd_read on request_private_details
  for select using (
    is_admin()
    or exists (
      select 1 from requests r
       where r.id = request_private_details.request_id
         and r.customer_id = auth.uid()
    )
    or is_assigned_to_request(request_id)
  );

-- The customer owns their own instructions and may change them. A helper
-- may read and never write: these are the customer's words, and an edit by
-- the other party is exactly the dispute this is meant to prevent.
drop policy if exists rpd_write_own on request_private_details;
create policy rpd_write_own on request_private_details
  for all using (
    is_admin()
    or exists (
      select 1 from requests r
       where r.id = request_private_details.request_id
         and r.customer_id = auth.uid()
    )
  ) with check (
    is_admin()
    or exists (
      select 1 from requests r
       where r.id = request_private_details.request_id
         and r.customer_id = auth.uid()
    )
  );

grant select, insert, update, delete on request_private_details to authenticated;
grant all on request_private_details to service_role;

-- -------------------------------------------------------------------------
-- Acceptance carries it into the booking
-- -------------------------------------------------------------------------
-- accept_request already copies the intake; the handover travels with it so
-- the booking keeps what was agreed even if the request is later edited.
create or replace function public.copy_handover_to_booking()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.handover_details is null and new.request_id is not null then
    select r.handover_details into new.handover_details
      from requests r where r.id = new.request_id;
  end if;
  return new;
end;
$$;

drop trigger if exists bookings_copy_handover on bookings;
create trigger bookings_copy_handover
  before insert on bookings
  for each row execute function public.copy_handover_to_booking();

-- -------------------------------------------------------------------------
-- Keeping updated_at honest
-- -------------------------------------------------------------------------
create or replace function public.touch_request_private_details()
returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists rpd_touch on request_private_details;
create trigger rpd_touch
  before update on request_private_details
  for each row execute function public.touch_request_private_details();
