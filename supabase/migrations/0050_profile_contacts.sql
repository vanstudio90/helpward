-- CLASS: pre-deploy
-- =========================================================================
-- 0050 — phone numbers leave the profiles row
--
-- profiles_read (0002) exposes ANY row where role = 'provider' to every
-- authenticated user, so every helper's phone number has been readable by
-- anyone with an account, permanently.
--
-- RLS cannot fix that. It is row-level: there is no way to expose
-- full_name and withhold phone on the same row. Column-level GRANT cannot
-- either — it is not row-conditional, and a customer reading their OWN
-- profile legitimately needs the column. The number has to move.
--
-- This is the cheap moment to do it: the table currently holds zero phone
-- numbers. The same migration after launch would move live customer PII.
--
-- Deliberately NOT a masked relay. Both pages that show a counterpart's
-- number put it behind a tel: link and expect a real one. A proxy number
-- (the Uber model) is a larger build and a separate decision; this
-- migration makes it possible by giving the number one owner.
--
-- Pairs with 0051, which drops profiles.phone. That one is deploy-coupled
-- and must land only AFTER the release that stops selecting the column.
-- =========================================================================

create table if not exists profile_contacts (
  user_id        uuid primary key references profiles(id) on delete cascade,
  phone          text,
  phone_verified boolean not null default false,
  updated_at     timestamptz not null default now()
);

-- Free today: zero rows carry a number. Written so a re-run is a no-op.
insert into profile_contacts (user_id, phone, phone_verified)
select p.id, p.phone, coalesce(p.phone_verified, false)
  from profiles p
 where p.phone is not null and p.phone <> ''
on conflict (user_id) do update
  set phone = excluded.phone,
      phone_verified = excluded.phone_verified,
      updated_at = now();

alter table profile_contacts enable row level security;

-- Who may read a phone number:
--   yourself
--   an admin
--   the other party on a booking that is HAPPENING RIGHT NOW
--
-- shares_active_booking() is the function 0047 already uses for the same
-- question about names and addresses, so the three stay consistent: a
-- completed booking is a record, not a standing licence to keep someone's
-- number.
drop policy if exists contacts_read on profile_contacts;
create policy contacts_read on profile_contacts
  for select using (
    user_id = auth.uid()
    or is_admin()
    or shares_active_booking(user_id)
  );

-- You may only write your own, and only the number itself.
drop policy if exists contacts_write_own on profile_contacts;
create policy contacts_write_own on profile_contacts
  for all using (user_id = auth.uid() or is_admin())
       with check (user_id = auth.uid() or is_admin());

-- Revoke the TABLE privilege before granting columns. A column-level
-- revoke cannot override a table-level grant, and Supabase grants ALL on
-- every public table to `authenticated` by default — so the obvious
-- `revoke update (phone_verified)` changes nothing and the user can mark
-- their own number verified. Same trap as 0040; the contact_visibility
-- suite caught it here.
revoke update on profile_contacts from authenticated;
grant  update (phone, updated_at) on profile_contacts to authenticated;
grant  insert, select on profile_contacts to authenticated;

-- phone_verified is an attestation about a number we checked. Only the
-- server may grant it; a self-granted one means nothing.
revoke update (phone_verified, user_id) on profile_contacts from anon;

create index if not exists profile_contacts_phone_idx
  on profile_contacts (phone) where phone is not null;

-- The old column stays until 0051 so the running release keeps working.
comment on column profiles.phone is
  'SUPERSEDED by profile_contacts.phone (migration 0050). Dropped in 0051. Do not read.';
