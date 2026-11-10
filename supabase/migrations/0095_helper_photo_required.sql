-- CLASS: pre-deploy
-- =========================================================================
-- 0095 — a helper's profile photo: required to be approved, and fixed once set
--
-- THREE ASKS, AND THEY ARE NOT EQUALLY ENFORCEABLE. Written out because
-- the difference matters more than the feature:
--
--   "required at registration"  -> enforced here, at approval.
--   "cannot be edited after"    -> enforced here, at the grant level.
--   "must be a selfie"          -> NOT enforced, and cannot be. See below.
--
-- WHY NOT AT SIGNUP. There is no "registration complete" event to hang
-- this on. signUp() creates the account and handle_new_user() (0078)
-- writes the rows; /helper/onboard is a checklist computed fresh on every
-- render that records nothing. And the avatars bucket insert policy
-- (0007) is keyed on auth.uid(), which does not exist while the signup
-- form is open — so the browser cannot upload a photo at signup even if
-- the form asked for one.
--
-- The one state change that actually means "this helper may now work" is
-- provider_profiles.status going to 'approved', written in exactly one
-- place by a human (app/(admin)/admin/helpers/actions.ts). That is the
-- choke point, so that is where the requirement goes.
--
-- A TRIGGER, NOT A POLICY, because approval runs under the service role
-- and RLS does not apply to it. Same shape as reject_self_review_flag
-- (0088) on the same table.
--
-- EXISTING HELPERS ARE NOT TOUCHED. The guard fires only on the
-- transition INTO 'approved'. Anyone already approved stays approved and
-- keeps working — which matters, because profiles.avatar_url is seeded
-- only from signup metadata that signupAction has never sent, so it is
-- null for essentially every account on the system.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 0. The assumptions this migration is built on, checked out loud.
--
-- The first attempt at this failed on `column "phone" of relation
-- "profiles" does not exist` — written from 0001's table definition
-- without noticing that 0051 had dropped phone and phone_verified when
-- 0050 moved numbers to profile_contacts. A column list is exactly the
-- kind of thing that rots, and a raw Postgres error at the prompt says
-- nothing about which assumption broke.
-- -------------------------------------------------------------------------
do $$
declare
  v_missing text;
begin
  -- Every column this migration grants or reads must exist.
  select string_agg(c, ', ') into v_missing
    from unnest(array[
      'id', 'role', 'avatar_url', 'full_name', 'country',
      'default_locale', 'default_currency', 'default_timezone', 'updated_at'
    ]) as c
   where not exists (
     select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'profiles'
        and column_name = c
   );
  if v_missing is not null then
    raise exception
      'REFUSING: profiles is missing %. The grant list in this migration was written against a stale schema.',
      v_missing;
  end if;

  -- 0081 renamed the enum value provider -> helper. Comparing against a
  -- label the type does not have is a hard error, not a false match.
  if not exists (
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
     where t.typname = 'user_role' and e.enumlabel = 'helper'
  ) then
    raise exception
      'REFUSING: user_role has no ''helper'' label. Apply 0081_helper_role_rename first.';
  end if;

  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'provider_profiles'
       and column_name = 'status'
  ) then
    raise exception 'REFUSING: provider_profiles.status is missing.';
  end if;
end $$;

-- -------------------------------------------------------------------------
-- 1. No approval without a photo.
-- -------------------------------------------------------------------------
create or replace function public.require_helper_photo_for_approval()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_avatar text;
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    select btrim(coalesce(p.avatar_url, '')) into v_avatar
      from profiles p where p.id = new.user_id;

    if v_avatar = '' then
      raise exception
        'This helper has no profile photo, so they cannot be approved.'
        using errcode = 'HW020';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists provider_profiles_require_photo on public.provider_profiles;
create trigger provider_profiles_require_photo
  before update on public.provider_profiles
  for each row execute function public.require_helper_photo_for_approval();

comment on function public.require_helper_photo_for_approval is
  'Refuses the pending -> approved transition for a helper with no profiles.avatar_url. Fires for the service role too, which is the point: approval is an admin action and RLS would not see it.';

