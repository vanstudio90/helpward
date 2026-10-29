-- CLASS: deploy-coupled
--
-- Rename the worker role from 'provider' to 'helper'.
--
-- WHY DEPLOY-COUPLED: renaming an enum VALUE is atomic. Postgres stores
-- enums by OID, so every profiles.role row flips in the same instant and
-- there is no window in which both spellings exist. Code that still
-- compares against the literal 'provider' stops recognising its own
-- helpers the moment this runs — mid-shift, with jobs in progress. The
-- app must already be reading through lib/roles.ts, which accepts both,
-- BEFORE this is applied. That shipped first, deliberately.
--
-- What follows the rename on its own, and what does not:
--
--   Rows               — follow. Stored by OID, not text.
--   RLS policies       — follow. A stored expression holds the enum OID,
--                        so `role = 'provider'::user_role` re-renders
--                        itself as `role = 'helper'::user_role`. Verified
--                        on rehearsal rather than assumed.
--   Function bodies    — do NOT follow. plpgsql source is stored as text,
--                        so every literal has to be rewritten by hand.
--                        That is what most of this file is.
--   favorites.kind     — unrelated. A text column with its own CHECK,
--                        meaning "a favourited helper". Renamed here too
--                        so one word is not two things.

begin;

-- ---------------------------------------------------------------------
-- 1. The enum value.
-- ---------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'user_role' and e.enumlabel = 'provider'
  ) then
    alter type user_role rename value 'provider' to 'helper';
  elsif not exists (
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'user_role' and e.enumlabel = 'helper'
  ) then
    raise exception 'user_role has neither provider nor helper — refusing to guess';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2. handle_new_user.
--
-- Patched from the LIVE definition rather than restated from a migration
-- file, so it keeps whatever the most recent change made it and only the
-- role handling moves. If the text it expects is absent the migration
-- raises instead of silently leaving the old behaviour in place.
--
-- The normalisation is not decoration. This function does
-- `meta_role::user_role`, so a signup still sending role='provider' —
-- from a browser tab holding a cached bundle, or an app build from
-- before today — would fail the cast outright and create no profile at
-- all. Accepting the retired spelling costs one line and prevents a
-- signup that dies after the account row already exists.
-- ---------------------------------------------------------------------
do $$
declare
  d text;
begin
  select pg_get_functiondef(p.oid) into d
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'handle_new_user';

  if d is null then
    raise exception 'handle_new_user not found';
  end if;
  if position($m$meta_role = 'provider'$m$ in d) = 0 then
    raise exception 'handle_new_user does not match the expected shape; patch it by hand';
  end if;

  -- ORDER MATTERS, and getting it wrong is silent.
  --
  -- The normalisation inserted below CONTAINS the text the branch rewrite
  -- looks for. Done the other way round, replace() — which rewrites every
  -- occurrence, not the first — turns the new guard into
  -- `if meta_role = 'helper' then meta_role := 'helper'`, a line that does
  -- nothing, while still reading as though it does. The function then
  -- compiles, the migration reports success, and the first signup from a
  -- client sending the old spelling dies on the enum cast.
  --
  -- So the branch is rewritten FIRST, while it is still the only match.
  d := replace(d, $m$if meta_role = 'provider' then$m$, $m$if meta_role = 'helper' then$m$);

  d := replace(
    d,
    $m$meta_role := coalesce(new.raw_user_meta_data->>'role', 'customer');$m$,
    $m$meta_role := coalesce(new.raw_user_meta_data->>'role', 'customer');
  -- Accept the retired spelling from any client still sending it.
  if meta_role = 'provider' then meta_role := 'helper'; end if;$m$
  );

  execute d;
end $$;

-- ---------------------------------------------------------------------
-- 3. cancel_booking.
--
-- v_who is plain text, so the enum rename does not reach it — but it is
-- concatenated into `cancel_reason = 'Cancelled by ' || v_who`, which is
-- stored on the booking and read by people. "Cancelled by provider" is
-- the word showing up in front of a customer.
-- ---------------------------------------------------------------------
do $$
declare
  d text;
begin
  select pg_get_functiondef(p.oid) into d
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'cancel_booking';

  if d is null then
    raise exception 'cancel_booking not found';
  end if;
  if position($m$v_who := 'provider';$m$ in d) = 0 then
    raise exception 'cancel_booking does not match the expected shape; patch it by hand';
  end if;

  execute replace(d, $m$v_who := 'provider';$m$, $m$v_who := 'helper';$m$);
end $$;

-- ---------------------------------------------------------------------
-- 4. favorites.kind.
--
-- Widen, move the data, then narrow — never a window where a legitimate
-- value is rejected.
-- ---------------------------------------------------------------------
alter table public.favorites drop constraint if exists favorites_kind_check;
alter table public.favorites
  add constraint favorites_kind_check
  check (kind in ('provider', 'helper', 'service', 'address'));

update public.favorites set kind = 'helper' where kind = 'provider';

alter table public.favorites drop constraint favorites_kind_check;
alter table public.favorites
  add constraint favorites_kind_check
  check (kind in ('helper', 'service', 'address'));

-- ---------------------------------------------------------------------
-- 5. auth app_metadata.
--
-- proxy.ts reads the role from the JWT on every request, and the JWT is
-- built from app_metadata — a separate copy from profiles.role, which
-- the enum rename does not touch. Left behind, it would keep minting
-- tokens saying 'provider' forever.
--
-- Existing sessions keep their old token until it refreshes. That is
-- exactly why the app accepts both spellings and why removing that pair
-- has to wait for the last old token to expire.
-- ---------------------------------------------------------------------
update auth.users
set raw_app_meta_data = jsonb_set(raw_app_meta_data, '{role}', '"helper"')
where raw_app_meta_data->>'role' = 'provider';

commit;
