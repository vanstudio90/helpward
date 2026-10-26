"use client";

import { useState, useTransition } from "react";
import { ClipboardCheck, Check, AlertCircle, Send } from "lucide-react";
import { cn } from "@/lib/cn";
import { saveInspectionItemAction, submitInspectionReportAction } from "./inspection-actions";

// A property inspection's deliverable IS the report. Before this the
// helper got the same "Start task / Mark complete" buttons as a dog walk,
// so the customer paid for a room-by-room assessment and received the
// word "completed".

export type InspectionItem = {
  id: string;
  position: number;
  area: string;
  condition: "good" | "fair" | "poor" | "not_checked" | "not_present";
  note: string | null;
};

export type InspectionReportData = {
  id: string;
  scope: string[];
  summary: string | null;
  submittedAt: string | null;
  items: InspectionItem[];
};

// The customer picked these by value; the helper should read words.
const AREA_LABELS: Record<string, string> = {
  condition: "General condition, room by room",
  damage: "Damage and wear",
  appliances: "Appliances working",
  safety: "Smoke alarms and safety",
  meters: "Meter readings",
  exterior: "Exterior and grounds",
};

const CONDITIONS = [
  { value: "good", label: "Good", tone: "bg-emerald-600 border-emerald-600 text-white" },
  { value: "fair", label: "Fair", tone: "bg-amber-500 border-amber-500 text-white" },
  { value: "poor", label: "Poor", tone: "bg-rose-600 border-rose-600 text-white" },
  { value: "not_present", label: "N/A", tone: "bg-slate-500 border-slate-500 text-white" },
] as const;

export function InspectionReport({
  bookingId, report,
}: { bookingId: string; report: InspectionReportData }) {
  const [items, setItems] = useState(report.items);
  const [summary, setSummary] = useState(report.summary ?? "");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(!!report.submittedAt);
  const [pending, start] = useTransition();

  const unchecked = items.filter((i) => i.condition === "not_checked").length;

  function setCondition(item: InspectionItem, condition: InspectionItem["condition"]) {
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, condition } : i)));
    setError(null);
    start(async () => {
      const r = await saveInspectionItemAction(bookingId, item.id, { condition });
      if (r?.error) {
        setError(r.error);
        // Put it back: the screen must not claim a finding that was not saved.
        setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, condition: item.condition } : i)));
      }
    });
  }

  function setNote(item: InspectionItem, note: string) {
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, note } : i)));
    start(async () => {
      const r = await saveInspectionItemAction(bookingId, item.id, { note });
      if (r?.error) setError(r.error);
    });
  }

  if (done) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
          <Check className="w-4 h-4 shrink-0" aria-hidden="true" /> Report sent to the customer
        </div>
        <p className="text-xs text-emerald-800/80 mt-1">
          You can mark this job complete now.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-3">
      <div className="flex items-start gap-2">
        <ClipboardCheck className="w-4 h-4 text-brand-600 mt-0.5 shrink-0" aria-hidden="true" />
        <div>
          <h3 className="text-sm font-bold text-slate-900">Inspection report</h3>
          <p className="text-xs text-slate-500">
            The customer asked for {report.scope.length} area
            {report.scope.length === 1 ? "" : "s"}. This is what they are paying for, so the job
            can&rsquo;t be completed until it&rsquo;s sent.
          </p>
        </div>
      </div>

      <ul className="space-y-2.5">
        {items.map((item) => (
          <li key={item.id} className="rounded-lg border border-slate-100 p-2.5">
            <div className="text-xs font-semibold text-slate-800">
              {AREA_LABELS[item.area] ?? item.area}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {CONDITIONS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  disabled={pending}
                  onClick={() => setCondition(item, c.value)}
                  className={cn(
                    "px-2.5 py-1 rounded-lg border text-[11px] font-semibold disabled:opacity-60",
                    item.condition === c.value
                      ? c.tone
                      : "bg-white border-slate-200 text-slate-600 hover:border-slate-300",
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>
            <textarea
              rows={2}
              defaultValue={item.note ?? ""}
              onBlur={(e) => setNote(item, e.target.value)}
              placeholder="What did you find? (optional)"
              className="mt-2 w-full px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </li>
        ))}
      </ul>

      <label className="block">
        <span className="text-xs font-semibold text-slate-700">Summary for the customer</span>
        <textarea
          rows={3}
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="Anything they should know first."
          className="mt-1 w-full px-2.5 py-2 rounded-lg bg-white border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </label>

      {error && (
        <p className="text-xs text-rose-700 flex items-start gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 mt-px shrink-0" aria-hidden="true" /> {error}
        </p>
      )}

      <button
        type="button"
        disabled={pending || unchecked > 0}
        onClick={() => {
          setError(null);
          start(async () => {
            const r = await submitInspectionReportAction(bookingId, summary);
            if (r?.error) setError(r.error);
            else setDone(true);
          });
        }}
        className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
      >
        <Send className="w-4 h-4" aria-hidden="true" />
        {unchecked > 0
          ? `${unchecked} area${unchecked === 1 ? "" : "s"} still to check`
          : "Send report to customer"}
      </button>
    </div>
  );
}
