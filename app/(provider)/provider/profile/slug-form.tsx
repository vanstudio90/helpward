"use client";

import { useActionState } from "react";
import { Link2, AlertCircle, CheckCircle2 } from "lucide-react";
import { setProviderSlugAction } from "./actions";

// Helper-facing editor for the public URL slug. Pre-fills with the
// existing slug (auto-generated on signup); editing it persists via the
// RLS-scoped server action and surfaces a 23505 collision as a friendly
// "already taken" message instead of a raw db error.
export function SlugForm({ initial }: { initial: string | null }) {
  const [state, formAction, pending] = useActionState(setProviderSlugAction, undefined);

  return (
    <form action={formAction} className="rounded-2xl bg-white border border-slate-100 p-4 sm:p-5">
      <h2 className="text-base font-bold text-slate-900 inline-flex items-center gap-2 mb-1">
        <Link2 className="w-4 h-4 text-brand-600" /> Public profile URL
      </h2>
      <p className="text-xs text-slate-500 mb-3 leading-relaxed">
        Your shareable profile lives at <code className="text-[11px] bg-slate-100 px-1.5 py-0.5 rounded">helpward.com/providers/&lt;your-slug&gt;</code>.
        Pick something memorable — customers will see it on every shared link.
      </p>

      {state?.error && (
        <div className="mb-3 flex items-start gap-2 text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded-lg p-2.5">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {state.error}
        </div>
      )}
      {state?.success && (
        <div className="mb-3 flex items-start gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg p-2.5">
          <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {state.success}
        </div>
      )}

      <label className="flex items-center gap-0 rounded-lg overflow-hidden border border-slate-200 focus-within:ring-4 focus-within:ring-brand-100 focus-within:border-brand-400">
        <span className="px-3 py-2 bg-slate-50 text-xs text-slate-500 font-mono shrink-0">/providers/</span>
        <input
          type="text"
          name="slug"
          defaultValue={initial ?? ""}
          required
          minLength={3}
          maxLength={60}
          pattern="[a-z0-9][a-z0-9\-]*[a-z0-9]"
          placeholder="maya-r"
          className="flex-1 min-w-0 px-2 py-2 text-sm font-mono focus:outline-none"
          disabled={pending}
        />
      </label>
      <p className="text-[10px] text-slate-500 mt-1">
        Lowercase letters, numbers, and dashes only. 3–60 characters. Cannot start or end with a dash.
      </p>

      <button
        type="submit"
        disabled={pending}
        className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-600 text-white text-sm font-semibold disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save URL"}
      </button>
    </form>
  );
}
