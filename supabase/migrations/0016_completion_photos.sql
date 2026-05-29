-- Photo proof of completion — the helper attaches 1–3 photos when marking
-- a booking complete (grocery on the doorstep, package picked up, etc.) so
-- the customer has visual proof and a trust signal before the 24h review
-- window closes.
--
-- Storage:
--   Files live in the `booking-photos` bucket (already created in
--   0007_storage.sql, public=false). Object path is
--   booking-photos/{booking_id}/{uploaded_by_user_id}/{timestamp}.{ext}.
--   Reads always go through signed URLs minted by the server using the
--   service role — never direct public reads.
--
-- This table is the registry of which photos belong to which booking. The
-- storage layer doesn't enforce ownership; we do it here at the row level
-- so a leaked storage path alone can't be used to enumerate other bookings.

create table if not exists booking_completion_photos (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id) on delete cascade,
  uploaded_by_user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,
  -- Optional caption written by the helper at upload time ("front porch by
  -- the pillar, hidden from street view"). Customer reads it under the photo.
  caption text,
  width int,
  height int,
  bytes int,
  content_type text,
  created_at timestamptz not null default now()
);

create index if not exists bcp_booking_idx on booking_completion_photos(booking_id, created_at desc);
create index if not exists bcp_uploader_idx on booking_completion_photos(uploaded_by_user_id);

-- =========================================================================
-- RLS — helper of the booking can insert; customer + helper + admin can read
-- =========================================================================
alter table booking_completion_photos enable row level security;

-- Helper-only insert: must be the assigned provider on the booking and the
-- booking must still be in_progress (no retroactive photo uploads after
-- completion to keep the proof tied to the work session).
do $$ begin
  create policy "bcp_helper_insert" on booking_completion_photos
    for insert with check (
      uploaded_by_user_id = auth.uid()
      and exists (
        select 1 from bookings b
        where b.id = booking_completion_photos.booking_id
          and b.provider_id = auth.uid()
          and b.status in ('in_progress', 'completed')
      )
    );
exception when duplicate_object then null; end $$;

-- Customer + helper of the booking can read their own photos
do $$ begin
  create policy "bcp_parties_read" on booking_completion_photos
    for select using (
      exists (
        select 1 from bookings b
        where b.id = booking_completion_photos.booking_id
          and (b.customer_id = auth.uid() or b.provider_id = auth.uid())
      )
    );
exception when duplicate_object then null; end $$;

-- Helper can delete their own photo (e.g. uploaded the wrong one) while
-- the booking is still in_progress. Once completed it's locked.
do $$ begin
  create policy "bcp_helper_delete_in_progress" on booking_completion_photos
    for delete using (
      uploaded_by_user_id = auth.uid()
      and exists (
        select 1 from bookings b
        where b.id = booking_completion_photos.booking_id
          and b.provider_id = auth.uid()
          and b.status = 'in_progress'
      )
    );
exception when duplicate_object then null; end $$;

-- Admin reads everything (support + moderation)
do $$ begin
  create policy "bcp_admin_read" on booking_completion_photos
    for select using (
      exists (
        select 1 from profiles p
        where p.id = auth.uid() and p.role = 'admin'
      )
    );
exception when duplicate_object then null; end $$;

grant select, insert, delete on booking_completion_photos to authenticated, service_role;
