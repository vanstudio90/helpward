import { ClipboardCheck } from "lucide-react";

// The customer's copy of what their inspector found. Read-only: the
// report is the helper's statement, and a document the subject can edit
// is not a report.

const AREA_LABELS: Record<string, string> = {
  condition: "General condition, room by room",
  damage: "Damage and wear",
  appliances: "Appliances working",
  safety: "Smoke alarms and safety",
  meters: "Meter readings",
  exterior: "Exterior and grounds",
};

const CONDITION_STYLE: Record<string, { label: string; className: string }> = {
  good:        { label: "Good",        className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  fair:        { label: "Fair",        className: "bg-amber-50 text-amber-800 border-amber-200" },
  poor:        { label: "Poor",        className: "bg-rose-50 text-rose-700 border-rose-200" },
  not_present: { label: "Not present", className: "bg-slate-50 text-slate-600 border-slate-200" },
  not_checked: { label: "Not checked", className: "bg-slate-50 text-slate-500 border-slate-200" },
};

export function InspectionView({
  summary, submittedAt, items,
}: {
  summary: string | null;
  submittedAt: string | null;
  items: Array<{ id: string; area: string; condition: string; note: string | null }>;
}) {
  if (!submittedAt) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
          <ClipboardCheck className="w-4 h-4 text-slate-400" aria-hidden="true" />
          Inspection report
        </div>
        <p className="text-xs text-slate-500 mt-1">
          Your inspector is still working through it. You&rsquo;ll be notified the moment it&rsquo;s sent.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
        <ClipboardCheck className="w-4 h-4 text-brand-600" aria-hidden="true" />
        Inspection report
      </div>

      {summary && (
        <p className="mt-2 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{summary}</p>
      )}

      <ul className="mt-3 space-y-2">
        {items.map((item) => {
          const tone = CONDITION_STYLE[item.condition] ?? CONDITION_STYLE.not_checked;
          return (
            <li key={item.id} className="rounded-xl border border-slate-100 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="text-xs font-semibold text-slate-800 min-w-0">
                  {AREA_LABELS[item.area] ?? item.area}
                </div>
                <span
                  className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border shrink-0 ${tone.className}`}
                >
                  {tone.label}
                </span>
              </div>
              {item.note && (
                <p className="mt-1.5 text-xs text-slate-600 whitespace-pre-wrap">{item.note}</p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
