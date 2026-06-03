"use client";

import { useEffect, useState, useTransition } from "react";
import { Globe, CheckCircle2, AlertCircle } from "lucide-react";
import { setProviderTimezoneAction } from "./actions";

// Auto-detect timezone card. Compares the helper's browser tz against the
// stored value on every page load. When they match (or we can't detect),
// the card renders a low-key confirmation row. When they differ, surfaces
// a one-tap "Use this timezone instead" CTA — we don't auto-overwrite
// because a helper traveling shouldn't have their analytics silently
// re-bucketed without consent.
export function TimezoneCard({ stored }: { stored: string }) {
  const [detected, setDetected] = useState<string | null>(null);
  const [current, setCurrent] = useState(stored);
  const [pending, start] = useTransition();
  const [state, setState] = useState<{ error?: string; success?: string } | null>(null);

  useEffect(() => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz) setDetected(tz);
    } catch {
      setDetected(null);
    }
  }, []);

  const matches = detected && detected === current;
  const canSwitch = detected && !matches;

  const apply = (next: string) => {
    setState(null);
    start(async () => {
      const r = await setProviderTimezoneAction(next);
      if (r?.error) setState({ error: r.error });
      else { setCurrent(next); setState({ success: r?.success ?? "Updated." }); }
    });
  };

  return (
    <section className="rounded-2xl bg-white border border-slate-100 p-4 sm:p-5">
      <h2 className="text-base font-bold text-slate-900 inline-flex items-center gap-2 mb-1">
        <Globe className="w-4 h-4 text-brand-600" /> Timezone
      </h2>
      <p className="text-xs text-slate-500 mb-3 leading-relaxed">
        Used to render your analytics + future schedule features in your actual local time.
        We never auto-change this — if you travel, your existing data stays bucketed where you set it.
      </p>

      {state?.error && (
        <div className="mb-3 flex items-start gap-2 text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded-lg p-2.5">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {state.error}
        </div>
      )}
      {state?.success && (
        <div className="mb-3 flex items-start gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg p-2.5">
          <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {state.success}
        </div>
      )}

      <div className="rounded-xl bg-slate-50 p-3 flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Stored</div>
          <div className="text-sm font-bold text-slate-900 font-mono truncate">{current}</div>
        </div>
        {matches && (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-full shrink-0">
            <CheckCircle2 className="w-3 h-3" /> Matches this browser
          </span>
        )}
      </div>

      {canSwitch && (
        <div className="mt-3 rounded-xl bg-amber-50 border border-amber-200 p-3 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-wide text-amber-700">This browser is in</div>
            <div className="text-sm font-bold text-amber-900 font-mono truncate">{detected}</div>
          </div>
          <button
            type="button"
            onClick={() => apply(detected!)}
            disabled={pending}
            className="px-3 py-2 rounded-lg bg-amber-600 text-white text-xs font-bold disabled:opacity-50 shrink-0"
          >
            {pending ? "Saving…" : "Use this timezone"}
          </button>
        </div>
      )}
    </section>
  );
}
