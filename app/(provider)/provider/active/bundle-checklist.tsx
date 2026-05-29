"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Circle, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/cn";
import { setBundleItemStatusAction } from "./bundle-actions";

export type BundleChecklistItem = {
  id: string;
  position: number;
  title: string;
  notes: string | null;
  itemPriceCents: number;
  status: "pending" | "in_progress" | "completed" | "skipped";
};

// Per-stop checklist shown to the helper while on an in-progress bundle
// booking. Tap to advance: pending → in_progress → completed. Optimistic UI
// for speed; if the server rejects we revert + show the error.
export function BundleChecklist({ items: initial }: { items: BundleChecklistItem[] }) {
  const [items, setItems] = useState(initial);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const advance = (id: string) => {
    const current = items.find((i) => i.id === id);
    if (!current || current.status === "completed") return;
    const next: BundleChecklistItem["status"] =
      current.status === "pending" ? "in_progress" : "completed";

    const prev = items;
    setItems((p) => p.map((i) => (i.id === id ? { ...i, status: next } : i)));
    setErr(null);

    start(async () => {
      const r = await setBundleItemStatusAction(id, next);
      if (r?.error) {
        setItems(prev);
        setErr(r.error);
      }
    });
  };

  const completed = items.filter((i) => i.status === "completed").length;

  return (
    <div className="rounded-2xl bg-white border border-slate-100 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-slate-900">
          Bundle progress
        </h3>
        <span className="text-xs font-bold text-slate-700 tabular-nums">
          {completed} / {items.length}
        </span>
      </div>

      {err && (
        <div className="mb-3 flex items-start gap-2 text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded-lg p-2.5">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {err}
        </div>
      )}

      <ol className="space-y-2">
        {items.map((it) => {
          const isDone = it.status === "completed";
          const isProg = it.status === "in_progress";
          return (
            <li key={it.id}>
              <button
                type="button"
                onClick={() => advance(it.id)}
                disabled={pending || isDone}
                className={cn(
                  "w-full text-left flex items-start gap-3 p-3 rounded-xl transition disabled:opacity-100",
                  isDone ? "bg-emerald-50" : isProg ? "bg-amber-50" : "bg-slate-50 hover:bg-slate-100",
                )}
              >
                <span className={cn(
                  "w-7 h-7 rounded-full inline-flex items-center justify-center shrink-0 mt-0.5 text-xs font-bold",
                  isDone ? "bg-emerald-600 text-white" :
                  isProg ? "bg-amber-500 text-white animate-pulse" :
                  "bg-white border border-slate-300 text-slate-500",
                )}>
                  {isDone ? <CheckCircle2 className="w-3.5 h-3.5" /> : isProg ? <Loader2 className="w-3.5 h-3.5" /> : it.position}
                </span>
                <div className="min-w-0 flex-1">
                  <div className={cn(
                    "text-sm font-bold",
                    isDone ? "text-emerald-900 line-through" : "text-slate-900",
                  )}>
                    {it.title}
                  </div>
                  {it.notes && (
                    <div className={cn(
                      "text-xs mt-0.5 leading-snug",
                      isDone ? "text-emerald-800/70 line-through" : "text-slate-600",
                    )}>
                      {it.notes}
                    </div>
                  )}
                  <div className="text-[10px] mt-1 font-semibold uppercase tracking-wide text-slate-500">
                    {isDone ? "Done" : isProg ? "Tap when complete" : "Tap to start"}
                  </div>
                </div>
                <div className="text-xs font-semibold text-slate-700 tabular-nums shrink-0">
                  ${(it.itemPriceCents / 100).toFixed(2)}
                </div>
              </button>
            </li>
          );
        })}
      </ol>

      {completed === items.length && items.length > 0 && (
        <div className="mt-3 rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-900">
          All stops complete — tap <strong>Mark task complete</strong> on the booking to wrap up and trigger
          payment capture.
        </div>
      )}
    </div>
  );
}
