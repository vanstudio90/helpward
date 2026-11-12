"use client";

import { useState, useTransition } from "react";
import { Timer, Loader2, Check } from "lucide-react";
import { setReplyTargetAction } from "@/app/(admin)/admin/inbox/actions";

/*
  THE RESPONSE TARGET, AND WHETHER THERE IS ONE.

  "Reply due" is a promise. The first version of this inbox hardcoded
  four hours, so every conversation was measured against a commitment
  nobody in the business had made — and "3 overdue" was a number the
  console had invented about itself.

  Now it is a setting with no default. Unset, nothing is overdue and
  this strip says so. Set, every clock in the console comes from it and
  changing it recomputes the open cases rather than leaving two
  generations of case measured differently.
*/

const CHOICES = [
  { label: "1 hour", minutes: 60 },
  { label: "4 hours", minutes: 240 },
  { label: "8 hours", minutes: 480 },
  { label: "1 day", minutes: 1440 },
];

export function ReplyTargetStrip({ minutes }: { minutes: number | null }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [editing, setEditing] = useState(false);

  const set = (value: number | null) =>
    start(async () => {
      const result = await setReplyTargetAction(value);
      setMessage({ ok: result.ok, text: result.ok ? result.message : result.error });
      if (result.ok) setEditing(false);
    });

  if (minutes !== null && !editing) {
    return (
      <p className="text-[12px] text-slate-600 flex flex-wrap items-center gap-1.5">
        <Timer className="w-3.5 h-3.5 text-brand-500" />
        <span>
          <span className="font-semibold text-slate-800">Reply target: {label(minutes)}</span>{" "}
          from the customer&apos;s last message. Everything called due or overdue comes from this.
        </span>
        <button onClick={() => setEditing(true)} className="font-semibold text-brand-700 hover:text-brand-800">
          Change
        </button>
        {message && <span className={message.ok ? "text-emerald-700" : "text-rose-700"}>{message.text}</span>}
      </p>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl px-3 py-2.5 flex flex-wrap items-center gap-2">
      <Timer className="w-4 h-4 text-slate-400" />
      <p className="text-[12px] text-slate-700 flex-1 min-w-[260px]">
        {minutes === null ? (
          <>
            <span className="font-semibold text-slate-900">No response target is configured.</span>{" "}
            Nothing is called due or overdue until one is set — the console will not invent a
            promise on your behalf.
          </>
        ) : (
          <>Currently {label(minutes)}. Pick a new target, or clear it.</>
        )}
      </p>
      {CHOICES.map((c) => (
        <button key={c.minutes} onClick={() => set(c.minutes)} disabled={pending}
          className={`text-[12px] font-semibold px-2.5 py-1 rounded-lg border disabled:opacity-50 ${
            minutes === c.minutes
              ? "bg-brand-600 border-brand-600 text-white"
              : "bg-white border-slate-200 text-slate-700 hover:border-brand-300"
          }`}>
          {minutes === c.minutes && <Check className="w-3 h-3 inline mr-1" />}
          {c.label}
        </button>
      ))}
      {minutes !== null && (
        <button onClick={() => set(null)} disabled={pending}
          className="text-[12px] font-semibold text-slate-500 hover:text-rose-700 px-2 py-1">
          Clear
        </button>
      )}
      {pending && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />}
      {message && (
        <span className={`text-[12px] ${message.ok ? "text-emerald-700" : "text-rose-700"}`}>
          {message.text}
        </span>
      )}
    </div>
  );
}

function label(minutes: number): string {
  if (minutes % 1440 === 0) return `${minutes / 1440} day${minutes === 1440 ? "" : "s"}`;
  if (minutes % 60 === 0) return `${minutes / 60} hour${minutes === 60 ? "" : "s"}`;
  return `${minutes} minutes`;
}
