-- CLASS: pre-deploy
-- =========================================================================
-- 0048 — the offer's area, without the address
--
-- Migration 0047 stopped an un-accepted helper from reading the pickup
-- address, which is right: an exact address broadcast to every candidate
-- is an address given to everyone who then declines.
--
-- But the inbox showed the area by EMBEDDING city and region from that
-- same addresses row, so the policy blanked it too and every offer read
-- "Area —". The helper could no longer tell whether a job was ten minutes
-- away or across the county.
--
-- Fixed by snapshotting the coarse location onto the request itself.
-- requests is already readable by an offered helper (req_read, 0002), so
-- no address access is widened and no extra round trip is needed.
-- =========================================================================

alter table requests
  add column if not exists pickup_city   text,
  add column if not exists pickup_region text;

-- Only the server writes these: they are derived from a verified address,
-- and a customer-supplied city would let a request advertise an area it is
-- not in.
revoke update (pickup_city, pickup_region) on requests from authenticated;

-- Keep them true as the address is created. A trigger rather than
-- application code, so a request inserted by any path carries its area.
create or replace function public.snapshot_request_area()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.pickup_address_id is not null then
    select a.city, a.region into new.pickup_city, new.pickup_region
      from addresses a where a.id = new.pickup_address_id;
  end if;
  return new;
end;
$$;

revoke execute on function public.snapshot_request_area() from public;

drop trigger if exists trg_snapshot_request_area on requests;
create trigger trg_snapshot_request_area
  before insert or update of pickup_address_id on requests
  for each row execute function public.snapshot_request_area();

-- Backfill the requests that already exist.
update requests r
   set pickup_city = a.city, pickup_region = a.region
  from addresses a
 where a.id = r.pickup_address_id
   and r.pickup_city is null;

do $$
declare v_missing int;
begin
  select count(*) into v_missing
    from requests r join addresses a on a.id = r.pickup_address_id
   where r.pickup_city is null and a.city is not null;
  if v_missing > 0 then
    raise exception 'backfill left % requests without an area', v_missing;
  end if;
  raise notice 'offer area snapshot: backfill complete';
end $$;
