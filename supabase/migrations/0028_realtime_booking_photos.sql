-- CLASS: pre-deploy
-- `alter publication ... add table` has no IF NOT EXISTS, so re-running
-- this file errored with "already member of publication". Guarded.
-- Add booking_completion_photos to the supabase_realtime publication so
-- the customer-side /bookings/[id] page can subscribe to proof-photo
-- inserts and re-render the gallery the moment the helper uploads,
-- without manual reload.

do $$
declare
  t text;
begin
  foreach t in array array['booking_completion_photos'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
      raise notice 'realtime: added %', t;
    end if;
  end loop;
end $$;
