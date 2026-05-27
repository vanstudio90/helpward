-- Helpward Supabase Storage buckets + RLS policies.
-- Buckets:
--   avatars        — public read; auth users can upload to avatars/{user_id}/*
--   booking-photos — restricted; auth users can upload + read photos for bookings
--                    they're part of (read via signed URLs from server)

-- =========================================================================
-- avatars bucket — public read
-- =========================================================================
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

-- Anyone (including anon) can read avatar files
drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read" on storage.objects
  for select using (bucket_id = 'avatars');

-- Authenticated users can upload to their own folder (avatars/{user_id}/...)
drop policy if exists "avatars_self_insert" on storage.objects;
create policy "avatars_self_insert" on storage.objects
  for insert with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Authenticated users can update/delete their own avatar files
drop policy if exists "avatars_self_update" on storage.objects;
create policy "avatars_self_update" on storage.objects
  for update using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_self_delete" on storage.objects;
create policy "avatars_self_delete" on storage.objects
  for delete using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- =========================================================================
-- booking-photos bucket — restricted; server-mediated reads
-- =========================================================================
insert into storage.buckets (id, name, public)
values ('booking-photos', 'booking-photos', false)
on conflict (id) do update set public = false;

-- Auth users can upload under booking-photos/{booking_id}/{user_id}/...
-- (we don't enforce booking ownership at the storage layer; the upload server
-- action checks it before generating the upload URL)
drop policy if exists "booking_photos_auth_insert" on storage.objects;
create policy "booking_photos_auth_insert" on storage.objects
  for insert with check (
    bucket_id = 'booking-photos'
    and auth.role() = 'authenticated'
  );

-- Reads are server-side only via service-role signed URLs.
