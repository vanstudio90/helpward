"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  X, ExternalLink, Shield, Wrench, Clock, Loader2, Lock, Paperclip, Upload,
  CheckSquare, Square, MessageSquarePlus, AlertTriangle, ArrowUpRight, Eye,
  CalendarClock, CreditCard, Send, RotateCcw, ChevronDown, FileText, Users,
} from "lucide-react";
import type { CaseDetail } from "@/lib/data/admin-disputes";
import {
  CASE_STATUS_LABEL, CASE_STATUS_TONE, CASE_STATUS_MEANING,
  CASE_PRIORITY_LABEL, CASE_PRIORITY_TONE, OUTCOME_LABEL, OUTCOME_MEANING,
  SOURCE_LABEL, EVENT_LABEL, KIND_TONE,
} from "@/lib/admin-case-states";
import { age, money } from "@/lib/admin-format";
import { ClientDateTime } from "@/components/ClientDateTime";
import { useCasePresence } from "@/components/admin/useCasePresence";
import {
  acknowledgeEscalationAction, addCaseNoteAction, addCaseTaskAction,
  contactPartyAction, escalateCaseAction, reopenCaseAction, resolveCaseAction,
  setCaseTaskAction, updateCaseAction, type CaseResult,
} from "@/app/(admin)/admin/disputes/actions";

/*
  THE INVESTIGATION PANEL.

  THREE THINGS ARE KEPT APART and the layout says so: the REPORT (what
  somebody alleged, in their words, through a channel, at a time), the
  EVIDENCE (files and conversations, where looking is itself recorded),
  and the FINDING (what we concluded, with reasoning, kept even if the
  case is later reopened). A console that renders all three as "the
  case" is how an investigation loses track of what was actually
  claimed.

  NOTHING HERE MOVES MONEY OR TOUCHES AN ACCOUNT. The financial block
  is a readout with a link; the resolution form says, where the button
  is, that closing a case is not a refund and not a suspension.

  TWO REVIEWERS AT ONCE IS THE NORMAL STATE at nine in the morning, so
  the panel holds the case's updated_at and sends it with every change.
  A stale copy is refused by the database and answered here with a
  reload — never with a silent overwrite.
*/

type Tab = "summary" | "evidence" | "timeline" | "resolution";

