// Pure types + formatters — safe to import from client components. Lives
// outside lib/data/* because anything there transitively imports the
// server-only Supabase client and poisons the client bundle.

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
  | { kind: "available"; until: string }
  | { kind: "vacation"; returnsOn: string | null }
  | { kind: "off-today" }
  | { kind: "before-shift"; nextStart: string }
  | { kind: "later-this-week"; weekdayName: string; time: string }
  | { kind: "no-schedule" };

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

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

  const todayOverride = overrides.find((o) => o.date === todayStr);
  if (todayOverride?.is_unavailable) return { kind: "off-today" };

  const todayShifts = todayOverride && todayOverride.start_time && todayOverride.end_time
    ? [{ start: todayOverride.start_time.slice(0, 5), end: todayOverride.end_time.slice(0, 5) }]
    : rules
        .filter((r) => r.weekday === todayWeekday)
        .map((r) => ({ start: r.start_time.slice(0, 5), end: r.end_time.slice(0, 5) }));

  const current = todayShifts.find((s) => s.start <= nowHM && nowHM < s.end);
  if (current) return { kind: "available", until: humanTime(current.end) };

  const next = todayShifts.find((s) => nowHM < s.start);
  if (next) return { kind: "before-shift", nextStart: humanTime(next.start) };

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
  const [h, m] = hm.split(":").map(Number);
  const am = h < 12;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12}${am ? "am" : "pm"}` : `${h12}:${pad(m)}${am ? "am" : "pm"}`;
}

// 7-day quick summary for the helper public profile strip. Resolves each
// of today + next 6 days against weekly rules + overrides + vacation. Only
// surfaces "available" with the earliest shift start time or "off"; the
// full schedule lives in the AvailabilityTable below.
export type DaySummary = {
  iso: string;        // YYYY-MM-DD
  dow: number;        // 0..6 (Sun..Sat)
  isToday: boolean;
  available: boolean;
  earliestStart: string | null; // "9am" / "9:30am" / null when off
  reason: "vacation" | "override-off" | "no-shifts" | "open" | "none";
};

export function nextSevenDaysSummary(
  rules: WeeklyRule[],
  overrides: DateOverride[],
  vacation: { on: boolean; returnsOn: string | null },
  now: Date = new Date(),
): DaySummary[] {
  const out: DaySummary[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + i);
    const iso = d.toISOString().slice(0, 10);
    const dow = d.getDay();
    const isToday = i === 0;

    // Vacation mode wins everything until returnsOn passes.
    if (vacation.on && (!vacation.returnsOn || iso < vacation.returnsOn)) {
      out.push({ iso, dow, isToday, available: false, earliestStart: null, reason: "vacation" });
      continue;
    }

    const override = overrides.find((o) => o.date === iso);
    if (override?.is_unavailable) {
      out.push({ iso, dow, isToday, available: false, earliestStart: null, reason: "override-off" });
      continue;
    }

    // Override with explicit start/end times REPLACES the weekly rule for
    // the day — same semantics as computeAvailabilityStatus.
    const shifts = override && override.start_time && override.end_time
      ? [{ start: override.start_time.slice(0, 5), end: override.end_time.slice(0, 5) }]
      : rules.filter((r) => r.weekday === dow).map((r) => ({
          start: r.start_time.slice(0, 5), end: r.end_time.slice(0, 5),
        }));

    if (shifts.length === 0) {
      out.push({ iso, dow, isToday, available: false, earliestStart: null, reason: "no-shifts" });
      continue;
    }
    const earliest = shifts.map((s) => s.start).sort()[0];
    out.push({
      iso, dow, isToday,
      available: true,
      earliestStart: humanTimeShort(earliest),
      reason: shifts.some(() => override) ? "open" : "open",
    });
  }
  return out;
}

// Tighter version of humanTime — drops minutes when they're :00 and uses
// 1-letter am/pm so it fits in a narrow column. "9a" / "5:30p".
function humanTimeShort(hm: string): string {
  const [h, m] = hm.split(":").map(Number);
  const am = h < 12;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const suf = am ? "a" : "p";
  return m === 0 ? `${h12}${suf}` : `${h12}:${pad(m)}${suf}`;
}

export function totalWeeklyHours(rules: WeeklyRule[]): number {
  let total = 0;
  for (const r of rules) {
    const [sh, sm] = r.start_time.split(":").map(Number);
    const [eh, em] = r.end_time.split(":").map(Number);
    total += (eh + em / 60) - (sh + sm / 60);
  }
  return Math.round(total * 10) / 10;
}
