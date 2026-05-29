import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft, Repeat, Pause, Play, X, Calendar, Clock, MapPin, AlertCircle,
  ChevronRight, SkipForward,
} from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ClientDateTime } from "@/components/ClientDateTime";
import {
  describeRule, type Cadence, nextNOccurrenceDates, type RecurrenceRule,
} from "@/lib/recurrence-pure";
import { SeriesActionButtons } from "./action-buttons";

export const dynamic = "force-dynamic";

export default async function SeriesDetailPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: series } = await supabase
    .from("booking_series")
    .select(`
      *,
      service:services(id, title, image_url, eta_label),
      pickup:addresses!booking_series_pickup_address_id_fkey(formatted)
    `)
    .eq("id", id)
    .maybeSingle();
  if (!series) notFound();

  const { data: requests } = await supabase
    .from("requests")
    .select("id, status, scheduled_for, series_occurrence_date, created_at")
    .eq("series_id", id)
    .order("scheduled_for", { ascending: false })
    .limit(50);

  const rule: RecurrenceRule = {
    cadence: series.cadence as Cadence,
    weekday: series.weekday ?? undefined,
    dayOfMonth: series.day_of_month ?? undefined,
    timeOfDay: typeof series.time_of_day === "string" ? series.time_of_day.slice(0, 5) : "09:00",
    startDate: series.start_date,
    endDate: series.end_date,
    maxOccurrences: series.max_occurrences,
  };

  const isActive = series.status === "active";
  const isPaused = series.status === "paused";
  const isCancelled = series.status === "cancelled" || series.status === "completed";
  const upcomingPreview = isActive ? nextNOccurrenceDates(rule, new Date(), 5, series.occurrences_created) : [];

  return (
    <div className="px-4 lg:px-8 py-5 lg:py-8 max-w-3xl mx-auto pb-12">
      <Link
        href="/bookings"
        className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 mb-4 hover:text-brand-800"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> All bookings
      </Link>

      {/* Header */}
      <div className="rounded-2xl bg-white border border-slate-100 p-5 mb-5">
        <div className="flex items-start gap-4 flex-wrap">
          {series.service?.image_url && (
            <img src={series.service.image_url} alt="" className="w-16 h-16 rounded-xl object-cover shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <div className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-brand-700 mb-1">
              <Repeat className="w-3 h-3" /> Recurring series
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">{series.service?.title ?? "Series"}</h1>
            <p className="text-sm text-slate-600 mt-1">{describeRule(rule)}</p>
          </div>
          <StatusPill status={series.status} />
        </div>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <Meta
            icon={<Calendar className="w-3.5 h-3.5 text-brand-600" />}
            label="Started"
            value={new Date(series.start_date + "T00:00:00").toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}
          />
          <Meta
            icon={<Clock className="w-3.5 h-3.5 text-amber-600" />}
            label="Occurrences"
            value={series.max_occurrences ? `${series.occurrences_created} of ${series.max_occurrences}` : `${series.occurrences_created} so far`}
          />
          <Meta
            icon={<MapPin className="w-3.5 h-3.5 text-emerald-600" />}
            label="Pickup"
            value={(series as { pickup: { formatted: string } | null }).pickup?.formatted ?? "—"}
          />
        </div>

        {series.notes && (
          <div className="mt-4 text-xs text-slate-700 bg-slate-50 rounded-xl p-3">
            <div className="font-bold text-slate-900 mb-1">Notes for the helper</div>
            {series.notes}
          </div>
        )}

        <div className="mt-5 pt-4 border-t border-slate-100">
          <SeriesActionButtons
            seriesId={series.id}
            status={series.status}
          />
        </div>
      </div>

      {/* Upcoming */}
      {upcomingPreview.length > 0 && (
        <section className="rounded-2xl bg-white border border-slate-100 p-5 mb-5">
          <h2 className="text-sm font-bold text-slate-900 mb-3 inline-flex items-center gap-2">
            <Calendar className="w-4 h-4 text-brand-600" /> Coming up
          </h2>
          <ul className="space-y-1.5">
            {upcomingPreview.map((d, i) => (
              <li key={d} className="flex items-center gap-3 text-xs">
                <span className="text-[10px] font-bold text-slate-400 w-4 text-center">{i + 1}</span>
                <span className="text-slate-700">
                  {new Date(d + "T00:00:00").toLocaleDateString(undefined, {
                    weekday: "short", month: "long", day: "numeric", year: "numeric",
                  })}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-[10px] text-slate-500 mt-3 leading-snug">
            We materialise the next occurrence as a real booking 48 hours before its date so the matching engine has
            time to find a helper.
          </p>
        </section>
      )}

      {/* History */}
      <section className="rounded-2xl bg-white border border-slate-100 p-5">
        <h2 className="text-sm font-bold text-slate-900 mb-3 inline-flex items-center gap-2">
          <Clock className="w-4 h-4 text-slate-500" /> History
        </h2>
        {(requests?.length ?? 0) === 0 ? (
          <p className="text-xs text-slate-500 py-4 text-center">No occurrences yet — the first one is on its way.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {(requests ?? []).map((r) => (
              <li key={r.id}>
                <Link href={`/bookings`} className="flex items-center gap-3 py-2.5 hover:bg-slate-50 rounded-lg transition">
                  <span className="w-7 h-7 rounded-lg bg-slate-50 inline-flex items-center justify-center shrink-0">
                    <Calendar className="w-3.5 h-3.5 text-slate-500" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold text-slate-900">
                      {r.series_occurrence_date
                        ? new Date(r.series_occurrence_date + "T00:00:00").toLocaleDateString(undefined, {
                            weekday: "short", month: "short", day: "numeric",
                          })
                        : "—"}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      <ClientDateTime iso={r.scheduled_for ?? r.created_at} />
                    </div>
                  </div>
                  <RequestStatusPill status={r.status} />
                  <ChevronRight className="w-3 h-3 text-slate-300 shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {isCancelled && (
        <div className="mt-5 rounded-2xl bg-slate-100 border border-slate-200 p-4 text-xs text-slate-700">
          {series.status === "cancelled"
            ? "This series is cancelled. No more occurrences will be scheduled."
            : "This series has completed. All planned occurrences have been generated."}
        </div>
      )}
    </div>
  );
}

function Meta({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-slate-500 mb-0.5">
        {icon} {label}
      </div>
      <div className="text-xs font-bold text-slate-900 truncate">{value}</div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; tone: string }> = {
    active: { label: "Active", tone: "bg-emerald-50 text-emerald-700" },
    paused: { label: "Paused", tone: "bg-amber-50 text-amber-700" },
    cancelled: { label: "Cancelled", tone: "bg-rose-50 text-rose-700" },
    completed: { label: "Completed", tone: "bg-slate-100 text-slate-700" },
  };
  const cfg = map[status] ?? map.active;
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide ${cfg.tone}`}>
      {cfg.label}
    </span>
  );
}

function RequestStatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    matching: "bg-amber-50 text-amber-700",
    matched: "bg-brand-50 text-brand-700",
    cancelled: "bg-slate-100 text-slate-500",
    expired: "bg-rose-50 text-rose-700",
    draft: "bg-slate-100 text-slate-500",
  };
  const tone = map[status] ?? "bg-slate-100 text-slate-700";
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${tone}`}>{status}</span>;
}
