"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  X, ExternalLink, ShieldCheck, Download, Layers, Clock, Lock, Info,
  FileText, MessageSquare, ChevronDown, AlertTriangle, CheckCircle2,
  Circle, XCircle, MinusCircle,
} from "lucide-react";
import {
  retryExportAction, cancelDeletionAction, markExportFailedAction,
  type RecoveryResult,
} from "@/app/(admin)/admin/data-requests/actions";
import type { DataRequestDetail } from "@/lib/data/admin-data-requests";
import {
  EXPORT_LABEL, EXPORT_TONE, DELETION_LABEL, DELETION_TONE, DELETION_MEANING,
  EVIDENCE_LABEL, EVIDENCE_TONE,
  type ExportState, type DeletionState,
} from "@/lib/admin-data-request-states";

/*
  ONE REQUEST.

  THE DELIVERY BLOCK IS THREE FACTS, NOT ONE. The file exists; the
  notice went out; somebody downloaded it. The third is usually
  unknowable and reads "Not recorded" — which is not "No". Saying "not
  delivered" about a file somebody downloaded last Tuesday would send
  support chasing a problem that does not exist; saying "delivered"
  about one nobody opened is worse.

  AND A DELETION IS ITS STEPS. Removing the login row proves nothing
  about uploaded files, live sessions or the booking history. Each step
  carries its own outcome, and the word "Deleted" appears only when
  every one of them succeeded.

  THE CLIENT IP IS HERE, BEHIND A CLICK, and nowhere else. It is a
  technical detail about a person, not a column in a queue.
*/

type Tab = "summary" | "processing" | "audit";

