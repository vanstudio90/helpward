"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { CheckCircle2, Play, AlertCircle, MapPin } from "lucide-react";
import { setOnlineAction, startBookingAction, completeBookingAction } from "./actions";
import { startGpsPings } from "@/lib/gps/ping";
import { cn } from "@/lib/cn";

export function OnlineToggle({ initialOnline }: { initialOnline: boolean }) {
  const [on, setOn] = useState(initialOnline);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [gpsNote, setGpsNote] = useState<string | null>(null);
  const stopGpsRef = useRef<(() => void) | null>(null);

  // Start/stop GPS pings when online state changes
  useEffect(() => {
    if (on) {
      setGpsNote(null);
      const stop = startGpsPings({
        onError: (e) => {
          const msg = e instanceof GeolocationPositionError
            ? (e.code === 1 ? "Location permission denied — task offers may not reach you accurately."
              : e.code === 2 ? "Location unavailable. Check device GPS."
              : "Location request timed out.")
            : e.message;
          setGpsNote(msg);
        },
        onUpdate: () => setGpsNote(null),
      });
      stopGpsRef.current = stop;
      return () => stop();
    } else {
      stopGpsRef.current?.();
      stopGpsRef.current = null;
    }
  }, [on]);

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
      {gpsNote && (
        <div className="text-[11px] text-amber-700 inline-flex items-center gap-1">
          <MapPin className="w-3 h-3" /> {gpsNote}
        </div>
      )}
    </div>
  );
}

export function BookingActions({
  bookingId, status, paymentStatus,
}: {
  bookingId: string;
  status: string;
  /** From the booking. start_booking refuses anything but authorized/captured. */
  paymentStatus: string;
}) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const action = status === "scheduled" ? "start" : "complete";

  // The server already refuses an unpaid start (migration 0043), and did
  // so correctly — but the button stayed enabled, so the helper's only way
  // to discover the job was not startable was to press it and read an
  // error. A control that cannot succeed should not look like it can.
  const held = paymentStatus === "authorized" || paymentStatus === "captured";
  const blockedReason =
    action !== "start" || held
      ? null
      : paymentStatus === "failed"
        ? "The customer's card was declined — don't start work."
        : "Waiting for the customer to confirm their payment.";
  const disabled = pending || !!blockedReason;

  return (
    <div>
      {err && (
        <div className="mb-2 flex items-start gap-2 text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded-lg p-2.5">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {err}
        </div>
      )}
      <button
        type="button"
        disabled={disabled}
        title={blockedReason ?? undefined}
        onClick={() => {
          setErr(null);
          start(async () => {
            const fn = action === "start" ? startBookingAction : completeBookingAction;
            const r = await fn(bookingId);
            if (r?.error) setErr(r.error);
          });
        }}
        className={cn(
          "w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl font-semibold",
          "disabled:opacity-60 disabled:cursor-not-allowed",
          action === "start"
            ? "bg-brand-600 text-white"
            : "bg-emerald-600 text-white"
        )}
      >
        {action === "start"
          ? <><Play className="w-4 h-4" aria-hidden="true" /> {pending ? "Starting…" : blockedReason ? "Waiting for payment" : "Start task"}</>
          : <><CheckCircle2 className="w-4 h-4" aria-hidden="true" /> {pending ? "Completing…" : "Mark complete"}</>}
      </button>
      {blockedReason && (
        <p className="mt-1.5 text-[11px] text-slate-500 text-center">{blockedReason}</p>
      )}
    </div>
  );
}
