import { createSupabaseServiceClient } from "@/lib/supabase/server";

// Booking aggregates per service for the last N days. Used by service cards
// to surface "Booked X times this week" social-proof badges. Returns a Map
// keyed by service_id so callers can do `counts.get(s.id) ?? 0` cheaply.
//
// Service-role client because we read across all users and the catalog is
// not user-scoped. Cached in-memory for 60s via Next's request memoization.
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

// Pretty social-proof label. Below 5 we say "Newly listed" to avoid the
// awkward "Booked 1 time this week" — better social signal than a tiny number.
export function bookingBadge(count: number): { label: string; tone: "new" | "warm" | "hot" } {
  if (count === 0) return { label: "Newly listed", tone: "new" };
  if (count < 5) return { label: "Newly listed", tone: "new" };
  if (count < 25) return { label: `Booked ${roundDown(count, 5)}+ times this week`, tone: "warm" };
  if (count < 100) return { label: `Booked ${roundDown(count, 10)}+ times this week`, tone: "warm" };
  return { label: `Booked ${roundDown(count, 50)}+ times this week`, tone: "hot" };
}

function roundDown(n: number, step: number): number {
  return Math.floor(n / step) * step;
}
