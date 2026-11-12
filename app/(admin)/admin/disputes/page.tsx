import { getCurrentUser } from "@/lib/auth/current-user";
import Link from "next/link";
import {
  Shield, Wrench, AlertTriangle, Users, Clock, CheckCircle2, FolderOpen,
  ChevronLeft, ChevronRight, ChevronRight as Caret, Download, Plus, Info,
} from "lucide-react";
import { getCaseQueue, getCaseDetail, type CaseRow } from "@/lib/data/admin-disputes";
import { getAdmins } from "@/lib/data/admin-helpers";
import {
  CASE_STATUS_LABEL, CASE_STATUS_TONE, CASE_PRIORITY_LABEL, CASE_PRIORITY_TONE,
} from "@/lib/admin-case-states";
import { age } from "@/lib/admin-format";
import { CaseQueueControls } from "@/components/admin/CaseQueueControls";
import { CasePanel } from "@/components/admin/CasePanel";
import { NewCaseDialog } from "@/components/admin/NewCaseDialog";

/*
  SAFETY & DISPUTES.

  SAFETY AND SERVICE ARE DIFFERENT WORK and the queue separates them.
  A report about somebody's conduct and a complaint about a half-done
  clean are the same table and nothing alike: one needs a reviewer
  today, the other needs a refund decision this week. Rendering them
  identically is how the first one waits behind the second.

  URGENT FIRST, then overdue reviews, then oldest — because a queue
  sorted by date alone buries the thing that matters under the things
  that arrived.

  AND A DEADLINE IS ONLY EVER ONE SOMEBODY SET. "Overdue reviews"
  counts cases carrying a next_review_at in the past. A case with no
  review time is not late; it simply has no promise attached, and the
  console does not invent one.
*/

export const dynamic = "force-dynamic";

const PAGE_SIZE = 5;

const TABS = [
  { key: "all", label: "All cases" },
  { key: "safety", label: "Safety reports" },
  { key: "service", label: "Service disputes" },
  { key: "resolved", label: "Resolved" },
] as const;

