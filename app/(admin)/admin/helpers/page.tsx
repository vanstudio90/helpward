import Link from "next/link";
import {
  AlertTriangle, ClipboardList, CheckCircle2, Info, Clock, UserCheck,
  ChevronLeft, ChevronRight, Users, Timer, UserX,
} from "lucide-react";
import { getHelperQueue, getHelperDetail, getAdmins, type HelperRow } from "@/lib/data/admin-helpers";
import { STATE_LABEL, STATE_TONE } from "@/lib/admin-helper-states";
import { getOverviewSnapshot } from "@/lib/data/admin-overview";
import { age } from "@/lib/admin-format";
import { HelperQueueControls } from "@/components/admin/HelperQueueControls";
import { HelperReviewPanel } from "@/components/admin/HelperReviewPanel";

/*
  THE APPROVAL QUEUE.

  What it replaced: a list of pending helpers with Approve and Reject
  beside each one and nothing in between. No way to see WHY an
  application was still open, no way to ask the applicant anything, no
  way to tell whose job it was — so thirty-three applications looked
  like one undifferentiated pile, and the ones blocked on us looked
  exactly like the ones blocked on a background check.

  The counters, the Requirements column and the panel's checklist all
  read helper_review_state (0100), so there is one answer to "why is
  this still here" and three places showing it.
*/

export const dynamic = "force-dynamic";

const PAGE_SIZE = 6;