export function CasePanel({
  detail, admins, me,
}: {
  detail: CaseDetail;
  admins: { id: string; name: string | null }[];
  me: { id: string; name: string };
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [tab, setTab] = useState<Tab>("summary");
  const [token, setToken] = useState(detail.updated_at);
  const [message, setMessage] = useState<{ ok: boolean; text: string; conflict?: boolean } | null>(null);
  const [pending, start] = useTransition();
  const { others } = useCasePresence(`dispute:${detail.id}`, me);
  const lastSeen = useRef(detail.updated_at);

  /*
    The case changed under us — somebody else saved. Take the new token
    so the next write is against the current row, and say so, because
    the panel's contents just changed while being read.
  */
  useEffect(() => {
    if (detail.updated_at !== lastSeen.current) {
      lastSeen.current = detail.updated_at;
      setToken(detail.updated_at);
      setMessage({ ok: true, text: "This case was updated — you are looking at the latest version." });
    }
  }, [detail.updated_at]);

  useEffect(() => {
    setToken(detail.updated_at);
    lastSeen.current = detail.updated_at;
    setTab("summary");
    setMessage(null);
  }, [detail.id, detail.updated_at]);

  const close = () => {
    const next = new URLSearchParams(params.toString());
    next.delete("open");
    router.replace(`/admin/disputes?${next.toString()}`, { scroll: false });
  };

  const run = (fn: () => Promise<CaseResult>) =>
    start(async () => {
      const result = await fn();
      if (result.ok) {
        if (result.updatedAt) {
          setToken(result.updatedAt);
          lastSeen.current = result.updatedAt;
        }
        setMessage({ ok: true, text: result.message });
      } else {
        setMessage({ ok: false, text: result.error, conflict: result.conflict });
      }
      router.refresh();
    });

  const Icon = detail.kind === "safety" ? Shield : Wrench;

  return (
    <aside className="bg-white rounded-2xl border border-slate-200 flex flex-col max-h-[calc(100vh-7rem)] overflow-hidden">
      <header className="px-4 pt-3.5 pb-3 border-b border-slate-100">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h2 className="text-[17px] font-bold text-slate-900 leading-tight flex items-center gap-1.5">
              <Icon className={`w-4 h-4 shrink-0 ${detail.kind === "safety" ? "text-violet-600" : "text-slate-400"}`} />
              <span className="tabular-nums">{detail.ref}</span>
              <span className="text-slate-300">•</span>
              <span className="truncate">{detail.title}</span>
            </h2>
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${CASE_STATUS_TONE[detail.status]}`}
                title={CASE_STATUS_MEANING[detail.status]}>
                {CASE_STATUS_LABEL[detail.status]}
              </span>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${CASE_PRIORITY_TONE[detail.priority]}`}>
                {CASE_PRIORITY_LABEL[detail.priority]} priority
              </span>
              {detail.stripe_dispute_id && (
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-900 text-white"
                  title="A bank chargeback. Stripe decides that one; this case is ours.">
                  Stripe chargeback
                </span>
              )}
              {detail.reopened_count > 0 && (
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                  Reopened ×{detail.reopened_count}
                </span>
              )}
            </div>
          </div>
          <Link href={`/admin/disputes?open=${detail.id}&full=1`} title="Open full case"
            className="text-[12px] font-semibold text-brand-700 hover:text-brand-800 inline-flex items-center gap-0.5 shrink-0">
            Open full case <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
          <button onClick={close} aria-label="Close"
            className="w-8 h-8 grid place-items-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-50">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* OWNER AND NEXT REVIEW */}
        <div className="flex flex-wrap items-center gap-2 mt-2.5">
          <span className="inline-flex items-center gap-1.5 text-[12px] text-slate-500">
            <Users className="w-3.5 h-3.5" /> Owner
          </span>
          <select
            value={detail.owner?.id ?? ""}
            disabled={pending}
            onChange={(e) => run(() => updateCaseAction(detail.id, token, { owner: e.target.value }))}
            className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-[12px] text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-200"
          >
            <option value="">Unassigned</option>
            {admins.map((a) => <option key={a.id} value={a.id}>{a.name ?? a.id.slice(0, 8)}</option>)}
          </select>

          <span className="inline-flex items-center gap-1.5 text-[12px] text-slate-500 ml-1">
            <CalendarClock className="w-3.5 h-3.5" /> Next review
          </span>
          <input
            type="datetime-local"
            disabled={pending}
            defaultValue={detail.next_review_at ? toLocalInput(detail.next_review_at) : ""}
            onChange={(e) => run(() => updateCaseAction(detail.id, token, {
              nextReview: e.target.value ? new Date(e.target.value).toISOString() : "",
            }))}
            className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-[12px] text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-200"
          />
          {detail.next_review_at && new Date(detail.next_review_at) < new Date() && detail.status !== "resolved" && (
            <span className="text-[11px] font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full">
              Review overdue
            </span>
          )}
        </div>

        {others.length > 0 && (
          <p className="mt-2 text-[12px] font-semibold text-brand-700 bg-brand-50 border border-brand-100 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5">
            <Eye className="w-3.5 h-3.5" />
            {others.map((o) => o.name).join(", ")} {others.length === 1 ? "is" : "are"} on this case too
          </p>
        )}

        <nav className="flex items-center gap-4 mt-3 -mb-3">
          {(["summary", "evidence", "timeline", "resolution"] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`text-[13px] font-semibold pb-2.5 border-b-2 capitalize ${
                tab === t ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800"
              }`}>
              {t}
              {t === "evidence" && detail.evidence.length > 0 && (
                <span className="ml-1 text-[11px] text-slate-400">{detail.evidence.length}</span>
              )}
            </button>
          ))}
        </nav>
      </header>

      <div className="flex-1 overflow-y-auto">
        {tab === "summary" && <Summary detail={detail} run={run} pending={pending} token={token} />}
        {tab === "evidence" && <Evidence detail={detail} />}
        {tab === "timeline" && <Timeline detail={detail} />}
        {tab === "resolution" && <Resolution detail={detail} run={run} pending={pending} token={token} admins={admins} />}
      </div>

      <Footer detail={detail} run={run} pending={pending} token={token} admins={admins}
        message={message} onReload={() => router.refresh()} setTab={setTab} />
    </aside>
  );
}

/* ------------------------------------------------------------- summary */

