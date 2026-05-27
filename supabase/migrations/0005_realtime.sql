-- Enable Supabase Realtime on the tables we want to subscribe to from the browser.
-- Realtime works via the `supabase_realtime` publication.

alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table provider_locations;
alter publication supabase_realtime add table notifications;
alter publication supabase_realtime add table bookings;
alter publication supabase_realtime add table match_attempts;
