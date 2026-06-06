-- Add booking_completion_photos to the supabase_realtime publication so
-- the customer-side /bookings/[id] page can subscribe to proof-photo
-- inserts and re-render the gallery the moment the helper uploads,
-- without manual reload.

alter publication supabase_realtime add table booking_completion_photos;