export default async function AdminDisputesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const tab = (TABS.find((t) => t.key === params.tab)?.key ?? "all") as
    "all" | "safety" | "service" | "resolved";

  /* The case file is keyed off ?open=; it does not wait for the queue. */
  const [queue, admins, detail] = await Promise.all([
    getCaseQueue({
      tab,
      region: params.region || null,
      owner: params.owner || null,
      priority: params.priority || null,
      status: params.status || null,
      search: params.q || null,
      includeReview: params.review === "1",
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
    getAdmins(),
    params.open ? getCaseDetail(params.open) : Promise.resolve(null),
  ]);


  /* The layout already verified this user for this request; this is
     the memoised answer, not a second call to the auth service. */
  const user = await getCurrentUser();
  const me = {
    id: user?.id ?? "unknown",
    name: admins.find((a) => a.id === user?.id)?.name ?? "A colleague",
  };

  /* A failed read says so. It must never be drawn as "no open cases". */
  if (!queue.ok) {
    return (
      <div className="px-6 py-10 max-w-3xl mx-auto">
        <div className="bg-white rounded-2xl border border-amber-200 p-6 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
          <div>
            <h1 className="text-lg font-bold text-slate-900">The case queue could not be loaded</h1>
            <p className="text-[14px] text-slate-600 mt-1">{queue.error}</p>
            <p className="text-[13px] text-slate-500 mt-2">
              This is a failed query, not an empty queue. Nothing has been lost.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const data = queue.data;
  const pages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
  const nothingAtAll = data.counts.open === 0 && data.counts.resolved_this_month === 0
    && !params.q && !params.region && !params.owner && !params.priority && !params.status;

  const query = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (value) next.set(key, value);
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    return `/admin/disputes?${next.toString()}`;
  };

  const exportHref = (() => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value && key !== "open" && key !== "page") next.set(key, value);
    }
    return `/api/admin/disputes/export?${next.toString()}`;
  })();

  const urgentUnassigned = data.rows.filter((r) => r.priority === "urgent" && !r.owner_id).length;

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 pb-12 max-w-[1700px] mx-auto">
      <div className={detail?.ok && detail.data ? "grid xl:grid-cols-[1fr_460px] gap-4 items-start" : ""}>
        <div className="min-w-0 space-y-4">
          <header className="flex flex-wrap items-start gap-3">
            <div className="min-w-0 flex-1">
              <h1 className="text-[28px] leading-tight font-bold text-slate-900">Safety &amp; disputes</h1>
              <p className="text-[14px] text-slate-500 mt-0.5">
                Review reports, protect people, document decisions.
              </p>
            </div>
            <a href={exportHref}
              className="inline-flex items-center gap-1.5 bg-white border border-slate-200 hover:border-slate-300 text-[13px] font-semibold text-slate-700 px-3 py-2.5 rounded-xl">
              <Download className="w-4 h-4" /> Export
            </a>
            <NewCaseDialog />
          </header>

          {/* THE FIVE SUMMARY CARDS */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5">
            <Card icon={FolderOpen} label="Open" value={data.counts.open} tone="slate"
              href={query({ tab: null, status: null, priority: null, page: null })} />
            <Card icon={AlertTriangle} label="Urgent" value={data.counts.urgent} tone="rose"
              href={query({ priority: "urgent", page: null })} />
            <Card icon={Users} label="Unassigned" value={data.counts.unassigned} tone="brand"
              href={query({ owner: "unassigned", page: null })} />
            <Card icon={Clock} label="Overdue reviews" value={data.counts.overdue_reviews} tone="amber"
              href={query({ page: null })} note="Only cases with a review time somebody set" />
            <Card icon={CheckCircle2} label="Resolved this month" value={data.counts.resolved_this_month}
              tone="emerald" href={query({ tab: "resolved", page: null })} />
          </div>

          <nav className="flex flex-wrap items-center gap-1.5">
            {TABS.map((t) => (
              <Link key={t.key} href={query({ tab: t.key === "all" ? null : t.key, page: null })}
                className={`text-[13px] font-semibold px-3 py-1.5 rounded-lg ${
                  tab === t.key ? "bg-brand-600 text-white" : "bg-white border border-slate-200 text-slate-600 hover:border-slate-300"
                }`}>
                {t.label}
                {t.key === "safety" && data.counts.safety_open > 0 && (
                  <span className={`ml-1.5 text-[11px] ${tab === t.key ? "text-white/80" : "text-slate-400"}`}>
                    {data.counts.safety_open}
                  </span>
                )}
                {t.key === "service" && data.counts.service_open > 0 && (
                  <span className={`ml-1.5 text-[11px] ${tab === t.key ? "text-white/80" : "text-slate-400"}`}>
                    {data.counts.service_open}
                  </span>
                )}
              </Link>
            ))}
            <span className="ml-auto text-[12px] text-slate-500">
              {params.review === "1" ? "Review & test cases included." : "Review & test cases excluded."}
            </span>
          </nav>

          <CaseQueueControls regions={data.regions} admins={admins} />

          {nothingAtAll ? (
            /* THE EMPTY STATE, only when the queue is genuinely empty —
               never beside a populated list. */
            <div className="bg-white rounded-2xl border border-slate-200 px-6 py-16 text-center">
              <Shield className="w-9 h-9 text-violet-300 mx-auto" />
              <p className="text-[18px] font-bold text-slate-900 mt-3">No open cases</p>
              <p className="text-[13px] text-slate-500 mt-1">New reports will appear here.</p>
              <div className="flex items-center justify-center gap-2 mt-4">
                <Link href={query({ tab: "resolved" })}
                  className="text-[13px] font-semibold text-slate-700 bg-white border border-slate-200 hover:border-slate-300 px-3.5 py-2 rounded-xl">
                  View resolved cases
                </Link>
                <NewCaseDialog />
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              {data.rows.length === 0 ? (
                <p className="px-4 py-10 text-center text-[13px] text-slate-500">
                  No cases match these filters.
                </p>
              ) : (
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-wide text-slate-400 bg-slate-50/60">
                      <th className="text-left font-semibold px-4 py-2">Case</th>
                      <th className="text-left font-semibold px-2 py-2">Type</th>
                      <th className="text-left font-semibold px-2 py-2">Priority</th>
                      <th className="text-left font-semibold px-2 py-2">Status</th>
                      <th className="text-left font-semibold px-2 py-2">Owner</th>
                      <th className="text-right font-semibold px-2 py-2">Age</th>
                      <th className="px-2 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((row) => (
                      <Row key={row.id} row={row} href={query({ open: row.id })}
                        selected={params.open === row.id} />
                    ))}
                  </tbody>
                </table>
              )}

              <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-slate-100">
                <span className="text-[12px] text-slate-500">
                  {data.total === 0
                    ? "Nothing to show"
                    : `Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, data.total)} of ${data.total}`}
                </span>
                <div className="flex items-center gap-1">
                  <PageLink href={query({ page: String(page - 1) })} disabled={page <= 1}>
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </PageLink>
                  {Array.from({ length: Math.min(3, pages) }, (_, i) => {
                    const n = Math.min(Math.max(1, page - 1), Math.max(1, pages - 2)) + i;
                    if (n > pages) return null;
                    return (
                      <Link key={n} href={query({ page: String(n) })}
                        className={`w-8 h-8 grid place-items-center rounded-lg text-[12px] font-semibold ${
                          n === page ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-100"
                        }`}>
                        {n}
                      </Link>
                    );
                  })}
                  <PageLink href={query({ page: String(page + 1) })} disabled={page >= pages}>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </PageLink>
                </div>
              </div>
            </div>
          )}

          {urgentUnassigned > 0 && (
            <Link href={query({ owner: "unassigned", priority: "urgent", page: null })}
              className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-center gap-2.5 hover:border-amber-300">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span className="text-[13px] text-amber-900 flex-1">
                <span className="font-semibold">
                  {urgentUnassigned} urgent report{urgentUnassigned === 1 ? " is" : "s are"} unassigned
                </span>{" "}
                on this page.
              </span>
              <span className="text-[12px] font-semibold text-white bg-brand-600 px-3 py-1.5 rounded-lg shrink-0">
                Assign reviewer
              </span>
            </Link>
          )}

          {/* TEAM WORKLOAD — straight from who owns what. */}
          {data.workload.length > 0 && (
            <section className="bg-white rounded-2xl border border-slate-200 px-4 py-3">
              <div className="flex items-center gap-2 mb-2">
                <h2 className="text-[13px] font-semibold text-slate-800 flex-1">Team workload</h2>
                <span className="text-[11px] text-slate-400">Open cases by owner</span>
              </div>
              <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {data.workload.map((w) => (
                  <li key={w.id ?? "unassigned"}>
                    <Link href={query({ owner: w.id ?? "unassigned", page: null })}
                      className="flex items-center gap-2 border border-slate-200 rounded-xl px-3 py-2 hover:border-brand-300">
                      <Users className="w-4 h-4 text-slate-400 shrink-0" />
                      <span className="text-[13px] text-slate-700 truncate flex-1">{w.name}</span>
                      <span className="text-[15px] font-bold text-slate-900 tabular-nums">{w.n}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="bg-white rounded-2xl border border-slate-200 px-4 py-3 flex items-start gap-2.5">
            <Info className="w-4 h-4 text-brand-500 mt-0.5 shrink-0" />
            <p className="text-[12px] text-slate-600">
              <span className="font-semibold text-slate-800">
                Resolving a case records a finding and nothing else.
              </span>{" "}
              Refunds and account restrictions are separate decisions, taken on their own screens
              with their own confirmations. Exports carry the management view only — never the
              report, the finding or anybody&apos;s name.
            </p>
          </div>
        </div>

        {detail?.ok && detail.data && (
          <CasePanel detail={detail.data} admins={admins} me={me} />
        )}
      </div>
    </div>
  );
}

function Card({ icon: Icon, label, value, href, tone, note }: {
  icon: typeof Users; label: string; value: number; href: string;
  tone: "slate" | "rose" | "brand" | "amber" | "emerald"; note?: string;
}) {
  const tones = {
    slate: "bg-white border-slate-200 text-slate-600",
    rose: "bg-rose-50 border-rose-200 text-rose-700",
    brand: "bg-brand-50 border-brand-200 text-brand-700",
    amber: "bg-amber-50 border-amber-200 text-amber-700",
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-700",
  }[tone];
  return (
    <Link href={href} className={`rounded-2xl border px-3.5 py-3 hover:shadow-sm transition flex items-center gap-3 ${tones}`}>
      <span className="w-10 h-10 rounded-xl bg-white/70 grid place-items-center shrink-0">
        <Icon className="w-5 h-5" />
      </span>
      <span className="min-w-0">
        <span className="block text-[12px] font-semibold text-slate-700">{label}</span>
        <span className="block text-[22px] font-bold text-slate-900 leading-tight tabular-nums">{value}</span>
        {note && <span className="block text-[10px] text-slate-500 leading-tight">{note}</span>}
      </span>
      <Caret className="w-4 h-4 text-slate-300 ml-auto shrink-0" />
    </Link>
  );
}

function Row({ row, href, selected }: { row: CaseRow; href: string; selected: boolean }) {
  const Icon = row.kind === "safety" ? Shield : Wrench;
  return (
    <tr className={`border-t border-slate-100 ${selected ? "bg-brand-50/60" : "hover:bg-slate-50"}`}>
      <td className="px-4 py-2.5">
        <Link href={href} className="block">
          <span className="block font-semibold text-brand-700 leading-tight tabular-nums">{row.ref}</span>
          <span className="block text-[12px] text-slate-600 truncate max-w-[220px]">{row.title}</span>
        </Link>
      </td>
      <td className="px-2 py-2.5">
        <Link href={href} className="inline-flex items-center gap-1.5 text-slate-600">
          <Icon className={`w-3.5 h-3.5 ${row.kind === "safety" ? "text-violet-500" : "text-slate-400"}`} />
          {row.kind === "safety" ? "Safety" : "Service"}
        </Link>
      </td>
      <td className="px-2 py-2.5">
        <Link href={href}>
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${CASE_PRIORITY_TONE[row.priority]}`}>
            {CASE_PRIORITY_LABEL[row.priority]}
          </span>
        </Link>
      </td>
      <td className="px-2 py-2.5">
        <Link href={href}>
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${CASE_STATUS_TONE[row.status]}`}>
            {CASE_STATUS_LABEL[row.status]}
          </span>
          {row.review_overdue && (
            <span className="ml-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700">
              Review due
            </span>
          )}
        </Link>
      </td>
      <td className="px-2 py-2.5 text-slate-700">
        <Link href={href} className="block truncate">
          {row.owner_name ?? <span className="text-slate-400">Unassigned</span>}
        </Link>
      </td>
      <td className="px-2 py-2.5 text-right tabular-nums text-slate-500">
        <Link href={href}>{age(row.age_seconds)}</Link>
      </td>
      <td className="px-2 py-2.5 text-right">
        <Link href={href} aria-label={`Open ${row.ref}`}>
          <Caret className="w-4 h-4 text-slate-300 inline" />
        </Link>
      </td>
    </tr>
  );
}

function PageLink({ href, disabled, children }: {
  href: string; disabled: boolean; children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <span className="w-8 h-8 grid place-items-center text-slate-300">{children}</span>
    );
  }
  return (
    <Link href={href} className="w-8 h-8 grid place-items-center rounded-lg text-slate-600 hover:bg-slate-100">
      {children}
    </Link>
  );
}
