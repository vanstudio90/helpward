-- CLASS: pre-deploy
--
-- Somewhere to keep the device tokens push has to be sent to.
--
-- There is nowhere today. notification_prefs (0001) has push_booking and
-- push_messages, which say whether somebody WANTS a push, and
-- notifications holds the in-app list — but nothing anywhere stores the
-- APNs token a notification would actually be delivered to. So the
-- preferences have been honoured by nothing.
--
-- This matters most on the helper side. A job offer expires, and a
-- helper who is not staring at the Offers tab never learns it existed.
--
-- One row per device, not per person: a helper with a phone and an iPad
-- should hear about an offer on both, and somebody who replaces a phone
-- should stop hearing about them on the old one.

create table if not exists device_tokens (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references profiles(id) on delete cascade,
  -- The APNs device token, hex. UNIQUE, and that is load-bearing: a
  -- token identifies a DEVICE, not a person. When someone signs out and
  -- a colleague signs in on the same phone, the token must move to the
  -- new user rather than exist twice — otherwise the previous owner
  -- keeps receiving another person's job offers on a phone they no
  -- longer hold. Registration upserts on this column.
  token         text not null unique,
  platform      text not null default 'ios' check (platform in ('ios', 'android', 'web')),
  -- Sandbox and production APNs are different hosts, and a token minted
  -- against one is rejected by the other. A TestFlight build and an App
  -- Store build of the same app therefore need different endpoints, so
  -- the device says which it is rather than the server guessing.
  environment   text not null default 'production'
                check (environment in ('sandbox', 'production')),
  created_at    timestamptz not null default now(),
  -- Touched on every launch, so a sweep can retire tokens for devices
  -- that have not opened the app in months instead of pushing to them
  -- forever.
  last_seen_at  timestamptz not null default now(),
  -- Set when APNs answers 410 Unregistered (the app was deleted) or 400
  -- BadDeviceToken. Kept rather than deleted so a device that comes
  -- back can be told apart from one that was never seen.
  disabled_at   timestamptz,
  disabled_reason text
);

create index if not exists device_tokens_user_idx
  on device_tokens (user_id) where disabled_at is null;

alter table device_tokens enable row level security;

-- A person manages their own devices and sees nobody else's. Sending is
-- done by the service role, which no policy applies to.
--
-- No public read of any kind: a device token is a delivery address for
-- one person's phone, and the only parties with any business reading it
-- are that person and the sender.
drop policy if exists dt_read_own on device_tokens;
create policy dt_read_own on device_tokens
  for select using (user_id = auth.uid() or is_admin());

drop policy if exists dt_insert_own on device_tokens;
create policy dt_insert_own on device_tokens
  for insert with check (user_id = auth.uid());

drop policy if exists dt_update_own on device_tokens;
create policy dt_update_own on device_tokens
  for update using (user_id = auth.uid() or is_admin())
  with check (user_id = auth.uid() or is_admin());

drop policy if exists dt_delete_own on device_tokens;
create policy dt_delete_own on device_tokens
  for delete using (user_id = auth.uid() or is_admin());
