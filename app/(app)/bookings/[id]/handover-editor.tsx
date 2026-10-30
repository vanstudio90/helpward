"use client";

import { useState, useTransition } from "react";
import { Pencil, X, Lock, Info } from "lucide-react";
import type { HandoverSpec } from "@/lib/handover";
import { updateHandoverAction } from "../actions";

type Values = Record<string, Record<string, string>>;

/*
  Edit the handover instructions on a booking that already exists.

  WHAT IS NOT IN HERE. The address, the stops, the duration, the
  quantities and the service are the five things the quote was priced
  from. Changing one of them changes what the helper agreed to do and
  what they are being paid, so they cannot be edited beside a meeting
  point as if they were the same kind of thing. The panel at the bottom
  says so, and says what to do instead, rather than leaving the customer
  to discover it by looking for a field that is not there.

  ON FAILURE THE FORM KEEPS WHAT WAS TYPED. The draft lives in this
  component and is never cleared by an error — a save that fails on a
  flaky connection must not also throw away three sentences of access
  instructions.
*/
export function HandoverEditor({
  bookingId,
  spec,
  initial,
  canEdit,
}: {
  bookingId: string;
  spec: HandoverSpec;
  initial: Values;
  canEdit: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Values>(initial);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!canEdit) return null;

  const set = (section: string, field: string, value: string) => {
    setDraft((d) => ({ ...d, [section]: { ...(d[section] ?? {}), [field]: value } }));
    setError(null);
  };

  const save = () => {
    setError(null);
    setSaved(null);
    startTransition(async () => {
      const result = await updateHandoverAction(bookingId, draft);
      if (result.error) {
        // The draft is deliberately left alone.
        setError(result.error);
        return;
      }
      // Only now — the message follows the write, never precedes it.
      setSaved(result.success ?? "Instructions updated");
      setOpen(false);
    });
  };

  if (!open) {
    return (
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => { setOpen(true); setSaved(null); }}
          className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-brand-700 hover:text-brand-800"
        >
          <Pencil className="w-3.5 h-3.5" />
          Edit instructions
        </button>
        {saved && (
          <span className="text-[13px] font-medium text-emerald-700">{saved}</span>
        )}
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-card border border-slate-200 bg-slate-50/70 p-3 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[15px] font-bold text-slate-900">{spec.label}</div>
          <p className="text-[13px] text-slate-500">{spec.intro}</p>
        </div>
        <button
          type="button"
          onClick={() => { setOpen(false); setError(null); }}
          className="shrink-0 rounded-full p-1.5 text-slate-500 hover:bg-slate-200"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="mt-3 space-y-4">
        {spec.sections.map((section) => (
          <fieldset key={section.key}>
            <legend className="text-[13px] font-semibold text-slate-700">{section.title}</legend>
            <div className="mt-2 space-y-3">
              {section.fields.map((field) => {
                const value = draft[section.key]?.[field.key] ?? "";
                const id = `${section.key}-${field.key}`;
                return (
                  <div key={field.key}>
                    <label htmlFor={id} className="flex items-center gap-1.5 text-[13px] text-slate-600">
                      {field.label}
                      {!field.required && <span className="text-slate-400">(optional)</span>}
                      {field.private && <Lock className="w-3 h-3 text-slate-400" aria-label="Shared only with the helper who accepts" />}
                    </label>

                    {field.type === "select" ? (
                      <select
                        id={id}
                        value={value}
                        onChange={(e) => set(section.key, field.key, e.target.value)}
                        className="mt-1 w-full rounded-field border border-slate-200 bg-white px-3 py-2 text-[15px]"
                      >
                        <option value="">Not chosen</option>
                        {(field.options ?? []).map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    ) : field.type === "textarea" ? (
                      <textarea
                        id={id}
                        value={value}
                        maxLength={field.maxLength}
                        rows={3}
                        placeholder={field.placeholder}
                        onChange={(e) => set(section.key, field.key, e.target.value)}
                        className="mt-1 w-full rounded-field border border-slate-200 bg-white px-3 py-2 text-[15px]"
                      />
                    ) : (
                      <input
                        id={id}
                        type="text"
                        value={value}
                        maxLength={field.maxLength}
                        placeholder={field.placeholder}
                        onChange={(e) => set(section.key, field.key, e.target.value)}
                        className="mt-1 w-full rounded-field border border-slate-200 bg-white px-3 py-2 text-[15px]"
                      />
                    )}

                    {field.hint && <p className="mt-1 text-[12px] text-slate-500">{field.hint}</p>}
                  </div>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-field bg-white border border-slate-200 p-3 text-[13px] text-slate-600">
        <Info className="w-4 h-4 shrink-0 text-slate-400 mt-0.5" />
        <p>
          This changes the instructions only. The{" "}
          <strong className="font-semibold text-slate-800">address, stops, duration, quantities and service</strong>{" "}
          are what your quote was priced from, so they can&apos;t be changed here. Message your
          helper to agree the change, then cancel this booking and book again at the new
          price — nothing is charged until a booking is completed.
        </p>
      </div>

      {error && (
        <p className="mt-3 rounded-field bg-rose-50 border border-rose-200 px-3 py-2 text-[13px] text-rose-800">
          {error}
        </p>
      )}

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="rounded-field bg-brand-600 px-4 py-2 text-[15px] font-semibold text-white disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save instructions"}
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); setError(null); }}
          className="rounded-field px-3 py-2 text-[15px] font-medium text-slate-600 hover:bg-slate-200"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
