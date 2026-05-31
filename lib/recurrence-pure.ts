// Pure recurrence helpers — date math only, no DB. Safe to import anywhere
// including from client components for the new-request picker.

export type Cadence = "weekly" | "biweekly" | "monthly";

export type RecurrenceRule = {
  cadence: Cadence;
  // Weekly + biweekly: 0=Sun..6=Sat. Required if cadence is weekly/biweekly.
  weekday?: number;
  // Monthly: 1..31. Required if cadence is monthly. Clamps to last-day-of-month
  // automatically (e.g. 31 in February → 28/29).
  dayOfMonth?: number;
  // The local-time-of-day the customer wants the task at. "HH:MM".
  timeOfDay: string;
  startDate: string;        // "YYYY-MM-DD"
  endDate?: string | null;
  maxOccurrences?: number | null;
};

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function describeRule(rule: RecurrenceRule): string {
  const time = humanTime(rule.timeOfDay);
  if (rule.cadence === "weekly") return `Every ${WEEKDAY_NAMES[rule.weekday ?? 0]} at ${time}`;
  if (rule.cadence === "biweekly") return `Every other ${WEEKDAY_NAMES[rule.weekday ?? 0]} at ${time}`;
  if (rule.cadence === "monthly") {
    const d = rule.dayOfMonth ?? 1;
    const suffix = ordinalSuffix(d);
    return `Monthly on the ${d}${suffix} at ${time}`;
  }
  return "";
}

export function shortRule(rule: RecurrenceRule): string {
  if (rule.cadence === "weekly") return `${WEEKDAY_SHORT[rule.weekday ?? 0]}s`;
  if (rule.cadence === "biweekly") return `Every other ${WEEKDAY_SHORT[rule.weekday ?? 0]}`;
  if (rule.cadence === "monthly") return `${rule.dayOfMonth}${ordinalSuffix(rule.dayOfMonth ?? 1)} of month`;
  return "";
}

// Compute the next occurrence DATE at or after `after`. Returns YYYY-MM-DD.
// Returns null if the series has ended (end_date past, or max_occurrences
// reached — caller passes occurrencesSoFar).
export function nextOccurrenceDate(
  rule: RecurrenceRule,
  after: Date,
  occurrencesSoFar = 0,
): string | null {
  if (rule.maxOccurrences != null && occurrencesSoFar >= rule.maxOccurrences) return null;

  const start = parseDate(rule.startDate);
  const cursorBase = after.getTime() < start.getTime() ? start : after;
  // Reset cursor to midnight UTC of "the day we're searching from" — we
  // don't want intra-day time-of-day to push the answer by a day.
  const cursor = new Date(Date.UTC(
    cursorBase.getUTCFullYear(),
    cursorBase.getUTCMonth(),
    cursorBase.getUTCDate(),
  ));

  let next: Date | null = null;

  if (rule.cadence === "weekly" || rule.cadence === "biweekly") {
    const targetWeekday = rule.weekday ?? 0;
    const startCursor = new Date(cursor);
    const startWeekday = startCursor.getUTCDay();
    let daysAhead = (targetWeekday - startWeekday + 7) % 7;
    next = new Date(startCursor);
    next.setUTCDate(next.getUTCDate() + daysAhead);

    if (rule.cadence === "biweekly") {
      // Align to the start_date's biweekly grid. The first occurrence is on
      // the first start_date-onwards weekday match; subsequent occurrences
      // are every 14 days from there.
      const startWeekdayMatch = findFirstWeekdayOnOrAfter(start, targetWeekday);
      const diffDays = Math.round((next.getTime() - startWeekdayMatch.getTime()) / 86400_000);
      if (diffDays % 14 !== 0) {
        // Shift forward to align with the 14-day grid.
        const shift = 14 - (diffDays % 14);
        next.setUTCDate(next.getUTCDate() + shift);
      }
    }
  } else if (rule.cadence === "monthly") {
    const targetDay = rule.dayOfMonth ?? 1;
    next = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(),
      Math.min(targetDay, daysInMonth(cursor.getUTCFullYear(), cursor.getUTCMonth()))));
    if (next.getTime() < cursor.getTime()) {
      next = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1,
        Math.min(targetDay, daysInMonth(next.getUTCFullYear(), next.getUTCMonth() + 1))));
    }
  }

  if (!next) return null;
  const nextStr = isoDay(next);
  if (rule.endDate && nextStr > rule.endDate) return null;
  return nextStr;
}

// Compute the next K occurrence DATES — useful for previewing the schedule
// to the customer at booking time and for the cron loop.
export function nextNOccurrenceDates(
  rule: RecurrenceRule,
  after: Date,
  k: number,
  occurrencesSoFar = 0,
): string[] {
  const out: string[] = [];
  let cursor = after;
  let so_far = occurrencesSoFar;
  for (let i = 0; i < k; i++) {
    const next = nextOccurrenceDate(rule, cursor, so_far);
    if (!next) break;
    out.push(next);
    so_far += 1;
    // Move cursor to one day past the last hit so we find the NEXT one.
    const d = parseDate(next);
    d.setUTCDate(d.getUTCDate() + 1);
    cursor = d;
  }
  return out;
}

