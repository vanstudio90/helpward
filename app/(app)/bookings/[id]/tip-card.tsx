"use client";

import { useState, useTransition } from "react";
import { Heart, AlertCircle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { setTipAction } from "../actions";

// Post-completion tip widget. Shows preset percentages of the base price + a
// custom field. 100% of the tip goes to the helper — we say so explicitly.

const PRESETS_PCT = [0, 10, 15, 20, 25];

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
  const [custom, setCustom] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const baseDollars = basePriceCents / 100;
  const currentTipDollars = currentTipCents / 100;
  const hasTipped = currentTipCents > 0;

  const presets = PRESETS_PCT.map((p) => ({
    pct: p,
    label: p === 0 ? "No tip" : `${p}%`,
    dollars: Math.round((baseDollars * p) / 100 * 100) / 100,
    selected: p > 0 && Math.abs(currentTipDollars - (baseDollars * p) / 100) < 0.01,
  }));

  const submit = (tipDollars: number) => {
    setErr(null); setSuccess(null);
    start(async () => {
      const r = await setTipAction(bookingId, tipDollars);
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
            {hasTipped ? `You tipped ${helperName}` : `Tip ${helperName}?`}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {hasTipped
              ? `${currency} $${currentTipDollars.toFixed(2)} added — 100% goes to the helper.`
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

      <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
        {presets.map((p) => (
          <button
            key={p.pct}
            type="button"
            disabled={pending}
            onClick={() => submit(p.dollars)}
            className={cn(
              "rounded-xl border py-2 px-1 text-center transition disabled:opacity-50",
              p.selected
                ? "border-brand-500 bg-brand-50 text-brand-700"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
            )}
          >
            <div className="text-xs font-bold">{p.label}</div>
            {p.pct > 0 && (
              <div className="text-[10px] text-slate-500 mt-0.5">${p.dollars.toFixed(2)}</div>
            )}
          </button>
        ))}
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
            onChange={(e) => setCustom(e.target.value)}
            placeholder="Custom amount"
            className="w-full pl-6 pr-3 py-2 rounded-lg bg-white border border-slate-200 text-sm focus:outline-none focus:ring-4 focus:ring-brand-100 focus:border-brand-400"
          />
        </div>
        <button
          type="button"
          disabled={pending || !custom}
          onClick={() => submit(parseFloat(custom) || 0)}
          className="inline-flex items-center gap-1 px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold disabled:opacity-50"
        >
          {pending ? "Saving…" : hasTipped ? "Update" : "Send tip"}
        </button>
      </div>

      {hasTipped && (
        <button
          type="button"
          disabled={pending}
          onClick={() => submit(0)}
          className="mt-2 text-[11px] text-slate-500 hover:text-slate-700 underline"
        >
          Remove tip
        </button>
      )}
    </div>
  );
}