export default async function AdminHelpersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const tab = (["queue", "all", "approved", "suspended"] as const)
    .find((t) => t === params.tab) ?? "queue";
  const page = Math.max(1, Number(params.page) || 1);

  /*
    THE PANEL'S READ TRAVELS WITH THE LIST. It is keyed off ?open= in
    the URL, not off anything the list returns, so waiting for the list
    first was a round trip spent queueing.
  */
  const [queue, admins, snapshot, detail] = await Promise.all([
    getHelperQueue({
      tab,
      region: params.region || null,
      owner: params.owner || null,
      state: params.state || null,
      search: params.q || null,
      sort: params.sort === "newest" ? "newest" : "oldest",
      includeReview: params.review === "1",
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
    getAdmins(),
    getOverviewSnapshot({ window: "30d", includeReview: params.review === "1" }),
    params.open ? getHelperDetail(params.open) : Promise.resolve(null),
  ]);


  if (!queue.ok) {
    return (
      <div className="px-6 py-10 max-w-3xl mx-auto">
        <div className="bg-white rounded-2xl border border-amber-200 p-6 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
          <div>
            <h1 className="text-lg font-bold text-slate-900">The helper queue could not be loaded</h1>
            <p className="text-[14px] text-slate-600 mt-1">{queue.error}</p>
          </div>
        </div>
      </div>
    );
  }

  const data = queue.data;
  const pages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
  const regions = snapshot.ok ? snapshot.data.regions.map((r) => r.name) : [];

  const query = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (value) next.set(key, value);
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    return `/admin/helpers?${next.toString()}`;
  };

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 pb-12 max-w-[1600px] mx-auto">
      <div className={detail?.ok && detail.data ? "grid xl:grid-cols-[1fr_440px] gap-4 items-start" : ""}>
        <div className="min-w-0 space-y-4">
          <header>
            <h1 className="text-[28px] leading-tight font-bold text-slate-900">Helpers</h1>
            <p className="text-[14px] text-slate-500 mt-0.5">
              Review applications. Manage readiness for work.
            </p>
          </header>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
            <Counter icon={ClipboardList} label="Pending review" value={data.counts.pending_review}
              href={query({ tab: null, state: null, page: null })} tone="slate" />
            <Counter icon={CheckCircle2} label="Ready for decision" value={data.counts.ready_for_decision}
              href={query({ tab: null, state: "ready", page: null })} tone="emerald" />
            <Counter icon={Info} label="Needs information" value={data.counts.needs_information}
              href={query({ tab: null, state: "info_requested", page: null })} tone="amber" />
            <Counter icon={Clock} label="Checks pending" value={data.counts.checks_pending}
              href={query({ tab: null, state: "background_pending", page: null })} tone="sky" />
            <Counter icon={UserCheck} label="Approved" value={data.counts.approved}
              href={query({ tab: "approved", state: null, page: null })} tone="brand" />
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <nav className="flex items-center gap-5 px-4 pt-3 border-b border-slate-100">
              {[
                { key: "queue", label: `Approval queue`, count: data.counts.pending_review },
                { key: "all", label: "All helpers", count: null },
                { key: "approved", label: "Approved", count: data.counts.approved },
                { key: "suspended", label: "Suspended", count: data.counts.suspended },
              ].map((t) => (
                <Link key={t.key} href={query({ tab: t.key === "queue" ? null : t.key, page: null, state: null })}
                  className={`text-[13px] font-semibold pb-2.5 border-b-2 ${
                    tab === t.key ? "border-brand-600 text-brand-700"
                      : "border-transparent text-slate-500 hover:text-slate-800"
                  }`}>
                  {t.label}
                  {t.count !== null && (
                    <span className={`ml-1.5 text-[11px] ${tab === t.key ? "text-brand-700" : "text-slate-400"}`}>
                      {t.count}
                    </span>
                  )}
                </Link>
              ))}
            </nav>

            <div className="px-4 py-3">
              <HelperQueueControls owners={data.owners} regions={regions} />
              <p className="flex items-center gap-1.5 text-[11px] text-slate-500 mt-2">
                <Info className="w-3.5 h-3.5 text-slate-400" />
                {params.review === "1"
                  ? "Showing App Review's controlled accounts alongside real applicants."
                  : "Review & test accounts excluded."}
              </p>
            </div>

            {data.rows.length === 0 ? (
              <p className="px-4 py-10 text-center text-[13px] text-slate-500">
                {tab === "queue" ? "No applications are waiting." : "Nothing matches these filters."}
              </p>
            ) : (
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wide text-slate-400 bg-slate-50/60">
                    <th className="text-left font-semibold px-4 py-2">Applicant</th>
                    <th className="text-left font-semibold px-2 py-2">Area &amp; services</th>
                    <th className="text-left font-semibold px-2 py-2">Requirements</th>
                    <th className="text-right font-semibold px-2 py-2">Waiting</th>
                    <th className="text-left font-semibold px-4 py-2">Owner</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row) => (
                    <QueueRow key={row.user_id} row={row}
                      href={query({ open: row.user_id })}
                      selected={params.open === row.user_id} />
                  ))}
                </tbody>
              </table>
            )}

            <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-slate-100">
              <span className="text-[12px] text-slate-500">
                {data.total === 0 ? "Nothing to show"
                  : `Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, data.total)} of ${data.total}`}
              </span>
              <div className="flex items-center gap-1">
                <PageLink href={query({ page: String(page - 1) })} disabled={page <= 1}>
                  <ChevronLeft className="w-3.5 h-3.5" /> Previous
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
                  Next <ChevronRight className="w-3.5 h-3.5" />
                </PageLink>
              </div>
            </div>
          </div>

          <section className="bg-white rounded-2xl border border-slate-200 px-4 py-3">
            <h2 className="text-[14px] font-bold text-slate-900 mb-2">Queue priorities</h2>
            <div className="flex flex-wrap items-center gap-2">
              <Priority icon={Timer} tone="amber"
                label={`${data.priorities.waiting_over_48h} waiting over 48h`}
                href={query({ tab: null, sort: "oldest", page: null })} />
              <Priority icon={UserX} tone="slate"
                label={`${data.priorities.unassigned} unassigned`}
                href={query({ tab: null, owner: null, page: null })} />
              <Priority icon={CheckCircle2} tone="emerald"
                label={`${data.priorities.ready_for_decision} ready for decision`}
                href={query({ tab: null, state: "ready", page: null })} />
            </div>
          </section>

          {/*
            The sentence the old page needed and did not have. Approval
            is a judgement about a person; dispatch readiness is a state
            their phone is in. Running them together is how a
            marketplace ends up with approved helpers nobody can book.
          */}
          <div className="bg-white rounded-2xl border border-slate-200 px-4 py-3 flex items-start gap-2.5">
            <Info className="w-4 h-4 text-brand-500 mt-0.5 shrink-0" />
            <p className="text-[12px] text-slate-600">
              <span className="font-semibold text-slate-800">
                Approval and dispatch readiness are separate.
              </span>{" "}
              An approved helper must also be online, reporting a recent location, payout-ready
              and offering the service before a job can reach them.
            </p>
          </div>
        </div>

        {detail?.ok && detail.data && (
          <HelperReviewPanel detail={detail.data} admins={admins} />
        )}
      </div>
    </div>
  );
}

