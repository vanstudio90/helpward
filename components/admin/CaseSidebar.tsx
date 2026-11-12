"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  ExternalLink, CalendarDays, CreditCard, ShieldAlert, Tag, X, Loader2,
  Mail, MessageSquare, Plus, History,
} from "lucide-react";
import type { CaseDetail } from "@/lib/data/admin-inbox";
import {
  PRIORITY_DOT, STATUS_MEANING, CHANNEL_LABEL,
} from "@/lib/admin-inbox-states";
import { money } from "@/lib/admin-format";
import { ClientDateTime } from "@/components/ClientDateTime";
import {
  openSafetyCaseAction, tagCaseAction, updateCaseAction,
} from "@/app/(admin)/admin/inbox/actions";

/*
  WHAT THIS CONVERSATION IS ATTACHED TO.

  The booking card is the reason this column exists: almost every
  support question is really a question about one job, and an operator
  who has to go and find it will answer from memory instead.

  PAYMENT IS SHOWN IN ITS OWN STATE, never summed with the quote and
  never translated into "paid". Authorized money is a hold; captured
  money has moved. The two are different answers to "has the customer
  been charged", which is the single most common question in this inbox.
*/

const PAYMENT_LABEL: Record<string, string> = {
  pending: "No hold placed",
  authorized: "Authorized",
  captured: "Captured",
  refunded: "Refunded",
  partial_refund: "Partly refunded",
  failed: "Capture failed",
};

const PAYMENT_TONE: Record<string, string> = {
  pending: "bg-slate-100 text-slate-600",
  authorized: "bg-sky-50 text-sky-700",
  captured: "bg-emerald-50 text-emerald-700",
  refunded: "bg-amber-50 text-amber-800",
  partial_refund: "bg-amber-50 text-amber-800",
  failed: "bg-rose-50 text-rose-700",
};

