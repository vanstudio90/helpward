import Link from "next/link";
import {
  Layers, Users, Settings2, Download, Bookmark, Search, Globe, RefreshCw,
  Info, FlaskConical, Wrench, CloudOff, ShieldCheck, ShieldAlert, ChevronLeft,
  ChevronRight, Link2, ExternalLink, AlertTriangle,
} from "lucide-react";
import { getAuditView, type AuditRow } from "@/lib/data/admin-audit";
import {
  OUTCOME_LABEL, OUTCOME_TONE, OUTCOME_MEANING, ACTOR_LABEL, ACTOR_TONE, TIMEZONES,
} from "@/lib/admin-audit-states";
import { AuditEventPanel } from "@/components/admin/AuditEventPanel";

/*
  AUDIT LOG.

  THE HEADLINE CLAIM IS CHECKED, NOT ASSERTED. "Read-only history" is
  a property of the database, and until migration 0109 it was false
  here: `authenticated` held UPDATE and DELETE on audit_log and the
  policy was FOR ALL, so any admin session could edit or erase its own
  trail through PostgREST. The banner therefore reads from
  `append_only_enforced` — a fact the view has to establish — and says
  the opposite, loudly, when it cannot.

  NOTHING CLAIMS TO BE TAMPER-PROOF OR COMPLETE. Append-only is a
  claim this product can now support. "Complete" would need coverage
  nobody has measured, so it is not written anywhere on this page.

  ORDERING IS DETERMINISTIC. Events share a second routinely — three in
  this database share a microsecond — so the list sorts by the instant
  AND a sequence, and shows the exact time on the event.

  AND AN ATTEMPT IS NOT AN OUTCOME: "Refund requested" is Submitted,
  "Refund confirmed" is Succeeded, and a denial is an event in its own
  right rather than a gap.
*/

export const dynamic = "force-dynamic";