function Summary({
  detail, run, pending, token,
}: {
  detail: CaseDetail;
  run: (fn: () => Promise<CaseResult>) => void;
  pending: boolean;
  token: string;
}) {
  const [note, setNote] = useState("");
  const [task, setTask] = useState("");

  return (
    <div className="px-4 py-3 space-y-3">
      {detail.escalation && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl px-3 py-2.5">
          <p className="text-[13px] font-semibold text-rose-900 flex items-center gap-1.5">
            <ArrowUpRight className="w-4 h-4" /> Escalated to {detail.escalation.to ?? "a senior reviewer"}
          </p>
          <p className="text-[12px] text-rose-800 mt-0.5">{detail.escalation.reason}</p>
          <p className="text-[11px] text-rose-700/80 mt-1">
            <ClientDateTime iso={detail.escalation.at} mode="datetime" />
            {detail.escalation.acknowledged_at
              ? ` · acknowledged by ${detail.escalation.acknowledged_by ?? "them"}`
              : " · not acknowledged yet"}
          </p>
        </div>
      )}

      {/* LINKED BOOKING */}
      {detail.booking ? (
        <section className="border border-slate-200 rounded-xl px-3 py-2.5">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-semibold text-slate-500 uppercase tracking-wide">Linked booking</p>
              <p className="text-[13px] font-semibold text-slate-900 mt-0.5">
                {detail.booking.service ?? "Booking"}{" "}
                <span className="font-normal text-slate-500 tabular-nums">{detail.booking.ref}</span>
              </p>
              <p className="text-[12px] text-slate-500">
                {detail.booking.status.replace("_", " ")}
                {detail.booking.city ? ` · ${detail.booking.city}` : ""}
                {detail.booking.scheduled_for ? " · " : ""}
                {detail.booking.scheduled_for && <ClientDateTime iso={detail.booking.scheduled_for} mode="date" />}
              </p>
              <p className="text-[12px] text-slate-600 mt-1">
                {detail.parties.customer && <>Customer: {detail.parties.customer.name ?? detail.parties.customer.ref} </>}
                {detail.parties.helper && <>· Helper: {detail.parties.helper.name ?? detail.parties.helper.ref}</>}
              </p>
            </div>
            <div className="flex flex-col gap-1 shrink-0">
              <Link href={`/admin/bookings?open=booking:${detail.booking.id}`}
                className="inline-flex items-center gap-1 text-[12px] font-semibold text-slate-700 bg-white border border-slate-200 hover:border-brand-300 px-2 py-1 rounded-lg">
                Open booking <ExternalLink className="w-3 h-3" />
              </Link>
              {detail.conversations.length > 0 && (
                <Link href={`/admin/inbox?open=${detail.conversations[0].id}`}
                  className="inline-flex items-center gap-1 text-[12px] font-semibold text-slate-700 bg-white border border-slate-200 hover:border-brand-300 px-2 py-1 rounded-lg">
                  View conversation <ExternalLink className="w-3 h-3" />
                </Link>
              )}
            </div>
          </div>
        </section>
      ) : (
        <p className="text-[12px] text-slate-500 border border-dashed border-slate-200 rounded-xl px-3 py-2.5">
          No booking is linked to this report — it came in about a person rather than a job.
        </p>
      )}

      {/*
        THE ORIGINAL REPORT. Never edited, always attributed, always
        dated. Corrections go on the timeline as notes; this is what was
        said at the time.
      */}
      <section className="border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50/60">
        <p className="text-[12px] font-semibold text-slate-500 uppercase tracking-wide">
          {detail.report.reporter_is_staff ? "Recorded by staff" : "Reported"}
          {detail.report.reported_by ? ` by ${detail.report.reported_by}` : ""}
        </p>
        <p className="text-[13px] text-slate-800 mt-1 whitespace-pre-wrap">{detail.report.description}</p>
        <p className="text-[11px] text-slate-500 mt-1.5">
          {SOURCE_LABEL[detail.report.source] ?? detail.report.source} ·{" "}
          <ClientDateTime iso={detail.report.reported_at} mode="datetime" />
          {detail.report.reported_by_name ? ` · caller gave the name ${detail.report.reported_by_name}` : ""}
          {" · this is the allegation, not a finding"}
        </p>
      </section>

      {/* EVIDENCE SUMMARY */}
      <section className="border border-slate-200 rounded-xl px-3 py-2.5 flex items-center gap-2">
        <Lock className="w-4 h-4 text-slate-400 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-slate-900">Evidence</p>
          <p className="text-[12px] text-slate-500">
            {describeEvidence(detail)} · {detail.conversations.length} conversation
            {detail.conversations.length === 1 ? "" : "s"} from this case
          </p>
        </div>
        <span className="text-[11px] text-slate-400 shrink-0">Access is logged.</span>
      </section>

      {/* NEXT STEPS */}
      <section>
        <h3 className="text-[12px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Next steps</h3>
        <ul className="space-y-1">
          {detail.tasks.length === 0 && (
            <li className="text-[13px] text-slate-500">No steps yet.</li>
          )}
          {detail.tasks.map((t) => (
            <li key={t.id} className="flex items-start gap-2">
              <button
                disabled={pending}
                onClick={() => run(() => setCaseTaskAction(t.id, !t.done))}
                className="mt-0.5 text-brand-600 disabled:opacity-50"
                aria-label={t.done ? `Reopen ${t.label}` : `Complete ${t.label}`}
              >
                {t.done ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4 text-slate-300" />}
              </button>
              <span className="min-w-0 flex-1">
                <span className={`block text-[13px] ${t.done ? "text-slate-400 line-through" : "text-slate-800"}`}>
                  {t.label}
                </span>
                {t.done && t.done_at && (
                  <span className="block text-[11px] text-slate-400">
                    {t.done_by ?? "Staff"} · <ClientDateTime iso={t.done_at} mode="datetime" />
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-1.5 mt-2">
          <input value={task} onChange={(e) => setTask(e.target.value)}
            placeholder="Add a step…"
            className="flex-1 text-[13px] border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-200" />
          <button
            disabled={pending || task.trim().length === 0}
            onClick={() => run(async () => {
              const result = await addCaseTaskAction(detail.id, task);
              if (result.ok) setTask("");
              return result;
            })}
            className="text-[12px] font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 px-2.5 py-1.5 rounded-lg">
            Add
          </button>
        </div>
        <p className="text-[11px] text-slate-400 mt-1">Ticking a step records it. It does not message anybody.</p>
      </section>

      {/* FINANCIAL CONTEXT — READ ONLY */}
      {detail.money && (
        <section className="border border-slate-200 rounded-xl px-3 py-2.5">
          <p className="text-[12px] font-semibold text-slate-500 uppercase tracking-wide">Financial context</p>
          <p className="text-[14px] font-bold text-slate-900 mt-0.5 tabular-nums">
            {money(detail.money.captured_cents, detail.money.currency ?? "CAD")} captured
          </p>
          <p className="text-[12px] text-slate-600">
            {detail.money.refunded_cents > 0
              ? `${money(detail.money.refunded_cents, detail.money.currency ?? "CAD")} refunded`
              : "Refund: not requested"}
          </p>
          <div className="flex items-center gap-2 mt-1.5">
            {detail.booking && (
              <Link href={`/admin/bookings?open=booking:${detail.booking.id}`}
                className="inline-flex items-center gap-1 text-[12px] font-semibold text-slate-700 bg-white border border-slate-200 hover:border-brand-300 px-2 py-1 rounded-lg">
                <CreditCard className="w-3 h-3" /> Open payment
              </Link>
            )}
            <span className="text-[11px] text-slate-500 italic">
              Financial actions require a separate review.
            </span>
          </div>
        </section>
      )}

      {/* PRIVATE NOTE */}
      <section>
        <h3 className="text-[12px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Private note</h3>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
          placeholder="Add an internal case note…"
          className="w-full text-[13px] border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-200" />
        <div className="flex items-center gap-2 mt-1.5">
          <button
            disabled={pending || note.trim().length === 0}
            onClick={() => run(async () => {
              const result = await addCaseNoteAction(detail.id, note);
              if (result.ok) setNote("");
              return result;
            })}
            className="inline-flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-[12px] font-semibold px-3 py-1.5 rounded-lg">
            <MessageSquarePlus className="w-3.5 h-3.5" /> Save note
          </button>
          <span className="text-[11px] text-slate-400">Staff only, on the timeline with your name.</span>
        </div>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------ evidence */

function Evidence({ detail }: { detail: CaseDetail }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    setError(null);
    for (const file of Array.from(files)) {
      const form = new FormData();
      form.set("file", file);
      form.set("case_id", detail.id);
      try {
        const response = await fetch("/api/admin/disputes/evidence", { method: "POST", body: form });
        const json = await response.json();
        if (!response.ok) setError(json.error ?? "That file could not be stored.");
      } catch (e) {
        setError((e as Error).message);
      }
    }
    setUploading(false);
    if (input.current) input.current.value = "";
    router.refresh();
  };

  return (
    <div className="px-4 py-3 space-y-3">
      <p className="text-[12px] text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 flex items-start gap-1.5">
        <Lock className="w-3.5 h-3.5 text-slate-400 mt-px shrink-0" />
        Evidence is held privately and handed out one signed minute at a time. Every time a file
        is opened, the case records who opened it — the counts below are those records.
      </p>

      <ul className="space-y-1.5">
        {detail.evidence.length === 0 && (
          <li className="text-[13px] text-slate-500">Nothing attached to this case yet.</li>
        )}
        {detail.evidence.map((e) => (
          <li key={e.id} className="border border-slate-200 rounded-xl px-3 py-2 flex items-center gap-2">
            <Paperclip className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-semibold text-slate-800 truncate">
                {e.filename ?? e.description ?? e.kind}
              </span>
              <span className="block text-[11px] text-slate-500">
                {e.added_by ?? "Staff"} · <ClientDateTime iso={e.created_at} mode="datetime" />
                {e.size_bytes != null ? ` · ${fileSize(e.size_bytes)}` : ""}
                {` · opened ${e.views} time${e.views === 1 ? "" : "s"}`}
              </span>
            </span>
            {e.kind === "file" && (
              <a href={`/api/admin/disputes/evidence/${e.id}`}
                className="text-[12px] font-semibold text-brand-700 hover:text-brand-800 shrink-0">
                Open
              </a>
            )}
          </li>
        ))}
      </ul>

      {detail.conversations.length > 0 && (
        <section>
          <h3 className="text-[12px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
            Conversations from this case
          </h3>
          <ul className="space-y-1">
            {detail.conversations.map((c) => (
              <li key={c.id}>
                <Link href={`/admin/inbox?open=${c.id}`}
                  className="flex items-center gap-2 border border-slate-200 rounded-xl px-3 py-2 hover:border-brand-300">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold text-slate-800 truncate">{c.subject}</span>
                    <span className="block text-[11px] text-slate-500">
                      {c.ref} · to the {c.party_role} · {c.channel === "email" ? "Email" : "In-app"}
                      {c.last_delivery ? ` · ${c.last_delivery.replace("_", " ")}` : ""}
                    </span>
                  </span>
                  <ExternalLink className="w-3 h-3 text-slate-300 shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div>
        <input ref={input} type="file" multiple hidden onChange={(e) => void upload(e.target.files)} />
        <button onClick={() => input.current?.click()} disabled={uploading}
          className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-slate-700 bg-white border border-slate-200 hover:border-brand-300 px-3 py-1.5 rounded-lg disabled:opacity-50">
          {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
          Add evidence
        </button>
        {error && <p className="text-[12px] text-rose-700 mt-1.5">{error}</p>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ timeline */

function Timeline({ detail }: { detail: CaseDetail }) {
  if (detail.timeline.length === 0) {
    return <p className="px-4 py-8 text-center text-[13px] text-slate-500">Nothing recorded yet.</p>;
  }
  return (
    <ol className="px-4 py-3 space-y-2.5">
      {detail.timeline.map((e, i) => (
        <li key={i} className="flex gap-2.5">
          <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
            e.kind === "resolved" ? "bg-emerald-500"
            : e.kind === "escalated" || e.kind === "reopened" ? "bg-rose-500"
            : "bg-slate-300"
          }`} />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium text-slate-900">
              {EVENT_LABEL[e.kind] ?? e.kind}
            </p>
            {e.body && <p className="text-[12px] text-slate-600 break-words whitespace-pre-wrap">{e.body}</p>}
            <p className="text-[11px] text-slate-400">
              {e.actor} · <ClientDateTime iso={e.at} mode="datetime" />
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/* ---------------------------------------------------------- resolution */

function Resolution({
  detail, run, pending, token, admins,
}: {
  detail: CaseDetail;
  run: (fn: () => Promise<CaseResult>) => void;
  pending: boolean;
  token: string;
  admins: { id: string; name: string | null }[];
}) {
  const [outcome, setOutcome] = useState<string>("");
  const [reason, setReason] = useState("");
  const [notifyCustomer, setNotifyCustomer] = useState(false);
  const [notifyHelper, setNotifyHelper] = useState(false);
  const [acceptOpen, setAcceptOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState("");

  return (
    <div className="px-4 py-3 space-y-3">
      {/* PREVIOUS FINDINGS, kept. */}
      {detail.resolutions.length > 0 && (
        <section>
          <h3 className="text-[12px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
            Findings on this case
          </h3>
          <ul className="space-y-1.5">
            {detail.resolutions.map((r, i) => (
              <li key={i} className="border border-slate-200 rounded-xl px-3 py-2">
                <p className="text-[13px] font-semibold text-slate-900">
                  {OUTCOME_LABEL[r.outcome] ?? r.outcome}
                  {r.reopened_at && <span className="text-[11px] font-normal text-amber-700"> · later reopened</span>}
                </p>
                <p className="text-[12px] text-slate-700 mt-0.5 whitespace-pre-wrap">{r.reason}</p>
                <p className="text-[11px] text-slate-400 mt-1">
                  {r.resolved_by ?? "Staff"} · <ClientDateTime iso={r.resolved_at} mode="datetime" />
                  {r.open_tasks_at_close > 0 ? ` · closed with ${r.open_tasks_at_close} step(s) open` : ""}
                </p>
                {r.reopen_reason && (
                  <p className="text-[11px] text-amber-800 mt-1">Reopened: {r.reopen_reason}</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {detail.actions.resolve ? (
        <section className="space-y-2">
          <h3 className="text-[12px] font-semibold text-slate-500 uppercase tracking-wide">Record the finding</h3>

          <div className="space-y-1">
            {(Object.keys(OUTCOME_LABEL) as (keyof typeof OUTCOME_LABEL)[]).map((key) => (
              <label key={key} className={`flex items-start gap-2 rounded-lg border px-2.5 py-1.5 cursor-pointer ${
                outcome === key ? "border-brand-400 bg-brand-50/60" : "border-slate-200 hover:border-slate-300"
              }`}>
                <input type="radio" name="outcome" value={key} checked={outcome === key}
                  onChange={() => setOutcome(key)} className="mt-1" />
                <span>
                  <span className="block text-[13px] font-semibold text-slate-800">{OUTCOME_LABEL[key]}</span>
                  <span className="block text-[11px] text-slate-500">{OUTCOME_MEANING[key]}</span>
                </span>
              </label>
            ))}
          </div>

          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={4}
            placeholder="The reasoning. What was looked at, what both sides said, and why this conclusion — at least a couple of sentences."
            className="w-full text-[13px] border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-200" />
          <p className="text-[11px] text-slate-400">
            {reason.trim().length < 20
              ? `${20 - reason.trim().length} more characters — this is what somebody reads when the case is questioned.`
              : "This is kept even if the case is later reopened."}
          </p>

          <div className="space-y-1">
            <p className="text-[12px] font-semibold text-slate-600">Tell them the outcome?</p>
            {detail.parties.customer && (
              <label className="flex items-center gap-2 text-[13px] text-slate-700">
                <input type="checkbox" checked={notifyCustomer} onChange={(e) => setNotifyCustomer(e.target.checked)} />
                Notify {detail.parties.customer.name ?? "the customer"} in their app
              </label>
            )}
            {detail.parties.helper && (
              <label className="flex items-center gap-2 text-[13px] text-slate-700">
                <input type="checkbox" checked={notifyHelper} onChange={(e) => setNotifyHelper(e.target.checked)} />
                Notify {detail.parties.helper.name ?? "the helper"} in their app
              </label>
            )}
          </div>

          {detail.actions.open_tasks > 0 && (
            <label className="flex items-start gap-2 text-[13px] text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2">
              <input type="checkbox" checked={acceptOpen} onChange={(e) => setAcceptOpen(e.target.checked)} className="mt-0.5" />
              <span>
                {detail.actions.open_tasks} step{detail.actions.open_tasks === 1 ? " is" : "s are"} still open.
                Close anyway, with that recorded on the finding.
              </span>
            </label>
          )}

          <p className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
            Closing this case records a finding and nothing else. It does not refund anybody and it
            does not restrict an account — both are separate decisions on their own screens.
          </p>

          <button
            disabled={pending || !outcome || reason.trim().length < 20 || (detail.actions.open_tasks > 0 && !acceptOpen)}
            onClick={() => run(() => resolveCaseAction(
              detail.id, token, outcome, reason,
              { customer: notifyCustomer, helper: notifyHelper }, acceptOpen))}
            className="w-full inline-flex items-center justify-center gap-1.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-[13px] font-semibold px-3 py-2 rounded-xl"
          >
            {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckSquare className="w-4 h-4" />}
            Record finding and close
          </button>
        </section>
      ) : (
        <section className="space-y-2">
          <p className="text-[13px] text-slate-700">
            This case was closed as{" "}
            <span className="font-semibold">{detail.outcome ? OUTCOME_LABEL[detail.outcome] : "resolved"}</span>
            {detail.resolved_at && <> on <ClientDateTime iso={detail.resolved_at} mode="date" /></>}.
          </p>
          <textarea value={reopenReason} onChange={(e) => setReopenReason(e.target.value)} rows={2}
            placeholder="Why does it need reopening?"
            className="w-full text-[13px] border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-200" />
          <button
            disabled={pending || reopenReason.trim().length < 10}
            onClick={() => run(() => reopenCaseAction(detail.id, token, reopenReason))}
            className="inline-flex items-center gap-1.5 bg-white border border-slate-200 hover:border-brand-300 text-[13px] font-semibold text-slate-700 px-3 py-2 rounded-xl disabled:opacity-50"
          >
            <RotateCcw className="w-4 h-4" /> Reopen case
          </button>
          <p className="text-[11px] text-slate-400">The finding above is kept, marked as reopened.</p>
        </section>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- footer */

function Footer({
  detail, run, pending, token, admins, message, onReload, setTab,
}: {
  detail: CaseDetail;
  run: (fn: () => Promise<CaseResult>) => void;
  pending: boolean;
  token: string;
  admins: { id: string; name: string | null }[];
  message: { ok: boolean; text: string; conflict?: boolean } | null;
  onReload: () => void;
  setTab: (t: Tab) => void;
}) {
  const [contact, setContact] = useState<null | "customer" | "helper">(null);
  const [channel, setChannel] = useState<"in_app" | "email">("in_app");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [escalating, setEscalating] = useState(false);
  const [to, setTo] = useState("");
  const [why, setWhy] = useState("");

  return (
    <div className="border-t border-slate-100 px-4 py-3 space-y-2 bg-slate-50/60">
      {message && (
        <div className={`text-[12px] rounded-lg px-2.5 py-1.5 flex items-start gap-2 ${
          message.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"
        }`}>
          <span className="flex-1">{message.text}</span>
          {message.conflict && (
            <button onClick={onReload} className="font-semibold underline shrink-0">Reload</button>
          )}
        </div>
      )}

      {detail.actions.acknowledge_escalation && (
        <button onClick={() => run(() => acknowledgeEscalationAction(detail.id))} disabled={pending}
          className="w-full text-[12px] font-semibold bg-rose-600 hover:bg-rose-700 text-white px-3 py-2 rounded-xl">
          Acknowledge the escalation
        </button>
      )}

      {contact && (
        <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-2">
          <p className="text-[12px] text-slate-600">
            Messaging the {contact}. This opens a conversation in the inbox, linked to this case,
            and its delivery state is shown there.
          </p>
          <div className="flex items-center gap-1.5">
            {(["in_app", "email"] as const).map((c) => (
              <button key={c} onClick={() => setChannel(c)}
                className={`text-[12px] font-semibold px-2.5 py-1 rounded-lg border ${
                  channel === c ? "bg-brand-600 border-brand-600 text-white" : "bg-white border-slate-200 text-slate-600"
                }`}>
                {c === "in_app" ? "In-app" : "Email"}
              </button>
            ))}
          </div>
          <input value={subject} onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
            className="w-full text-[13px] border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-200" />
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3}
            placeholder="What do you need from them?"
            className="w-full text-[13px] border border-slate-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-brand-200" />
          <div className="flex items-center gap-2">
            <button
              disabled={pending || subject.trim().length === 0 || body.trim().length === 0}
              onClick={() => run(async () => {
                const result = await contactPartyAction(detail.id, contact, subject, body, channel);
                if (result.ok) { setSubject(""); setBody(""); setContact(null); }
                return result;
              })}
              className="inline-flex items-center gap-1.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-[12px] font-semibold px-3 py-1.5 rounded-lg">
              {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              Send
            </button>
            <button onClick={() => setContact(null)} className="text-[12px] font-semibold text-slate-500">Cancel</button>
          </div>
        </div>
      )}

      {escalating && (
        <div className="bg-white border border-rose-200 rounded-xl p-3 space-y-2">
          <p className="text-[12px] text-rose-900 font-semibold">
            Escalation hands the case over. They are notified and become the owner.
          </p>
          <select value={to} onChange={(e) => setTo(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[13px]">
            <option value="">Choose who</option>
            {admins.filter((a) => a.id !== detail.owner?.id).map((a) => (
              <option key={a.id} value={a.id}>{a.name ?? a.id.slice(0, 8)}</option>
            ))}
          </select>
          <textarea value={why} onChange={(e) => setWhy(e.target.value)} rows={2}
            placeholder="What do you need them to decide?"
            className="w-full text-[13px] border border-slate-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-rose-200" />
          <div className="flex items-center gap-2">
            <button
              disabled={pending || !to || why.trim().length < 10}
              onClick={() => run(async () => {
                const result = await escalateCaseAction(detail.id, token, to, why);
                if (result.ok) { setWhy(""); setEscalating(false); }
                return result;
              })}
              className="inline-flex items-center gap-1.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-[12px] font-semibold px-3 py-1.5 rounded-lg">
              <ArrowUpRight className="w-3.5 h-3.5" /> Escalate
            </button>
            <button onClick={() => setEscalating(false)} className="text-[12px] font-semibold text-slate-500">Cancel</button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={() => setTab("resolution")}
          className="flex-1 inline-flex items-center justify-center gap-1.5 bg-brand-600 hover:bg-brand-700 text-white text-[13px] font-semibold px-3 py-2 rounded-xl"
        >
          <FileText className="w-4 h-4" />
          {detail.actions.resolve ? "Review resolution" : "View finding"}
        </button>

        <details className="relative shrink-0">
          <summary className="list-none cursor-pointer inline-flex items-center gap-1.5 bg-white border border-slate-200 hover:border-slate-300 text-[13px] font-semibold text-slate-700 px-3 py-2 rounded-xl">
            Contact parties <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </summary>
          <div className="absolute right-0 bottom-full mb-1.5 w-56 bg-white border border-slate-200 rounded-xl shadow-lg p-1 z-20">
            {detail.actions.contact_customer && (
              <button onClick={() => setContact("customer")}
                className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-slate-50 text-[13px] font-semibold text-slate-800">
                Message the customer
              </button>
            )}
            {detail.actions.contact_helper && (
              <button onClick={() => setContact("helper")}
                className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-slate-50 text-[13px] font-semibold text-slate-800">
                Message the helper
              </button>
            )}
            {detail.actions.contact_blocked_reason && (
              <p className="px-2.5 py-2 text-[12px] text-slate-500">{detail.actions.contact_blocked_reason}</p>
            )}
          </div>
        </details>

        {detail.actions.escalate && (
          <button onClick={() => setEscalating((v) => !v)} disabled={pending}
            className="inline-flex items-center gap-1.5 bg-white border border-rose-200 hover:border-rose-300 text-[13px] font-semibold text-rose-700 px-3 py-2 rounded-xl">
            <AlertTriangle className="w-4 h-4" /> Escalate
          </button>
        )}
      </div>

      <p className="text-[11px] text-slate-500 italic">
        Every decision records an owner, an outcome and a reason.
      </p>
    </div>
  );
}

/* ----------------------------------------------------------------- bits */

function describeEvidence(detail: CaseDetail): string {
  const files = detail.evidence.filter((e) => e.kind === "file").length;
  const others = detail.evidence.length - files;
  if (detail.evidence.length === 0) return "Nothing attached yet";
  const parts = [];
  if (files) parts.push(`${files} attachment${files === 1 ? "" : "s"}`);
  if (others) parts.push(`${others} other item${others === 1 ? "" : "s"}`);
  return parts.join(" · ");
}

function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

/* datetime-local wants the viewer's own clock, not UTC. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
