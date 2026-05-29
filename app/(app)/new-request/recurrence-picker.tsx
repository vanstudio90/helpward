"use client";

import { useState, useMemo } from "react";
import { Repeat, ChevronDown, Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  type Cadence, type RecurrenceRule, describeRule, nextNOccurrenceDates,
} from "@/lib/recurrence-pure";

const WEEKDAYS = [
  { id: 0, short: "Sun" }, { id: 1, short: "Mon" }, { id: 2, short: "Tue" },
  { id: 3, short: "Wed" }, { id: 4, short: "Thu" }, { id: 5, short: "Fri" },
  { id: 6, short: "Sat" },
];

// Self-contained recurrence picker. When "Repeat this task" is on, the
// form switches to recurrence mode and submits to /bookings/series/new
// instead of the one-shot endpoint. The new-request page form decides
// which based on the `repeat_on` hidden input we render.

export function RecurrencePicker() {
  const [enabled, setEnabled] = useState(false);
  const [cadence, setCadence] = useState<Cadence>("weekly");
  const [weekday, setWeekday] = useState<number>(new Date().getDay());
  const [dayOfMonth, setDayOfMonth] = useState<number>(new Date().getDate());
  const [timeOfDay, setTimeOfDay] = useState("09:00");
  const [startDate, setStartDate] = useState(() => isoToday());
  const [hasEnd, setHasEnd] = useState(false);
  const [endDate, setEndDate] = useState("");
  const [hasMax, setHasMax] = useState(false);
  const [maxOccurrences, setMaxOccurrences] = useState<number>(12);

  // Customer's browser timezone — captured so the server materialises in
  // the right tz. Falls back to America/Vancouver if Intl isn't available.
  const timezone = useMemo(() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone; }
    catch { return "America/Vancouver"; }
  }, []);

  const rule: RecurrenceRule = {
    cadence,
    weekday: cadence === "weekly" || cadence === "biweekly" ? weekday : undefined,
    dayOfMonth: cadence === "monthly" ? dayOfMonth : undefined,
    timeOfDay,
    startDate,
    endDate: hasEnd && endDate ? endDate : null,
    maxOccurrences: hasMax ? maxOccurrences : null,
  };

  const previewDates = useMemo(() => {
    if (!enabled) return [];
    try { return nextNOccurrenceDates(rule, new Date(), 4, 0); }
    catch { return []; }
  }, [enabled, rule]);

  return (
    <fieldset className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <input type="hidden" name="repeat_on" value={enabled ? "1" : "0"} />
      {enabled && (
        <>
          <input type="hidden" name="cadence" value={cadence} />
          {(cadence === "weekly" || cadence === "biweekly") && (
            <input type="hidden" name="weekday" value={String(weekday)} />
          )}
          {cadence === "monthly" && (
            <input type="hidden" name="day_of_month" value={String(dayOfMonth)} />
          )}
          <input type="hidden" name="time_of_day" value={timeOfDay} />
          <input type="hidden" name="start_date" value={startDate} />
          {hasEnd && endDate && <input type="hidden" name="end_date" value={endDate} />}
          {hasMax && <input type="hidden" name="max_occurrences" value={String(maxOccurrences)} />}
          <input type="hidden" name="timezone" value={timezone} />
        </>
      )}

      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="w-4 h-4 rounded text-brand-600"
        />
        <span className="inline-flex items-center gap-2 text-sm font-bold text-slate-900">
          <Repeat className="w-4 h-4 text-brand-600" />
          Repeat this task
        </span>
        <span className="text-xs text-slate-500">Schedule it weekly, biweekly, or monthly.</span>
      </label>

      {enabled && (
        <div className="mt-4 space-y-3">
          {/* Cadence */}
          <div className="grid grid-cols-3 gap-1.5 p-1 bg-white rounded-xl border border-slate-200">
            {(["weekly", "biweekly", "monthly"] as Cadence[]).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCadence(c)}
                className={cn(
                  "py-2 rounded-lg text-xs font-semibold transition capitalize",
                  cadence === c ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-50",
                )}
              >
                {c}
              </button>
            ))}
          </div>

          {/* Weekday picker for weekly + biweekly */}
          {(cadence === "weekly" || cadence === "biweekly") && (
            <div>
              <span className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1.5">
                Day of the week
              </span>
              <div className="grid grid-cols-7 gap-1">
                {WEEKDAYS.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setWeekday(d.id)}
                    className={cn(
                      "py-2 rounded-lg text-xs font-bold border transition",
                      weekday === d.id
                        ? "bg-brand-600 text-white border-brand-600"
                        : "bg-white text-slate-700 border-slate-200 hover:border-brand-300",
                    )}
                  >
                    {d.short}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Day-of-month for monthly */}
          {cadence === "monthly" && (
            <label className="block">
              <span className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1.5">
                Day of the month
              </span>
              <select
                value={dayOfMonth}
                onChange={(e) => setDayOfMonth(Number(e.target.value))}
                className="w-32 px-3 py-2 rounded-lg bg-white border border-slate-200 text-sm font-semibold focus:outline-none focus:ring-4 focus:ring-brand-100 focus:border-brand-400"
              >
                {Array.from({ length: 31 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>{n}{ordinal(n)}</option>
                ))}
              </select>
              <p className="text-[10px] text-slate-500 mt-1">
                If the month doesn&apos;t have this day (e.g. Feb 31), we&apos;ll use the last day of the month.
              </p>
            </label>
          )}

          {/* Time of day + start date */}
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1.5">
                Time
              </span>
              <input
                type="time"
                value={timeOfDay}
                onChange={(e) => setTimeOfDay(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-white border border-slate-200 text-sm font-semibold focus:outline-none focus:ring-4 focus:ring-brand-100 focus:border-brand-400"
              />
            </label>
            <label className="block">
              <span className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1.5">
                Start date
              </span>
              <input
                type="date"
                min={isoToday()}
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-white border border-slate-200 text-sm font-semibold focus:outline-none focus:ring-4 focus:ring-brand-100 focus:border-brand-400"
              />
            </label>
          </div>

          {/* End conditions */}
          <details className="text-xs">
            <summary className="cursor-pointer flex items-center gap-1 font-semibold text-slate-700">
              <ChevronDown className="w-3 h-3" /> Optional: end date or occurrence limit
            </summary>
            <div className="mt-3 space-y-3">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={hasEnd} onChange={(e) => setHasEnd(e.target.checked)} className="rounded" />
                <span>End on a specific date</span>
              </label>
              {hasEnd && (
                <input
                  type="date"
                  min={startDate}
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="ml-6 px-3 py-2 rounded-lg bg-white border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-100"
                />
              )}
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={hasMax} onChange={(e) => setHasMax(e.target.checked)} className="rounded" />
                <span>Cap at a number of occurrences</span>
              </label>
              {hasMax && (
                <input
                  type="number"
                  min={1}
                  max={520}
                  value={maxOccurrences}
                  onChange={(e) => setMaxOccurrences(Number(e.target.value))}
                  className="ml-6 w-20 px-3 py-2 rounded-lg bg-white border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-100"
                />
              )}
            </div>
          </details>

          {/* Schedule preview */}
          {previewDates.length > 0 && (
            <div className="mt-2 rounded-xl bg-white border border-slate-200 p-3">
              <div className="text-[11px] font-bold uppercase tracking-wide text-brand-700 mb-1.5 inline-flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> {describeRule(rule)}
              </div>
              <ul className="text-xs text-slate-600 space-y-0.5">
                {previewDates.map((d) => (
                  <li key={d}>
                    {new Date(d + "T00:00:00").toLocaleDateString(undefined, {
                      weekday: "long", month: "long", day: "numeric", year: "numeric",
                    })}
                  </li>
                ))}
              </ul>
              <p className="text-[10px] text-slate-500 mt-2">
                Next {previewDates.length} occurrences shown. We&apos;ll match a helper for each one and notify you
                as it&apos;s scheduled.
              </p>
            </div>
          )}
        </div>
      )}
    </fieldset>
  );
}

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function ordinal(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return "th";
  switch (n % 10) { case 1: return "st"; case 2: return "nd"; case 3: return "rd"; default: return "th"; }
}
