import Link from "next/link";
import {
  AlertTriangle, RefreshCw, Download, CalendarDays, XCircle, Settings2, Plus,
  Search, Info, FlaskConical, Wrench, CloudOff, Trash2, BarChart3, CheckCircle2,
  ChevronLeft, ChevronRight, ShieldQuestion,
} from "lucide-react";
import { getDataRequestsView, type DataRequestRow } from "@/lib/data/admin-data-requests";
import {
  EXPORT_LABEL, EXPORT_TONE, DELETION_LABEL, DELETION_TONE, DELETION_MEANING,
  type ExportState, type DeletionState,
} from "@/lib/admin-data-request-states";
import { DataRequestPanel } from "@/components/admin/DataRequestPanel";

/*
  DATA REQUESTS.

  THE HEADING MAKES NO COMPLIANCE CLAIM. A screen cannot certify that a
  business meets CCPA, PIPEDA or GDPR; it can describe the workflow and
  show what actually ran. The old page called itself a
  "CCPA, PIPEDA, and GDPR-compliance queue", which is a sentence no
  piece of software is in a position to write about itself.

  AVAILABILITY FOLLOWS THE CLOCK. An export whose link has expired is
  expired, whatever the stored status says — that was a real defect on
  the live page, where a row read READY beside an expiry date already
  in the past, and the derived state in this design is how it stays
  fixed.

  SCHEDULED IS NOT DELETED, and the summary cards keep them apart: two
  deletions scheduled is two people waiting, not two accounts gone.

  AND THE CLIENT IP IS NOT A COLUMN. It is a technical detail about a
  person and it lives behind a click in the panel.
*/

export const dynamic = "force-dynamic";

const TABS = [
  { key: "all", label: "All requests" },
  { key: "exports", label: "Data exports" },
  { key: "deletions", label: "Account deletion" },
  { key: "attention", label: "Needs attention" },
  { key: "history", label: "History" },
] as const;