// Combine an occurrence DATE + the rule's local-time-of-day + a timezone
// into a real UTC ISO string. Uses Intl to look up the offset for the date.
// The result is what we store on requests.scheduled_for.
export function occurrenceToISOAtTimezone(
  date: string,       // "YYYY-MM-DD"
  timeOfDay: string,  // "HH:MM" or "HH:MM:SS"
  timezone: string,
): string {
  const [year, month, day] = date.split("-").map(Number);
  const [hh, mm] = timeOfDay.split(":").map(Number);
  // Find UTC instant that, when displayed in the target tz, reads as the
  // requested local time. Two-pass approximation: start with naïve UTC,
  // measure offset error, correct.
  const naive = new Date(Date.UTC(year, month - 1, day, hh, mm));
  const tzOffsetMin = offsetMinutes(naive, timezone);
  const corrected = new Date(naive.getTime() - tzOffsetMin * 60_000);
  // Second pass to handle DST transitions cleanly.
  const tzOffsetMin2 = offsetMinutes(corrected, timezone);
  if (tzOffsetMin2 !== tzOffsetMin) {
    return new Date(naive.getTime() - tzOffsetMin2 * 60_000).toISOString();
  }
  return corrected.toISOString();
}

// Validate a patch applied to an existing series. Returns null when the
// resulting rule is internally consistent (cadence/weekday/day-of-month line
// up, time looks like HH:MM, end_date and max_occurrences are sane). Drives
// the inline error on the in-place series editor.
export type SeriesPatch = {
  cadence: Cadence;
  weekday?: number | null;
  dayOfMonth?: number | null;
  timeOfDay: string;
  endDate?: string | null;
  maxOccurrences?: number | null;
  notes?: string | null;
  // Caller passes this so we can reject max_occurrences < already-materialised
  occurrencesCreated?: number;
};
export function validateSeriesPatch(p: SeriesPatch): string | null {
  if (!/^\d{2}:\d{2}(:\d{2})?$/.test(p.timeOfDay)) return "Time must be HH:MM.";
  if (p.cadence === "weekly" || p.cadence === "biweekly") {
    const wd = p.weekday;
    if (wd == null || wd < 0 || wd > 6) return "Pick a weekday.";
    if (p.dayOfMonth != null) return "Weekly schedules can't also have a day-of-month.";
  } else if (p.cadence === "monthly") {
    const dom = p.dayOfMonth;
    if (dom == null || dom < 1 || dom > 31) return "Pick a day of the month (1–31).";
    if (p.weekday != null) return "Monthly schedules can't also have a weekday.";
  } else {
    return "Unknown cadence.";
  }
  if (p.endDate && !/^\d{4}-\d{2}-\d{2}$/.test(p.endDate)) return "End date must be YYYY-MM-DD.";
  if (p.maxOccurrences != null) {
    if (!Number.isFinite(p.maxOccurrences) || p.maxOccurrences < 1) return "Max occurrences must be at least 1.";
    if (p.occurrencesCreated != null && p.maxOccurrences < p.occurrencesCreated) {
      return `You've already had ${p.occurrencesCreated} occurrence${p.occurrencesCreated === 1 ? "" : "s"} — set the cap to that or higher, or cancel the series instead.`;
    }
  }
  if (p.notes != null && p.notes.length > 1000) return "Notes are too long (max 1000 chars).";
  return null;
}

// True iff the patch changes anything that affects WHEN occurrences land
// (so the action knows to cancel any pending materialised next-occurrence
// before its cron picks up the new rule).
export function patchAffectsSchedule(
  patch: SeriesPatch,
  current: { cadence: Cadence; weekday: number | null; dayOfMonth: number | null; timeOfDay: string; endDate: string | null; maxOccurrences: number | null }
): boolean {
  return patch.cadence !== current.cadence
    || (patch.weekday ?? null) !== current.weekday
    || (patch.dayOfMonth ?? null) !== current.dayOfMonth
    || patch.timeOfDay !== current.timeOfDay
    || (patch.endDate ?? null) !== current.endDate
    || (patch.maxOccurrences ?? null) !== current.maxOccurrences;
}

// =========================================================================
// Internals
// =========================================================================

function parseDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysInMonth(year: number, month: number): number {
  // month is 0-indexed; new Date(year, month+1, 0) gives last day of month
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function findFirstWeekdayOnOrAfter(d: Date, weekday: number): Date {
  const ahead = (weekday - d.getUTCDay() + 7) % 7;
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + ahead);
  return out;
}

function humanTime(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const am = h < 12;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12}${am ? "am" : "pm"}` : `${h12}:${String(m).padStart(2, "0")}${am ? "am" : "pm"}`;
}

function ordinalSuffix(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return "th";
  switch (n % 10) {
    case 1: return "st";
    case 2: return "nd";
    case 3: return "rd";
    default: return "th";
  }
}

function offsetMinutes(d: Date, timezone: string): number {
  // Inspired by date-fns-tz: ask Intl what hour the given UTC instant
  // displays as in the target tz, infer the offset.
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const parts = dtf.formatToParts(d).reduce<Record<string, string>>((acc, p) => {
    if (p.type !== "literal") acc[p.type] = p.value;
    return acc;
  }, {});
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return (asUtc - d.getTime()) / 60_000;
}