export function CaseSidebar({
  detail, admins,
}: {
  detail: CaseDetail;
  admins: { id: string; name: string | null }[];
}) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [tagging, setTagging] = useState(false);
  const [tag, setTag] = useState("");
  const [safety, setSafety] = useState(false);
  const [category, setCategory] = useState("safety");
  const [description, setDescription] = useState("");

  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) =>
    start(async () => {
      const result = await fn();
      setMessage({ ok: result.ok, text: result.ok ? (result.message ?? "Done.") : (result.error ?? "Failed.") });
    });

  const select =
    "appearance-none bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[13px] text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-200";

  return (
    <aside className="bg-white rounded-2xl border border-slate-200 flex flex-col max-h-[calc(100vh-7rem)] overflow-y-auto">
      <div className="px-4 py-3 border-b border-slate-100">
        <h3 className="text-[15px] font-bold text-slate-900">Case details</h3>
      </div>

      <div className="px-4 py-3 space-y-2">
        <Field label="Status">
          <select value={detail.status} disabled={pending} title={STATUS_MEANING[detail.status]}
            onChange={(e) => run(() => updateCaseAction(detail.id, { status: e.target.value }))}
            className={select}>
            <option value="open">Open</option>
            <option value="waiting">Waiting</option>
            <option value="resolved">Resolved</option>
          </select>
        </Field>

        <Field label="Priority">
          <span className="inline-flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${PRIORITY_DOT[detail.priority]}`} />
            <select value={detail.priority} disabled={pending}
              onChange={(e) => run(() => updateCaseAction(detail.id, { priority: e.target.value }))}
              className={select}>
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </span>
        </Field>

        <Field label="Assigned to">
          <select value={detail.assignee?.id ?? ""} disabled={pending}
            onChange={(e) => run(() => updateCaseAction(detail.id, { assignee: e.target.value }))}
            className={select}>
            <option value="">Unassigned</option>
            {admins.map((a) => <option key={a.id} value={a.id}>{a.name ?? a.id.slice(0, 8)}</option>)}
          </select>
        </Field>

        <Field label="Customer">
          {detail.customer ? (
            <span className="inline-flex items-center gap-1.5 min-w-0">
              <span className="text-[13px] text-slate-900 truncate">{detail.customer.name ?? detail.customer.ref}</span>
              <Link href={`/admin/users?open=${detail.customer.id}`}
                className="text-[12px] font-semibold text-brand-700 hover:text-brand-800 inline-flex items-center gap-0.5 shrink-0">
                View profile <ExternalLink className="w-3 h-3" />
              </Link>
            </span>
          ) : (
            <span className="text-[13px] text-slate-500 truncate">
              {detail.contact_email ?? "Unknown sender"} · no account
            </span>
          )}
        </Field>

        <Field label="Channel">
          <span className="inline-flex items-center gap-1.5 text-[13px] text-slate-800">
            {detail.channel === "email" ? <Mail className="w-3.5 h-3.5 text-slate-400" /> : <MessageSquare className="w-3.5 h-3.5 text-slate-400" />}
            {CHANNEL_LABEL[detail.channel]}
          </span>
        </Field>

        {detail.customer && (
          <p className="text-[11px] text-slate-500 pt-0.5">
            Customer since <ClientDateTime iso={detail.customer.joined_at} mode="date" /> ·{" "}
            {detail.customer.bookings_total} booking{detail.customer.bookings_total === 1 ? "" : "s"}
          </p>
        )}
      </div>

      {/* THE JOB THIS IS ABOUT */}
      <div className="px-4 pb-3">
        {detail.booking ? (
          <div className="border border-slate-200 rounded-xl px-3 py-2.5">
            <div className="flex items-start gap-2">
              <span className="w-8 h-8 rounded-lg bg-brand-50 text-brand-700 grid place-items-center shrink-0">
                <CalendarDays className="w-4 h-4" />
              </span>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-slate-900 truncate">
                  {detail.booking.service ?? "Booking"}
                </p>
                <p className="text-[12px] text-slate-500 tabular-nums">{detail.booking.ref}</p>
              </div>
            </div>
            <dl className="mt-2 space-y-1">
              <Line label="Scheduled">
                <ClientDateTime iso={detail.booking.scheduled_for} mode="datetime" />
              </Line>
              <Line label="Helper">{detail.booking.helper ?? "Unassigned"}</Line>
              <Line label={`${detail.booking.currency ?? "CAD"} quote`}>
                {detail.booking.total_cents == null
                  ? "—"
                  : money(detail.booking.total_cents, detail.booking.currency ?? "CAD")}
              </Line>
              <div className="flex items-center gap-2 text-[13px]">
                <dt className="text-slate-500">Payment</dt>
                <dd className="ml-auto">
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                    PAYMENT_TONE[detail.booking.payment_status ?? "pending"] ?? "bg-slate-100 text-slate-600"
                  }`}>
                    {PAYMENT_LABEL[detail.booking.payment_status ?? "pending"] ?? detail.booking.payment_status}
                  </span>
                </dd>
              </div>
            </dl>
            <Link href={`/admin/bookings?open=booking:${detail.booking.id}`}
              className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-brand-700 hover:text-brand-800">
              Open booking <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
        ) : (
          <p className="text-[12px] text-slate-500 border border-dashed border-slate-200 rounded-xl px-3 py-2.5">
            No booking is linked to this conversation, so there is nothing to show about a job,
            a helper or a payment.
          </p>
        )}
      </div>

      {/* THE THREE MOVES */}
      <div className="px-4 pb-3 flex flex-wrap gap-1.5">
        {/* The booking record is where the money actually is — holds,
            captures and refunds as separate events. /admin/payments is
            still a stub, and a button that lands on one is worse than
            no button. */}
        {detail.booking ? (
          <Link href={`/admin/bookings?open=booking:${detail.booking.id}`}
            className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-slate-700 bg-white border border-slate-200 hover:border-slate-300 px-2.5 py-1.5 rounded-lg">
            <CreditCard className="w-3.5 h-3.5 text-slate-500" /> View payment
          </Link>
        ) : null}

        {detail.dispute ? (
          <Link href="/admin/disputes"
            className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 px-2.5 py-1.5 rounded-lg">
            <ShieldAlert className="w-3.5 h-3.5" /> Safety case {detail.dispute.ref}
          </Link>
        ) : detail.actions.open_safety_case ? (
          <button onClick={() => setSafety((v) => !v)}
            className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-slate-700 bg-white border border-slate-200 hover:border-rose-300 hover:text-rose-700 px-2.5 py-1.5 rounded-lg">
            <ShieldAlert className="w-3.5 h-3.5 text-slate-500" /> Open safety case
          </button>
        ) : (
          <span title={detail.actions.open_safety_case_blocked_reason ?? ""}
            className="inline-flex items-center gap-1.5 text-[12px] font-medium text-slate-400 bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-lg cursor-help">
            <ShieldAlert className="w-3.5 h-3.5" /> Safety case
          </span>
        )}

        <button onClick={() => setTagging((v) => !v)}
          className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-slate-700 bg-white border border-slate-200 hover:border-slate-300 px-2.5 py-1.5 rounded-lg">
          <Tag className="w-3.5 h-3.5 text-slate-500" /> Add tag
        </button>
      </div>

      {safety && (
        <div className="px-4 pb-3">
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 space-y-2">
            <p className="text-[12px] text-rose-900 font-semibold">
              This opens a dispute against {detail.booking?.ref} and marks the conversation urgent.
            </p>
            <select value={category} onChange={(e) => setCategory(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[13px]">
              {["safety", "damage", "no_show", "quality", "billing", "other"].map((c) => (
                <option key={c} value={c}>{c.replace("_", " ")}</option>
              ))}
            </select>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
              placeholder="What happened? At least a sentence — the safety team works from this."
              className="w-full text-[13px] border border-slate-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-rose-200" />
            <div className="flex items-center gap-2">
              <button
                disabled={pending || description.trim().length < 10}
                onClick={() => run(async () => {
                  const result = await openSafetyCaseAction(detail.id, category, description);
                  if (result.ok) { setDescription(""); setSafety(false); }
                  return result;
                })}
                className="inline-flex items-center gap-1.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-[12px] font-semibold px-3 py-1.5 rounded-lg">
                {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldAlert className="w-3.5 h-3.5" />}
                Open safety case
              </button>
              <button onClick={() => setSafety(false)} className="text-[12px] font-semibold text-slate-500">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* TAGS */}
      <div className="px-4 pb-3">
        <h4 className="text-[12px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Tags</h4>
        <div className="flex flex-wrap items-center gap-1.5">
          {detail.tags.length === 0 && !tagging && (
            <span className="text-[12px] text-slate-400">None yet.</span>
          )}
          {detail.tags.map((t) => (
            <span key={t} className="inline-flex items-center gap-1 text-[12px] font-medium bg-brand-50 text-brand-700 px-2 py-0.5 rounded-full">
              {t}
              <button onClick={() => run(() => tagCaseAction(detail.id, t, true))} disabled={pending}
                aria-label={`Remove ${t}`} className="text-brand-400 hover:text-brand-700">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          {tagging && (
            <span className="inline-flex items-center gap-1">
              <input value={tag} onChange={(e) => setTag(e.target.value)}
                placeholder="Tag name"
                className="w-28 text-[12px] border border-slate-200 rounded-full px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-brand-200" />
              <button
                disabled={pending || tag.trim().length === 0}
                onClick={() => run(async () => {
                  const result = await tagCaseAction(detail.id, tag);
                  if (result.ok) { setTag(""); setTagging(false); }
                  return result;
                })}
                className="text-brand-700 disabled:opacity-40" aria-label="Add tag">
                <Plus className="w-3.5 h-3.5" />
              </button>
            </span>
          )}
        </div>
      </div>

      {message && (
        <p className={`mx-4 mb-3 text-[12px] rounded-lg px-2.5 py-1.5 ${
          message.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"
        }`}>
          {message.text}
        </p>
      )}

      {/*
        RELATED CASES. "This is their third message about this booking"
        is the fact that changes how a reply gets written, and it used
        to require leaving the conversation to find out.
      */}
      {detail.related.length > 0 && (
        <div className="px-4 pb-3">
          <h4 className="text-[12px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
            Related cases
          </h4>
          <ul className="space-y-1">
            {detail.related.map((r) => (
              <li key={`${r.kind}-${r.id}`}>
                <Link href={r.href}
                  className="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5 hover:border-brand-300">
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${
                    r.kind === "dispute" ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-600"
                  }`}>
                    {r.kind === "dispute" ? "Dispute" : "Case"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12px] font-semibold text-slate-800 truncate">{r.title}</span>
                    <span className="block text-[11px] text-slate-500 tabular-nums">
                      {r.ref} · {r.status}
                    </span>
                  </span>
                  <ExternalLink className="w-3 h-3 text-slate-300 shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* CASE ACTIVITY */}
      <div className="px-4 pb-4 border-t border-slate-100 pt-3">
        <h4 className="text-[12px] font-semibold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
          <History className="w-3.5 h-3.5" /> Case activity
        </h4>
        <ol className="space-y-2">
          {detail.activity.map((e, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-400 mt-1.5 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] text-slate-800">{e.label}</span>
                {e.detail && <span className="block text-[11px] text-slate-500 truncate">{e.detail}</span>}
              </span>
              <span className="text-[11px] text-slate-400 shrink-0">
                <ClientDateTime iso={e.at} mode="time" />
              </span>
            </li>
          ))}
        </ol>
      </div>
    </aside>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[13px] text-slate-500 w-[88px] shrink-0">{label}</span>
      <span className="min-w-0 flex-1 flex justify-end">{children}</span>
    </div>
  );
}

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2 text-[13px]">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-slate-900 ml-auto text-right truncate">{children}</dd>
    </div>
  );
}
