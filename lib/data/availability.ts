import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";

export type WeeklyRule = {
  id: string;
  weekday: number; // 0=Sun..6=Sat
  start_time: string; // "HH:MM:SS"
  end_time: string;
};

export type DateOverride = {
  id: string;
  date: string;          // "YYYY-MM-DD"
  is_unavailable: boolean;
  start_time: string | null;
  end_time: string | null;
  label: string | null;
};

export type AvailabilityStatus =
  | { kind: "available"; until: string }              // available right now, until "HH:MM"
  | { kind: "vacation"; returnsOn: string | null }    // helper toggled vacation mode
  | { kind: "off-today" }                             // no shift today
  | { kind: "before-shift"; nextStart: string }       // shift later today, "HH:MM"
  | { kind: "later-this-week"; weekdayName: string; time: string }
  | { kind: "no-schedule" };                          // helper hasn't set anything up

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Provider's own rules — auth client respects RLS so it only returns the
// caller's rows. Used by /provider/schedule editor.
export async function getMyAvailability(): Promise<{ rules: WeeklyRule[]; overrides: DateOverride[]; vacation: { on: boolean; returnsOn: string | null } } | null> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const today = new Date().toISOString().slice(0, 10);
  const [{ data: rules }, { data: overrides }, { data: pp }] = await Promise.all([
    supabase
      .from("provider_availability_rules")
      .select("id, weekday, start_time, end_time")
      .eq("provider_id", user.id)
      .order("weekday")
      .order("start_time"),
    supabase
      .from("provider_availability_overrides")
      .select("id, date, is_unavailable, start_time, end_time, label")
      .eq("provider_id", user.id)
      .gte("date", today)
      .order("date"),
    supabase
      .from("provider_profiles")
      .select("vacation_mode, vacation_returns_on")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  return {
    rules: (rules ?? []) as WeeklyRule[],
    overrides: (overrides ?? []) as DateOverride[],
    vacation: { on: pp?.vacation_mode ?? false, returnsOn: pp?.vacation_returns_on ?? null },
  };
}

// Public read — service-role so we bypass the unauthenticated visitor's
// missing RLS context. Policy already restricts to approved providers.
export async function getProviderAvailability(providerId: string): Promise<{
  rules: WeeklyRule[];
  overrides: DateOverride[];
  vacation: { on: boolean; returnsOn: string | null };
}> {
  const supabase = createSupabaseServiceClient();
  const today = new Date().toISOString().slice(0, 10);
  const [{ data: rules }, { data: overrides }, { data: pp }] = await Promise.all([
    supabase
      .from("provider_availability_rules")
      .select("id, weekday, start_time, end_time")
      .eq("provider_id", providerId)
      .order("weekday")
      .order("start_time"),
    supabase
      .from("provider_availability_overrides")
      .select("id, date, is_unavailable, start_time, end_time, label")
      .eq("provider_id", providerId)
      .gte("date", today)
      .order("date")
      .limit(50),
    supabase
      .from("provider_profiles")
      .select("vacation_mode, vacation_returns_on")
      .eq("user_id", providerId)
      .maybeSingle(),
  ]);

  return {
    rules: (rules ?? []) as WeeklyRule[],
    overrides: (overrides ?? []) as DateOverride[],
    vacation: { on: pp?.vacation_mode ?? false, returnsOn: pp?.vacation_returns_on ?? null },
  };
}

// Compute the human-readable availability status for "right now" — used by
// the public profile badge ("Available now until 6pm", "Off until Monday").
//
// `now` is injectable for tests; defaults to the server's wall clock.
// Times are interpreted naively (server-side) — fine for the badge because
// we're comparing the current "HH:MM" with the helper's "HH:MM" within the
// same day; the helper's TZ is handled by the fact that they entered their
// schedule in their own local time.
export function computeAvailabilityStatus(
  rules: WeeklyRule[],
  overrides: DateOverride[],
  vacation: { on: boolean; returnsOn: string | null },
  now: Date = new Date(),
): AvailabilityStatus {
  if (vacation.on) return { kind: "vacation", returnsOn: vacation.returnsOn };

  if (rules.length === 0 && overrides.length === 0) return { kind: "no-schedule" };

  const todayStr = now.toISOString().slice(0, 10);
  const todayWeekday = now.getDay();
  const nowHM = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

  // Step 1: is there an override for today?
  const todayOverride = overrides.find((o) => o.date === todayStr);
  if (todayOverride?.is_unavailable) return { kind: "off-today" };

  // Step 2: what shifts apply today? Overrides ADD shifts; weekly rules are
  // the default.
  const todayShifts = todayOverride && todayOverride.start_time && todayOverride.end_time
    ? [{ start: todayOverride.start_time.slice(0, 5), end: todayOverride.end_time.slice(0, 5) }]
    : rules
        .filter((r) => r.weekday === todayWeekday)
        .map((r) => ({ start: r.start_time.slice(0, 5), end: r.end_time.slice(0, 5) }));

  // Currently inside a shift?
  const current = todayShifts.find((s) => s.start <= nowHM && nowHM < s.end);
  if (current) return { kind: "available", until: humanTime(current.end) };

  // Upcoming shift today?
  const next = todayShifts.find((s) => nowHM < s.start);
  if (next) return { kind: "before-shift", nextStart: humanTime(next.start) };

  // Look ahead through the rest of the week — first non-empty day with a
  // rule. Limit to next 6 days; beyond that we just say "off-today".
  for (let i = 1; i <= 6; i++) {
    const wd = (todayWeekday + i) % 7;
    const date = new Date(now);
    date.setDate(date.getDate() + i);
    const dateStr = date.toISOString().slice(0, 10);
    const dayOverride = overrides.find((o) => o.date === dateStr);
    if (dayOverride?.is_unavailable) continue;
    const dayShifts = dayOverride && dayOverride.start_time
      ? [{ start: dayOverride.start_time.slice(0, 5), end: dayOverride.end_time?.slice(0, 5) ?? "" }]
      : rules.filter((r) => r.weekday === wd).map((r) => ({ start: r.start_time.slice(0, 5), end: r.end_time.slice(0, 5) }));
    if (dayShifts.length > 0) {
      const first = dayShifts[0];
      return {
        kind: "later-this-week",
        weekdayName: WEEKDAY_NAMES[wd],
        time: humanTime(first.start),
      };
    }
  }
  return { kind: "off-today" };
}

function pad(n: number): string { return n.toString().padStart(2, "0"); }

function humanTime(hm: string): string {
  // "14:30" → "2:30pm"
  const [h, m] = hm.split(":").map(Number);
  const am = h < 12;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12}${am ? "am" : "pm"}` : `${h12}:${pad(m)}${am ? "am" : "pm"}`;
}

// Tiny formatter so the editor can summarise "12 hours/week" for the
// helper without recomputing client-side.
export function totalWeeklyHours(rules: WeeklyRule[]): number {
  let total = 0;
  for (const r of rules) {
    const [sh, sm] = r.start_time.split(":").map(Number);
    const [eh, em] = r.end_time.split(":").map(Number);
    total += (eh + em / 60) - (sh + sm / 60);
  }
  return Math.round(total * 10) / 10;
}
