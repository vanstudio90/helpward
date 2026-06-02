"use client";

import { useState, useTransition } from "react";
import {
  Calendar, Clock, Plus, X, AlertCircle, CheckCircle2, Plane, Trash2, Copy,
} from "lucide-react";
import { cn } from "@/lib/cn";
import {
  saveWeeklyRulesAction, addOverrideAction, addOverrideRangeAction,
  removeOverrideAction, setVacationModeAction, type WeeklyRulePayload,
} from "./actions";
import type { WeeklyRule, DateOverride } from "@/lib/availability-pure";
import { totalWeeklyHours } from "@/lib/availability-pure";

const WEEKDAYS = [
  { id: 0, short: "Sun", long: "Sunday" },
  { id: 1, short: "Mon", long: "Monday" },
  { id: 2, short: "Tue", long: "Tuesday" },
  { id: 3, short: "Wed", long: "Wednesday" },
  { id: 4, short: "Thu", long: "Thursday" },
  { id: 5, short: "Fri", long: "Friday" },
  { id: 6, short: "Sat", long: "Saturday" },
];

type EditorRule = { weekday: number; start_time: string; end_time: string };

function fromDb(rules: WeeklyRule[]): EditorRule[] {
  return rules.map((r) => ({
    weekday: r.weekday,
    start_time: r.start_time.slice(0, 5),
    end_time: r.end_time.slice(0, 5),
  }));
}

