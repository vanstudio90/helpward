"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  X, ExternalLink, Star, Lock, EyeOff, Eye, ShieldCheck, Info, CalendarDays,
  User, Users, Scale, FileText, History, AlertTriangle, CheckSquare, Square,
} from "lucide-react";
import type { ReviewDetail } from "@/lib/data/admin-reviews";
import {
  VISIBILITY_LABEL, VISIBILITY_TONE, REPORT_REASONS, REASON_LABEL,
  RATING_EFFECT_LABEL, RATING_EFFECT_TONE,
} from "@/lib/admin-review-states";

/*
  ONE REPORTED REVIEW.

  THE ORIGINAL IS READ-ONLY AND ALWAYS WILL BE. There is no control in
  this panel that edits what a customer wrote. A moderator hides it,
  restores it or escalates it; rewriting somebody's feedback — or
  replacing it with a tidier version — is the one thing a review system
  must never be able to do.

  A VERIFIED BOOKING IS NOT A VERIFIED CLAIM. The green strip means the
  transaction happened and this person was on it. Whether the move
  really did take longer than expected is not something anybody here
  checked, and the line under the booking says so.

  AND THE RATING EFFECT IS STATED, NOT ASKED. In this product hiding a
  review removes its rating from the helper's public average, because
  the aggregate reads only visible rows and recomputes on update. A
  moderator deciding about a phone number in a comment is also deciding
  about two stars, and they should know that before they click.
*/

type Tab = "review" | "reports" | "history";

