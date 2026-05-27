"use client";

import { useActionState } from "react";
import { updateProfileAction } from "./actions";
import { Edit3, AlertCircle, CheckCircle2 } from "lucide-react";

export function SettingsForm({
  initial,
}: { initial: { full_name: string; phone: string; country: string; email: string; avatar_url: string | null; email_verified: boolean } }) {
  const [state, formAction, pending] = useActionState(updateProfileAction, undefined);

  return (
    <div className="rounded-2xl bg-white border border-slate-100 p-4 sm:p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-bold text-slate-900">Profile Information</h2>
      </div>

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

      <form action={formAction} className="space-y-4">
        <div className="flex items-start gap-4">
          {initial.avatar_url ? (
            <img src={initial.avatar_url} className="w-20 h-20 rounded-full" alt="" />
          ) : (
            <div className="w-20 h-20 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xl font-bold">
              {initial.full_name?.[0] ?? "?"}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1 w-full min-w-0">
            <label className="block">
              <span className="text-[11px] text-slate-500">Full Name</span>
              <input
                name="full_name"
                defaultValue={initial.full_name}
                required
                className="mt-1 w-full px-3 py-2 rounded-lg bg-white border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
              />
            </label>
            <label className="block">
              <span className="text-[11px] text-slate-500">Phone Number</span>
              <input
                name="phone"
                type="tel"
                defaultValue={initial.phone}
                placeholder="+1 (604) 555-0123"
                className="mt-1 w-full px-3 py-2 rounded-lg bg-white border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="text-[11px] text-slate-500">Country</span>
              <select
                name="country"
                defaultValue={initial.country}
                className="mt-1 w-full px-3 py-2 rounded-lg bg-white border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200 appearance-none"
              >
                <option value="US">United States</option>
                <option value="CA">Canada</option>
              </select>
            </label>
          </div>
        </div>

        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 text-xs font-semibold text-brand-700 border border-brand-200 px-3 py-2 rounded-lg disabled:opacity-50"
        >
          <Edit3 className="w-3 h-3" /> {pending ? "Saving…" : "Save changes"}
        </button>
      </form>
    </div>
  );
}
