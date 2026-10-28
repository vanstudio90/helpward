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

/* How a waiting job ended, in the helper's words.
 *
 * "Mark complete" is the wrong question for this service: reaching the
 * front of the queue is not the only acceptable ending, and the endings
 * are not worth the same money. A venue that refused a stand-in means no
 * valid waiting was possible, and the customer is not charged for it —
 * which is a decision only the helper standing there can report.
 */
const WAIT_OUTCOMES: { value: string; label: string; detail: string }[] = [
  { value: "customer_took_over", label: "Customer took over",
    detail: "They arrived and took your place in the queue." },
  { value: "booked_period_ended", label: "Booked time ran out",
    detail: "You waited the whole booked period and they didn't arrive." },
  { value: "queue_closed", label: "Queue closed or sold out",
    detail: "You waited, but the line shut or the item ran out before the turn came." },
  { value: "venue_refused_substitution", label: "Venue refused a stand-in",
    detail: "They wouldn't let you hold the place. Your customer won't be charged." },
];

export function BookingActions({
  bookingId, status, paymentStatus, needsReport = false, hasReport = false,
  serviceId,
}: {
  bookingId: string;
  status: string;
  /** From the booking. start_booking refuses anything but authorized/captured. */
  paymentStatus: string;
  /** service_completion_requirements.requires_report for this service. */
  needsReport?: boolean;
  /** Whether that report has actually been sent. */
  hasReport?: boolean;
  /** Only wait-in-line asks how the job ended; every other service has one ending. */
  serviceId?: string;
}) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<string>("");

  const action = status === "scheduled" ? "start" : "complete";

  // The server already refuses an unpaid start (migration 0043), and did
  // so correctly — but the button stayed enabled, so the helper's only way
  // to discover the job was not startable was to press it and read an
  // error. A control that cannot succeed should not look like it can.
  const held = paymentStatus === "authorized" || paymentStatus === "captured";
  const startBlocked =
    action !== "start" || held
      ? null
      : paymentStatus === "failed"
        ? "The customer's card was declined — don't start work."
        : "Waiting for the customer to confirm their payment.";

  // Same shape, same reason: complete_booking (migration 0056) refuses to
  // complete an inspection with no report — correctly, since the report
  // IS what the customer paid for — but the button stayed enabled, so the
  // only way to find out was to press it and read the refusal.
  const completeBlocked =
    action === "complete" && needsReport && !hasReport
      ? "Send the inspection report first — it's what the customer is paying for."
      : null;

  // Asking only where the answer changes something. Every other service
  // has exactly one way of being finished, and a one-option picker is
  // just an extra tap.
  const asksOutcome = action === "complete" && serviceId === "wait-in-line";
  const outcomeMissing = asksOutcome && !outcome;

  const blockedReason = startBlocked ?? completeBlocked;
  const disabled = pending || !!blockedReason || outcomeMissing;

  return (
    <div>
      {asksOutcome && (
        <fieldset className="mb-3">
          <legend className="text-xs font-semibold text-slate-700 mb-1.5">
            How did it end?
          </legend>
          <div className="space-y-1.5">
            {WAIT_OUTCOMES.map((o) => (
              <label
                key={o.value}
                className={cn(
                  "flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer",
                  outcome === o.value
                    ? "border-brand-300 bg-brand-50/70"
                    : "border-slate-200 bg-white hover:bg-slate-50",
                )}
              >
                <input
                  type="radio"
                  name={`outcome-${bookingId}`}
                  value={o.value}
                  checked={outcome === o.value}
                  onChange={() => setOutcome(o.value)}
                  className="mt-0.5 w-4 h-4 shrink-0 text-brand-600 focus:ring-brand-200"
                />
                <span className="min-w-0">
                  <span className="block text-xs font-semibold text-slate-900">{o.label}</span>
                  <span className="block text-[11px] text-slate-600 leading-snug">{o.detail}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
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
            const r = action === "start"
              ? await startBookingAction(bookingId)
              : await completeBookingAction(bookingId, outcome || undefined);
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
          : <><CheckCircle2 className="w-4 h-4" aria-hidden="true" /> {
              pending ? "Completing…"
              : completeBlocked ? "Report needed first"
              : outcomeMissing ? "Choose how it ended"
              : asksOutcome ? "Finish this job"
              : "Mark complete"}</>}
      </button>
      {blockedReason && (
        <p className="mt-1.5 text-[11px] text-slate-500 text-center">{blockedReason}</p>
      )}
    </div>
  );
}