export default async function AdminAuditLogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;

  const view = await getAuditView({
    window: params.window,
    actor: params.actor ?? null,
    action: params.action ?? null,
    outcome: params.outcome ?? null,
    search: params.q ?? null,
    timezone: params.tz ?? null,
    includeReview: params.review === "1",
    open: params.open ?? null,
  });

  const openId = params.open ?? view.selected?.id ?? null;
  const detail = openId && openId === view.selected?.id ? view.selected : null;
  const filtered = Boolean(params.q || params.actor || params.action || params.outcome || params.correlation);

  const query = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (value) next.set(key, value);
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    return `/admin/audit-log?${next.toString()}`;
  };

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 pb-12 max-w-[1700px] mx-auto">
      <div className={detail ? "grid xl:grid-cols-[1fr_560px] gap-4 items-start" : ""}>
        <div className="min-w-0 space-y-4">
          <header className="flex flex-wrap items-start gap-3">
            <div className="min-w-0 flex-1">
              <h1 className="text-[28px] leading-tight font-bold text-slate-900 flex flex-wrap items-center gap-2.5">
                Audit log
              </h1>
              <p className="text-[14px] text-slate-500 mt-0.5">
                Trace who did what, when and to which record.
              </p>
            </div>
            <button type="button" disabled={!view.writable}
              className="inline-flex items-center gap-1.5 bg-white border border-slate-200 text-[13px] font-semibold text-slate-700 px-3 py-2.5 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed">
              <Download className="w-4 h-4" /> Export
            </button>
            <button type="button" disabled={!view.writable}
              className="inline-flex items-center gap-1.5 bg-white border border-slate-200 text-[13px] font-semibold text-slate-700 px-3 py-2.5 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed">
              <Bookmark className="w-4 h-4" /> Saved views
            </button>
          </header>


          {/*
            THE CLAIM, AND WHETHER IT IS TRUE. This is the sentence the
            brief warns about: a console must not call its log read-only
            because the buttons are missing.
          */}
          {view.append_only_enforced ? (
            <div className="bg-brand-50/60 border border-brand-100 rounded-xl px-3.5 py-2.5 flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-brand-600 mt-0.5 shrink-0" />
              <p className="text-[12px] text-slate-700">
                <span className="font-semibold">Append-only history — a correction is a new event.</span>{" "}
                {view.append_only_detail} This page makes no claim to be tamper-proof or complete;
                it claims only that nothing here can be amended or removed through the application.
              </p>
            </div>
          ) : (
            <div className="bg-rose-50 border border-rose-200 rounded-xl px-3.5 py-2.5 flex items-start gap-2.5">
              <ShieldAlert className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
              <p className="text-[12px] text-rose-900">
                <span className="font-semibold">This log is editable.</span>{" "}
                {view.append_only_detail} Until that is fixed, treat what follows as a record of
                what somebody chose to leave here.
              </p>
            </div>
          )}

          {/*
            THE BANNER SAYS WHAT IS ACTUALLY INCOMPLETE.

            It read "Events are known to be missing" over a sentence
            about unrecorded ROLES — which is a different and much
            worse claim. Nothing is missing from this trail; some of
            the older entries cannot say what role their actor held.
            Describing that as a missing event would send somebody
            looking for a hole that is not there.
          */}
          {view.logging_gap && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-2.5 flex items-start gap-2.5">
              <Info className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
              <p className="text-[12px] text-amber-900">
                <span className="font-semibold">Some entries cannot say what the actor was.</span>{" "}
                {view.logging_gap} The events themselves are all here — it is the role beside them
                that is unknown, and an unknown role is not the same as nothing having happened.
              </p>
            </div>
          )}

          {/*
            THE FILTERS SUBMIT. A control that looks like a filter and
            does nothing is how somebody concludes an event is absent
            when they simply never narrowed the window.
          */}
          <form method="get" action="/admin/audit-log" className="flex flex-wrap items-center gap-2">
            {params.review === "1" && <input type="hidden" name="review" value="1" />}
            {params.open && <input type="hidden" name="open" value={params.open} />}
            <div className="relative flex-1 min-w-[220px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input name="q" defaultValue={params.q ?? ""}
                placeholder="Search event, actor, record or request ID"
                className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-brand-200" />
            </div>
            <Select name="window" value={params.window}
              options={["Last 7 days", "Last 24 hours", "Last 30 days", "Everything"]} />
            <Select name="actor" value={params.actor}
              options={["Actor: All", "Staff", "Customers", "Helpers", "System"]} />
            <Select name="outcome" value={params.outcome}
              options={["Outcome: All", "Succeeded", "Submitted", "Denied", "Failed"]} />
            <button type="submit"
              className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-white bg-brand-600 px-3 py-2 rounded-xl hover:bg-brand-700">
              <Settings2 className="w-3.5 h-3.5" /> Apply
            </button>
          </form>

          <div className="flex flex-wrap items-center gap-2">
            {/* TEST ACTIVITY IS FILTERED, NEVER DELETED. */}
            <Link href={query({ review: params.review === "1" ? null : "1" })}
              className={`inline-flex items-center gap-2 text-[12px] font-medium px-3 py-2 rounded-xl border ${
                params.review === "1" ? "bg-amber-50 border-amber-200 text-amber-800" : "bg-white border-slate-200 text-slate-600"
              }`}>
              <FlaskConical className="w-3.5 h-3.5" />
              Review &amp; test activity: {params.review === "1" ? "included" : "excluded"}
            </Link>
            <span className="text-[11px] text-slate-500">
              Excluded events stay recorded and remain searchable — the filter hides them, nothing
              removes them.
            </span>

            <span className="ml-auto inline-flex items-center gap-1.5 text-[12px] font-medium text-slate-600 bg-white border border-slate-200 px-3 py-2 rounded-xl">
              <Globe className="w-3.5 h-3.5 text-slate-400" />
              {view.timezone.split(" ")[0]}
              <span className="text-slate-400">({TIMEZONES.length} available)</span>
            </span>
            <button type="button" disabled={!view.writable}
              className="inline-flex items-center gap-1.5 text-[12px] font-medium text-slate-600 bg-white border border-slate-200 px-3 py-2 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed">
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <Count icon={Layers} label="Events in view" value={view.counts.events_in_view} />
            <Count icon={Users} label="Staff actions" value={view.counts.staff_actions} />
            <Count icon={Settings2} label="System events" value={view.counts.system_events} />
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            {view.load_error ? (
              <div className="px-5 py-8 flex items-start gap-3">
                <CloudOff className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-[14px] font-semibold text-slate-900">The trail could not be loaded</p>
                  <p className="text-[13px] text-slate-600 mt-0.5">{view.load_error}</p>
                  <p className="text-[13px] text-slate-600 mt-1">
                    This is a failed query, not an empty history. Events continue to be recorded.
                  </p>
                </div>
              </div>
            ) : view.rows.length === 0 ? (
              <div className="px-6 py-14 text-center">
                <p className="text-[16px] font-bold text-slate-900">
                  {filtered ? "No events match these filters" : "No events recorded yet"}
                </p>
                <p className="text-[13px] text-slate-500 mt-1">
                  {filtered
                    ? "Widen the window or clear a filter."
                    : "Privileged actions appear here as they happen."}
                </p>
                {filtered && (
                  <Link href="/admin/audit-log" className="inline-block mt-3 text-[13px] font-semibold text-brand-700">
                    Clear filters
                  </Link>
                )}
              </div>
            ) : (
              <>
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-wide text-slate-400 bg-slate-50/60">
                      <th className="text-left font-semibold px-4 py-2">Time ↓</th>
                      <th className="text-left font-semibold px-2 py-2">Actor</th>
                      <th className="text-left font-semibold px-2 py-2">Action</th>
                      <th className="text-left font-semibold px-2 py-2">Record</th>
                      <th className="text-left font-semibold px-4 py-2">Outcome</th>
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
                    Showing 1–{view.rows.length} of {view.total_rows} · newest first, ties broken by
                    sequence
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
            <section className="bg-white rounded-2xl border border-slate-200 px-4 py-3">
              <h2 className="text-[13px] font-semibold text-slate-800 flex items-center gap-1.5 mb-1.5">
                <Info className="w-4 h-4 text-brand-600" /> Finding a history
              </h2>
              <p className="text-[12px] text-slate-600">
                Search a record ID — BK-, SF-, RF-, CU- — for everything that touched it. Search a
                request ID to follow one action through the attempt, the server&apos;s work and the
                outcome.
              </p>
              <Link href="/admin/audit-log" className="mt-2 inline-block text-[12px] font-semibold text-brand-700">
                Clear filters
              </Link>
            </section>

            <section className="bg-white rounded-2xl border border-slate-200 px-4 py-3">
              <h2 className="text-[13px] font-semibold text-slate-800 flex items-center gap-1.5 mb-1.5">
                <Link2 className="w-4 h-4 text-brand-600" /> Attempts and outcomes
              </h2>
              <dl className="space-y-1">
                {(["submitted", "succeeded", "denied", "failed"] as const).map((o) => (
                  <div key={o} className="flex items-start gap-2">
                    <dt className={`text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${OUTCOME_TONE[o]}`}>
                      {OUTCOME_LABEL[o]}
                    </dt>
                    <dd className="text-[12px] text-slate-600 min-w-0">{OUTCOME_MEANING[o]}</dd>
                  </div>
                ))}
              </dl>
            </section>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 px-4 py-3 flex items-start gap-2.5">
            <Wrench className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
            <p className="text-[12px] text-slate-600 flex-1">
              An actor&apos;s role is the role they held when they acted, saved with the event. Looking it
              up from the profile today would relabel history every time somebody&apos;s role changes —
              and in this product the admin claim lives in the session rather than the profile row,
              so a lookup can be wrong immediately, not just eventually.
            </p>
            <Link href="/admin/audit-log/classic"
              className="text-[12px] font-semibold text-slate-600 bg-white border border-slate-200 px-3 py-1.5 rounded-lg hover:border-brand-300 hover:text-brand-700 shrink-0">
              Open the real trail
            </Link>
          </div>
        </div>

        {detail && <AuditEventPanel detail={detail} sample={!view.writable} />}
      </div>
    </div>
  );
}

