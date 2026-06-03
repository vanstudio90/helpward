import { createSupabaseServerClient } from "@/lib/supabase/server";

// Customer-side "lifetime stats" fetcher — the mirror of helper analytics.
// Everything scoped via SSR cookie client; RLS on bookings + services already
// restricts to customer_id = auth.uid(). Returns null when nobody's signed
// in so the caller can short-circuit.

export type CustomerLifetimeStats = {
  totalSpentCents: number;
  spent30dCents: number;
  completedAllTime: number;
  completedLast30Days: number;
  favoriteService: { title: string; bookings: number } | null;
  topHelper: { userId: string; slug: string | null; fullName: string; bookings: number } | null;
  weeklySpend: { weekStart: string; spentCents: number }[];
  nextScheduled: { id: string; scheduledFor: string; serviceTitle: string } | null;
};

export async function getCustomerLifetimeStats(): Promise<CustomerLifetimeStats | null> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const now = new Date();
  const since30d = new Date(now); since30d.setDate(since30d.getDate() - 30);
  const since12w = new Date(now); since12w.setDate(since12w.getDate() - 12 * 7);

  // Two parallel queries: lifetime completed bookings (for totals + favorite
  // service + top helper aggregation) and the next scheduled booking (so we
  // can surface "your next task is Saturday at 9am" without a third trip).
  const [{ data: completedRows }, { data: nextRow }] = await Promise.all([
    supabase
      .from("bookings")
      .select(`
        id, status, total_cents, completed_at, created_at, provider_id, service_id,
        service:services(title),
        provider:provider_profiles!bookings_provider_id_fkey(
          user_id, slug,
          profile:profiles!provider_profiles_user_id_fkey(full_name)
        )
      `)
      .eq("customer_id", user.id)
      .eq("status", "completed")
      .order("completed_at", { ascending: false }),
    supabase
      .from("bookings")
      .select(`
        id, scheduled_for,
        service:services(title)
      `)
      .eq("customer_id", user.id)
      .eq("status", "scheduled")
      .gte("scheduled_for", new Date().toISOString())
      .order("scheduled_for", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  type Row = {
    id: string; total_cents: number; completed_at: string | null; created_at: string;
    provider_id: string; service_id: string;
    service: { title: string } | null;
    provider: {
      user_id: string; slug: string | null;
      profile: { full_name: string } | null;
    } | null;
  };
  const completed = (completedRows ?? []) as unknown as Row[];

  const totalSpentCents = completed.reduce((s, b) => s + (b.total_cents ?? 0), 0);
  const since30dIso = since30d.toISOString();
  const last30 = completed.filter((b) => (b.completed_at ?? b.created_at) >= since30dIso);
  const spent30dCents = last30.reduce((s, b) => s + (b.total_cents ?? 0), 0);

  // Favorite service: count completed bookings per service_id, take the top.
  const svcCount = new Map<string, { title: string; n: number }>();
  for (const b of completed) {
    const title = b.service?.title ?? "Unknown";
    const cur = svcCount.get(b.service_id) ?? { title, n: 0 };
    cur.n += 1;
    svcCount.set(b.service_id, cur);
  }
  const favoriteService = [...svcCount.values()].sort((a, b) => b.n - a.n)[0] ?? null;

  // Top helper: most-booked provider. We only surface when they've been
  // hired ≥2 times — once is a coincidence, twice is a relationship.
  const helperCount = new Map<string, { userId: string; slug: string | null; fullName: string; n: number }>();
  for (const b of completed) {
    if (!b.provider) continue;
    const cur = helperCount.get(b.provider.user_id) ?? {
      userId: b.provider.user_id,
      slug: b.provider.slug,
      fullName: b.provider.profile?.full_name ?? "Helper",
      n: 0,
    };
    cur.n += 1;
    helperCount.set(b.provider.user_id, cur);
  }
  const topHelperRaw = [...helperCount.values()].sort((a, b) => b.n - a.n)[0];
  const topHelper = topHelperRaw && topHelperRaw.n >= 2
    ? { userId: topHelperRaw.userId, slug: topHelperRaw.slug, fullName: topHelperRaw.fullName, bookings: topHelperRaw.n }
    : null;

  // 12-week weekly spend (Monday-start). Bucket the same way helper-analytics
  // does so the visual language stays consistent.
  const weeklySpend: CustomerLifetimeStats["weeklySpend"] = [];
  for (let i = 11; i >= 0; i--) {
    const start = mondayOfWeek(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i * 7));
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    const cents = completed
      .filter((b) => {
        const t = new Date(b.completed_at ?? b.created_at);
        return t >= start && t < end;
      })
      .reduce((s, b) => s + (b.total_cents ?? 0), 0);
    weeklySpend.push({ weekStart: start.toISOString().slice(0, 10), spentCents: cents });
  }

  type NextRow = { id: string; scheduled_for: string; service: { title: string } | null };
  const next = nextRow as unknown as NextRow | null;
  const nextScheduled = next
    ? { id: next.id, scheduledFor: next.scheduled_for, serviceTitle: next.service?.title ?? "Service" }
    : null;

  return {
    totalSpentCents,
    spent30dCents,
    completedAllTime: completed.length,
    completedLast30Days: last30.length,
    favoriteService: favoriteService ? { title: favoriteService.title, bookings: favoriteService.n } : null,
    topHelper,
    weeklySpend,
    nextScheduled,
  };
}

function mondayOfWeek(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  const dow = (out.getDay() + 6) % 7;
  out.setDate(out.getDate() - dow);
  return out;
}
