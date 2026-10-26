"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, UserCheck, CreditCard, Play, CheckCircle2, ArrowRight } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

// This screen used to render once and stop. A helper could accept
// thirty seconds later and the customer would still be reading "Finding
// a helper", with nothing to do but go back to the dashboard — so the
// one action standing between them and their job starting was invisible
// on the very screen they were watching.

export type LiveStage = "matching" | "matched" | "confirm_card" | "ready" | "in_progress" | "completed" | "cancelled";

const STAGES: Array<{ key: LiveStage; label: string; icon: React.ReactNode }> = [
  { key: "matching",     label: "Finding a helper", icon: <Search className="w-3.5 h-3.5" aria-hidden="true" /> },
  { key: "matched",      label: "Helper matched",   icon: <UserCheck className="w-3.5 h-3.5" aria-hidden="true" /> },
  { key: "confirm_card", label: "Confirm card",     icon: <CreditCard className="w-3.5 h-3.5" aria-hidden="true" /> },
  { key: "ready",        label: "Ready",            icon: <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" /> },
  { key: "in_progress",  label: "In progress",      icon: <Play className="w-3.5 h-3.5" aria-hidden="true" /> },
  { key: "completed",    label: "Completed",        icon: <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" /> },
];

export function LiveRequestStatus({
  requestId, initialStage, initialBookingId, initialHelperName, expiresAt,
}: {
  requestId: string;
  initialStage: LiveStage;
  initialBookingId: string | null;
  initialHelperName: string | null;
  /**
   * When the request stops looking for a helper.
   *
   * Derived from created_at plus the expire-stale-requests cron's
   * 30-minute rule — there is no stored expiry. The cron runs every 15
   * minutes, so this is "about then", and the copy says "around" rather
   * than naming a minute it cannot guarantee.
   */
  expiresAt: string | null;
}) {
  const router = useRouter();
  const [stage, setStage] = useState(initialStage);
  const [bookingId, setBookingId] = useState(initialBookingId);
  const [helperName, setHelperName] = useState(initialHelperName);

  // Watch the request and its booking. Realtime is already enabled on
  // both tables for dispatch and the admin inbox.
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`request-status:${requestId}`)
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "requests", filter: `id=eq.${requestId}` },
        () => router.refresh())
      .on("postgres_changes",
        { event: "*", schema: "public", table: "bookings", filter: `request_id=eq.${requestId}` },
        () => router.refresh())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [requestId, router]);

  // Server props are the source of truth; this keeps them in sync after a
  // refresh without flashing the old stage.
  useEffect(() => {
    setStage(initialStage);
    setBookingId(initialBookingId);
    setHelperName(initialHelperName);
  }, [initialStage, initialBookingId, initialHelperName]);

  const reached = STAGES.findIndex((s) => s.key === stage);
  const current = Math.max(0, reached);

  return (
    <div className="space-y-4">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1.5" aria-label="Request progress">
        {STAGES.map((s, i) => {
          const done = i < current;
          const now = i === current;
          return (
            <li key={s.key} className="flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                  now ? "bg-brand-600 text-white"
                  : done ? "bg-emerald-50 text-emerald-700"
                  : "bg-slate-100 text-slate-400"
                }`}
                aria-current={now ? "step" : undefined}
              >
                {s.icon} {s.label}
              </span>
              {i < STAGES.length - 1 && <span aria-hidden="true" className="text-slate-300">›</span>}
            </li>
          );
        })}
      </ol>

      {/* The next action, said plainly, on the screen they are watching. */}
      {stage === "confirm_card" && bookingId && (
        <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4" role="status">
          <div className="text-sm font-bold text-amber-950">
            {helperName ? `${helperName} is ready.` : "Your helper is ready."} Confirm your card to let them start.
          </div>
          <p className="text-xs text-amber-900/80 mt-0.5">
            A temporary hold, not a charge. You pay after the task is finished.
          </p>
          <Link
            href={`/bookings/${bookingId}/confirm-payment`}
            className="mt-2.5 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-amber-600 text-white text-sm font-semibold"
          >
            Confirm card <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </Link>
        </div>
      )}

      {stage === "matching" && (
        <p className="text-xs text-slate-500">
          This page updates on its own — you don&rsquo;t need to refresh.
          {expiresAt && (
            <> We&rsquo;ll stop looking around{" "}
              <time dateTime={expiresAt}>
                {new Date(expiresAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
              </time>{" "}
              if nobody accepts.
            </>
          )}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {bookingId ? (
          <Link
            href={`/bookings/${bookingId}`}
            className="flex-1 min-w-[12rem] inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-slate-900 text-white text-sm font-semibold"
          >
            View your request <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </Link>
        ) : (
          <Link
            href="/bookings"
            className="flex-1 min-w-[12rem] inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-slate-900 text-white text-sm font-semibold"
          >
            View your request <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </Link>
        )}
        {(stage === "matching" || stage === "matched") && (
          <Link
            href={`/bookings?cancel=${requestId}`}
            className="inline-flex items-center justify-center px-4 py-3 rounded-xl border border-slate-300 text-slate-600 text-sm font-semibold"
          >
            Cancel this request
          </Link>
        )}
      </div>
    </div>
  );
}