export function ScheduleEditor({
  initialRules, initialOverrides, vacation,
}: {
  initialRules: WeeklyRule[];
  initialOverrides: DateOverride[];
  vacation: { on: boolean; returnsOn: string | null };
}) {
  const [editorRules, setEditorRules] = useState<EditorRule[]>(fromDb(initialRules));
  const [savePending, startSave] = useTransition();
  const [saveState, setSaveState] = useState<{ error?: string; success?: string } | undefined>();

  const addShift = (weekday: number) => {
    setEditorRules((prev) => [...prev, { weekday, start_time: "09:00", end_time: "17:00" }]);
    setSaveState(undefined);
  };

  const removeShift = (idx: number) => {
    setEditorRules((prev) => prev.filter((_, i) => i !== idx));
    setSaveState(undefined);
  };

  const updateShift = (idx: number, patch: Partial<EditorRule>) => {
    setEditorRules((prev) => prev.map((r, i) => i === idx ? { ...r, ...patch } : r));
    setSaveState(undefined);
  };

  // Copy first shift on Monday to Tue-Fri — common "weekday office hours" case.
  const copyToWeekdays = () => {
    const monday = editorRules.find((r) => r.weekday === 1);
    if (!monday) return;
    setEditorRules((prev) => {
      const cleared = prev.filter((r) => r.weekday < 1 || r.weekday > 5);
      const withMonday = prev.find((r) => r.weekday === 1) ? prev.filter((r) => r.weekday === 1) : [];
      const newWeekdays = [2, 3, 4, 5].map((w) => ({
        weekday: w, start_time: monday.start_time, end_time: monday.end_time,
      }));
      return [...cleared, ...withMonday, ...newWeekdays].sort(byWeekdayThenTime);
    });
  };

  const save = () => {
    setSaveState(undefined);
    startSave(async () => {
      const payload: WeeklyRulePayload[] = editorRules
        .slice()
        .sort(byWeekdayThenTime);
      const r = await saveWeeklyRulesAction(payload);
      setSaveState(r);
    });
  };

  const hours = totalWeeklyHours(
    editorRules.map((r) => ({ id: "", weekday: r.weekday, start_time: r.start_time, end_time: r.end_time }))
  );

  const grouped = WEEKDAYS.map((day) => ({
    ...day,
    shifts: editorRules
      .map((r, i) => ({ ...r, idx: i }))
      .filter((r) => r.weekday === day.id)
      .sort((a, b) => a.start_time.localeCompare(b.start_time)),
  }));

  return (
    <div className="space-y-6">
      <VacationCard initial={vacation} />

      <section className="rounded-2xl bg-white border border-slate-100 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 inline-flex items-center gap-2">
              <Calendar className="w-4 h-4 text-brand-600" /> Weekly hours
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              The hours you&apos;re typically available, repeated every week.{" "}
              {hours > 0 && <span className="font-semibold text-slate-700">~{hours} hours/week</span>}
            </p>
          </div>
          {editorRules.find((r) => r.weekday === 1) && (
            <button
              type="button"
              onClick={copyToWeekdays}
              className="text-xs font-semibold text-brand-700 hover:text-brand-800 inline-flex items-center gap-1 shrink-0"
              title="Copy Monday's first shift to Tue-Fri"
            >
              <Copy className="w-3 h-3" /> Same hours Mon–Fri
            </button>
          )}
        </div>

        <ul className="divide-y divide-slate-100">
          {grouped.map((day) => (
            <li key={day.id} className="py-3 grid grid-cols-[80px_1fr] sm:grid-cols-[100px_1fr] gap-3 items-start">
              <div className="pt-2">
                <div className="text-sm font-bold text-slate-900">{day.short}</div>
                <div className="text-[10px] text-slate-400 hidden sm:block">{day.long}</div>
              </div>
              <div className="space-y-2">
                {day.shifts.length === 0 && (
                  <div className="text-xs text-slate-400 italic py-2">Not available</div>
                )}
                {day.shifts.map((s) => (
                  <ShiftRow
                    key={s.idx}
                    rule={s}
                    onChange={(patch) => updateShift(s.idx, patch)}
                    onRemove={() => removeShift(s.idx)}
                  />
                ))}
                <button
                  type="button"
                  onClick={() => addShift(day.id)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:text-brand-800"
                >
                  <Plus className="w-3 h-3" /> Add shift
                </button>
              </div>
            </li>
          ))}
        </ul>

        {saveState?.error && (
          <div className="mt-3 flex items-start gap-2 text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-lg p-2.5">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {saveState.error}
          </div>
        )}
        {saveState?.success && (
          <div className="mt-3 flex items-start gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg p-2.5">
            <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> {saveState.success}
          </div>
        )}

        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={save}
            disabled={savePending}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold disabled:opacity-50"
          >
            {savePending ? "Saving…" : "Save schedule"}
          </button>
          <button
            type="button"
            onClick={() => { setEditorRules(fromDb(initialRules)); setSaveState(undefined); }}
            disabled={savePending}
            className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700"
          >
            Discard changes
          </button>
        </div>
      </section>

      <OverridesCard initial={initialOverrides} />
    </div>
  );
}

function byWeekdayThenTime(a: EditorRule, b: EditorRule): number {
  if (a.weekday !== b.weekday) return a.weekday - b.weekday;
  return a.start_time.localeCompare(b.start_time);
}

// Local-date arithmetic for the override range. UTC math + ISO slice keeps
// us off the DST cliffs that bite anyone using new Date().setDate().
function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function mergeAndSort(existing: DateOverride[], incoming: DateOverride[]): DateOverride[] {
  // Don't re-add a row for a date that already has time-off — the server
  // dedupes via the unique partial index, so this just keeps the UI honest.
  const haveOffDate = new Set(
    existing.filter((o) => o.is_unavailable).map((o) => o.date),
  );
  const fresh = incoming.filter((o) => !haveOffDate.has(o.date));
  return [...existing, ...fresh].sort((a, b) => a.date.localeCompare(b.date));
}

function ShiftRow({
  rule, onChange, onRemove,
}: { rule: EditorRule; onChange: (patch: Partial<EditorRule>) => void; onRemove: () => void }) {
  const invalid = rule.end_time <= rule.start_time;
  return (
    <div className="flex items-center gap-2">
      <input
        type="time"
        value={rule.start_time}
        onChange={(e) => onChange({ start_time: e.target.value })}
        className={cn("w-28 px-2 py-1.5 rounded-lg bg-white border text-sm focus:outline-none focus:ring-2",
          invalid ? "border-rose-300 focus:ring-rose-200" : "border-slate-200 focus:ring-brand-200")}
      />
      <span className="text-xs text-slate-400">to</span>
      <input
        type="time"
        value={rule.end_time}
        onChange={(e) => onChange({ end_time: e.target.value })}
        className={cn("w-28 px-2 py-1.5 rounded-lg bg-white border text-sm focus:outline-none focus:ring-2",
          invalid ? "border-rose-300 focus:ring-rose-200" : "border-slate-200 focus:ring-brand-200")}
      />
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove shift"
        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function VacationCard({ initial }: { initial: { on: boolean; returnsOn: string | null } }) {
  const [pending, start] = useTransition();
  const [on, setOn] = useState(initial.on);
  const [returnsOn, setReturnsOn] = useState(initial.returnsOn ?? "");
  const [state, setState] = useState<{ error?: string; success?: string } | undefined>();

  const submit = (next: boolean) => {
    setState(undefined);
    start(async () => {
      const r = await setVacationModeAction(next, next ? (returnsOn || null) : null);
      if (r?.error) setState(r);
      else { setOn(next); setState(r); }
    });
  };

  return (
    <section className={cn("rounded-2xl border p-4 sm:p-5", on ? "bg-amber-50 border-amber-200" : "bg-white border-slate-100")}>
      <div className="flex items-start gap-3">
        <span className={cn("w-10 h-10 rounded-xl inline-flex items-center justify-center shrink-0", on ? "bg-amber-100" : "bg-slate-50")}>
          <Plane className={cn("w-5 h-5", on ? "text-amber-700" : "text-slate-500")} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold text-slate-900">Vacation mode</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Temporarily mark yourself as unavailable without erasing your weekly schedule.
            {on && returnsOn && <span className="text-amber-800 font-semibold"> Returning {new Date(returnsOn).toLocaleDateString()}.</span>}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          onClick={() => submit(!on)}
          disabled={pending}
          className={cn("relative inline-flex w-10 h-6 rounded-full transition shrink-0 disabled:opacity-50",
            on ? "bg-amber-500" : "bg-slate-200")}
        >
          <span className={cn("absolute top-0.5 w-5 h-5 bg-white rounded-full transition shadow-sm",
            on ? "right-0.5" : "left-0.5")} />
        </button>
      </div>
      {on && (
        <div className="mt-3 flex items-center gap-2">
          <label className="text-xs font-semibold text-slate-700">Returning on</label>
          <input
            type="date"
            value={returnsOn}
            min={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setReturnsOn(e.target.value)}
            className="px-2 py-1.5 rounded-lg bg-white border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-200"
          />
          <button
            type="button"
            onClick={() => submit(true)}
            disabled={pending}
            className="text-xs font-semibold text-amber-800 hover:text-amber-900"
          >
            Update
          </button>
        </div>
      )}
      {state?.error && <div className="mt-2 text-xs text-rose-700">{state.error}</div>}
    </section>
  );
}

function OverridesCard({ initial }: { initial: DateOverride[] }) {
  const [overrides, setOverrides] = useState<DateOverride[]>(initial);
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  // "off" = single time-off day, "off-range" = contiguous block of days off,
  // "extra" = extra-shift on a single date. Three modes keep the form
  // compact while covering the workflows that actually happen.
  const [kind, setKind] = useState<"off" | "off-range" | "extra">("off");
  const today = new Date().toISOString().slice(0, 10);
  const maxDate = addDaysISO(today, 365);
  const [date, setDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [label, setLabel] = useState("");
  const [state, setState] = useState<{ error?: string; success?: string } | undefined>();
  const [showPast, setShowPast] = useState(false);

  const extraInvalid = kind === "extra" && endTime <= startTime;
  const rangeInvalid = kind === "off-range" && endDate < date;

  const add = () => {
    if (extraInvalid || rangeInvalid) {
      setState({ error: extraInvalid ? "End must be after start." : "End date must be on or after start date." });
      return;
    }
    setState(undefined);
    start(async () => {
      if (kind === "off-range") {
        const r = await addOverrideRangeAction(date, endDate, label.trim() || null);
        if (r?.error) { setState({ error: r.error }); return; }
        // Optimistically add every day in the range — refetch on next nav.
        const newRows: DateOverride[] = [];
        let cursor = date;
        while (cursor <= endDate) {
          newRows.push({
            id: crypto.randomUUID(),
            date: cursor,
            is_unavailable: true,
            start_time: null,
            end_time: null,
            label: label.trim() || null,
          });
          cursor = addDaysISO(cursor, 1);
        }
        setOverrides((prev) => mergeAndSort(prev, newRows));
        setOpen(false);
        setLabel("");
        setState({ success: r.success });
        return;
      }

      const r = await addOverrideAction(
        date,
        kind === "off",
        kind === "off" ? null : startTime,
        kind === "off" ? null : endTime,
        label.trim() || null,
      );
      if (r?.error) setState(r);
      else {
        // Optimistically add — refetch on next nav anyway.
        setOverrides((prev) => [
          {
            id: crypto.randomUUID(),
            date,
            is_unavailable: kind === "off",
            start_time: kind === "off" ? null : startTime + ":00",
            end_time: kind === "off" ? null : endTime + ":00",
            label: label.trim() || null,
          },
          ...prev,
        ].sort((a, b) => a.date.localeCompare(b.date)));
        setOpen(false);
        setLabel("");
        setState(r);
      }
    });
  };

  const remove = (id: string) => {
    setState(undefined);
    start(async () => {
      const r = await removeOverrideAction(id);
      if (r?.error) setState(r);
      else setOverrides((prev) => prev.filter((o) => o.id !== id));
    });
  };

  const visible = showPast ? overrides : overrides.filter((o) => o.date >= today);
  const pastCount = overrides.length - visible.length;

  return (
    <section className="rounded-2xl bg-white border border-slate-100 p-4 sm:p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-bold text-slate-900 inline-flex items-center gap-2">
          <Clock className="w-4 h-4 text-brand-600" /> One-off dates
        </h2>
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="text-xs font-semibold text-brand-700 hover:text-brand-800 inline-flex items-center gap-1"
          >
            <Plus className="w-3 h-3" /> Add date
          </button>
        )}
      </div>
      <p className="text-xs text-slate-500 mb-3">
        Mark a single date as off (vacation, sick day) or add an extra shift outside your weekly hours.
        Overrides win over weekly rules for that date.
      </p>

      {open && (
        <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Type</span>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as "off" | "off-range" | "extra")}
              className="mt-1 w-full px-2 py-1.5 rounded-lg bg-white border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
            >
              <option value="off">Time off — single day</option>
              <option value="off-range">Time off — date range</option>
              <option value="extra">Extra shift</option>
            </select>
          </label>

          <div className={cn("grid gap-2", kind === "off-range" ? "grid-cols-2" : "grid-cols-1")}>
            <label className="block">
              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                {kind === "off-range" ? "Start" : "Date"}
              </span>
              <input
                type="date"
                value={date}
                min={today}
                max={maxDate}
                onChange={(e) => {
                  setDate(e.target.value);
                  // Keep end >= start when in range mode
                  if (kind === "off-range" && endDate < e.target.value) setEndDate(e.target.value);
                }}
                className="mt-1 w-full px-2 py-1.5 rounded-lg bg-white border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
              />
            </label>
            {kind === "off-range" && (
              <label className="block">
                <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">End (inclusive)</span>
                <input
                  type="date"
                  value={endDate}
                  min={date}
                  max={maxDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className={cn(
                    "mt-1 w-full px-2 py-1.5 rounded-lg bg-white border text-sm focus:outline-none focus:ring-2",
                    rangeInvalid
                      ? "border-rose-300 focus:ring-rose-200"
                      : "border-slate-200 focus:ring-brand-200",
                  )}
                />
              </label>
            )}
          </div>

          {kind === "extra" && (
            <>
              <div className="flex items-center gap-2">
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className={cn(
                    "w-28 px-2 py-1.5 rounded-lg bg-white border text-sm",
                    extraInvalid ? "border-rose-300" : "border-slate-200",
                  )}
                />
                <span className="text-xs text-slate-400">to</span>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className={cn(
                    "w-28 px-2 py-1.5 rounded-lg bg-white border text-sm",
                    extraInvalid ? "border-rose-300" : "border-slate-200",
                  )}
                />
              </div>
              {extraInvalid && (
                <div className="text-[11px] text-rose-700">End time must be after start time.</div>
              )}
            </>
          )}
          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Label (optional)</span>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={80}
              placeholder={
                kind === "extra" ? "Extra weekend shift…"
                : kind === "off-range" ? "Vacation, conference, family trip…"
                : "Vacation, sick day, family event…"
              }
              className="mt-1 w-full px-2 py-1.5 rounded-lg bg-white border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
            />
          </label>
          {state?.error && <div className="text-xs text-rose-700">{state.error}</div>}
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={add}
              disabled={pending || extraInvalid || rangeInvalid}
              className="px-4 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold disabled:opacity-50"
            >
              {pending ? "Adding…" : kind === "off-range" ? "Add date range" : "Add"}
            </button>
            <button
              type="button"
              onClick={() => { setOpen(false); setState(undefined); }}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {overrides.length > 0 && pastCount > 0 && (
        <div className="mb-2 flex items-center justify-end">
          <button
            type="button"
            onClick={() => setShowPast((v) => !v)}
            className="text-[11px] font-semibold text-slate-500 hover:text-slate-700"
          >
            {showPast
              ? `Hide past (${pastCount})`
              : `Show past (${pastCount})`}
          </button>
        </div>
      )}
      {visible.length === 0 ? (
        <p className="text-xs text-slate-400 text-center py-4">
          {overrides.length === 0 ? "No upcoming overrides." : "No upcoming overrides — past ones hidden."}
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {visible.map((o) => {
            const niceDate = new Date(o.date + "T00:00:00").toLocaleDateString(undefined, {
              weekday: "short", month: "short", day: "numeric",
            });
            return (
              <li key={o.id} className="py-2.5 flex items-center gap-3">
                <span className={cn("inline-flex w-9 h-9 rounded-lg items-center justify-center shrink-0",
                  o.is_unavailable ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700")}>
                  {o.is_unavailable ? <Plane className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-slate-900">{niceDate}</div>
                  <div className="text-[11px] text-slate-500">
                    {o.is_unavailable
                      ? "Off all day"
                      : `Extra shift ${o.start_time?.slice(0,5)}–${o.end_time?.slice(0,5)}`}
                    {o.label && <> · {o.label}</>}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => remove(o.id)}
                  disabled={pending}
                  aria-label="Remove override"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
