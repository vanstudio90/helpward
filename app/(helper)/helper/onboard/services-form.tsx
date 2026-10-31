"use client";

import { useActionState } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { saveProviderServicesAction } from "./actions";
import type { ServiceWithCategory } from "@/lib/data/services";

// Replaces the checkbox grid that was never wired to anything.
export function HelperServicesForm({
  services, initialSelected, embedded = false,
}: {
  services: ServiceWithCategory[];
  initialSelected: string[];
  /** Rendered inside its own numbered step, which already has the card and
   *  the heading. Without this the step showed a card inside a card under a
   *  second copy of its own title. */
  embedded?: boolean;
}) {
  const [state, formAction, pending] = useActionState(saveProviderServicesAction, undefined);
  const selected = new Set(initialSelected);

  return (
    <form
      action={formAction}
      className={embedded ? "mt-2" : "mt-8 rounded-card bg-slate-50 border border-slate-100 p-5"}
    >
      {!embedded && (
        <div className="text-[15px] font-bold text-slate-900 mb-1">
          Services you offer ({services.length} available)
        </div>
      )}
      <p className="text-[13px] text-slate-500 mb-3">
        You&apos;ll only be offered tasks for the services you tick here.
        Choose at least one of the {services.length} available.
      </p>

      {state?.error && (
        <div className="mb-3 flex items-start gap-2 text-[13px] text-rose-700 bg-rose-50 border border-rose-100 rounded-field p-2.5">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {state.error}
        </div>
      )}
      {state?.success && (
        <div className="mb-3 flex items-start gap-2 text-[13px] text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-field p-2.5">
          <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {state.success}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[13px]">
        {services.map((s) => (
          <label key={s.id} className="flex items-center gap-2 p-2 rounded-field bg-white border border-slate-100 cursor-pointer hover:border-brand-300">
            <input
              type="checkbox"
              name="service_id"
              value={s.id}
              defaultChecked={selected.has(s.id)}
              className="w-4 h-4 rounded text-brand-600"
            />
            <span className="truncate">{s.title}</span>
          </label>
        ))}
      </div>

      <button
        type="submit"
        disabled={pending}
        className="mt-4 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-field bg-brand-600 text-white text-[15px] font-semibold disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save my services"}
      </button>

      <p className="text-[13px] text-slate-500 mt-3 leading-relaxed">
        Saving this is what puts you into the matching pool. You also need to be
        approved, online, and reporting a recent location before tasks reach you.
      </p>
    </form>
  );
}
