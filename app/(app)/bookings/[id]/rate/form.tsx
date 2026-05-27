"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Star, AlertCircle, ArrowLeft } from "lucide-react";
import { submitReviewAction } from "./actions";
import { cn } from "@/lib/cn";

export function RateForm({
  bookingId, serviceTitle, providerName, providerAvatar, bookingStatus,
}: {
  bookingId: string;
  serviceTitle: string;
  providerName: string;
  providerAvatar: string | null;
  bookingStatus: string;
}) {
  const [rating, setRating] = useState(5);
  const [hover, setHover] = useState(0);
  const [state, formAction, pending] = useActionState(submitReviewAction.bind(null, bookingId), undefined);

  if (bookingStatus !== "completed") {
    return (
      <div className="max-w-md mx-auto py-12 px-4 text-center">
        <h1 className="text-lg font-bold">Booking not yet completed</h1>
        <p className="text-sm text-slate-500 mt-2">You can rate once the provider marks the task complete.</p>
        <Link href="/bookings" className="mt-4 inline-block text-sm font-semibold text-brand-700">← Back to bookings</Link>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto py-8 px-4">
      <Link href="/bookings" className="inline-flex items-center gap-1 text-sm text-slate-500 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to bookings
      </Link>

      <div className="rounded-2xl bg-white border border-slate-100 p-6 text-center">
        {providerAvatar ? (
          <img src={providerAvatar} className="w-20 h-20 rounded-full mx-auto" alt="" />
        ) : (
          <div className="w-20 h-20 rounded-full bg-slate-100 mx-auto flex items-center justify-center text-2xl font-bold text-slate-400">
            {providerName[0]}
          </div>
        )}
        <h1 className="mt-4 text-2xl font-bold text-slate-900">How was your experience?</h1>
        <p className="mt-1 text-sm text-slate-500">
          Rate <strong>{providerName}</strong> for the <strong>{serviceTitle}</strong> task.
        </p>

        {state?.error && (
          <div className="mt-4 flex items-start gap-2 text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-xl p-3 text-left">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {state.error}
          </div>
        )}

        <form action={formAction} className="mt-6 space-y-4">
          <input type="hidden" name="rating" value={rating} />

          <div className="flex items-center justify-center gap-2" onMouseLeave={() => setHover(0)}>
            {[1, 2, 3, 4, 5].map((i) => {
              const filled = (hover || rating) >= i;
              return (
                <button
                  type="button"
                  key={i}
                  onClick={() => setRating(i)}
                  onMouseEnter={() => setHover(i)}
                  className="p-1"
                  aria-label={`${i} star${i > 1 ? "s" : ""}`}
                >
                  <Star className={cn("w-10 h-10 transition", filled ? "fill-amber-400 text-amber-400" : "text-slate-300")} />
                </button>
              );
            })}
          </div>

          <textarea
            name="comment"
            rows={4}
            placeholder="Anything you'd like to say? (optional)"
            className="w-full px-3 py-2.5 rounded-xl bg-white border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200 text-left"
          />

          <button
            type="submit"
            disabled={pending}
            className="w-full py-3 rounded-xl bg-brand-600 text-white text-sm font-semibold disabled:opacity-50"
          >
            {pending ? "Submitting…" : "Submit review"}
          </button>
        </form>
      </div>
    </div>
  );
}