function Count({ icon: Icon, label, value }: { icon: typeof Layers; label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 flex items-center gap-3 min-w-0">
      <span className="w-10 h-10 rounded-xl bg-violet-50 grid place-items-center shrink-0">
        <Icon className="w-5 h-5 text-violet-600" />
      </span>
      <span className="min-w-0">
        <span className="block text-[12px] font-semibold text-slate-600 truncate">{label}</span>
        <span className="block text-[22px] font-bold text-slate-900 leading-none tabular-nums whitespace-nowrap mt-0.5">
          {value}
        </span>
      </span>
    </div>
  );
}

function Select({ name, value, options }: { name: string; value?: string; options: string[] }) {
  return (
    <select name={name} defaultValue={value ?? options[0]}
      className="appearance-none bg-white border border-slate-200 rounded-xl px-3 py-2 text-[13px] font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-200">
      {options.map((o) => <option key={o}>{o}</option>)}
    </select>
  );
}

function Row({ row, href, selected }: { row: AuditRow; href: string; selected: boolean }) {
  return (
    <tr className={`border-t border-slate-100 ${selected ? "bg-brand-50/60" : "hover:bg-slate-50"}`}>
      <td className="px-4 py-2.5 text-slate-600 tabular-nums">
        <Link href={href} className="block" title={row.occurred_exact}>{row.occurred_at}</Link>
      </td>
      <td className="px-2 py-2.5">
        {/* THE SAME NAME AS THE PANEL. One person, one name. */}
        <Link href={href} className="block">
          <span className="block font-semibold text-slate-900 truncate">{row.actor.name}</span>
          <span className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded ${ACTOR_TONE[row.actor.kind]}`}>
            {row.actor.role_at_event || ACTOR_LABEL[row.actor.kind]}
          </span>
          {/*
            THE CORRECTION BELONGS BESIDE THE NAME IT GETS WRONG.
            Events 13–15 on this database name a customer who did
            nothing; a migration's self-test borrowed their id. Hiding
            that behind a click means the wrong name is what a reader
            carries away.
          */}
          {row.correction && (
            <span className="mt-1 flex items-start gap-1 text-[10px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
              <AlertTriangle className="w-3 h-3 mt-px shrink-0" />
              <span className="min-w-0">
                {row.correction.label}
                <span className="block font-medium text-amber-700/90">
                  Corrected by {row.correction.id}
                </span>
              </span>
            </span>
          )}
        </Link>
      </td>
      <td className="px-2 py-2.5 text-slate-700">
        <Link href={href} title={row.action_code}>{row.action}</Link>
      </td>
      <td className="px-2 py-2.5">
        {row.record ? (
          row.record.missing ? (
            <span className="text-[12px] text-amber-700" title="The record this event refers to has been removed.">
              {row.record.label} (removed)
            </span>
          ) : (
            <Link href={row.record.href ?? href}
              className="font-semibold text-brand-700 tabular-nums inline-flex items-center gap-1">
              {row.record.label}
              {row.record.href && <ExternalLink className="w-3 h-3 text-slate-300" />}
            </Link>
          )
        ) : (
          <span className="text-slate-400">—</span>
        )}
      </td>
      <td className="px-4 py-2.5">
        <Link href={href} title={OUTCOME_MEANING[row.outcome]}>
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${OUTCOME_TONE[row.outcome]}`}>
            {OUTCOME_LABEL[row.outcome]}
          </span>
        </Link>
      </td>
    </tr>
  );
}
