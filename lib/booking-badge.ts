// Pure formatter — safe to import from client components. Lives outside
// lib/data/* because anything there transitively imports the server-only
// Supabase client and poisons the client bundle.

// Pretty social-proof label. Below 5 we say "Newly listed" to avoid the
// awkward "Booked 1 time this week" — better social signal than a tiny number.
export function bookingBadge(count: number): { label: string; tone: "new" | "warm" | "hot" } {
  if (count < 5) return { label: "Newly listed", tone: "new" };
  if (count < 25) return { label: `Booked ${roundDown(count, 5)}+ times this week`, tone: "warm" };
  if (count < 100) return { label: `Booked ${roundDown(count, 10)}+ times this week`, tone: "warm" };
  return { label: `Booked ${roundDown(count, 50)}+ times this week`, tone: "hot" };
}

function roundDown(n: number, step: number): number {
  return Math.floor(n / step) * step;
}
