-- CLASS: pre-deploy
-- =========================================================================
-- 0060 — one way to add a table to realtime
--
-- `alter publication ... add table` has no IF NOT EXISTS and errors with
-- "already member of publication" on a second run. Three migrations hit
-- that (0005, 0027, 0028), each was guarded individually, and 0059 then
-- made the same mistake again — because the guard was a pattern to
-- remember rather than a function to call.
--
-- So: a function to call.
-- =========================================================================

create or replace function public.add_to_realtime(p_table text)
returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = p_table
  ) then
    return false;
  end if;

  execute format('alter publication supabase_realtime add table public.%I', p_table);
  raise notice 'realtime: added %', p_table;
  return true;
end;
$$;

revoke execute on function public.add_to_realtime(text) from public, anon, authenticated;
