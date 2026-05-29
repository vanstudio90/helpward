import Link from "next/link";
import { redirect } from "next/navigation";
import { Download, Trash2, Shield, AlertCircle, CheckCircle2, Clock } from "lucide-react";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";
import { ClientDateTime } from "@/components/ClientDateTime";

// Admin queue for CCPA/PIPEDA/GDPR requests. v1 is read-only with manual
// processing — a follow-up round adds a cron that auto-assembles export
// archives and executes deletions after grace_until passes.

const EXPORT_TONE: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700",
  processing: "bg-blue-50 text-blue-700",
  ready: "bg-emerald-50 text-emerald-700",
  delivered: "bg-emerald-50 text-emerald-700",
  failed: "bg-rose-50 text-rose-700",
  expired: "bg-slate-100 text-slate-500",
};

const DEL_TONE: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700",
  cancelled: "bg-slate-100 text-slate-500",
  executing: "bg-blue-50 text-blue-700",
  executed: "bg-rose-100 text-rose-700",
  failed: "bg-rose-50 text-rose-700",
};

export default async function AdminDataRequestsPage() {
  const userClient = await createSupabaseServerClient();
  const { data: { user } } = await userClient.auth.getUser();
  if ((user?.app_metadata?.role as string | undefined) !== "admin") redirect("/login");

  const supabase = createSupabaseServiceClient();
  const [{ data: exports }, { data: deletions }] = await Promise.all([
    supabase
      .from("data_export_requests")
      .select(`
        id, status, requested_at, completed_at, expires_at, failure_reason, ip,
        user:profiles!data_export_requests_user_id_fkey(id, full_name, avatar_url, role)
      `)
      .order("requested_at", { ascending: false })
      .limit(100),
    supabase
      .from("account_deletion_requests")
      .select(`
        id, status, reason, requested_at, grace_until, executed_at, cancelled_at, failure_reason, ip,
        user:profiles!account_deletion_requests_user_id_fkey(id, full_name, avatar_url, role)
      `)
      .order("requested_at", { ascending: false })
      .limit(100),
  ]);

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-6xl mx-auto">
      <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 inline-flex items-center gap-2">
        <Shield className="w-6 h-6 text-brand-600" /> Data requests
      </h1>
      <p className="text-sm text-slate-500 mt-1 mb-5">
        CCPA, PIPEDA, and GDPR-compliance queue. Auto-processing cron ships next round; for now ops handles each
        manually and updates status via Supabase SQL.
      </p>

      <section className="mb-8">
        <h2 className="text-base font-bold text-slate-900 mb-3 inline-flex items-center gap-2">
          <Download className="w-4 h-4 text-brand-600" /> Data exports
          <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
            {exports?.length ?? 0}
          </span>
        </h2>
        {(exports?.length ?? 0) === 0 ? (
          <Empty text="No export requests yet." />
        ) : (
          <ul className="rounded-2xl bg-white border border-slate-100 divide-y divide-slate-100 overflow-hidden">
            {(exports ?? []).map((r) => {
              const u = (r as { user: { id: string; full_name: string; avatar_url: string | null; role: string } | null }).user;
              return (
                <li key={r.id} className="p-4 flex items-start gap-3">
                  <Avatar name={u?.full_name} url={u?.avatar_url ?? null} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-slate-900">{u?.full_name ?? "?"}</span>
                      <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded uppercase">{u?.role ?? "?"}</span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${EXPORT_TONE[r.status]}`}>
                        {r.status.toUpperCase()}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      Requested <ClientDateTime iso={r.requested_at} />
                      {r.completed_at && <> · Completed <ClientDateTime iso={r.completed_at} /></>}
                      {r.expires_at && <> · Expires <ClientDateTime iso={r.expires_at} /></>}
                      {r.ip && ` · ${r.ip}`}
                    </div>
                    {r.failure_reason && (
                      <div className="mt-1 text-[11px] text-rose-700 inline-flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" /> {r.failure_reason}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-base font-bold text-slate-900 mb-3 inline-flex items-center gap-2">
          <Trash2 className="w-4 h-4 text-rose-600" /> Account deletions
          <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
            {deletions?.length ?? 0}
          </span>
        </h2>
        {(deletions?.length ?? 0) === 0 ? (
          <Empty text="No deletion requests yet." />
        ) : (
          <ul className="rounded-2xl bg-white border border-slate-100 divide-y divide-slate-100 overflow-hidden">
            {(deletions ?? []).map((r) => {
              const u = (r as { user: { id: string; full_name: string; avatar_url: string | null; role: string } | null }).user;
              const past = r.status === "pending" && new Date(r.grace_until) <= new Date();
              return (
                <li key={r.id} className="p-4 flex items-start gap-3">
                  <Avatar name={u?.full_name} url={u?.avatar_url ?? null} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-slate-900">{u?.full_name ?? "?"}</span>
                      <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded uppercase">{u?.role ?? "?"}</span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${DEL_TONE[r.status]}`}>
                        {r.status.toUpperCase()}
                      </span>
                      {past && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700">
                          <Clock className="w-2.5 h-2.5" /> GRACE EXPIRED — DELETE NOW
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      Requested <ClientDateTime iso={r.requested_at} /> · Grace until <ClientDateTime iso={r.grace_until} />
                      {r.cancelled_at && <> · Cancelled <ClientDateTime iso={r.cancelled_at} /></>}
                      {r.executed_at && <> · Executed <ClientDateTime iso={r.executed_at} /></>}
                      {r.ip && ` · ${r.ip}`}
                    </div>
                    {r.reason && (
                      <p className="mt-1 text-[11px] text-slate-600 italic">&ldquo;{r.reason}&rdquo;</p>
                    )}
                    {r.failure_reason && (
                      <div className="mt-1 text-[11px] text-rose-700 inline-flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" /> {r.failure_reason}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <p className="mt-6 text-[11px] text-slate-400">
        Audit-trail: every status change is also written to{" "}
        <Link href="/admin/audit-log?action=user.data_export_requested" className="text-brand-700 hover:underline">audit-log</Link>.
      </p>
    </div>
  );
}

function Avatar({ name, url }: { name?: string | null; url: string | null }) {
  if (url) return <img src={url} alt="" className="w-9 h-9 rounded-full" />;
  return (
    <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 font-bold text-xs">
      {name?.[0] ?? "?"}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-2xl bg-white border border-slate-100 p-8 text-center">
      <CheckCircle2 className="w-5 h-5 text-emerald-600 mx-auto mb-1.5" />
      <p className="text-sm text-slate-500">{text}</p>
    </div>
  );
}
