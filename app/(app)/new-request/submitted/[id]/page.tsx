import Link from "next/link";
import { CheckCircle2, Clock, Search, Sparkles } from "lucide-react";
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

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-12 max-w-xl mx-auto">
      <div className="text-center">
        <span className="inline-flex w-16 h-16 rounded-full bg-emerald-50 items-center justify-center mb-4">
          <CheckCircle2 className="w-8 h-8 text-emerald-600" />
        </span>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Request submitted</h1>
        <p className="mt-2 text-sm text-slate-600">We're finding the best provider for you.</p>
      </div>

      <div className="mt-6 rounded-2xl bg-white border border-slate-100 p-5">
        <dl className="text-sm space-y-3">
          <Row label="Service" value={request.service?.title ?? "—"} />
          <Row label="Address" value={request.pickup?.formatted ?? "—"} />
          <Row label="When" value={request.scheduled_for ? <ClientDateTime iso={request.scheduled_for} /> : "ASAP"} />
          <Row label="Estimated price" value={request.estimated_price_cents ? `$${(request.estimated_price_cents / 100).toFixed(2)}` : "—"} />
          <Row label="Status" value={
            <span className="inline-flex items-center gap-1 text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full text-[10px] font-semibold">
              <Search className="w-3 h-3 animate-pulse" /> Matching
            </span>
          } />
        </dl>
      </div>

      <div className="mt-6 rounded-2xl bg-brand-50 border border-brand-100 p-5">
        <div className="flex items-start gap-3">
          <Sparkles className="w-5 h-5 text-brand-600 shrink-0 mt-0.5" />
          <div>
            <div className="text-sm font-bold text-slate-900">What happens next?</div>
            <p className="text-xs text-slate-600 mt-1 leading-relaxed">
              Once the matching engine is live (Phase 3 of the build), nearby providers
              will be notified instantly. The first to accept gets the task and you'll
              get a push notification. For now your request is saved and visible on your
              dashboard.
            </p>
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
