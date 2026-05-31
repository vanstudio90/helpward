"use client";

import { useState, useTransition } from "react";
import {
  Pencil, X, Save, AlertCircle, CheckCircle2, Loader2, Calendar, Clock,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { updateSeriesAction } from "../actions";
import type { Cadence } from "@/lib/recurrence-pure";

type Initial = {
  cadence: Cadence;
  weekday: number | null;
  dayOfMonth: number | null;
  timeOfDay: string;
  endDate: string | null;
  maxOccurrences: number | null;
  notes: string | null;
  occurrencesCreated: number;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Inline edit form on /bookings/series/[id]. Only rendered when the series
// is paused; we explicitly tell the user to pause first if they try to edit
// an active series. The form mirrors the recurrence-picker on /new-request
// so the experience is symmetric — pick cadence, then either weekday or
// day-of-month, then time + end conditions + notes.
export function SeriesEditForm({
  seriesId,
  initial,
  serviceTitle,
}: {
  seriesId: string;
  initial: Initial;
  serviceTitle: string;
}) {
  const [open, setOpen] = useState(false);
  const [cadence, setCadence] = useState<Cadence>(initial.cadence);
  const [weekday, setWeekday] = useState<number | null>(initial.weekday ?? 1);
  const [dayOfMonth, setDayOfMonth] = useState<number>(initial.dayOfMonth ?? 1);
  const [timeOfDay, setTimeOfDay] = useState<string>(initial.timeOfDay);
  const [endDate, setEndDate] = useState<string>(initial.endDate ?? "");
  const [maxOcc, setMaxOcc] = useState<string>(
    initial.maxOccurrences != null ? String(initial.maxOccurrences) : ""
  );
  const [notes, setNotes] = useState<string>(initial.notes ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const onSave = () => {
    setErr(null);
    setSuccess(null);
    const fd = new FormData();
    fd.append("cadence", cadence);
    if (cadence !== "monthly" && weekday != null) fd.append("weekday", String(weekday));
    if (cadence === "monthly") fd.append("day_of_month", String(dayOfMonth));
    fd.append("time_of_day", timeOfDay);
    if (endDate) fd.append("end_date", endDate);
    if (maxOcc) fd.append("max_occurrences", maxOcc);
    fd.append("notes", notes);
    start(async () => {
      const r = await updateSeriesAction(seriesId, fd);
      if (r?.error) { setErr(r.error); return; }
      setSuccess(r?.success ?? "Saved.");
      setOpen(false);
    });
  };

  if (!open) {
    return (
      <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl bg-amber-50/60 border border-amber-100 p-4">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-amber-900 inline-flex items-center gap-1.5">
            <Pencil className="w-3.5 h-3.5" /> Series is paused
          </div>
          <div className="text-xs text-amber-800/80 mt-0.5 leading-snug">
            Make changes to the cadence, time, notes, or end conditions while it&apos;s safe to do so —
            no occurrence will be materialised until you resume.
          </div>
          {success && (
            <div className="mt-2 flex items-start gap-2 text-xs text-emerald-700 bg-white border border-emerald-100 rounded-lg p-2">
              <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {success}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-amber-200 text-amber-700 text-xs font-bold hover:bg-amber-50 shrink-0"
        >
          <Pencil className="w-3.5 h-3.5" /> Edit series
        </button>
      </div>
    );
  }

  return (
    <div className="mb-5 rounded-2xl bg-white border border-amber-200 p-4 sm:p-5 ring-2 ring-amber-100">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-bold text-slate-900 inline-flex items-center gap-1.5">
          <Pencil className="w-4 h-4 text-amber-600" /> Editing &ldquo;{serviceTitle}&rdquo;
        </div>
        <button
          type="button"
          onClick={() => { setOpen(false); setErr(null); }}
          className="text-slate-400 hover:text-slate-600"
          aria-label="Close editor"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {err && (
        <div className="mb-3 flex items-start gap-2 text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded-lg p-2.5">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {err}
        </div>
      )}

      <div className="space-y-4">
        {/* Cadence */}
        <div>
          <div className="text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-1.5">Cadence</div>
          <div className="grid grid-cols-3 gap-1.5">
            {(["weekly", "biweekly", "monthly"] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCadence(c)}
                disabled={pending}
                className={cn(
                  "py-2 rounded-lg text-xs font-bold border capitalize",
                  cadence === c
                    ? "bg-brand-600 text-white border-brand-600"
                    : "bg-white text-slate-700 border-slate-200",
                )}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {/* Weekday or day-of-month */}
        {cadence !== "monthly" ? (
          <div>
            <div className="text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-1.5">
              {cadence === "weekly" ? "Every" : "Every other"}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {WEEKDAYS.map((label, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setWeekday(i)}
                  disabled={pending}
                  className={cn(
                    "py-2 rounded-lg text-[11px] font-bold border",
                    weekday === i
                      ? "bg-brand-600 text-white border-brand-600"
                      : "bg-white text-slate-700 border-slate-200",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div>
            <label className="block">
              <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wide">Day of the month</span>
              <select
                value={dayOfMonth}
                onChange={(e) => setDayOfMonth(Number(e.target.value))}
                disabled={pending}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white"
              >
                {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </label>
            <p className="text-[10px] text-slate-500 mt-1 leading-snug">
              If a month doesn&apos;t have that day (e.g. 31 in February), it clamps to the last day.
            </p>
          </div>
        )}

        {/* Time of day */}
        <label className="block">
          <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wide">Time of day</span>
          <div className="mt-1 relative">
            <Clock className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="time"
              value={timeOfDay}
              onChange={(e) => setTimeOfDay(e.target.value)}
              disabled={pending}
              className="w-full pl-8 pr-3 py-2 rounded-lg border border-slate-200 text-sm bg-white"
            />
          </div>
        </label>

        {/* End conditions */}
        <details className="rounded-lg border border-slate-200 p-3">
          <summary className="text-xs font-bold text-slate-700 cursor-pointer">
            End conditions {endDate || maxOcc ? "·" : ""} {endDate && `ends ${endDate}`} {maxOcc && `cap ${maxOcc}`}
          </summary>
          <div className="mt-3 space-y-3">
            <label className="block">
              <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wide inline-flex items-center gap-1">
                <Calendar className="w-3 h-3" /> End date (optional)
              </span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                disabled={pending}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white"
              />
            </label>
            <label className="block">
              <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wide">Max occurrences (optional)</span>
              <input
                type="number"
                min={Math.max(1, initial.occurrencesCreated)}
                value={maxOcc}
                onChange={(e) => setMaxOcc(e.target.value)}
                disabled={pending}
                placeholder="No cap"
                className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white"
              />
              <p className="text-[10px] text-slate-500 mt-1">
                You&apos;ve already had {initial.occurrencesCreated} occurrence{initial.occurrencesCreated === 1 ? "" : "s"} — the cap must be at least that.
              </p>
            </label>
          </div>
        </details>

        {/* Notes */}
        <label className="block">
          <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wide">Notes for the helper</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value.slice(0, 1000))}
            rows={3}
            disabled={pending}
            placeholder="Anything they should know each time"
            className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white"
          />
          <div className="text-[10px] text-slate-500 mt-0.5 text-right">{notes.length}/1000</div>
        </label>

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onSave}
            disabled={pending}
            className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-brand-600 text-white text-sm font-bold disabled:opacity-50"
          >
            {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {pending ? "Saving…" : "Save changes"}
          </button>
          <button
            type="button"
            onClick={() => { setOpen(false); setErr(null); }}
            disabled={pending}
            className="px-4 py-2.5 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
