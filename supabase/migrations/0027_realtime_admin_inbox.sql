-- Add the tables that drive the /admin/inbox queue counts to the Supabase
-- Realtime publication so the AdminInboxRealtimeRefresh client component
-- can subscribe to postgres_changes events and trigger router.refresh()
-- when any of the queues gains a new row.
--
-- bookings + notifications + match_attempts + messages were already added
-- in 0005_realtime.sql. The five tables below close the gap for the
-- inbox's "needs human attention" surface.

alter publication supabase_realtime add table disputes;
alter publication supabase_realtime add table provider_profiles;
alter publication supabase_realtime add table requests;
alter publication supabase_realtime add table data_export_requests;
alter publication supabase_realtime add table account_deletion_requests;
