import { createSupabaseServiceClient } from "@/lib/supabase/server";

// Booking aggregates per service for the last N days. Used by service cards
// to surface "Booked X times this week" social-proof badges. Returns a Map
// keyed by service_id so callers can do `counts.get(s.id) ?? 0` cheaply.
//
// Service-role client because we read across all users and the catalog is
// not user-scoped. SERVER-ONLY — re-exporting `bookingBadge` lives in a
// separate file so client components can import the pure formatter without
// pulling next/headers into the browser bundle.
export async function getBookingCountsByService(days = 7): Promise<Map<string, number>> {
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("bookings")
    .select("service_id")
    .gte("created_at", since)
    .limit(50_000);
  if (error) {
    console.error("getBookingCountsByService:", error.message);
    return new Map();
  }
  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    if (!row.service_id) continue;
    counts.set(row.service_id, (counts.get(row.service_id) ?? 0) + 1);
  }
  return counts;
}
