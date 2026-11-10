-- CLASS: pre-deploy
-- =========================================================================
-- 0094 — replacing a week's availability becomes one transaction
--
-- Saving a schedule is "delete every rule, then insert the new ones". On
-- both the website (app/(helper)/helper/schedule/actions.ts) and in the
-- app that is TWO PostgREST requests, so the sequence is not atomic
-- however the comment above it reads: if the insert fails — a validation
-- error, a dropped connection, the app backgrounded at the wrong moment
-- — the delete has already committed and the helper's entire week is
-- gone. They find out by not being offered work.
--
-- A function body is a single transaction, so the delete and the insert
-- either both land or neither does.
--
-- SECURITY INVOKER, deliberately. RLS still applies, so this cannot be
-- used to write somebody else's schedule, and provider_id is taken from
-- auth.uid() rather than from the payload so it cannot be asked to.
-- A definer function here would be a way to write any provider's rules
-- for the sake of a transaction we can have without it.
--
-- The guards mirror the website's action exactly: a weekday in 0..6,
-- end after start, and at most 40 shifts in a week.
-- =========================================================================

create or replace function public.set_availability_week(p_rules jsonb)
returns integer
language plpgsql
security invoker
set search_path = public as $$
declare
  v_user  uuid := auth.uid();
  v_count integer;
begin
  if v_user is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;

  if p_rules is null or jsonb_typeof(p_rules) <> 'array' then
    raise exception 'Availability must be a list of shifts';
  end if;

  v_count := jsonb_array_length(p_rules);
  if v_count > 40 then
    raise exception 'That is more than 40 shifts in a week';
  end if;

  -- Validated before anything is deleted, so a bad payload cannot cost
  -- the helper the week they already had.
  if exists (
    select 1 from jsonb_array_elements(p_rules) as r
     where (r->>'weekday') is null
        or (r->>'weekday')::int not between 0 and 6
        or (r->>'start_time') is null
        or (r->>'end_time') is null
        or (r->>'end_time')::time <= (r->>'start_time')::time
  ) then
    raise exception 'Every shift needs a weekday and an end time after its start';
  end if;

  delete from provider_availability_rules where provider_id = v_user;

  insert into provider_availability_rules (provider_id, weekday, start_time, end_time)
  select v_user,
         (r->>'weekday')::smallint,
         (r->>'start_time')::time,
         (r->>'end_time')::time
    from jsonb_array_elements(p_rules) as r;

  return v_count;
end $$;

revoke all on function public.set_availability_week(jsonb) from public, anon;
grant execute on function public.set_availability_week(jsonb) to authenticated;

comment on function public.set_availability_week(jsonb) is
  'Atomically replaces the caller''s weekly availability. Several shifts per '
  'weekday are expected and supported (split shifts). See 0094.';