export function ReviewPanel({ detail, sample }: { detail: ReviewDetail; sample: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const [tab, setTab] = useState<Tab>("review");
  const [reason, setReason] = useState(detail.report_reason ?? "");
  const [note, setNote] = useState("");
  const [assessment, setAssessment] = useState(
    Object.fromEntries(detail.policy_assessment.map((a) => [a.key, a.checked])),
  );

  const close = () => {
    const next = new URLSearchParams(params.toString());
    next.delete("open");
    router.replace(`/admin/reviews?${next.toString()}`, { scroll: false });
  };

  const violationChecked = detail.policy_assessment.some(
    (a) => a.key !== "negative_only" && assessment[a.key],
  );

  return (
    <aside className="bg-white rounded-2xl border border-slate-200 flex flex-col max-h-[calc(100vh-7rem)] overflow-hidden">
      <header className="px-4 pt-3.5 pb-3 border-b border-slate-100">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h2 className="text-[18px] font-bold text-slate-900 leading-tight flex flex-wrap items-center gap-2">
              <span className="tabular-nums">{detail.id}</span>
              <span className="text-slate-300">•</span>
              {detail.service}
              <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${VISIBILITY_TONE[detail.visibility]}`}>
                {detail.visibility === "hidden" ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                {VISIBILITY_LABEL[detail.visibility]}
              </span>
            </h2>
            <button type="button" disabled={sample}
              className="text-[12px] font-semibold text-brand-700 inline-flex items-center gap-1 mt-0.5 disabled:text-slate-400 disabled:cursor-not-allowed">
              Open full record <ExternalLink className="w-3 h-3" />
            </button>
          </div>
          <button onClick={close} aria-label="Close"
            className="w-8 h-8 grid place-items-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-50">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* THE TRANSACTION IS VERIFIED. THE CLAIMS ARE NOT. */}
        <div className="mt-2.5 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-emerald-800">
            <ShieldCheck className="w-4 h-4" />
            {detail.booking_verified ? "Verified booking" : "No booking linked"}
          </span>
          <span className="text-[12px] text-emerald-900/80">
            {detail.booking_verified
              ? "Linked to a completed booking."
              : "This review has no completed booking behind it."}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-[12px] text-slate-600">
          <span className="inline-flex items-center gap-1.5">
            <User className="w-3.5 h-3.5 text-slate-400" /> Customer: {detail.customer.name}
          </span>
          <Link href="/admin/users" className="font-semibold text-brand-700">View customer</Link>
          <span className="text-slate-200">|</span>
          <span className="inline-flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-slate-400" /> Helper: {detail.helper.name}
          </span>
          {/* The public profile is where this review actually appears, so
              that is what "view helper" offers; the admin record is one
              click further on. */}
          <Link href={detail.helper.id ? `/helpers/${detail.helper.id}` : "/admin/helpers"}
            className="font-semibold text-brand-700">
            View helper
          </Link>
        </div>

        <nav className="flex items-center gap-4 mt-3 -mb-3">
          {([["review", "Review"], ["reports", "Reports"], ["history", "Decision history"]] as const).map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              className={`text-[13px] font-semibold pb-2.5 border-b-2 whitespace-nowrap ${
                tab === key ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800"
              }`}>
              {label}
              {key === "reports" && detail.reports.length > 0 && (
                <span className="ml-1 text-[11px] text-slate-400">{detail.reports.length}</span>
              )}
            </button>
          ))}
        </nav>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {tab === "review" && (
          <>
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-semibold text-slate-700">Rating</span>
              <Stars rating={detail.rating} />
              <span className="text-[13px] font-semibold text-slate-900 tabular-nums">
                {detail.rating}/5
              </span>
            </div>

            {/* WHAT THEY WROTE — never editable. */}
            <section className="border border-slate-200 rounded-xl px-3 py-2.5">
              <h3 className="text-[12px] font-semibold text-slate-500 uppercase tracking-wide mb-1">
                Original feedback
              </h3>
              <p className="text-[13px] text-slate-800 italic">&ldquo;{detail.original_text}&rdquo;</p>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                {detail.original_restricted && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full">
                    <Lock className="w-3 h-3" /> Restricted original
                  </span>
                )}
                <span className="text-[11px] text-slate-500">
                  {detail.public_text_available
                    ? "This is what the public sees."
                    : "Public version unavailable while hidden. The words above are kept exactly as written."}
                </span>
              </div>
            </section>

            <div className="grid sm:grid-cols-2 gap-3">
              <Fact label="Current visibility">
                <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${VISIBILITY_TONE[detail.visibility]}`}>
                  {detail.visibility === "hidden" ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  {VISIBILITY_LABEL[detail.visibility]}
                </span>
              </Fact>
              <Fact label="Reported reason">
                <span className="text-[13px] text-slate-900">
                  {detail.report_reason ? REASON_LABEL[detail.report_reason] : "Not reported"}
                </span>
              </Fact>
            </div>

            {/* BOOKING CONTEXT */}
            <section className="border border-slate-200 rounded-xl px-3 py-2.5">
              <h3 className="text-[13px] font-semibold text-slate-900 flex items-center gap-1.5">
                <CalendarDays className="w-4 h-4 text-brand-600" /> Booking context
              </h3>
              <p className="text-[13px] text-slate-700 mt-1">
                {detail.booking_ref}
                {detail.booking_completed_at ? ` · Completed ${detail.booking_completed_at}` : ""}
                {detail.booking_city ? ` · ${detail.booking_city}` : ""}
              </p>
              <div className="flex flex-wrap items-center gap-3 mt-1.5">
                <Link href="/admin/bookings" className="text-[12px] font-semibold text-brand-700 inline-flex items-center gap-1">
                  Open booking <ExternalLink className="w-3 h-3" />
                </Link>
                <Link href={detail.helper.id ? `/helpers/${detail.helper.id}` : "/admin/helpers"}
                  className="text-[12px] font-semibold text-brand-700 inline-flex items-center gap-1">
                  View helper <ExternalLink className="w-3 h-3" />
                </Link>
              </div>
              <p className="text-[11px] text-slate-500 mt-1.5 flex items-start gap-1.5">
                <Info className="w-3.5 h-3.5 text-slate-400 mt-px shrink-0" />
                The booking is verified — this person was on this job. Whether what they wrote about
                it is accurate has not been checked by anybody.
              </p>
            </section>

            <div className="grid sm:grid-cols-2 gap-3">
              {/* POLICY ASSESSMENT */}
              <section className="border border-slate-200 rounded-xl px-3 py-2.5">
                <h3 className="text-[13px] font-semibold text-slate-900 flex items-center gap-1.5 mb-2">
                  <Scale className="w-4 h-4 text-brand-600" /> Policy assessment
                </h3>
                <ul className="space-y-1.5">
                  {detail.policy_assessment.map((item) => (
                    <li key={item.key}>
                      <button
                        onClick={() => setAssessment((a) => ({ ...a, [item.key]: !a[item.key] }))}
                        className="flex items-start gap-2 text-left w-full"
                      >
                        {assessment[item.key]
                          ? <CheckSquare className="w-4 h-4 text-brand-600 mt-px shrink-0" />
                          : <Square className="w-4 h-4 text-slate-300 mt-px shrink-0" />}
                        <span>
                          <span className="block text-[13px] text-slate-800">{item.label}</span>
                          {item.note && <span className="block text-[11px] text-slate-500">{item.note}</span>}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                {detail.policy_reference && (
                  detail.policy_reference.href ? (
                    <Link href={detail.policy_reference.href}
                      className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-brand-700">
                      Policy reference: {detail.policy_reference.label} <ExternalLink className="w-3 h-3" />
                    </Link>
                  ) : (
                    <span className="mt-2 block text-[12px] font-semibold text-slate-500"
                      title="The written policy is not published in the console yet.">
                      Policy reference: {detail.policy_reference.label}
                    </span>
                  )
                )}
              </section>

              {/* RATING TREATMENT — the real answer */}
              <section className="border border-slate-200 rounded-xl px-3 py-2.5">
                <h3 className="text-[13px] font-semibold text-slate-900 flex items-center gap-1.5 mb-2">
                  <Star className="w-4 h-4 text-brand-600" /> Rating treatment
                </h3>
                <div className="flex items-start gap-2 text-[13px]">
                  <span className="text-slate-600">Public rating</span>
                  <span className={`ml-auto text-[11px] font-semibold px-2 py-0.5 rounded-full text-right ${
                    RATING_EFFECT_TONE[detail.rating_treatment.public_effect]
                  }`}>
                    {RATING_EFFECT_LABEL[detail.rating_treatment.public_effect]}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">{detail.rating_treatment.mechanism}</p>
                <div className="flex items-start gap-2 text-[13px] mt-2 pt-2 border-t border-slate-100">
                  <span className="text-slate-600">Internal record</span>
                  <span className="ml-auto text-[13px] text-slate-900">Retained</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  {detail.rating_treatment.internal_record}
                  {!detail.rating_treatment.internal_average_exists && (
                    <>
                      {" "}
                      <span className="text-amber-800 font-semibold">
                        There is no separate internal average today
                      </span>{" "}
                      — the only aggregate is the public one, and it excludes hidden reviews.
                    </>
                  )}
                </p>
              </section>
            </div>

            {/* DECISION */}
            <section className="border border-slate-200 rounded-xl px-3 py-2.5 space-y-2">
              <h3 className="text-[13px] font-semibold text-slate-900">Decision</h3>
              <label className="flex items-center gap-2">
                <span className="text-[12px] text-slate-600 w-[84px] shrink-0">Reason</span>
                <select value={reason} onChange={(e) => setReason(e.target.value)}
                  className="flex-1 bg-white border border-slate-200 rounded-lg px-2.5 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-brand-200">
                  <option value="">Choose a reason</option>
                  {REPORT_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </label>
              <label className="flex items-start gap-2">
                <span className="text-[12px] text-slate-600 w-[84px] shrink-0 pt-2">Private note</span>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3}
                  placeholder="Add evidence and rationale."
                  className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-brand-200" />
              </label>
              <p className="text-[11px] text-slate-500">
                Staff only, stored with your name and the time. A decision records the actor, the
                reason, the policy and the visibility before and after.
              </p>
              {!violationChecked && reason && (
                <p className="text-[12px] text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 flex items-start gap-1.5">
                  <AlertTriangle className="w-4 h-4 mt-px shrink-0" />
                  Nothing in the assessment is a violation yet. A low rating or unhappy wording is
                  not grounds on its own.
                </p>
              )}
            </section>
          </>
        )}

        {tab === "reports" && (
          <ul className="space-y-2">
            {detail.reports.map((report) => (
              <li key={report.id} className="border border-slate-200 rounded-xl px-3 py-2.5">
                <p className="text-[13px] font-semibold text-slate-900">
                  {REASON_LABEL[report.reason] ?? report.reason}
                </p>
                {report.detail && <p className="text-[12px] text-slate-700 mt-0.5">{report.detail}</p>}
                <p className="text-[11px] text-slate-500 mt-1">
                  Reported by the {report.reported_by} · {report.at} · {report.id}
                </p>
              </li>
            ))}
            {detail.reports.length === 0 && (
              <li className="text-[13px] text-slate-500">Nobody has reported this review.</li>
            )}
          </ul>
        )}

        {tab === "history" && (
          <ol className="space-y-2.5">
            {detail.decisions.map((d, i) => (
              <li key={i} className="flex gap-2.5">
                <History className="w-3.5 h-3.5 text-slate-300 mt-1 shrink-0" />
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-slate-900">
                    {d.action}
                    {d.from_visibility !== d.to_visibility && (
                      <span className="text-[12px] font-normal text-slate-500">
                        {" "}· {VISIBILITY_LABEL[d.from_visibility]} → {VISIBILITY_LABEL[d.to_visibility]}
                      </span>
                    )}
                  </p>
                  {d.note && <p className="text-[12px] text-slate-600">{d.note}</p>}
                  <p className="text-[11px] text-slate-400">
                    {d.actor} · {d.at}
                    {d.reason ? ` · ${d.reason}` : ""}
                    {d.policy_reference ? ` · ${d.policy_reference}` : ""}
                  </p>
                </div>
              </li>
            ))}
            <li className="text-[11px] text-slate-500 pt-1">
              Append-only. A decision that was wrong is reversed with another decision, not by
              deleting this one.
            </li>
          </ol>
        )}
      </div>

      <footer className="border-t border-slate-100 px-4 py-3 space-y-2 bg-slate-50/60">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={sample || !reason}
            title={sample ? "Design concept — decisions are switched off" : undefined}
            className="inline-flex items-center gap-1.5 bg-brand-600 text-white text-[13px] font-semibold px-3.5 py-2 rounded-xl disabled:bg-slate-200 disabled:text-slate-500 disabled:cursor-not-allowed">
            <FileText className="w-4 h-4" /> Record decision
          </button>
          {detail.actions.restore && (
            <button type="button" disabled={sample}
              className="inline-flex items-center gap-1.5 bg-white border border-slate-200 text-[13px] font-semibold text-slate-700 px-3 py-2 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed">
              <Eye className="w-4 h-4" /> Review restoration
            </button>
          )}
          {detail.actions.open_safety_case && (
            <Link href="/admin/disputes"
              className="inline-flex items-center gap-1.5 bg-white border border-slate-200 text-[13px] font-semibold text-slate-700 px-3 py-2 rounded-xl hover:border-rose-300 hover:text-rose-700">
              <ShieldCheck className="w-4 h-4" /> Open safety case
            </Link>
          )}
        </div>
        <p className="text-[11px] text-slate-500">
          The original feedback is preserved whatever is decided here — nobody can edit a customer&apos;s
          words. Restoring is one more recorded decision, and the helper&apos;s public average follows
          the visibility either way.
        </p>
      </footer>
    </aside>
  );
}

function Stars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${rating} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n}
          className={`w-4 h-4 ${n <= rating ? "fill-amber-400 text-amber-400" : "text-slate-200"}`} />
      ))}
    </span>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="block text-[12px] font-semibold text-slate-500">{label}</span>
      <span className="block mt-0.5">{children}</span>
    </div>
  );
}
