-- Make a blocked dispatch VISIBLE and ACTIONABLE.
--
-- The problem this solves: broadcast_request returns an integer count, and
-- the application treats a broadcast as best-effort. So when the function
-- refuses to dispatch — unverified pickup address, no boundary dataset, no
-- eligible helper — the request simply sits in 'matching' until a cron
-- expires it. Nothing errors. Nothing is logged. A customer waits, and
-- nobody finds out until someone reads the database.
--
-- That failure mode is what makes an application rollback dangerous: old
-- code cannot set addresses.geocode_verified, so under migration 0032 every
-- new request would be silently refused. The fix is not to weaken the gate
-- on rollback. The fix is to make the refusal loud.
--
-- Every refusal now writes a row here AND notifies admins.

create table if not exists dispatch_refusals (
  id          bigserial primary key,
  request_id  uuid not null references requests(id) on delete cascade,
  -- Machine-readable so an alert can group on it.
  reason      text not null check (reason in (
    'address_unverified',      -- pickup address never passed geocode verification
    'boundary_no_dataset',     -- no active official boundary set loaded
    'boundary_outside',        -- pin is outside every active boundary
    'no_pickup_location',      -- request has no usable address row
    'no_eligible_helper'       -- everything checked out; nobody available
  )),
  detail      text,
  created_at  timestamptz not null default now()
);

create index if not exists dr_request_idx on dispatch_refusals (request_id);
create index if not exists dr_recent_idx  on dispatch_refusals (created_at desc);
create index if not exists dr_reason_idx  on dispatch_refusals (reason, created_at desc);

alter table dispatch_refusals enable row level security;
drop policy if exists dr_admin_read on dispatch_refusals;
create policy dr_admin_read on dispatch_refusals for select using (is_admin());

-- Admin-facing rollup. 'no_eligible_helper' is normal operational noise at
-- low supply; the other reasons indicate a CONFIGURATION fault and are what
-- an alert should fire on.
create or replace function public.dispatch_health(p_since interval default interval '1 hour')
returns table (
  reason text,
  occurrences bigint,
  distinct_requests bigint,
  last_seen timestamptz,
  is_configuration_fault boolean
)
language sql stable security definer set search_path = public as $$
  select
    r.reason,
    count(*)                        as occurrences,
    count(distinct r.request_id)    as distinct_requests,
    max(r.created_at)               as last_seen,
    r.reason <> 'no_eligible_helper' as is_configuration_fault
  from dispatch_refusals r
  where r.created_at > now() - p_since
  group by r.reason
  order by is_configuration_fault desc, occurrences desc;
$$;

grant execute on function public.dispatch_health(interval) to authenticated, service_role;

-- Internal: record a refusal and, for configuration faults, notify every
-- admin exactly once per request+reason so a broken deploy surfaces in the
-- admin inbox immediately rather than being discovered by a customer.
create or replace function public.record_dispatch_refusal(
  p_request_id uuid,
  p_reason text,
  p_detail text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_already boolean;
begin
  select exists (
    select 1 from dispatch_refusals
    where request_id = p_request_id and reason = p_reason
  ) into v_already;

  insert into dispatch_refusals (request_id, reason, detail)
  values (p_request_id, p_reason, p_detail);

  -- Loud, but not repetitive: notify on the first occurrence of each
  -- request+reason pair, and never for ordinary low-supply misses.
  if not v_already and p_reason <> 'no_eligible_helper' then
    insert into notifications (user_id, type, payload)
    select p.id, 'dispatch_blocked', jsonb_build_object(
      'request_id', p_request_id,
      'reason', p_reason,
      'detail', p_detail
    )
    from profiles p
    where p.role = 'admin';
  end if;
end;
$$;

grant execute on function public.record_dispatch_refusal(uuid, text, text) to service_role;

comment on table dispatch_refusals is
  'Why a request was not dispatched. Any reason other than no_eligible_helper is a configuration fault (unverified addresses, missing boundary dataset) and is the signal that an application/migration mismatch is in effect.';
