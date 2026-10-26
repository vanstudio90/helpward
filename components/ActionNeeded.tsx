import Link from "next/link";
import { AlertTriangle, CreditCard, ArrowRight } from "lucide-react";

// The thing the customer has to do next, above everything else.
//
// A booking waiting on a bank challenge used to appear as "Scheduled"
// under Upcoming, with the dashboard saying "Nothing in progress" — so
// the one action standing between the customer and their helper starting
// looked like a job that was already under way.

export type PendingAction = {
  bookingId: string;
  serviceTitle: string;
  /** What the customer has to do. */
  kind: "confirm_card" | "card_declined";
};

export function ActionNeeded({ actions }: { actions: PendingAction[] }) {
  if (actions.length === 0) return null;

  return (
    <div className="mb-5 space-y-2">
      {actions.map((a) => {
        const declined = a.kind === "card_declined";
        return (
          <div
            key={a.bookingId}
            role="status"
            className={`rounded-2xl border p-4 flex flex-col sm:flex-row sm:items-center gap-3 ${
              declined
                ? "border-rose-200 bg-rose-50"
                : "border-amber-200 bg-amber-50"
            }`}
          >
            <span
              className={`w-10 h-10 rounded-xl inline-flex items-center justify-center shrink-0 ${
                declined ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"
              }`}
            >
              {declined
                ? <AlertTriangle className="w-5 h-5" aria-hidden="true" />
                : <CreditCard className="w-5 h-5" aria-hidden="true" />}
            </span>

            <div className="min-w-0 flex-1">
              <div className={`text-sm font-bold ${declined ? "text-rose-950" : "text-amber-950"}`}>
                {declined
                  ? "Your card was declined"
                  : "Your helper is ready. Confirm your card to let them start."}
              </div>
              <div className={`text-xs mt-0.5 ${declined ? "text-rose-900/80" : "text-amber-900/80"}`}>
                {a.serviceTitle}
                {declined
                  ? " — add a different card and we'll try again."
                  : " — they can't begin until the hold is in place."}
              </div>
            </div>

            <Link
              href={declined ? "/payments" : `/bookings/${a.bookingId}/confirm-payment`}
              className={`inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold shrink-0 ${
                declined ? "bg-rose-600 text-white" : "bg-amber-600 text-white"
              }`}
            >
              {declined ? "Use another card" : "Confirm card"}
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </Link>
          </div>
        );
      })}
    </div>
  );
}
