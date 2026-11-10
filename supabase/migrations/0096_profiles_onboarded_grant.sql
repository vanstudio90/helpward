-- CLASS: pre-deploy
-- =========================================================================
-- 0096 — give back profiles.onboarded_at, which 0095 took by accident
--
-- 0095 revoked UPDATE on profiles and granted it back column by column.
-- The list was built by reading 0001's table definition and the
-- `alter table profiles add column` lines — and it missed one, because
-- 0025 writes its ALTER across two lines and the search that found the
-- others did not match it.
--
-- The column is profiles.onboarded_at. dismissOnboardingAction
-- (app/(app)/dashboard/onboarding-actions.ts) stamps it as the
-- signed-in customer when they dismiss the dashboard tour, deliberately
-- server-side so the tour stays dismissed across devices rather than
-- living in localStorage. Without the grant that action fails and the
-- tour comes back on every visit.
--
-- EVERY OTHER COLUMN ON profiles IS ACCOUNTED FOR, so this is the last
-- of them:
--
--   id, role                 never user-writable. `role` is the one 0095
--                            was closing: a user could set their own to
--                            'admin', the sync_role trigger copied it
--                            into their JWT, and is_admin() read it back.
--   avatar_url               set_my_avatar only (0095).
--   full_name, country,      granted in 0095. Written by the settings
--   default_currency,        form, the helper profile screen and the
--   default_locale,          iOS app.
--   default_timezone,
--   updated_at
--   onboarded_at             granted here.
--   referral_credits_cents   READ ONLY in both apps — nothing in either
--                            codebase writes it. Left ungranted on
--                            purpose: it is a balance, and before 0095
--                            any signed-in user could have set their own.
--   is_review_account        service role only. 0088 already guards it
--                            with reject_self_review_flag; leaving it out
--                            of the grant means the trigger is no longer
--                            the only thing standing there.
--   created_at               never.
--   phone, phone_verified    dropped by 0051; numbers live on
--                            profile_contacts and change through
--                            set_my_phone (0061).
-- =========================================================================

do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'profiles'
       and column_name = 'onboarded_at'
  ) then
    raise exception
      'REFUSING: profiles.onboarded_at does not exist. Apply 0025_profile_onboarded first.';
  end if;
end $$;

grant update (onboarded_at) on public.profiles to authenticated;