export function DataRequestPanel({
  detail, sample, can,
}: {
  detail: DataRequestDetail;
  sample: boolean;
  can: { retry_export: boolean; cancel_deletion: boolean; mark_failed: boolean };
}) {
  /*
    EVERY ONE OF THESE ASKS FOR A REASON BEFORE ANYTHING HAPPENS.

    These are acts performed on a person's own data at their request,
    so the record has to carry who did it and why. The prompt is not a
    confirmation step bolted on — the database refuses the call without
    a reason, and this is where the operator types it.
  */
  const [busy, setBusy] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<RecoveryResult | null>(null);

  const ask = (
    key: string,
    question: string,
    fn: (reason: string) => Promise<RecoveryResult>,
  ) => async () => {
    const reason = window.prompt(question);
    if (reason === null) return;
    setBusy(key);
    setOutcome(null);
    try {
      const result = await fn(reason);
      setOutcome(result);
      if (result.ok) router.refresh();
    } catch (e) {
      setOutcome({ ok: false, error: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  };
  const router = useRouter();
  const params = useSearchParams();
  const [tab, setTab] = useState<Tab>("summary");

  const close = () => {
    const next = new URLSearchParams(params.toString());
    next.delete("open");
    router.replace(`/admin/data-requests?${next.toString()}`, { scroll: false });
  };

  const isExport = detail.kind === "export";
  const tone = isExport
    ? EXPORT_TONE[detail.state as ExportState]
    : DELETION_TONE[detail.state as DeletionState];
  const label = isExport
    ? EXPORT_LABEL[detail.state as ExportState]
    : DELETION_LABEL[detail.state as DeletionState];

  return (
    <aside className="bg-white rounded-2xl border border-slate-200 flex flex-col max-h-[calc(100vh-7rem)] overflow-hidden">
      <header className="px-4 pt-3.5 pb-3 border-b border-slate-100">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h2 className="text-[18px] font-bold text-slate-900 leading-tight flex flex-wrap items-center gap-2">
              <span className="tabular-nums">{detail.id}</span>
              <span className="text-slate-300">•</span>
              {detail.title}
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${tone}`}
                title={isExport ? undefined : DELETION_MEANING[detail.state as DeletionState]}>
                {label}
              </span>
            </h2>
            <p className="text-[12px] text-slate-500 mt-0.5">
              {detail.account.name} <span className="text-slate-300">•</span>{" "}
              <span className="capitalize">{detail.account.role}</span>{" "}
              <span className="text-slate-300">•</span>{" "}
              <span className="tabular-nums">{detail.account.ref}</span>
            </p>
          </div>
          <Link href="/admin/users" className="text-[12px] font-semibold text-brand-700 inline-flex items-center gap-1 shrink-0">
            View account <ExternalLink className="w-3 h-3" />
          </Link>
          <button onClick={close} aria-label="Close"
            className="w-8 h-8 grid place-items-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-50">
            <X className="w-4 h-4" />
          </button>
        </div>

        <nav className="flex items-center gap-4 mt-3 -mb-3">
          {(["summary", "processing", "audit"] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`text-[13px] font-semibold pb-2.5 border-b-2 capitalize ${
                tab === t ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800"
              }`}>
              {t}
            </button>
          ))}
        </nav>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {tab === "summary" && (
          <>
            <div className="grid sm:grid-cols-2 gap-3">
              {/* WHO ASKED, AND HOW WE KNOW */}
              <section className="border border-slate-200 rounded-xl px-3 py-2.5">
                <h3 className="text-[13px] font-semibold text-slate-900 flex items-center gap-1.5 mb-2">
                  <ShieldCheck className="w-4 h-4 text-brand-600" /> Identity check
                </h3>
                {(() => {
                  const check = detail.export_detail?.identity_check ?? detail.deletion_detail?.identity_check;
                  return (
                    <span className={`inline-flex items-center gap-1.5 text-[12px] font-semibold px-2 py-1 rounded-lg ${
                      check?.verified ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"
                    }`}>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {check?.method ?? "Not verified"}
                    </span>
                  );
                })()}
                <dl className="mt-2 space-y-1">
                  <Line label="Source" value={detail.export_detail?.source ?? detail.deletion_detail?.source ?? "—"} />
                  <Line label="Requested" value={detail.export_detail?.requested_at ?? detail.deletion_detail?.requested_at ?? "—"} />
                  {detail.export_detail && (
                    <>
                      <Line label="Completed" value={detail.export_detail.completed_at ?? "Not completed"} />
                      <Line label="Link expires" value={detail.export_detail.expires_at ?? "—"} />
                    </>
                  )}
                  {detail.deletion_detail && (
                    <>
                      <Line label="Eligible" value={detail.deletion_detail.grace_until ?? "—"} />
                      <Line label="Executed" value={detail.deletion_detail.executed_at ?? "Not executed"} />
                    </>
                  )}
                </dl>
                {/* A TIME WITHOUT A ZONE IS NOT A TIME. */}
                <p className="text-[11px] text-slate-500 mt-1.5">All times {detail.timezone}.</p>
              </section>

              {/* DELIVERY: THREE SEPARATE FACTS */}
              {detail.export_detail && (
                <section className="border border-slate-200 rounded-xl px-3 py-2.5">
                  <h3 className="text-[13px] font-semibold text-slate-900 flex items-center gap-1.5 mb-2">
                    <Download className="w-4 h-4 text-brand-600" /> Export delivery
                  </h3>
                  <dl className="space-y-1">
                    <Evidence label="File generated" value={detail.export_detail.delivery.file_generated} />
                    <Evidence label="Delivery notice" value={detail.export_detail.delivery.notice_sent} />
                    <Evidence label="Download status" value={detail.export_detail.delivery.downloaded} />
                  </dl>
                  <p className="text-[11px] text-slate-500 mt-2 flex items-start gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-slate-400 mt-px shrink-0" />
                    {detail.export_detail.delivery.access_note}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <button type="button" disabled={sample}
                      className="text-[12px] font-semibold text-slate-700 bg-white border border-slate-200 hover:border-brand-300 px-2.5 py-1.5 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed">
                      Preview notification
                    </button>
                    <button type="button" disabled={sample || Boolean(detail.actions.reissue_blocked_reason)}
                      title={detail.actions.reissue_blocked_reason ?? undefined}
                      className="text-[12px] font-semibold text-white bg-brand-600 hover:bg-brand-700 px-2.5 py-1.5 rounded-lg disabled:bg-slate-200 disabled:text-slate-500 disabled:cursor-not-allowed">
                      Review delivery
                    </button>
                  </div>
                </section>
              )}

              {/* DELETION: EVERY STEP, SEPARATELY */}
              {detail.deletion_detail && (
                <section className="border border-slate-200 rounded-xl px-3 py-2.5">
                  <h3 className="text-[13px] font-semibold text-slate-900 flex items-center gap-1.5 mb-2">
                    <Layers className="w-4 h-4 text-brand-600" /> Deletion steps
                  </h3>
                  <ul className="space-y-1.5">
                    {detail.deletion_detail.steps.map((step) => (
                      <li key={step.label} className="flex items-start gap-2">
                        {step.state === "done" ? <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-px shrink-0" />
                          : step.state === "failed" ? <XCircle className="w-4 h-4 text-rose-500 mt-px shrink-0" />
                          : step.state === "pending" ? <Clock className="w-4 h-4 text-sky-500 mt-px shrink-0" />
                          : <MinusCircle className="w-4 h-4 text-slate-300 mt-px shrink-0" />}
                        <span className="min-w-0">
                          <span className="block text-[13px] text-slate-800">{step.label}</span>
                          {step.detail && <span className="block text-[11px] text-slate-500">{step.detail}</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5 mt-2">
                    Removing the login account does not by itself prove the files, sessions and
                    related records were handled. Each step above reports for itself.
                  </p>
                </section>
              )}
            </div>

            {/* SCOPE or RETENTION */}
            {detail.export_detail && (
              <section className="border border-slate-200 rounded-xl px-3 py-2.5">
                <h3 className="text-[13px] font-semibold text-slate-900 flex items-center gap-1.5 mb-2">
                  <Layers className="w-4 h-4 text-brand-600" /> Scope
                </h3>
                <ul className="space-y-1">
                  {detail.export_detail.scope.map((item) => (
                    <li key={item.label} className="flex items-start gap-2 text-[13px]">
                      {item.included
                        ? <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-px shrink-0" />
                        : <Circle className="w-4 h-4 text-slate-300 mt-px shrink-0" />}
                      <span className="min-w-0">
                        <span className={item.included ? "text-slate-800" : "text-slate-500"}>{item.label}</span>
                        {item.note && <span className="block text-[11px] text-slate-500">{item.note}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="text-[11px] text-slate-500 mt-2">{detail.export_detail.scope_note}</p>
              </section>
            )}

            {detail.deletion_detail && (
              <section className="border border-slate-200 rounded-xl px-3 py-2.5">
                <h3 className="text-[13px] font-semibold text-slate-900 mb-1">What is kept, and why</h3>
                <p className="text-[11px] text-slate-500 mb-2">
                  Promising that everything disappears is a promise a marketplace cannot keep.
                  These are the categories that survive a deletion.
                </p>
                <ul className="space-y-1.5">
                  {detail.deletion_detail.retention.map((item) => (
                    <li key={item.label} className="border border-slate-100 rounded-lg px-2.5 py-1.5">
                      <span className="block text-[13px] font-semibold text-slate-800">{item.label}</span>
                      <span className="block text-[12px] text-slate-600">{item.treatment}</span>
                      <span className="block text-[11px] text-slate-400">{item.why}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* PRIVACY CONTROLS */}
            <section className="border border-slate-200 rounded-xl px-3 py-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-[13px] font-semibold text-slate-900 flex items-center gap-1.5">
                  <Lock className="w-4 h-4 text-brand-600" /> Privacy controls
                </h3>
                <span className="ml-auto text-[11px] font-semibold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full">
                  Restricted access · activity logged
                </span>
              </div>
              <p className="text-[12px] text-slate-600 mt-1">{detail.privacy_note}</p>
              {/* THE IP LIVES HERE AND NOWHERE ELSE. */}
              <details className="mt-2">
                <summary className="text-[12px] font-semibold text-slate-700 cursor-pointer inline-flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-slate-400" /> Technical details
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                </summary>
                <dl className="mt-1.5 space-y-1">
                  {detail.technical.map((item) => (
                    <Line key={item.label} label={item.label} value={item.value} />
                  ))}
                </dl>
                <p className="text-[11px] text-slate-500 mt-1">
                  Opening this is recorded against your name.
                </p>
              </details>
            </section>
          </>
        )}

        {tab === "processing" && (
          <ol className="space-y-2.5">
            {detail.timeline.map((step, i) => (
              <li key={i} className="flex gap-2.5">
                <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${step.at ? "bg-brand-500" : "bg-slate-200"}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-slate-900">{step.label}</p>
                  {step.note && <p className="text-[12px] text-slate-600">{step.note}</p>}
                </div>
                <span className="text-[12px] text-slate-500 tabular-nums shrink-0">
                  {step.at ?? <span className="text-slate-400">Not recorded</span>}
                </span>
              </li>
            ))}
            <li className="text-[11px] text-slate-500 pt-1">All times {detail.timezone}.</li>
          </ol>
        )}

        {tab === "audit" && (
          <ol className="space-y-2.5">
            {detail.audit.map((entry, i) => (
              <li key={i} className="flex gap-2.5">
                <FileText className="w-3.5 h-3.5 text-slate-300 mt-1 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] text-slate-900">{entry.action}</p>
                  {entry.detail && <p className="text-[12px] text-slate-600">{entry.detail}</p>}
                  <p className="text-[11px] text-slate-400">{entry.actor} · {entry.at}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>

      <footer className="border-t border-slate-100 px-4 py-3 space-y-2 bg-slate-50/60">
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/admin/audit-log"
            className="inline-flex items-center gap-1.5 bg-brand-600 text-white text-[13px] font-semibold px-3.5 py-2 rounded-xl hover:bg-brand-700">
            <FileText className="w-4 h-4" /> View audit history
          </Link>
          <button type="button" disabled={sample}
            className="inline-flex items-center gap-1.5 bg-white border border-slate-200 text-[13px] font-semibold text-slate-700 px-3 py-2 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed">
            <MessageSquare className="w-4 h-4" /> Contact requester
          </button>
          {/*
            NO DESTRUCTIVE ACTION SITS ON A ROW OR A SINGLE CLICK. The
            irreversible ones live behind this menu, each asking for a
            reason before anything happens.
          */}
          <details className="relative ml-auto">
            <summary className="list-none cursor-pointer inline-flex items-center gap-1.5 bg-white border border-slate-200 text-[13px] font-semibold text-slate-700 px-3 py-2 rounded-xl">
              More actions <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </summary>
            <div className="absolute right-0 bottom-full mb-1.5 w-64 bg-white border border-slate-200 rounded-xl shadow-lg p-1 z-20">
              <p className="px-2.5 py-1.5 text-[11px] text-slate-500">
                Each of these asks for a reason and records who did it.
              </p>
              {/*
                A CONTROL THAT IS ON WHEN THE ACT WOULD BE REFUSED
                teaches people to click and read an error. Each of
                these is off when the row's state makes it impossible,
                and the title says which state that is.
              */}
              <button type="button"
                disabled={sample || !can.retry_export || !detail.actions.retry_export || busy !== null}
                title={detail.actions.retry_blocked_reason ?? undefined}
                onClick={ask("retry",
                  "Why is this export being rebuilt? It is recorded with the request.\n\nThe previous download link dies and does not come back — the new build produces a new one.",
                  (reason) => retryExportAction(detail.uuid, reason))}
                className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-slate-50 text-[13px] font-semibold text-slate-800 disabled:text-slate-400 disabled:cursor-not-allowed">
                {busy === "retry" ? "Queueing…" : "Queue a fresh build"}
              </button>
              {detail.kind === "deletion" && (
                <button type="button"
                  disabled={sample || !can.cancel_deletion || !detail.actions.cancel_deletion || busy !== null}
                  title={detail.actions.cancel_blocked_reason ?? undefined}
                  onClick={ask("cancel",
                    "Why is the deletion being cancelled? They asked for it, so the record has to say who stopped it and why.\n\nThe account holder is told in the app.",
                    (reason) => cancelDeletionAction(detail.uuid, reason))}
                  className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-amber-50 text-[13px] font-semibold text-amber-800 disabled:text-slate-400 disabled:cursor-not-allowed">
                  {busy === "cancel" ? "Cancelling…" : "Cancel the deletion"}
                </button>
              )}
              <button type="button"
                disabled={sample || !can.mark_failed || !detail.actions.mark_failed || busy !== null}
                title={detail.actions.mark_failed ? undefined : "Only a build that is waiting or in progress can be recorded as failed."}
                onClick={ask("fail",
                  "What went wrong? A failure with no reason is the thing somebody has to debug later.",
                  (reason) => markExportFailedAction(detail.uuid, reason))}
                className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-rose-50 text-[13px] font-semibold text-rose-700 disabled:text-slate-400 disabled:cursor-not-allowed">
                {busy === "fail" ? "Recording…" : "Mark as failed"}
              </button>
            </div>
          </details>
        </div>
        {outcome && (
          <div className={`rounded-xl px-3 py-2 border ${
            outcome.ok ? "bg-emerald-50 border-emerald-200" : "bg-rose-50 border-rose-200"
          }`}>
            <p className={`text-[12px] font-semibold ${outcome.ok ? "text-emerald-900" : "text-rose-900"}`}>
              {outcome.ok ? outcome.message : outcome.error}
            </p>
            {outcome.ok && outcome.detail && (
              <p className="text-[11px] text-slate-600 mt-0.5">{outcome.detail}</p>
            )}
          </div>
        )}

        <p className="text-[11px] text-slate-500 flex items-start gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mt-px shrink-0" />
          Before retrying anything, check what the first attempt did. A regenerated export and a
          second notice are both things the requester will see.
        </p>
      </footer>
    </aside>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2 text-[13px]">
      <dt className="text-slate-500 w-[104px] shrink-0">{label}</dt>
      <dd className="text-slate-800 min-w-0 truncate tabular-nums">{value}</dd>
    </div>
  );
}

function Evidence({ label, value }: { label: string; value: "yes" | "no" | "not_recorded" }) {
  return (
    <div className="flex items-center gap-2 text-[13px]">
      <dt className="text-slate-600">{label}</dt>
      <dd className={`ml-auto inline-flex items-center gap-1 font-semibold ${EVIDENCE_TONE[value]}`}>
        {value === "yes" ? <CheckCircle2 className="w-3.5 h-3.5" />
          : value === "no" ? <XCircle className="w-3.5 h-3.5" />
          : <MinusCircle className="w-3.5 h-3.5" />}
        {EVIDENCE_LABEL[value]}
      </dd>
    </div>
  );
}