function Counter({ icon: Icon, label, value, href, tone }: {
  icon: typeof Users; label: string; value: number; href: string;
  tone: "amber" | "brand" | "sky" | "emerald" | "slate";
}) {
  const tones = {
    amber: "bg-amber-50 border-amber-200 text-amber-700",
    brand: "bg-brand-50 border-brand-200 text-brand-700",
    sky: "bg-sky-50 border-sky-200 text-sky-700",
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-700",
    slate: "bg-white border-slate-200 text-slate-600",
  }[tone];
  return (
    <Link href={href} className={`rounded-2xl border px-3 py-2.5 hover:shadow-sm transition ${tones}`}>
      <span className="flex items-center gap-1.5 text-[12px] font-semibold">
        <Icon className="w-4 h-4" /> {label}
      </span>
      <span className="block text-[22px] font-bold text-slate-900 leading-tight mt-0.5 tabular-nums">
        {value}
      </span>
    </Link>
  );
}

function QueueRow({ row, href, selected }: { row: HelperRow; href: string; selected: boolean }) {
  return (
    <tr className={`border-t border-slate-100 ${selected ? "bg-brand-50/60" : "hover:bg-slate-50"}`}>
      <td className="px-4 py-2.5">
        <Link href={href} className="flex items-center gap-2.5">
          {row.avatar_url ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={row.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
          ) : (
            <span className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 grid place-items-center text-[11px] font-bold shrink-0">
              {(row.name ?? "?").slice(0, 2).toUpperCase()}
            </span>
          )}
          <span className="min-w-0">
            <span className="block font-semibold text-slate-900 leading-tight truncate">
              {row.name ?? "Applicant"}
            </span>
            <span className="block text-[12px] text-slate-500 tabular-nums">{row.ref}</span>
          </span>
        </Link>
      </td>
      <td className="px-2 py-2.5 text-slate-600">
        <Link href={href} className="block">
          {row.area ?? "—"} · {row.service_count} service{row.service_count === 1 ? "" : "s"}
        </Link>
      </td>
      <td className="px-2 py-2.5">
        <Link href={href}>
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATE_TONE[row.state]}`}>
            {STATE_LABEL[row.state]}
          </span>
        </Link>
      </td>
      <td className="px-2 py-2.5 text-right tabular-nums text-slate-600">
        <Link href={href}>{age(row.waiting_seconds)}</Link>
      </td>
      <td className="px-4 py-2.5">
        <Link href={href} className={row.owner_name ? "text-slate-700" : "text-slate-400"}>
          {row.owner_name ?? "Unassigned"}
        </Link>
      </td>
    </tr>
  );
}

function Priority({ icon: Icon, label, href, tone }: {
  icon: typeof Users; label: string; href: string; tone: "amber" | "slate" | "emerald";
}) {
  const tones = {
    amber: "bg-amber-50 text-amber-800 border-amber-200",
    slate: "bg-slate-50 text-slate-700 border-slate-200",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
  }[tone];
  return (
    <Link href={href} className={`inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-full border ${tones}`}>
      <Icon className="w-3.5 h-3.5" /> {label}
    </Link>
  );
}

function PageLink({ href, disabled, children }: {
  href: string; disabled: boolean; children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-slate-300 px-2.5 py-1.5">
        {children}
      </span>
    );
  }
  return (
    <Link href={href}
      className="inline-flex items-center gap-1 text-[12px] font-semibold text-slate-600 hover:text-brand-700 px-2.5 py-1.5">
      {children}
    </Link>
  );
}
