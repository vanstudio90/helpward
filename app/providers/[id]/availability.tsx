import { Calendar, CheckCircle2, Clock, Plane, MoonStar } from "lucide-react";
import {
  getProviderAvailability, computeAvailabilityStatus,
  type AvailabilityStatus, type WeeklyRule, type DateOverride,
} from "@/lib/data/availability";
import { nextSevenDaysSummary, type DaySummary } from "@/lib/availability-pure";
import { cn } from "@/lib/cn";

const DOW_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// 7-column strip: today + next 6 days, each cell shows either the earliest
// start time (green) or "Off" (slate). Today gets a brand-tinted ring.
// More scannable than the full weekly table for customers deciding "can
// they help me tomorrow?" without scrolling.
export function NextSevenDaysStrip({
  rules, overrides, vacation,
}: { rules: WeeklyRule[]; overrides: DateOverride[]; vacation: { on: boolean; returnsOn: string | null } }) {
  const days = nextSevenDaysSummary(rules, overrides, vacation);
  // If literally every day is "off" with reason "no-shifts" we hide the
  // strip — same posture as AvailabilityTable: don't show an empty grid
  // when the helper just hasn't set hours yet.
  if (days.every((d) => !d.available && d.reason === "no-shifts")) return null;

  return (
    <div className="mt-4 grid grid-cols-7 gap-1.5">
      {days.map((d: DaySummary) => (
        <div
          key={d.iso}
          className={cn(
            "rounded-lg border px-1 py-2 text-center",
            d.available ? "bg-emerald-50 border-emerald-100" : "bg-slate-50 border-slate-100",
            d.isToday && (d.available ? "ring-2 ring-emerald-400" : "ring-2 ring-slate-300"),
          )}
        >
          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
            {d.isToday ? "Today" : DOW_SHORT[d.dow]}
          </div>
          <div className={cn(
            "text-xs font-bold mt-0.5",
            d.available ? "text-emerald-700" : "text-slate-400",
          )}>
            {d.available ? d.earliestStart : d.reason === "vacation" ? "Away" : "Off"}
          </div>
        </div>
      ))}
    </div>
  );
}

const WEEKDAYS = [
  { id: 0, short: "Sun" }, { id: 1, short: "Mon" }, { id: 2, short: "Tue" },
  { id: 3, short: "Wed" }, { id: 4, short: "Thu" }, { id: 5, short: "Fri" },
  { id: 6, short: "Sat" },
];

// Available-now badge — small inline chip. Status is computed server-side at
// render time; the page is force-dynamic so this updates per request.
export function AvailabilityBadge({ status }: { status: AvailabilityStatus }) {
  switch (status.kind) {
    case "available":
      return (
        <span className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full text-xs font-semibold">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Available now until {status.until}
        </span>
      );
    case "before-shift":
      return (
        <span className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-700 px-3 py-1 rounded-full text-xs font-semibold">
          <Clock className="w-3 h-3" /> Starts at {status.nextStart}
        </span>
      );
    case "later-this-week":
      return (
        <span className="inline-flex items-center gap-1.5 bg-slate-100 text-slate-700 px-3 py-1 rounded-full text-xs font-semibold">
          <Calendar className="w-3 h-3" /> Back {status.weekdayName} {status.time}
        </span>
      );
    case "off-today":
      return (
        <span className="inline-flex items-center gap-1.5 bg-slate-100 text-slate-500 px-3 py-1 rounded-full text-xs font-semibold">
          <MoonStar className="w-3 h-3" /> Off today
        </span>
      );
    case "vacation":
      return (
        <span className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-700 px-3 py-1 rounded-full text-xs font-semibold">
          <Plane className="w-3 h-3" />
          {status.returnsOn
            ? `Away until ${new Date(status.returnsOn + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
            : "On vacation"}
        </span>
      );
    case "no-schedule":
      return (
        <span className="inline-flex items-center gap-1.5 bg-brand-50 text-brand-700 px-3 py-1 rounded-full text-xs font-semibold">
          <CheckCircle2 className="w-3 h-3" /> Open to bookings
        </span>
      );
  }
}

// Weekly schedule grid for the public profile.
export function AvailabilityTable({
  rules, overrides,
}: { rules: WeeklyRule[]; overrides: DateOverride[] }) {
  const grouped = WEEKDAYS.map((day) => ({
    ...day,
    shifts: rules.filter((r) => r.weekday === day.id),
  }));
  const upcomingOverrides = overrides.slice(0, 5);

  // If the provider has neither rules nor overrides we hide the table — the
  // badge already says "open to bookings", showing an empty table is noise.
  if (rules.length === 0 && upcomingOverrides.length === 0) return null;

  return (
    <section className="mt-6 rounded-2xl bg-white border border-slate-100 p-5">
      <h2 className="text-sm font-bold text-slate-900 mb-3 inline-flex items-center gap-2">
        <Calendar className="w-4 h-4 text-brand-600" /> Typical weekly hours
      </h2>
      <table className="w-full text-xs">
        <tbody>
          {grouped.map((day) => (
            <tr key={day.id} className="border-b border-slate-100 last:border-b-0">
              <th className="text-left font-bold text-slate-700 py-2 w-12">{day.short}</th>
              <td className="py-2 text-slate-700">
                {day.shifts.length === 0
                  ? <span className="text-slate-400">—</span>
                  : day.shifts.map((s, i) => (
                      <span key={s.id}>
                        {humanRange(s.start_time, s.end_time)}
                        {i < day.shifts.length - 1 && <span className="text-slate-400">, </span>}
                      </span>
                    ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {upcomingOverrides.length > 0 && (
        <div className="mt-4 pt-3 border-t border-slate-100">
          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-2">Upcoming exceptions</div>
          <ul className="space-y-1.5 text-xs">
            {upcomingOverrides.map((o) => (
              <li key={o.id} className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                <div className="min-w-0">
                  <span className="font-semibold text-slate-900">
                    {new Date(o.date + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                  </span>
                  <span className="text-slate-500">
                    {" — "}
                    {o.is_unavailable
                      ? "Off all day"
                      : `Available ${humanRange(o.start_time!, o.end_time!)}`}
                    {o.label && ` (${o.label})`}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

// Server-side wrapper that fetches + computes — keeps the providers/[id]
// page simple.
export async function AvailabilitySection({ providerId }: { providerId: string }) {
  const { rules, overrides, vacation } = await getProviderAvailability(providerId);
  const status = computeAvailabilityStatus(rules, overrides, vacation);
  return (
    <>
      <div className="mt-3 flex justify-center">
        <AvailabilityBadge status={status} />
      </div>
      <AvailabilityTable rules={rules} overrides={overrides} />
    </>
  );
}

function humanRange(start: string, end: string): string {
  return `${human(start)}–${human(end)}`;
}

function human(t: string): string {
  // "HH:MM:SS" → "9am" / "9:30am" / "5:30pm"
  const [h, m] = t.split(":").map(Number);
  const am = h < 12;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12}${am ? "am" : "pm"}` : `${h12}:${String(m).padStart(2, "0")}${am ? "am" : "pm"}`;
}
