"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  X, ExternalLink, Copy, Link2, Lock, Info, ChevronDown, ShieldCheck, AlertTriangle,
} from "lucide-react";
import type { AuditDetail } from "@/lib/data/admin-audit";
import {
  OUTCOME_LABEL, OUTCOME_TONE, OUTCOME_MEANING, ACTOR_LABEL, ACTOR_TONE,
} from "@/lib/admin-audit-states";

/*
  ONE EVENT.

  THE CHANGES TABLE SHOWS WHAT MOVED AND NOTHING ELSE. A row reading
  "Owner: Alex → Alex" trains an operator to skim, and skimming is how
  the one line that mattered gets missed.

  THE ACTOR IS NAMED THE SAME HERE AS IN THE LIST. Two names for one
  person — a display name in the row and a full name in the panel — is
  how an investigation ends up with two suspects.

  AND THE ROLE IS THE ROLE AT THE TIME. Looking it up from the profile
  today would relabel historic events every time somebody is promoted,
  and in this product the admin claim lives in the JWT rather than in
  profiles.role — so a profile lookup can be wrong the moment it is
  made, not merely later.
*/

type Tab = "summary" | "changes" | "technical";

export function AuditEventPanel({ detail, sample }: { detail: AuditDetail; sample: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const [tab, setTab] = useState<Tab>("summary");

  const close = () => {
    const next = new URLSearchParams(params.toString());
    next.delete("open");
    router.replace(`/admin/audit-log?${next.toString()}`, { scroll: false });
  };

  return (
    <aside className="bg-white rounded-2xl border border-slate-200 flex flex-col max-h-[calc(100vh-7rem)] overflow-hidden">
      <header className="px-4 pt-3.5 pb-3 border-b border-slate-100">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[12px] text-slate-500 tabular-nums">Event {detail.id}</p>
            <h2 className="text-[19px] font-bold text-slate-900 leading-tight">{detail.action}</h2>
          </div>
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${OUTCOME_TONE[detail.outcome]}`}
            title={OUTCOME_MEANING[detail.outcome]}>
            {OUTCOME_LABEL[detail.outcome]}
          </span>
          <button onClick={close} aria-label="Close"
            className="w-8 h-8 grid place-items-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-50">
            <X className="w-4 h-4" />
          </button>
        </div>

        <nav className="flex items-center gap-4 mt-3 -mb-3">
          {(["summary", "changes", "technical"] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`text-[13px] font-semibold pb-2.5 border-b-2 capitalize ${
                tab === t ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800"
              }`}>
              {t}
              {t === "changes" && detail.changes.length > 0 && (
                <span className="ml-1 text-[11px] text-slate-400">{detail.changes.length}</span>
              )}
            </button>
          ))}
        </nav>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {detail.correction && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
            <p className="text-[13px] font-semibold text-amber-900 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" /> {detail.correction.label}
            </p>
            <p className="text-[12px] text-amber-800 mt-0.5">{detail.correction.note}</p>
            <p className="text-[11px] text-amber-700/80 mt-1">
              Corrected by {detail.correction.id} · {detail.correction.at} — this entry stays
              exactly as it was written, because removing it would be the tampering the log exists
              to rule out.
            </p>
          </div>
        )}

        {tab === "summary" && (
          <>
            <dl className="space-y-1.5">
              <Line label="Actor">
                <span className="inline-flex items-center gap-1.5">
                  {detail.actor.name}
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${ACTOR_TONE[detail.actor.kind]}`}>
                    {ACTOR_LABEL[detail.actor.kind]}
                  </span>
                </span>
              </Line>
              {/* THE ROLE AT THE TIME, not the role today. */}
              <Line label="Role at event">{detail.actor.role_at_event}</Line>
              <Line label="Source">{detail.actor.source}</Line>
              <Line label="Occurred">
                <span className="tabular-nums">{detail.occurred_at}</span>
              </Line>
            </dl>
            <p className="text-[11px] text-slate-500 -mt-1">
              Exact: <span className="tabular-nums">{detail.occurred_exact}</span> · stored in UTC,
              shown in {detail.timezone}.
            </p>

            {detail.record && (
              <div className="flex items-center gap-2 border border-slate-200 rounded-xl px-3 py-2.5">
                <span className="text-[13px] text-slate-600">Linked record</span>
                <span className="ml-auto inline-flex items-center gap-2">
                  <span className="font-semibold text-brand-700 tabular-nums">{detail.record.label}</span>
                  {detail.record.missing ? (
                    <span className="text-[11px] font-semibold bg-amber-50 text-amber-800 px-2 py-0.5 rounded-full">
                      Record removed
                    </span>
                  ) : detail.record.href ? (
                    <Link href={detail.record.href}
                      className="text-[12px] font-semibold text-slate-700 bg-white border border-slate-200 hover:border-brand-300 px-2 py-1 rounded-lg inline-flex items-center gap-1">
                      Open <ExternalLink className="w-3 h-3" />
                    </Link>
                  ) : null}
                </span>
              </div>
            )}

            {detail.reason && (
              <div>
                <span className="block text-[12px] font-semibold text-slate-600">Reason</span>
                <p className="text-[13px] text-slate-800 mt-0.5">{detail.reason}</p>
              </div>
            )}

            {detail.related_records.length > 0 && (
              <div>
                <span className="block text-[12px] font-semibold text-slate-600 mb-1">Related records</span>
                <div className="flex flex-wrap gap-1.5">
                  {detail.related_records.map((r) => (
                    r.href ? (
                      <Link key={r.label} href={r.href}
                        className="inline-flex items-center gap-1 text-[12px] font-semibold text-brand-700 bg-white border border-slate-200 hover:border-brand-300 px-2 py-1 rounded-lg">
                        {r.label} <ExternalLink className="w-3 h-3" />
                      </Link>
                    ) : (
                      <span key={r.label} className="text-[12px] text-slate-500 px-2 py-1">{r.label}</span>
                    )
                  ))}
                </div>
              </div>
            )}

            {/* THE TRAIL: an attempt, the server's action, the outcome. */}
            {detail.correlation.id && (
              <section className="border border-slate-200 rounded-xl px-3 py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-[13px] font-semibold text-slate-900 flex items-center gap-1.5">
                    <Link2 className="w-4 h-4 text-brand-600" /> Correlation
                  </h3>
                  <span className="ml-auto text-[12px] text-slate-500 tabular-nums">{detail.correlation.id}</span>
                </div>
                <ol className="mt-2 space-y-1.5">
                  {detail.correlation.trail.map((step) => (
                    <li key={step.id} className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-brand-400 shrink-0" />
                      <span className="text-[13px] text-slate-800 flex-1">{step.label}</span>
                      <span className="text-[12px] text-slate-500 tabular-nums">{step.at}</span>
                    </li>
                  ))}
                </ol>
                <p className="text-[11px] text-slate-500 mt-2 flex items-start gap-1.5">
                  <Info className="w-3.5 h-3.5 text-slate-400 mt-px shrink-0" />
                  The outcome is recorded by the server, separately from the request. An attempt and
                  its result are two events on purpose.
                </p>
              </section>
            )}
          </>
        )}

        {tab === "changes" && (
          detail.changes.length === 0 ? (
            <p className="text-[13px] text-slate-500 py-6 text-center">
              This event changed no fields.
            </p>
          ) : (
            <>
              <table className="w-full text-[13px] border border-slate-200 rounded-xl overflow-hidden">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wide text-slate-400 bg-slate-50">
                    <th className="text-left font-semibold px-3 py-2">Field</th>
                    <th className="text-left font-semibold px-3 py-2">Before</th>
                    <th className="text-left font-semibold px-3 py-2">After</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.changes.map((change) => (
                    <tr key={change.field} className="border-t border-slate-100">
                      <td className="px-3 py-2 text-slate-700">{change.field}</td>
                      <td className="px-3 py-2 text-slate-500">
                        {change.before ?? <span className="text-slate-400">Not set</span>}
                      </td>
                      <td className="px-3 py-2 font-semibold text-slate-900">
                        {change.after ?? <span className="font-normal text-slate-400">Cleared</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[11px] text-slate-500">
                Only the fields that moved are listed, and these are the values saved with the event
                — not a comparison against whatever the record says today.
              </p>
            </>
          )
        )}

        {tab === "technical" && (
          <>
            <p className="text-[12px] text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 flex items-start gap-1.5">
              <Lock className="w-3.5 h-3.5 text-slate-400 mt-px shrink-0" />
              {detail.redaction_note}
            </p>
            <details open className="border border-slate-200 rounded-xl px-3 py-2.5">
              <summary className="text-[13px] font-semibold text-slate-800 cursor-pointer inline-flex items-center gap-1.5">
                Technical metadata <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </summary>
              <dl className="mt-2 space-y-1">
                {detail.technical.map((item) => (
                  <Line key={item.label} label={item.label}>
                    <span className="tabular-nums">{item.value}</span>
                  </Line>
                ))}
              </dl>
            </details>
          </>
        )}
      </div>

      <footer className="border-t border-slate-100 px-4 py-3 flex flex-wrap items-center gap-2 bg-slate-50/60">
        <button type="button" disabled={sample}
          className="inline-flex items-center gap-1.5 bg-brand-600 text-white text-[13px] font-semibold px-3.5 py-2 rounded-xl disabled:bg-slate-200 disabled:text-slate-500 disabled:cursor-not-allowed">
          <Copy className="w-4 h-4" /> Copy event ID
        </button>
        {detail.record?.href && !detail.record.missing && (
          <Link href={detail.record.href}
            className="inline-flex items-center gap-1.5 bg-white border border-slate-200 text-[13px] font-semibold text-slate-700 px-3 py-2 rounded-xl">
            <ExternalLink className="w-4 h-4" /> Open record
          </Link>
        )}
        {detail.correlation.id && (
          <Link href={`/admin/audit-log?correlation=${detail.correlation.id}`}
            className="inline-flex items-center gap-1.5 bg-white border border-slate-200 text-[13px] font-semibold text-slate-700 px-3 py-2 rounded-xl">
            <Link2 className="w-4 h-4" /> View related events
            <span className="text-slate-400">{detail.correlation.related_count}</span>
          </Link>
        )}
        <p className="w-full text-[11px] text-slate-500 flex items-start gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-slate-400 mt-px shrink-0" />
          This entry cannot be edited from anywhere. If it is wrong, a correction is appended and
          both stay.
        </p>
      </footer>
    </aside>
  );
}

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2 text-[13px]">
      <dt className="text-slate-500 w-[112px] shrink-0">{label}</dt>
      <dd className="text-slate-900 min-w-0 flex-1">{children}</dd>
    </div>
  );
}
