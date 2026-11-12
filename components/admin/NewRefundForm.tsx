"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Info } from "lucide-react";
import { requestRefundAction, type RefundResult } from "@/app/(admin)/admin/refunds/actions";
import { REFUND_REASONS } from "@/lib/admin-refund-states";
import { money } from "@/lib/admin-format";

/*
  ASKING FOR A REFUND, FROM THE PAYMENT IT IS AGAINST.

  "Review refund" on a payment navigated to /admin/refunds?start=PY-…
  and showed an empty table: the reader accepted `start` and ignored
  it, so the one route into this workflow led nowhere. There was no
  way to create a request at all.

  WHAT THIS FORM WILL NOT LET SOMEBODY DO:

  * Refund a charge that does not exist. The leg is chosen from the
    charges this payment actually has.
  * Ask for more than is left. The figure beside each leg already has
    refunds in flight subtracted, and the database re-checks it under
    a lock before anything is reserved.
  * Discover who carries the cost afterwards. The settlement rule for
    the chosen reason is printed before the button, not on somebody's
    payout statement later.
*/

export type RefundTarget = {
  paymentRef: string;
  bookingId: string;
  bookingRef: string;
  customerName: string;
  currency: string;
  legs: {
    leg: "service" | "tip";
    label: string;
    captured_cents: number;
    available_cents: number;
  }[];
  /* Set when nothing can be requested, with the reason. */
  blocked_reason: string | null;
};

const ABSORBED = new Set(["goodwill", "duplicate_charge", "overcharge", "cancelled_late"]);

export function NewRefundForm({ target, canRequest }: { target: RefundTarget; canRequest: boolean }) {
  const router = useRouter();
  const first = target.legs.find((l) => l.available_cents > 0) ?? target.legs[0];
  const [leg, setLeg] = useState<"service" | "tip">(first?.leg ?? "service");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RefundResult | null>(null);

  const chosen = target.legs.find((l) => l.leg === leg);
  const available = chosen?.available_cents ?? 0;
  const cents = Math.round(Number(amount) * 100);
  const amountValid = Number.isFinite(cents) && cents > 0 && cents <= available;

  const submit = async () => {
    setBusy(true);
    setResult(null);
    try {
      const outcome = await requestRefundAction({
        bookingId: target.bookingId, leg, amountCents: cents,
        reason, note: note || null,
      });
      setResult(outcome);
      if (outcome.ok) {
        setAmount("");
        setNote("");
        router.refresh();
      }
    } catch (e) {
      setResult({ ok: false, error: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="bg-white rounded-2xl border border-brand-200 px-4 py-3.5 space-y-3">
      <div>
        <h2 className="text-[15px] font-bold text-slate-900">
          Refund {target.paymentRef}
        </h2>
        <p className="text-[12px] text-slate-500">
          {target.customerName} · booking {target.bookingRef}
        </p>
      </div>

      {target.blocked_reason ? (
        <p className="text-[12px] text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 flex items-start gap-1.5">
          <AlertTriangle className="w-4 h-4 mt-px shrink-0" /> {target.blocked_reason}
        </p>
      ) : (
        <>
          {/* ONE LEG, CHOSEN. A tip is a separate charge with its own
              balance; it is never taken to top up the other. */}
          <div className="flex flex-wrap gap-2">
            {target.legs.map((l) => (
              <button key={l.leg} type="button" onClick={() => setLeg(l.leg)}
                className={`text-left px-3 py-2 rounded-xl border ${
                  leg === l.leg ? "border-brand-400 bg-brand-50" : "border-slate-200 bg-white"
                }`}>
                <span className="block text-[13px] font-semibold text-slate-900">{l.label}</span>
                <span className="block text-[11px] text-slate-600 tabular-nums">
                  {money(l.available_cents, target.currency)} left of {money(l.captured_cents, target.currency)}
                </span>
              </button>
            ))}
          </div>

          <div className="grid sm:grid-cols-2 gap-2">
            <label>
              <span className="block text-[12px] font-semibold text-slate-700">
                Amount ({target.currency})
              </span>
              <input value={amount} onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal" placeholder={(available / 100).toFixed(2)}
                className="mt-0.5 w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-[13px] tabular-nums" />
              <span className="block text-[11px] text-slate-500 mt-0.5">
                At most {money(available, target.currency)} — refunds already in flight are
                subtracted, and the database checks it again before reserving.
              </span>
            </label>
            <label>
              <span className="block text-[12px] font-semibold text-slate-700">Reason</span>
              <select value={reason} onChange={(e) => setReason(e.target.value)}
                className="mt-0.5 w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-[13px] bg-white">
                <option value="">Choose a reason</option>
                {REFUND_REASONS.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </label>
          </div>

          {/* WHO CARRIES IT, BEFORE THE BUTTON. */}
          {reason && (
            <p className="text-[12px] text-slate-700 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 flex items-start gap-1.5">
              <Info className="w-4 h-4 text-slate-400 mt-px shrink-0" />
              {ABSORBED.has(reason)
                ? "On these grounds the helper keeps their share and Helpward carries the refund."
                : "On these grounds the helper's share goes back with the refund."}
            </p>
          )}

          <label className="block">
            <span className="block text-[12px] font-semibold text-slate-700">Note (optional)</span>
            <input value={note} onChange={(e) => setNote(e.target.value)}
              className="mt-0.5 w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-[13px]" />
          </label>

          {result && (
            <p className={`text-[12px] rounded-xl px-3 py-2 border ${
              result.ok ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                : "bg-rose-50 border-rose-200 text-rose-900"
            }`}>
              <span className="font-semibold">{result.ok ? result.message : result.error}</span>
              {result.ok && result.detail && (
                <span className="block font-normal text-slate-600 mt-0.5">{result.detail}</span>
              )}
            </p>
          )}

          <div className="flex items-center gap-2">
            <p className="text-[11px] text-slate-500 flex-1">
              This creates a request. Nothing is sent until somebody approves it, and the approval
              is recorded with their name.
            </p>
            <button type="button" onClick={() => void submit()}
              disabled={!canRequest || busy || !amountValid || !reason}
              title={
                !amountValid && amount
                  ? `Between 0.01 and ${(available / 100).toFixed(2)}`
                  : !reason ? "Choose a reason — it decides who carries the cost." : undefined
              }
              className="inline-flex items-center gap-1.5 bg-brand-600 text-white text-[13px] font-semibold px-3.5 py-2 rounded-xl disabled:bg-slate-200 disabled:text-slate-500 disabled:cursor-not-allowed">
              {busy ? "Requesting…" : "Request refund"}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
