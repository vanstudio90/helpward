"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Play, AlertCircle } from "lucide-react";
import { setOnlineAction, startBookingAction, completeBookingAction } from "./actions";
import { cn } from "@/lib/cn";

export function OnlineToggle({ initialOnline }: { initialOnline: boolean }) {
  const [on, setOn] = useState(initialOnline);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          const next = !on;
          setOn(next);
          setErr(null);
          start(async () => {
            const result = await setOnlineAction(next);
            if (result?.error) {
              setOn(!next);
              setErr(result.error);
            }
          });
        }}
        className={cn(
          "relative inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-semibold shrink-0",
          on ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-600"
        )}
      >
        <span className={cn("w-2 h-2 rounded-full", on ? "bg-emerald-500 animate-pulse" : "bg-slate-400")} />
        {on ? "Online" : "Offline"}
      </button>
      {err && <div className="text-[11px] text-rose-600">{err}</div>}
    </div>
  );
}

export function BookingActions({ bookingId, status }: { bookingId: string; status: string }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const action = status === "scheduled" ? "start" : "complete";

  return (
    <div>
      {err && (
        <div className="mb-2 flex items-start gap-2 text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded-lg p-2.5">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {err}
        </div>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setErr(null);
          start(async () => {
            const fn = action === "start" ? startBookingAction : completeBookingAction;
            const r = await fn(bookingId);
            if (r?.error) setErr(r.error);
          });
        }}
        className={cn(
          "w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl font-semibold disabled:opacity-60",
          action === "start"
            ? "bg-brand-600 text-white"
            : "bg-emerald-600 text-white"
        )}
      >
        {action === "start" ? <><Play className="w-4 h-4" /> {pending ? "Starting…" : "Start task"}</> : <><CheckCircle2 className="w-4 h-4" /> {pending ? "Completing…" : "Mark complete"}</>}
      </button>
    </div>
  );
}
