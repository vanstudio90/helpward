-- CLASS: pre-deploy
-- Enable Supabase Realtime on the tables we want to subscribe to from the
-- browser. Realtime works via the `supabase_realtime` publication.
--
-- `alter publication ... add table` has no IF NOT EXISTS and errors with
-- "relation is already member of publication" on a second run. All three
-- realtime migrations (0005, 0027, 0028) had this, so the runner's claim
-- that every migration is idempotent was false — it only surfaced when
-- --redo re-applied the set and the batch stopped partway through.
-- Guarded now, in all three.
do $$
declare
  t text;
begin
  foreach t in array array[
    'messages', 'provider_locations', 'notifications', 'bookings', 'match_attempts'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
      raise notice 'realtime: added %', t;
    end if;
  end loop;
end $$;