-- -------------------------------------------------------------------------
-- 2. The photo cannot be changed once it is set.
--
-- Until now this was a UI convention and nothing else: `profiles` never
-- had its table-level UPDATE grant revoked, so a helper with their own
-- session could PATCH /rest/v1/profiles?id=eq.<their uid> and set
-- avatar_url to anything, or null, without touching a server action.
-- 0040 documents this exact trap for provider_profiles.
--
-- So UPDATE is revoked and granted back column by column, leaving
-- avatar_url out. Everything a person legitimately edits about
-- themselves is still here; the one column that is now an identity
-- record is not.
--
-- AND IT CLOSES A PRIVILEGE ESCALATION, which is the more serious half
-- of this statement and was found while writing it.
--
-- `profiles_update` (0002) allows `id = auth.uid()`, and its WITH CHECK
-- repeats the same test under a comment reading "Only admin can change
-- role" — but `id = auth.uid()` is true for the person doing it no
-- matter what they set `role` to. With no column grant narrowing it,
-- any signed-in user could:
--
--     PATCH /rest/v1/profiles?id=eq.<their own id>   {"role":"admin"}
--
-- The `sync_role` trigger (0001) then copies that value into
-- auth.users.raw_app_meta_data, jwt_role() reads app_metadata.role, and
-- is_admin() returns true — for every is_admin() check in the estate.
--
-- `role` is not in the list below, so that path is shut. Role changes
-- were always meant to be the service role's alone
-- (app/(admin)/admin/helpers/actions.ts), and now they are.
--
-- THE LIST IS THE LIVE SCHEMA, not 0001's. 0051 dropped profiles.phone
-- and profiles.phone_verified when 0050 moved numbers to
-- profile_contacts — granting them is what made the first attempt at
-- this migration fail. Phone still changes, through set_my_phone (0061).
-- -------------------------------------------------------------------------
revoke update on public.profiles from authenticated;
grant update (
  full_name,
  country,
  default_locale,
  default_currency,
  default_timezone,
  updated_at
) on public.profiles to authenticated;

-- -------------------------------------------------------------------------
-- 3. The one way avatar_url may be written.
--
-- security definer so it can write a column nobody has been granted.
-- It sets the first photo for anybody, and refuses to REPLACE one that a
-- HELPER already has. Customers may still change theirs: the ask was
-- about helper identity, and freezing a customer's avatar would be a
-- different product decision nobody made.
--
-- Admins are deliberately exempt. Without that, a helper who uploads an
-- unusable photo is stuck with it for the life of the account and
-- support has no fix at all — which is a worse failure than the one
-- this migration prevents.
-- -------------------------------------------------------------------------
create or replace function public.set_my_avatar(p_url text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_role user_role;
  v_existing text;
begin
  if auth.uid() is null then
    raise exception 'Not signed in.' using errcode = 'HW021';
  end if;

  select p.role, btrim(coalesce(p.avatar_url, ''))
    into v_role, v_existing
    from profiles p where p.id = auth.uid();

  if v_role = 'helper' and v_existing <> '' then
    raise exception
      'Your profile photo is part of how customers recognise you and cannot be changed here. Contact support if it needs correcting.'
      using errcode = 'HW022';
  end if;

  -- Must live in this account's own folder of the avatars bucket.
  -- avatar_url is free text, and without this the column could be
  -- pointed at any URL at all — including somebody else's face.
  if p_url is null
     or p_url !~ ('^https?://[^ ]+/storage/v1/object/public/avatars/' || auth.uid()::text || '/')
  then
    raise exception 'That is not a valid avatar URL for this account.'
      using errcode = 'HW023';
  end if;

  update profiles
     set avatar_url = p_url,
         updated_at = now()
   where id = auth.uid();
end $$;

revoke execute on function public.set_my_avatar(text) from public;
grant execute on function public.set_my_avatar(text) to authenticated;

comment on function public.set_my_avatar is
  'The only write path to profiles.avatar_url for a signed-in user. Sets a first photo for anyone; refuses to replace a helper''s. Admins correct one with the service role.';

-- -------------------------------------------------------------------------
-- 4. The file behind the URL cannot be swapped either.
--
-- A frozen column over a mutable object is not a frozen photo: 0007 let
-- any authenticated user update or delete objects in their own avatars
-- folder, so a helper could leave the URL alone and replace what it
-- points at — or delete it and leave a broken image on their profile.
--
-- Helpers lose both; customers keep them, same reasoning as above.
-- -------------------------------------------------------------------------
drop policy if exists "avatars_self_update" on storage.objects;
create policy "avatars_self_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
    and not exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'helper'
    )
  );

drop policy if exists "avatars_self_delete" on storage.objects;
create policy "avatars_self_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
    and not exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'helper'
    )
  );

-- =========================================================================
-- WHAT THIS MIGRATION DOES NOT DO, so nobody reads more into it.
--
-- It does not verify that the photo is a selfie, or a face, or the
-- person. A server receives an image file; it cannot know whether that
-- came from a front camera, a rear camera, a screenshot, or a
-- photograph of a photograph. Nothing in this estate does face
-- detection, and no screen may say "verified".
--
-- What actually looks at the photo is the human who approves the
-- account — and the admin queue already renders it
-- (app/(admin)/admin/helpers/page.tsx), so a reviewer can decline one
-- that is not a clear head-and-shoulders photo. This migration makes
-- sure there is always one there to look at.
-- =========================================================================
