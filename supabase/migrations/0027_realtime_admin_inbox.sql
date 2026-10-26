-- CLASS: pre-deploy
-- `alter publication ... add table` has no IF NOT EXISTS, so re-running
-- this file errored with "already member of publication". Guarded.
-- Add the tables that drive the /admin/inbox queue counts to the Supabase
-- Realtime publication so the AdminInboxRealtimeRefresh client component
-- can subscribe to postgres_changes events and trigger router.refresh()
-- when any of the queues gains a new row.
--
-- bookings + notifications + match_attempts + messages were already added
-- in 0005_realtime.sql. The five tables below close the gap for the
-- inbox's "needs human attention" surface.

do $$
declare
  t text;
begin
  foreach t in array array['disputes', 'provider_profiles', 'requests', 'data_export_requests', 'account_deletion_requests'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
      raise notice 'realtime: added %', t;
    end if;
  end loop;
end $$;
