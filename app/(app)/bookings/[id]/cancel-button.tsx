"use client";

import { useTransition, useState, useEffect } from "react";
import { X, AlertCircle, Info } from "lucide-react";
import { cancelBookingAction, previewCancellationAction } from "../actions";

type Fee = {
  cents: number;
  rate: number;
  reason: string;
  explanation: string;
  because: string;
};

/*
  CANCELLING COSTS SOMETHING ONCE A HELPER HAS TAKEN THE JOB.

  So the amount is fetched and shown BEFORE the button that cancels,
  in money, with the reason it applies — and the button says what it
  will do rather than just "Cancel booking". Nothing is charged until
  the customer has seen the figure and pressed the thing that names it.

  The figure is the server's. It is sent back on confirm and checked
  again there, so a screen left open cannot authorise an amount the
  customer never saw.
*/
export function CancelBookingButton({ bookingId }: { bookingId: string }) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [fee, setFee] = useState<Fee | null>(null);
  const [loadingFee, setLoadingFee] = useState(false);

  useEffect(() => {
    if (!open || fee) return;
    setLoadingFee(true);
    previewCancellationAction(bookingId)
      .then((r) => {
        if ("fee" in r && r.fee) setFee(r.fee as Fee);
        else if ("error" in r && r.error) setErr(r.error);
      })
      .finally(() => setLoadingFee(false));
  }, [open, bookingId, fee]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-field border border-rose-200 text-rose-700 text-[15px] font-semibold"
      >
        <X className="w-4 h-4" /> Cancel booking
      </button>
    );
  }

  const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
  const charges = (fee?.cents ?? 0) > 0;

  return (
    <div className="rounded-field border border-slate-200 bg-slate-50 p-3">
      <div className="text-[15px] font-semibold text-slate-900 mb-2">Cancel this booking?</div>

      {loadingFee && (
        <div className="text-[13px] text-slate-500 mb-2">Checking what this will cost…</div>
      )}

      {/* THE AMOUNT, BEFORE THE BUTTON. */}
      {fee && charges && (
        <div className="mb-2 rounded-field border border-amber-200 bg-amber-50 px-3 py-2.5">
          <div className="text-[15px] font-semibold text-amber-900">
            Cancelling costs {money(fee.cents)}
          </div>
          <p className="text-[13px] text-amber-900 mt-0.5">{fee.explanation}</p>
          <p className="text-[12px] text-amber-800/90 mt-1">{fee.because}</p>
        </div>
      )}

      {fee && !charges && (
        <p className="mb-2 flex items-start gap-1.5 text-[13px] text-slate-600">
          <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-slate-400" />
          {fee.explanation}
        </p>
      )}

      <textarea
        rows={2}
        placeholder="Reason (optional)…"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="w-full px-3 py-2 rounded-field bg-white border border-slate-200 text-[15px] focus:outline-none focus:ring-2 focus:ring-brand-200"
      />

      {err && (
        <div className="mt-2 flex items-start gap-1.5 text-[13px] text-rose-700">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {err}
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          disabled={pending || loadingFee || !fee}
          onClick={() => {
            setErr(null);
            start(async () => {
              const r = await cancelBookingAction(
                bookingId,
                reason || undefined,
                fee?.cents ?? 0,
              );
              if (r?.error) setErr(r.error);
              /* The fee moved while this was on screen: show the new
                 one and make them accept that instead. */
              if (r && "needsAcceptance" in r && r.needsAcceptance && r.fee) {
                setFee(r.fee as Fee);
                return;
              }
              if (!r?.error) setOpen(false);
            });
          }}
          className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-field bg-rose-600 text-white text-[15px] font-semibold disabled:opacity-50"
        >
          {pending
            ? "Cancelling…"
            : charges
              ? `Cancel and pay ${money(fee!.cents)}`
              : "Cancel booking"}
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); setErr(null); setReason(""); }}
          className="px-3 py-2.5 rounded-field border border-slate-200 text-[15px] font-semibold text-slate-700"
        >
          Keep it
        </button>
      </div>
    </div>
  );
}
