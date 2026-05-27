"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, ArrowUp } from "lucide-react";
import { resolveDisputeAction } from "./actions";

export function ResolveButton({ disputeId }: { disputeId: string }) {
  const [open, setOpen] = useState(false);
  const [resolution, setResolution] = useState("");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const submit = (status: "resolved" | "escalated") => {
    if (resolution.trim().length < 10) {
      setErr("Please write at least 10 characters explaining the resolution.");
      return;
    }
    setErr(null);
    start(async () => {
      await resolveDisputeAction(disputeId, resolution.trim(), status);
      setOpen(false);
      setResolution("");
    });
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold"
      >
        Resolve dispute
      </button>
    );
  }

  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <label className="block">
        <span className="text-xs font-semibold text-slate-700">Resolution notes</span>
        <textarea
          value={resolution}
          onChange={(e) => setResolution(e.target.value)}
          rows={3}
          placeholder="What action was taken? (refund issued, provider warned, no fault found, escalated to legal...)"
          className="mt-1 w-full px-3 py-2 rounded-lg bg-white border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
        />
      </label>
      {err && <div className="mt-2 text-xs text-rose-700">{err}</div>}
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => submit("resolved")}
          disabled={pending}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold disabled:opacity-50"
        >
          <CheckCircle2 className="w-3.5 h-3.5" /> Mark resolved
        </button>
        <button
          type="button"
          onClick={() => submit("escalated")}
          disabled={pending}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-rose-600 text-white text-xs font-semibold disabled:opacity-50"
        >
          <ArrowUp className="w-3.5 h-3.5" /> Escalate
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); setErr(null); }}
          className="ml-auto text-xs text-slate-500"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
