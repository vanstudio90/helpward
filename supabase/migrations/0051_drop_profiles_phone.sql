-- CLASS: deploy-coupled
-- =========================================================================
-- 0051 — drop profiles.phone
--
-- MUST land only AFTER the release that stops reading the column. Several
-- pages select profiles with `*`; dropping it first breaks them.
--
-- The number now lives in profile_contacts with a policy that releases it
-- to the other party only while a booking between them is live (0050).
-- Leaving the old column would re-expose it the moment anything selected
-- profiles again, so it goes rather than lingering as a trap.
-- =========================================================================

-- Refuse to drop a column that still holds numbers nobody copied across.
do $$
declare v_stranded int;
begin
  if not exists (
    select 1 from information_schema.columns
     where table_name = 'profiles' and column_name = 'phone'
  ) then
    raise notice 'profiles.phone already dropped';
    return;
  end if;

  select count(*) into v_stranded
    from profiles p
   where p.phone is not null and p.phone <> ''
     and not exists (
       select 1 from profile_contacts c
        where c.user_id = p.id and c.phone = p.phone
     );

  if v_stranded > 0 then
    raise exception
      'REFUSING: % phone number(s) on profiles have no matching profile_contacts row. Re-run 0050 first.',
      v_stranded;
  end if;

  execute 'alter table profiles drop column phone';
  raise notice 'profiles.phone dropped; % contact row(s) carry the numbers now',
    (select count(*) from profile_contacts where phone is not null);
end $$;

-- phone_verified goes with it: it described the column that just left.
alter table profiles drop column if exists phone_verified;
