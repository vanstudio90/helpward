import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { AlertOctagon } from "lucide-react";
import { ResolveButton } from "./resolve";
import { ClientDateTime } from "@/components/ClientDateTime";

const TONE: Record<string, string> = {
  open: "bg-amber-50 text-amber-700",
  investigating: "bg-blue-50 text-blue-700",
  resolved: "bg-emerald-50 text-emerald-700",
  escalated: "bg-rose-50 text-rose-700",
};

const CAT_LABEL: Record<string, string> = {
  no_show: "No show",
  quality: "Quality",
  damage: "Damage",
  billing: "Billing",
  safety: "Safety",
  other: "Other",
};

export default async function AdminDisputesPage() {
  const supabase = createSupabaseServiceClient();
  const { data } = await supabase
    .from("disputes")
    .select(`
      id, category, description, status, resolution, created_at, resolved_at,
      booking:bookings(id, service:services(title), total_cents),
      opener:profiles!disputes_opened_by_fkey(full_name, avatar_url)
    `)
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-5xl mx-auto">
      <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 inline-flex items-center gap-2">
        <AlertOctagon className="w-6 h-6 text-rose-600" /> Disputes
      </h1>
      <p className="text-sm text-slate-500 mt-1 mb-5">
        {data?.length ?? 0} total · {(data ?? []).filter((d) => d.status === "open").length} open
      </p>

      {(data?.length ?? 0) === 0 ? (
        <div className="rounded-2xl bg-white border border-slate-100 p-12 text-center">
          <p className="text-sm text-slate-500">No disputes yet.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {(data ?? []).map((d) => {
            const booking = (d as { booking: { id: string; service: { title: string } | null; total_cents: number } | null }).booking;
            const opener = (d as { opener: { full_name: string; avatar_url: string | null } | null }).opener;
            return (
              <li key={d.id} className="rounded-2xl bg-white border border-slate-100 p-5">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${TONE[d.status]}`}>
                        {d.status.toUpperCase()}
                      </span>
                      <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700">
                        {CAT_LABEL[d.category] ?? d.category}
                      </span>
                      <span className="text-xs text-slate-500"><ClientDateTime iso={d.created_at} /></span>
                    </div>
                    <div className="text-sm font-bold text-slate-900 mt-2">
                      {booking?.service?.title ?? "—"} · ${((booking?.total_cents ?? 0) / 100).toFixed(2)}
                    </div>
                    <div className="text-xs text-slate-500">
                      Opened by {opener?.full_name ?? "?"} · booking #{booking?.id.slice(0, 8) ?? "—"}
                    </div>
                  </div>
                </div>

                <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700 whitespace-pre-wrap">
                  {d.description}
                </div>

                {d.resolution && (
                  <div className="mt-3 rounded-xl bg-emerald-50 border border-emerald-100 p-3 text-sm text-emerald-900">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Resolution</div>
                    <div className="mt-1">{d.resolution}</div>
                    {d.resolved_at && <div className="text-[11px] text-emerald-600 mt-2"><ClientDateTime iso={d.resolved_at} /></div>}
                  </div>
                )}

                {(d.status === "open" || d.status === "investigating") && (
                  <ResolveButton disputeId={d.id} />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
