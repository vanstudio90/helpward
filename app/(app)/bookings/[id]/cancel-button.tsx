"use client";

import { useTransition, useState } from "react";
import { X, AlertCircle } from "lucide-react";
import { cancelBookingAction } from "../actions";

export function CancelBookingButton({ bookingId }: { bookingId: string }) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);

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

  return (
    <div className="rounded-field border border-slate-200 bg-slate-50 p-3">
      <div className="text-[15px] font-semibold text-slate-900 mb-2">Cancel this booking?</div>
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
          disabled={pending}
          onClick={() => {
            setErr(null);
            start(async () => {
              const r = await cancelBookingAction(bookingId, reason || undefined);
              if (r?.error) setErr(r.error);
              else setOpen(false);
            });
          }}
          className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-field bg-rose-600 text-white text-[15px] font-semibold disabled:opacity-50"
        >
          {pending ? "Cancelling…" : "Cancel booking"}
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); setErr(null); setReason(""); }}
          className="px-3 py-2.5 rounded-field border border-slate-200 text-[15px] font-semibold text-slate-700"
        >
          Keep
        </button>
      </div>
    </div>
  );
}
