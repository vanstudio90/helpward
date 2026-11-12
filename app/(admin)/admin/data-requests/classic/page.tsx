import { getCurrentUser } from "@/lib/auth/current-user";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Download, Trash2, Shield, AlertCircle, CheckCircle2, Clock } from "lucide-react";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";
import { ClientDateTime } from "@/components/ClientDateTime";
import { one } from "@/lib/supabase/relation";

// Admin queue for personal-data exports and account deletions. The
// workflow is described here; this screen does not certify compliance
// with any particular regime. Auto-processing is wired:
//   * /api/cron/process-data-exports runs every 30 minutes and flips
//     pending → ready (or → failed) for every export request.
//   * /api/cron/execute-account-deletions runs daily at 05:00 UTC and
//     deletes accounts whose grace_until has passed via the Supabase Auth
//     Admin REST API (cascading FKs handle the rest).
// This page is the operator view — eyes on failures + visibility into the
// queue. Manual SQL still works for one-offs.

/*
  WHAT THE OPERATOR SEES IS THE EFFECTIVE STATE, NOT THE STORED ONE.

  An export row read "READY" with an expiry date already in the past,
  because the column still said ready and nothing compared it to the
  clock. The link behind it was dead. A status that disagrees with the
  date printed beside it is worse than no status.
*/
function effectiveExportStatus(
  status: string,
  expiresAt: string | null,
): { label: string; expired: boolean } {
  const expired = Boolean(expiresAt && new Date(expiresAt).getTime() < Date.now());
  if (expired && status !== "failed") return { label: "expired", expired: true };
  return { label: status, expired: false };
}

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

/*
  THE WORKING QUEUE, kept as it was — with two defects fixed on the way
  past: an export read READY after its link had expired, and the
  requester's IP address sat in the list.

  /admin/data-requests now shows the agreed design, which reads nothing.
  This page is the only view of the real queue, so it stays.
*/
export default async function AdminDataRequestsClassicPage() {
  /* Memoised for this request — the layout verified it already. */
  const user = await getCurrentUser();
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
      <Link href="/admin/data-requests"
        className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-slate-500 hover:text-brand-700 mb-3">
        ← Back to Data requests
      </Link>
      <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 inline-flex items-center gap-2">
        <Shield className="w-6 h-6 text-brand-600" /> Data requests · working queue
      </h1>
      <p className="text-sm text-slate-500 mt-1 mb-5">
        Personal-data exports and account deletions. Exports are processed by a cron every 30 minutes;
        deletions run daily at 05:00 UTC once{" "}
        <code className="text-[11px] bg-slate-100 px-1 py-0.5 rounded">grace_until</code> passes.
        Failures show here with the captured reason. This screen describes the workflow — it does not
        by itself certify compliance with any regime, and a scheduled deletion is not a completed one.
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
              const u = one(r.user);
              return (
                <li key={r.id} className="p-4 flex items-start gap-3">
                  <Avatar name={u?.full_name} url={u?.avatar_url ?? null} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-slate-900">{u?.full_name ?? "?"}</span>
                      <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded uppercase">{u?.role ?? "?"}</span>
                      {(() => {
                        const state = effectiveExportStatus(r.status, r.expires_at);
                        return (
                          <span
                            title={state.expired
                              ? `Stored status is "${r.status}", but the link expired. The download no longer works.`
                              : undefined}
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${EXPORT_TONE[state.label] ?? EXPORT_TONE.expired}`}>
                            {state.label.toUpperCase()}
                          </span>
                        );
                      })()}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      Requested <ClientDateTime iso={r.requested_at} />
                      {r.completed_at && <> · Completed <ClientDateTime iso={r.completed_at} /></>}
                      {r.expires_at && <> · Expires <ClientDateTime iso={r.expires_at} /></>}
                    </div>
                    {/* The requester's IP is a technical detail about a
                        person, not a column. It stays behind a click. */}
                    {r.ip && (
                      <details className="mt-1">
                        <summary className="text-[11px] text-slate-400 cursor-pointer">Technical details</summary>
                        <div className="text-[11px] text-slate-500 mt-0.5">Client IP {r.ip}</div>
                      </details>
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
              const u = one(r.user);
              const past = r.status === "pending" && new Date(r.grace_until) <= new Date();
              return (
                <li key={r.id} className="p-4 flex items-start gap-3">
                  <Avatar name={u?.full_name} url={u?.avatar_url ?? null} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-slate-900">{u?.full_name ?? "?"}</span>
                      <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded uppercase">{u?.role ?? "?"}</span>
                      {/*
                        SCHEDULED, ELIGIBLE AND DELETED ARE DIFFERENT.
                        A request stored as "pending" whose grace has
                        passed is eligible — the work has not run — and
                        saying so is not the same as saying deleted.
                      */}
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${DEL_TONE[r.status]}`}>
                        {past ? "ELIGIBLE" : r.status.toUpperCase()}
                      </span>
                      {past && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700">
                          <Clock className="w-2.5 h-2.5" /> GRACE PASSED — NOT YET DELETED
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      Requested <ClientDateTime iso={r.requested_at} /> · Grace until <ClientDateTime iso={r.grace_until} />
                      {r.cancelled_at && <> · Cancelled <ClientDateTime iso={r.cancelled_at} /></>}
                      {r.executed_at && <> · Executed <ClientDateTime iso={r.executed_at} /></>}

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
