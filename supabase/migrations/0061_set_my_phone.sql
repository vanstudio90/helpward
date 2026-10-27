-- CLASS: pre-deploy
-- =========================================================================
-- 0061 — saving your own phone number
--
-- Settings failed with "permission denied for table profile_contacts".
--
-- The cause was the upsert, not the policy. A PostgREST upsert is
-- INSERT ... ON CONFLICT (user_id) DO UPDATE, and it puts every column it
-- was given into the SET clause — user_id included. 0050 grants
-- authenticated UPDATE on (phone, updated_at) only, deliberately, so the
-- SET on user_id was refused. Updating an EXISTING row worked, because
-- that path never touched user_id; only first-time saves failed.
--
-- The fix is not to widen the grant. user_id and phone_verified are
-- exactly the columns that must not be user-writable: one decides whose
-- number it is, the other asserts we checked it. A function that writes
-- the caller's own row needs neither to be grantable.
-- =========================================================================

create or replace function public.set_my_phone(p_phone text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_clean text := nullif(trim(coalesce(p_phone, '')), '');
  v_existing text;
begin
  if v_user is null then
    raise exception 'Not signed in';
  end if;
  if v_clean is not null and length(v_clean) > 30 then
    raise exception 'That phone number is too long.';
  end if;

  select phone into v_existing from profile_contacts where user_id = v_user;

  insert into profile_contacts (user_id, phone, updated_at)
  values (v_user, v_clean, now())
  on conflict (user_id) do update
    set phone = excluded.phone,
        updated_at = now(),
        -- A changed number is an unverified number. Carrying the old
        -- verification across would let someone verify one number and
        -- then swap in another.
        phone_verified = case
          when profile_contacts.phone is distinct from excluded.phone then false
          else profile_contacts.phone_verified
        end;
end;
$$;

revoke execute on function public.set_my_phone(text) from public, anon;
grant execute on function public.set_my_phone(text) to authenticated, service_role;

-- The table's own grants stay as narrow as 0050 made them: nothing here
-- needs widening, which was the point of doing it as a function.