export default async function AdminDataRequestsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const tab = (TABS.find((t) => t.key === params.tab)?.key ?? "all") as string;

  const view = await getDataRequestsView({
    tab,
    role: params.role ?? null,
    status: params.status ?? null,
    window: params.window ?? null,
    search: params.q ?? null,
    open: params.open ?? null,
  });

  const openId = params.open ?? view.selected?.id ?? null;
  const detail = openId && openId === view.selected?.id ? view.selected : null;
  const filtered = Boolean(params.q || params.role || params.status || params.window);
  const nothingAtAll = view.total_requests === 0 && !view.load_error;
  const noMatches = !nothingAtAll && view.rows.length === 0 && !view.load_error;

  const query = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (value) next.set(key, value);
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    return `/admin/data-requests?${next.toString()}`;
  };

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 pb-12 max-w-[1700px] mx-auto">
      <div className={detail ? "grid xl:grid-cols-[1fr_620px] gap-4 items-start" : ""}>
        <div className="min-w-0 space-y-4">
          <header className="flex flex-wrap items-start gap-3">
            <div className="min-w-0 flex-1">
              {!view.writable && (
            <div className="bg-sky-50 border border-sky-200 rounded-2xl px-4 py-3 flex items-start gap-2.5">
              <FlaskConical className="w-4 h-4 text-sky-600 mt-0.5 shrink-0" />
              <p className="text-[12px] text-sky-900">
                <span className="font-semibold">These are the real requests, read live.</span>{" "}
                Every state is derived rather than printed from the stored column — an expired link
                reads expired, and eligible never reads deleted. Acting on a request is not wired
                here yet.
              </p>
            </div>
          )}

          {view.sample && (
                <p className="text-[11px] font-bold uppercase tracking-wide text-violet-700">
                  Design concept · sample requests
                </p>
              )}
              <h1 className="text-[28px] leading-tight font-bold text-slate-900">Data requests</h1>
              <p className="text-[14px] text-slate-500 mt-0.5">
                Manage personal-data exports and account deletion.
              </p>
            </div>
            <button type="button" disabled={!view.writable}
              className="inline-flex items-center gap-1.5 bg-white border border-slate-200 text-[13px] font-semibold text-slate-700 px-3 py-2.5 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed">
              <Settings2 className="w-4 h-4" /> Processing settings
            </button>
            <button type="button" disabled={!view.writable}
              className="inline-flex items-center gap-1.5 bg-brand-600 text-white text-[13px] font-semibold px-4 py-2.5 rounded-xl disabled:bg-slate-200 disabled:text-slate-500 disabled:cursor-not-allowed">
              <Plus className="w-4 h-4" /> Record request
            </button>
          </header>

          {view.sample && (
            <div className="bg-violet-50 border border-violet-200 rounded-2xl px-4 py-3 flex items-start gap-2.5">
              <FlaskConical className="w-4 h-4 text-violet-600 mt-0.5 shrink-0" />
              <p className="text-[12px] text-violet-900">
                <span className="font-semibold">These requests are invented.</span>{" "}
                Nothing here generates a file, sends a notice or deletes anything. The real queue —
                with the two defects you spotted now fixed — is at{" "}
                <Link href="/admin/data-requests/classic" className="font-semibold underline underline-offset-2">
                  /admin/data-requests/classic
                </Link>. Wiring this design is{" "}
                <code className="text-[11px] bg-white/70 px-1 py-0.5 rounded">getDataRequestsView()</code>{" "}
                in <code className="text-[11px] bg-white/70 px-1 py-0.5 rounded">lib/data/admin-data-requests.ts</code>.
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5">
            <Count icon={AlertTriangle} tone="amber" label="Needs attention" value={view.counts.needs_attention}
              href={query({ tab: "attention" })} />
            <Count icon={RefreshCw} tone="sky" label="Exports processing" value={view.counts.exports_processing}
              href={query({ tab: "exports", status: "processing" })} />
            <Count icon={Download} tone="emerald" label="Exports available" value={view.counts.exports_available}
              href={query({ tab: "exports", status: "available" })} note="Link still valid" />
            <Count icon={CalendarDays} tone="violet" label="Deletions scheduled" value={view.counts.deletions_scheduled}
              href={query({ tab: "deletions" })} note="Not yet deleted" />
            <Count icon={XCircle} tone="rose" label="Failed" value={view.counts.failed}
              href={query({ tab: "attention", status: "failed" })} />
          </div>

          <nav className="flex flex-wrap items-center gap-5 border-b border-slate-200">
            {TABS.map((t) => (
              <Link key={t.key} href={query({ tab: t.key === "all" ? null : t.key, open: null })}
                className={`text-[13px] font-semibold pb-2.5 border-b-2 whitespace-nowrap ${
                  tab === t.key ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800"
                }`}>
                {t.label}
              </Link>
            ))}
            <Link href="/admin/data-requests/classic"
              className="ml-auto mb-2 inline-flex items-center gap-1.5 text-[12px] font-semibold text-slate-600 bg-white border border-slate-200 px-3 py-1.5 rounded-lg hover:border-brand-300 hover:text-brand-700">
              <Wrench className="w-3.5 h-3.5" /> Open the working queue
            </Link>
          </nav>

          <div className="flex flex-wrap items-end gap-2">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input placeholder="Search request or account"
                className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-brand-200" />
            </div>
            <Select label="Role" options={["All", "Customer", "Helper"]} />
            <Select label="Status" options={["All", "Processing", "Available", "Expired", "Scheduled", "Failed"]} />
            <Select label="Window" options={["Last 30 days", "Last 7 days", "Last 90 days", "Everything"]} />
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            {view.load_error ? (
              <div className="px-5 py-8 flex items-start gap-3">
                <CloudOff className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-[14px] font-semibold text-slate-900">
                    The request queue could not be loaded
                  </p>
                  <p className="text-[13px] text-slate-600 mt-0.5">{view.load_error}</p>
                  <p className="text-[13px] text-slate-600 mt-1">
                    This is a failed query, not an empty queue. Requests and their deadlines are
                    unaffected, and the workers carry on.
                  </p>
                </div>
              </div>
            ) : nothingAtAll ? (
              <Empty title="No data requests to show"
                body="Nobody has asked for an export or a deletion. New requests appear here as they arrive." />
            ) : noMatches ? (
              <Empty title="No matching requests"
                body={`Nothing matches these filters. There are ${view.total_requests} requests in total.`}
                action={{ label: "Clear filters", href: "/admin/data-requests" }} />
            ) : (
              <>
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-wide text-slate-400 bg-slate-50/60">
                      <th className="text-left font-semibold px-4 py-2">Request</th>
                      <th className="text-left font-semibold px-2 py-2">Account</th>
                      <th className="text-left font-semibold px-2 py-2">Type</th>
                      <th className="text-left font-semibold px-2 py-2">Status</th>
                      <th className="text-left font-semibold px-2 py-2">Key date</th>
                      <th className="text-left font-semibold px-4 py-2">Owner</th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.rows.map((row) => (
                      <Row key={row.id} row={row} href={query({ open: row.id })} selected={openId === row.id} />
                    ))}
                  </tbody>
                </table>

                <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-slate-100">
                  <span className="text-[12px] text-slate-500">
                    Showing 1–{view.rows.length} of {view.total_requests} · times in {view.timezone}
                  </span>
                  <div className="flex items-center gap-1">
                    <span className="w-8 h-8 grid place-items-center text-slate-300">
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </span>
                    {[1, 2, 3].map((n) => (
                      <span key={n} className={`w-8 h-8 grid place-items-center rounded-lg text-[12px] font-semibold ${
                        n === 1 ? "bg-brand-600 text-white" : "text-slate-600"
                      }`}>
                        {n}
                      </span>
                    ))}
                    <span className="w-8 h-8 grid place-items-center text-slate-400">
                      <ChevronRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            {/* PROCESSING HEALTH — observations, not promises */}
            <section className="bg-white rounded-2xl border border-slate-200 px-4 py-3">
              <h2 className="text-[14px] font-bold text-slate-900 flex items-center gap-1.5 mb-2">
                <BarChart3 className="w-4 h-4 text-brand-600" /> Processing health
              </h2>
              <ul className="divide-y divide-slate-100">
                {view.health.map((worker) => (
                  <li key={worker.key} className="flex items-center gap-2.5 py-2">
                    {/*
                      FIVE STATES, FIVE MARKS. An empty run is a tick,
                      because the worker did its job; a refused secret
                      is a cross, because it did not — and before the
                      run log existed both of those looked like the
                      grey question mark that means "no record".
                    */}
                    {worker.state === "healthy" || worker.state === "idle"
                      ? <CheckCircle2 className={`w-4 h-4 shrink-0 ${worker.state === "idle" ? "text-slate-400" : "text-emerald-500"}`} />
                      : worker.state === "failing" || worker.state === "unauthorized"
                        ? <XCircle className="w-4 h-4 text-rose-500 shrink-0" />
                        : <ShieldQuestion className="w-4 h-4 text-slate-300 shrink-0" />}
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] text-slate-800">{worker.label}</span>
                      <span className="block text-[11px] text-slate-500">{worker.detail}</span>
                    </span>
                    <span className="text-[12px] text-slate-500 shrink-0 text-right">
                      {worker.state === "never_run"
                        ? <span className="font-semibold text-slate-500">No run recorded</span>
                        : worker.last_run_at
                          ? <>Last run {worker.last_run_at}</>
                          : <Link href={query({ tab: "attention" })} className="font-semibold text-brand-700">Review failure →</Link>}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-[11px] text-slate-500 mt-2 flex items-start gap-1.5">
                <Info className="w-3.5 h-3.5 text-slate-400 mt-px shrink-0" />
                {view.health_note}
              </p>
            </section>

            {/* WHAT THE WORDS MEAN */}
            <section className="bg-white rounded-2xl border border-slate-200 px-4 py-3">
              <h2 className="text-[14px] font-bold text-slate-900 mb-2">Three states, not one</h2>
              <dl className="space-y-1.5">
                {(["scheduled", "eligible", "deleted"] as DeletionState[]).map((state) => (
                  <div key={state} className="flex items-start gap-2">
                    <dt className={`text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${DELETION_TONE[state]}`}>
                      {DELETION_LABEL[state]}
                    </dt>
                    <dd className="text-[12px] text-slate-600 min-w-0">{DELETION_MEANING[state]}</dd>
                  </div>
                ))}
              </dl>
              <p className="text-[11px] text-slate-500 mt-2">
                And &ldquo;partly completed&rdquo; exists because removing a login row proves nothing
                about the files beside it.
              </p>
            </section>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 px-4 py-3 flex items-start gap-2.5">
            <Info className="w-4 h-4 text-brand-500 mt-0.5 shrink-0" />
            <p className="text-[12px] text-slate-600">
              <span className="font-semibold text-slate-800">This screen describes a workflow. It does not certify compliance with anything.</span>{" "}
              An export link expires whatever the stored status says; a generated file is not proof
              that anybody received or opened it; and nothing irreversible happens from a row —
              destructive actions ask for a reason and record who gave it. Exact times are shown in{" "}
              {view.timezone}.
            </p>
          </div>
        </div>

        {detail && <DataRequestPanel detail={detail} sample={false} can={view.can} />}
      </div>
    </div>
  );
}

function Count({ icon: Icon, label, value, tone, href, note }: {
  icon: typeof Download; label: string; value: number;
  tone: "amber" | "sky" | "emerald" | "violet" | "rose"; href: string; note?: string;
}) {
  const tones = {
    amber: "bg-amber-50 border-amber-200 text-amber-600",
    sky: "bg-sky-50 border-sky-200 text-sky-600",
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-600",
    violet: "bg-violet-50 border-violet-200 text-violet-600",
    rose: "bg-rose-50 border-rose-200 text-rose-600",
  }[tone];
  return (
    <Link href={href} className={`rounded-2xl border px-3.5 py-3 min-w-0 hover:shadow-sm transition ${tones}`}>
      <span className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-700 min-w-0">
        <Icon className="w-4 h-4 shrink-0" />
        <span className="truncate">{label}</span>
      </span>
      <span className="block text-[22px] font-bold text-slate-900 leading-none tabular-nums whitespace-nowrap mt-1.5">
        {value}
      </span>
      {note && <span className="block text-[10px] text-slate-500 leading-tight mt-0.5">{note}</span>}
    </Link>
  );
}

function Empty({ title, body, action }: {
  title: string; body: string; action?: { label: string; href: string };
}) {
  return (
    <div className="px-6 py-14 text-center">
      <span className="w-14 h-14 rounded-2xl bg-violet-50 grid place-items-center mx-auto">
        <ShieldQuestion className="w-6 h-6 text-violet-400" />
      </span>
      <p className="text-[18px] font-bold text-slate-900 mt-3">{title}</p>
      <p className="text-[13px] text-slate-500 mt-1 max-w-sm mx-auto">{body}</p>
      {action && (
        <Link href={action.href}
          className="inline-block mt-4 text-[13px] font-semibold text-white bg-brand-600 hover:bg-brand-700 px-4 py-2 rounded-xl">
          {action.label}
        </Link>
      )}
    </div>
  );
}

function Select({ label, options }: { label: string; options: string[] }) {
  return (
    <label className="text-[11px] font-semibold text-slate-500">
      {label}
      <select className="mt-1 block appearance-none bg-white border border-slate-200 rounded-xl px-3 py-2 text-[13px] font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-200">
        {options.map((o) => <option key={o}>{o}</option>)}
      </select>
    </label>
  );
}

function Row({ row, href, selected }: { row: DataRequestRow; href: string; selected: boolean }) {
  const isExport = row.kind === "export";
  const tone = isExport
    ? EXPORT_TONE[row.state as ExportState]
    : DELETION_TONE[row.state as DeletionState];
  const label = isExport
    ? EXPORT_LABEL[row.state as ExportState]
    : DELETION_LABEL[row.state as DeletionState];
  /* The stored column and the shown state disagreeing is the defect
     this design exists to prevent, so where they differ the row says
     so on hover rather than hiding it. */
  const drifted = isExport && row.stored_status === "ready" && row.state === "expired";

  return (
    <tr className={`border-t border-slate-100 ${selected ? "bg-brand-50/60" : "hover:bg-slate-50"}`}>
      <td className="px-4 py-2.5">
        <Link href={href} className="font-semibold text-brand-700 tabular-nums">{row.id}</Link>
      </td>
      <td className="px-2 py-2.5">
        <Link href={href} className="block">
          <span className="block text-slate-900 font-medium truncate">{row.account.name}</span>
          <span className="block text-[11px] text-slate-500 capitalize">{row.account.role}</span>
        </Link>
      </td>
      <td className="px-2 py-2.5">
        <Link href={href} className="inline-flex items-center gap-1.5 text-slate-600">
          {isExport ? <Download className="w-3.5 h-3.5 text-slate-400" /> : <Trash2 className="w-3.5 h-3.5 text-slate-400" />}
          {isExport ? "Export" : "Deletion"}
        </Link>
      </td>
      <td className="px-2 py-2.5">
        <Link href={href}
          title={drifted ? "Stored status is still \"ready\", but the link has expired." : undefined}>
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${tone}`}>{label}</span>
        </Link>
      </td>
      <td className="px-2 py-2.5 text-slate-700">
        <Link href={href} className="block">
          <span className="text-[11px] text-slate-500">{row.key_date_label}</span>{" "}
          <span className="tabular-nums">{row.key_date ?? "—"}</span>
        </Link>
      </td>
      <td className="px-4 py-2.5">
        <Link href={href}>
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
            row.owner ? "bg-slate-100 text-slate-700" : "bg-amber-50 text-amber-800"
          }`}>
            {row.owner ?? "Unassigned"}
          </span>
        </Link>
      </td>
    </tr>
  );
}
