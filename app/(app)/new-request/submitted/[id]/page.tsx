import Link from "next/link";
import { CheckCircle2, Clock, Search, Sparkles, XCircle, AlertCircle } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { ClientDateTime } from "@/components/ClientDateTime";

export default async function RequestSubmittedPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: request } = await supabase
    .from("requests")
    .select("*, service:services(title), pickup:addresses!requests_pickup_address_id_fkey(formatted)")
    .eq("id", id)
    .single();

  if (!request) notFound();

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
          <Row label="Estimated price" value={request.estimated_price_cents ? `$${(request.estimated_price_cents / 100).toFixed(2)}` : "—"} />
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

      <div className="mt-6 flex gap-3">
        <Link href="/dashboard" className="flex-1 inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-slate-900 text-white text-sm font-semibold">
          Back to dashboard
        </Link>
        <Link href="/new-request" className="flex-1 inline-flex items-center justify-center gap-2 py-3 rounded-xl border border-brand-200 text-brand-700 text-sm font-semibold">
          Another request
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
        heading: "Helper on the way",
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
