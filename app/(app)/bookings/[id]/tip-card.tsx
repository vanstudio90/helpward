"use client";

import { useState, useTransition } from "react";
import { Heart, AlertCircle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/money";
import { setTipAction } from "../actions";

// Post-completion tip widget. Shows preset percentages of the base price
// plus a custom field. 100% of the tip goes to the helper — we say so.
//
// CHOOSING AN AMOUNT AND SENDING IT ARE TWO SEPARATE ACTIONS. They used
// to be one: tapping "20%" charged the card there and then. Combined
// with the (correct) rule below that a sent tip is final, that made a
// single mis-tap on a five-button grid an irreversible charge on a real
// card. A tip is the one payment on this page the customer is choosing
// to make, so it is the last place a stray tap should move money.
//
// A SENT TIP IS FINAL, and this component has to say so. It used to keep
// offering "Update", "Remove tip" and the percentage buttons after a tip
// had been charged; the server correctly refused every one, so the
// customer was handed controls whose only possible outcome was an error.
// The tip is a separate Stripe charge, so changing it would mean charging
// a difference or refunding one.

const PRESETS_PCT = [10, 15, 20, 25];

export function TipCard({
  bookingId, basePriceCents, currentTipCents, currency, helperName,
}: {
  bookingId: string;
  basePriceCents: number;
  currentTipCents: number;
  currency: string;
  helperName: string;
}) {
  const [pending, start] = useTransition();
  // The money has moved. Nothing below may offer to change it.
  const isFinal = currentTipCents > 0;
  const [custom, setCustom] = useState("");
  // What the customer has CHOSEN. Null until they pick something, and
  // never enough on its own to charge anything.
  const [chosenCents, setChosenCents] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const presets = PRESETS_PCT.map((pct) => ({
    pct,
    cents: Math.round((basePriceCents * pct) / 100),
  }));

  const customCents = (() => {
    const n = parseFloat(custom);
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.round(n * 100);
  })();

  const chooseCustom = () => {
    setErr(null);
    if (customCents === null) return;
    setChosenCents(customCents);
  };

  const sendChosen = () => {
    if (chosenCents === null || chosenCents <= 0) return;
    setErr(null); setSuccess(null);
    start(async () => {
      const r = await setTipAction(bookingId, chosenCents / 100);
      if (r?.error) setErr(r.error);
      else if (r?.success) setSuccess(r.success);
    });
  };

  return (
    <div className="rounded-2xl bg-white border border-slate-100 p-4 sm:p-5">
      <div className="flex items-start gap-3 mb-3">
        <span className="w-10 h-10 rounded-xl bg-rose-50 inline-flex items-center justify-center shrink-0">
          <Heart className="w-5 h-5 text-rose-600" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold text-slate-900">
            {isFinal ? `You tipped ${helperName}` : `Tip ${helperName}?`}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {isFinal
              ? `${formatMoney(currentTipCents, currency)} added — 100% goes to the helper.`
              : "100% of your tip goes to the helper. Nothing to Helpward."}
          </p>
        </div>
      </div>

      {err && (
        <div className="mb-3 flex items-start gap-2 text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded-lg p-2.5">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {err}
        </div>
      )}
      {success && (
        <div className="mb-3 flex items-start gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg p-2.5">
          <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {success}
        </div>
      )}

      {isFinal ? (
        <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
            <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
            {formatMoney(currentTipCents, currency)} sent to {helperName}
          </div>
          <p className="text-xs text-emerald-800/80 mt-1">
            Tips are charged straight away and can&rsquo;t be changed or taken back.
            If something went wrong,{" "}
            <a href="/help" className="underline font-semibold">contact support</a>.
          </p>
        </div>
      ) : (
        <>
          {/* Step 1 — choose. These buttons move no money. */}
          <div className="grid grid-cols-4 gap-1.5" role="group" aria-label="Choose a tip amount">
            {presets.map((p) => {
              const selected = chosenCents === p.cents;
              return (
                <button
                  key={p.pct}
                  type="button"
                  disabled={pending}
                  aria-pressed={selected}
                  onClick={() => { setErr(null); setCustom(""); setChosenCents(p.cents); }}
                  className={cn(
                    "rounded-xl border py-2 px-1 text-center transition disabled:opacity-50",
                    selected
                      ? "border-brand-500 bg-brand-50 text-brand-700 ring-2 ring-brand-200"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                  )}
                >
                  <div className="text-xs font-bold">{p.pct}%</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {formatMoney(p.cents, currency)}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex items-center gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">$</span>
              <input
                type="number"
                step="0.50"
                min="0"
                max="500"
                value={custom}
                onChange={(e) => { setCustom(e.target.value); setChosenCents(null); }}
                onBlur={chooseCustom}
                placeholder="Custom amount"
                aria-label="Custom tip amount"
                className="w-full pl-6 pr-3 py-2 rounded-lg bg-white border border-slate-200 text-sm focus:outline-none focus:ring-4 focus:ring-brand-100 focus:border-brand-400"
              />
            </div>
            <button
              type="button"
              disabled={pending || customCents === null}
              onClick={chooseCustom}
              className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 text-sm font-semibold disabled:opacity-50 hover:bg-slate-50"
            >
              Use this
            </button>
          </div>

          {/* Step 2 — send. The only control that charges anything, and
              it names the amount, the currency and the person, so the
              confirming tap cannot be a blind one. */}
          <div className="mt-3 border-t border-slate-100 pt-3">
            <button
              type="button"
              disabled={pending || chosenCents === null || chosenCents <= 0}
              onClick={sendChosen}
              className="w-full px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-bold disabled:opacity-40"
            >
              {pending
                ? "Sending…"
                : chosenCents === null
                  ? "Choose an amount first"
                  : `Send ${formatMoney(chosenCents, currency)} to ${helperName}`}
            </button>
            <p className="mt-1.5 text-[11px] text-slate-500 text-center">
              Charged to your card straight away, and can&rsquo;t be taken back.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
