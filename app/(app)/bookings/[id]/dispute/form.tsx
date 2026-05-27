"use client";

import { useActionState } from "react";
import Link from "next/link";
import { AlertOctagon, AlertCircle, ArrowLeft } from "lucide-react";
import { openDisputeAction } from "./actions";

const CATEGORIES = [
  { value: "no_show", label: "Provider didn't show up" },
  { value: "quality", label: "Quality of work" },
  { value: "damage", label: "Damage to property" },
  { value: "billing", label: "Billing issue" },
  { value: "safety", label: "Safety concern" },
  { value: "other", label: "Something else" },
];

export function DisputeForm({
  bookingId, serviceTitle,
}: { bookingId: string; serviceTitle: string }) {
  const [state, formAction, pending] = useActionState(openDisputeAction.bind(null, bookingId), undefined);

  return (
    <div className="max-w-xl mx-auto py-8 px-4">
      <Link href={`/bookings/${bookingId}`} className="inline-flex items-center gap-1 text-sm text-slate-500 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to booking
      </Link>

      <div className="rounded-2xl bg-white border border-slate-100 p-6">
        <div className="flex items-start gap-3 mb-4">
          <span className="inline-flex w-10 h-10 rounded-xl bg-rose-50 items-center justify-center">
            <AlertOctagon className="w-5 h-5 text-rose-600" />
          </span>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Open a dispute</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              About: {serviceTitle}
            </p>
          </div>
        </div>

        <p className="text-sm text-slate-600 mb-5">
          Our team will review within 4 hours. Be as specific as you can —
          dates, what you expected, what actually happened, and any photos
          you have (upload coming once Storage is wired).
        </p>

        {state?.error && (
          <div className="mb-4 flex items-start gap-2 text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-xl p-3">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {state.error}
          </div>
        )}

        <form action={formAction} className="space-y-4">
          <label className="block">
            <span className="text-xs font-semibold text-slate-700">Category</span>
            <select
              name="category"
              required
              defaultValue=""
              className="mt-1 w-full px-3 py-2.5 rounded-xl bg-white border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
            >
              <option value="" disabled>Select a category</option>
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-slate-700">What happened?</span>
            <textarea
              name="description"
              rows={6}
              required
              minLength={20}
              placeholder="Describe the issue with specifics..."
              className="mt-1 w-full px-3 py-2.5 rounded-xl bg-white border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
            />
            <p className="text-[11px] text-slate-500 mt-1">Minimum 20 characters.</p>
          </label>

          <button
            type="submit"
            disabled={pending}
            className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-rose-600 text-white text-sm font-semibold disabled:opacity-50"
          >
            <AlertOctagon className="w-4 h-4" /> {pending ? "Submitting…" : "Submit dispute"}
          </button>
          <p className="text-[11px] text-slate-500 text-center">
            You can also email <a href="mailto:safety@helpward.com" className="text-brand-700 font-semibold">safety@helpward.com</a> for urgent issues.
          </p>
        </form>
      </div>
    </div>
  );
}
