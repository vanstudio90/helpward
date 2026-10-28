import Link from "next/link";
import { CheckCircle2, Clock, Search, Sparkles, XCircle, AlertCircle } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { ClientDateTime } from "@/components/ClientDateTime";
import { LiveRequestStatus, type LiveStage } from "./live-status";
import { formatMoney } from "@/lib/money";
import { one } from "@/lib/supabase/relation";

export default async function RequestSubmittedPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: request } = await supabase
    .from("requests")
    .select("*, service:services(title), pickup:addresses!requests_pickup_address_id_fkey(formatted, country)")
    .eq("id", id)
    .single();

  if (!request) notFound();

  // What is ACTUALLY happening, including the booking a helper may have
  // created since this page was first opened.
  const { data: booking } = await supabase
    .from("bookings")
    .select("id, status, payment_status, stripe_payment_intent_id, currency, total_cents, provider_id")
    .eq("request_id", id)
    .maybeSingle();

  const { data: helper } = booking?.provider_id
    ? await supabase.from("profiles").select("full_name").eq("id", booking.provider_id).maybeSingle()
    : { data: null };

  const stage: LiveStage =
    request.status === "cancelled" ? "cancelled"
    : !booking ? "matching"
    : booking.status === "completed" ? "completed"
    : booking.status === "in_progress" ? "in_progress"
    : booking.payment_status === "pending" && booking.stripe_payment_intent_id ? "confirm_card"
    : booking.payment_status === "failed" ? "confirm_card"
    : booking.payment_status === "authorized" || booking.payment_status === "captured" ? "ready"
    : "matched";

  // Before a booking exists there is no booking currency, and this
  // defaulted to USD — so a Vancouver request quoted CA$ on the form,
  // US$ here, then CA$ again once accepted. The pickup address has a
  // verified country; that is the one to read, and it is the same fact
  // accept_request uses (migration 0052).
  const pickupCountry =
    (one((request as { pickup?: { country?: string } | { country?: string }[] | null }).pickup)?.country) ?? "US";
  const quoteCurrency = (booking?.currency as string | undefined)
    ?? (pickupCountry === "CA" ? "CAD" : "USD");

  const copy = describeStatus(request.status as string);

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-12 max-w-xl mx-auto">
      <div className="text-center">
        <span className={`inline-flex w-16 h-16 rounded-full items-center justify-center mb-4 ${copy.iconWrap}`}>
          {copy.icon}
        </span>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">{copy.heading}</h1>
        <p className="mt-2 text-sm text-slate-600">{copy.sub}</p>
      </div>

      <div className="mt-6 rounded-2xl bg-white border border-slate-100 p-5">
        <dl className="text-sm space-y-3">
          <Row label="Service" value={request.service?.title ?? "—"} />
          <Row label="Address" value={request.pickup?.formatted ?? "—"} />
          <Row label="When" value={request.scheduled_for ? <ClientDateTime iso={request.scheduled_for} /> : "ASAP"} />
          <Row
            label={booking ? "Total" : "Estimated total"}
            value={
              request.estimated_price_cents
                ? `${formatMoney(booking?.total_cents ?? request.estimated_price_cents, quoteCurrency)} before an optional tip`
                : "—"
            }
          />
          <Row label="Status" value={
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${copy.badgeClass}`}>
              {copy.badgeIcon} {copy.badgeLabel}
            </span>
          } />
        </dl>
      </div>

      <div className="mt-6 rounded-2xl bg-brand-50 border border-brand-100 p-5">
        <div className="flex items-start gap-3">
          <Sparkles className="w-5 h-5 text-brand-600 shrink-0 mt-0.5" />
          <div>
            <div className="text-sm font-bold text-slate-900">{copy.nextTitle}</div>
            <p className="text-xs text-slate-600 mt-1 leading-relaxed">{copy.nextBody}</p>
          </div>
        </div>
      </div>

      {/* Replaces a pair of links that led AWAY from the thing the
          customer was waiting on. The screen now tracks the request and
          says what to do next, on the page they are already watching. */}
      <div className="mt-6">
        <LiveRequestStatus
          requestId={id}
          initialStage={stage}
          initialBookingId={booking?.id ?? null}
          initialHelperName={(helper?.full_name as string | null) ?? null}
          // Derived, not stored: there is no expires_at column. The
          // expire-stale-requests cron retires anything left in
          // 'matching' for 30 minutes, so that is the honest number —
          // and it is given as the cron's rule, not as a promise.
          expiresAt={
            request.created_at
              ? new Date(new Date(request.created_at as string).getTime() + 30 * 60_000).toISOString()
              : null
          }
        />
      </div>

      <div className="mt-4 text-center">
        <Link href="/new-request" className="text-xs font-semibold text-slate-500 underline underline-offset-2">
          Book something else
        </Link>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-slate-900 font-medium text-right">{value}</dd>
    </div>
  );
}

// The page used to render a fixed "Request submitted / Matching" success
// state regardless of the row's real status, so a cancelled or expired
// request still looked live when its URL was reopened (HW-08).
function describeStatus(status: string) {
  switch (status) {
    case "cancelled":
      return {
        heading: "Request cancelled",
        sub: "This request was cancelled and is no longer being offered to helpers.",
        icon: <XCircle className="w-8 h-8 text-rose-600" />,
        iconWrap: "bg-rose-50",
        badgeLabel: "Cancelled",
        badgeIcon: <XCircle className="w-3 h-3" />,
        badgeClass: "text-rose-700 bg-rose-50",
        nextTitle: "Need this done after all?",
        nextBody: "Nothing was charged. Start a new request whenever you're ready and it goes back out to nearby helpers.",
      };
    case "expired":
      return {
        heading: "Request expired",
        sub: "No helper accepted this request in time, so it was retired.",
        icon: <AlertCircle className="w-8 h-8 text-slate-500" />,
        iconWrap: "bg-slate-100",
        badgeLabel: "Expired",
        badgeIcon: <AlertCircle className="w-3 h-3" />,
        badgeClass: "text-slate-600 bg-slate-100",
        nextTitle: "What happened?",
        nextBody: "Requests expire when no approved helper nearby accepts them. Nothing was charged. Try again — scheduling it for a later time often helps.",
      };
    case "matched":
      return {
        // Not "on the way": there is no en-route state in the system, so
        // nothing here knows whether anyone has set off. The sub-line
        // already said only that the request was accepted, and the two
        // contradicted each other.
        heading: "Helper accepted",
        sub: "A helper accepted your request.",
        icon: <CheckCircle2 className="w-8 h-8 text-emerald-600" />,
        iconWrap: "bg-emerald-50",
        badgeLabel: "Matched",
        badgeIcon: <CheckCircle2 className="w-3 h-3" />,
        badgeClass: "text-emerald-700 bg-emerald-50",
        nextTitle: "What happens next?",
        nextBody: "Track the task and message your helper from Bookings. You're only charged after the task is marked complete.",
      };
    default:
      return {
        heading: "Request submitted",
        sub: "We're offering it to helpers near you.",
        icon: <CheckCircle2 className="w-8 h-8 text-emerald-600" />,
        iconWrap: "bg-emerald-50",
        badgeLabel: "Matching",
        badgeIcon: <Search className="w-3 h-3 animate-pulse" />,
        badgeClass: "text-amber-700 bg-amber-50",
        nextTitle: "What happens next?",
        nextBody: "Your request goes out to approved helpers nearby who offer this service. The first to accept gets the task and you'll be notified. If nobody accepts, the request expires on its own and you're not charged.",
      };
  }
}
