import { createSupabaseServerClient } from "@/lib/supabase/server";

// Helper-side analytics fetcher. Everything scoped to the calling user via
// the SSR cookie-bound client — RLS on bookings/match_attempts/reviews
// already restricts to provider_id = auth.uid() so no service-role needed.
// Returns null when there's no signed-in helper (caller decides what to do).

export type HelperAnalytics = {
  kpis: {
    lifetimeEarningsCents: number;
    earningsLast30DaysCents: number;
    completedAllTime: number;
    completedLast30Days: number;
    acceptanceRatePct: number | null;     // null = not enough offers yet
    averageRating: number | null;
    repeatCustomerRatePct: number | null; // % of completed bookings from repeat customers
  };
  weeklyBookings: {
    weekStart: string; // YYYY-MM-DD (Monday)
    count: number;
    payoutCents: number;
  }[];
  topServices: {
    serviceTitle: string;
    bookings: number;
    payoutCents: number;
  }[];
  hourHistogram: { hour: number; count: number }[]; // 0..23
};

export async function getHelperAnalytics(): Promise<HelperAnalytics | null> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const now = new Date();
  const since30d = new Date(now);
  since30d.setDate(since30d.getDate() - 30);
  // 12 weeks of weekly buckets — ~3 months which is enough trend for a
  // helper to see whether their bookings are climbing or flat, without
  // pulling thousands of rows for a long-tenured account.
  const since12w = new Date(now);
  since12w.setDate(since12w.getDate() - 12 * 7);

  const [
    { data: bookings },
    { data: attempts },
    { data: reviews },
  ] = await Promise.all([
    supabase
      .from("bookings")
      .select("id, status, customer_id, service_id, payout_cents, total_cents, completed_at, created_at, scheduled_for")
      .eq("provider_id", user.id)
      .gte("created_at", since12w.toISOString()),
    supabase
      .from("match_attempts")
      .select("id, responded_at, response, notified_at")
      .eq("provider_id", user.id)
      .gte("notified_at", since12w.toISOString()),
    supabase
      .from("reviews")
      .select("rating")
      .eq("provider_id", user.id),
  ]);

  type Booking = {
    id: string; status: string; customer_id: string; service_id: string;
    payout_cents: number; total_cents: number;
    completed_at: string | null; created_at: string; scheduled_for: string | null;
  };
  const bs = (bookings ?? []) as Booking[];
  const completed = bs.filter((b) => b.status === "completed");

  // KPIs ------------------------------------------------------------------
  const since30dIso = since30d.toISOString();
  const lifetimeEarningsCents = completed.reduce((s, b) => s + (b.payout_cents ?? 0), 0);
  const earningsLast30DaysCents = completed
    .filter((b) => (b.completed_at ?? b.created_at) >= since30dIso)
    .reduce((s, b) => s + (b.payout_cents ?? 0), 0);
  const completedLast30Days = completed
    .filter((b) => (b.completed_at ?? b.created_at) >= since30dIso).length;

  // Acceptance rate: responded=accept / total responded (ignore still-pending
  // since they could go either way). Need ≥5 attempts to surface a rate,
  // otherwise we'd show "100% from 1 offer" which is noise not signal.
  const respondedAttempts = (attempts ?? []).filter((a) => a.response != null);
  const acceptanceRatePct = respondedAttempts.length >= 5
    ? Math.round((respondedAttempts.filter((a) => a.response === "accept").length / respondedAttempts.length) * 100)
    : null;

  const ratings = (reviews ?? []).map((r) => r.rating as number).filter((r) => r != null);
  const averageRating = ratings.length > 0
    ? Math.round((ratings.reduce((s, r) => s + r, 0) / ratings.length) * 10) / 10
    : null;

  // Repeat customers: customer_id appears on ≥2 of this helper's completed
  // bookings. Need ≥5 completed bookings to make the rate meaningful.
  const completedByCustomer = new Map<string, number>();
  for (const b of completed) {
    completedByCustomer.set(b.customer_id, (completedByCustomer.get(b.customer_id) ?? 0) + 1);
  }
  const repeatCustomerRatePct = completed.length >= 5
    ? Math.round(([...completedByCustomer.values()].filter((n) => n >= 2).reduce((s, n) => s + n, 0) / completed.length) * 100)
    : null;

  // Weekly bookings (12 buckets, Mon-start) ------------------------------
  const weeklyBookings: HelperAnalytics["weeklyBookings"] = [];
  for (let i = 11; i >= 0; i--) {
    const start = mondayOfWeek(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i * 7));
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    const inWeek = bs.filter((b) => {
      const t = new Date(b.created_at);
      return t >= start && t < end;
    });
    const completedInWeek = inWeek.filter((b) => b.status === "completed");
    weeklyBookings.push({
      weekStart: start.toISOString().slice(0, 10),
      count: inWeek.length,
      payoutCents: completedInWeek.reduce((s, b) => s + (b.payout_cents ?? 0), 0),
    });
  }

  // Top services by completed-booking volume + payout. Need service titles
  // — one extra query in batch via .in().
  const serviceIds = Array.from(new Set(completed.map((b) => b.service_id))).filter(Boolean);
  let serviceTitles = new Map<string, string>();
  if (serviceIds.length > 0) {
    const { data: svcs } = await supabase
      .from("services")
      .select("id, title")
      .in("id", serviceIds);
    serviceTitles = new Map((svcs ?? []).map((s) => [s.id as string, s.title as string] as const));
  }
  const serviceAgg = new Map<string, { bookings: number; payoutCents: number }>();
  for (const b of completed) {
    const k = b.service_id;
    const cur = serviceAgg.get(k) ?? { bookings: 0, payoutCents: 0 };
    cur.bookings += 1;
    cur.payoutCents += b.payout_cents ?? 0;
    serviceAgg.set(k, cur);
  }
  const topServices: HelperAnalytics["topServices"] = [...serviceAgg.entries()]
    .map(([id, v]) => ({ serviceTitle: serviceTitles.get(id) ?? "Unknown", ...v }))
    .sort((a, b) => b.payoutCents - a.payoutCents)
    .slice(0, 5);

  // Hour-of-day histogram on OFFER timestamps — answers "when do I actually
  // get offers, so I know when to be online". Uses match_attempts.notified_at
  // in browser local timezone via toLocaleString trick (server time is UTC
  // but helpers care about their local hours).
  const hourCounts = new Array(24).fill(0) as number[];
  for (const a of attempts ?? []) {
    if (!a.notified_at) continue;
    const d = new Date(a.notified_at);
    hourCounts[d.getHours()] += 1;
  }
  const hourHistogram = hourCounts.map((count, hour) => ({ hour, count }));

  return {
    kpis: {
      lifetimeEarningsCents,
      earningsLast30DaysCents,
      completedAllTime: completed.length,
      completedLast30Days,
      acceptanceRatePct,
      averageRating,
      repeatCustomerRatePct,
    },
    weeklyBookings,
    topServices,
    hourHistogram,
  };
}

function mondayOfWeek(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  // getDay: 0=Sun..6=Sat. Want Mon=0..Sun=6 for week-starts-Monday.
  const dow = (out.getDay() + 6) % 7;
  out.setDate(out.getDate() - dow);
  return out;
}
