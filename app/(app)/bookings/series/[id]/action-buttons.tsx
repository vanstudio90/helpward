"use client";

import { useState, useTransition } from "react";
import {
  Pause, Play, X, SkipForward, AlertCircle, CheckCircle2, Loader2,
} from "lucide-react";
import {
  pauseSeriesAction, resumeSeriesAction, cancelSeriesAction,
  skipNextOccurrenceAction,
} from "../actions";

export function SeriesActionButtons({
  seriesId, status,
}: { seriesId: string; status: string }) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<{ error?: string; success?: string } | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  const isActive = status === "active";
  const isPaused = status === "paused";
  const isTerminal = status === "cancelled" || status === "completed";

  const wrap = (fn: () => Promise<{ error?: string; success?: string } | undefined>) => () => {
    setState(null);
    start(async () => {
      const r = await fn();
      setState(r ?? null);
    });
  };

  if (isTerminal) {
    return null;
  }

  return (
    <div>
      {state?.error && (
        <div className="mb-3 flex items-start gap-2 text-[13px] text-rose-700 bg-rose-50 border border-rose-100 rounded-field p-2.5">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {state.error}
        </div>
      )}
      {state?.success && (
        <div className="mb-3 flex items-start gap-2 text-[13px] text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-field p-2.5">
          <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {state.success}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {isActive && (
          <>
            <button
              type="button"
              disabled={pending}
              onClick={wrap(() => pauseSeriesAction(seriesId))}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-field border border-amber-200 text-amber-700 text-[13px] font-semibold hover:bg-amber-50 disabled:opacity-50"
            >
              {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Pause className="w-3.5 h-3.5" />} Pause series
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={wrap(() => skipNextOccurrenceAction(seriesId))}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-field border border-slate-200 text-slate-700 text-[13px] font-semibold hover:bg-slate-50 disabled:opacity-50"
            >
              {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <SkipForward className="w-3.5 h-3.5" />} Skip next
            </button>
          </>
        )}
        {isPaused && (
          <button
            type="button"
            disabled={pending}
            onClick={wrap(() => resumeSeriesAction(seriesId))}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-field bg-emerald-600 text-white text-[13px] font-bold hover:bg-emerald-700 disabled:opacity-50"
          >
            {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />} Resume series
          </button>
        )}

        {!confirmingCancel ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => setConfirmingCancel(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-field border border-rose-200 text-rose-700 text-[13px] font-semibold hover:bg-rose-50 disabled:opacity-50"
          >
            <X className="w-3.5 h-3.5" /> Cancel series
          </button>
        ) : (
          <div className="flex items-center gap-2 w-full mt-2 rounded-field bg-rose-50 border border-rose-200 p-3">
            <div className="flex-1 text-[13px] text-rose-900">
              Cancelling stops all future occurrences. Already-scheduled bookings still happen — cancel each from
              its booking page if you also want to skip them.
            </div>
            <button
              type="button"
              disabled={pending}
              onClick={wrap(() => cancelSeriesAction(seriesId))}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-field bg-rose-600 text-white text-[13px] font-bold disabled:opacity-50 shrink-0"
            >
              {pending ? "Cancelling…" : "Confirm cancel"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmingCancel(false)}
              className="text-[13px] font-semibold text-slate-600"
            >
              Keep
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
