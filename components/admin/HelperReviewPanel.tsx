"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  X, ExternalLink, CheckCircle2, AlertCircle, Clock, Loader2, Lock,
  MapPin, ShieldCheck, Ban, MessageSquarePlus, Info,
} from "lucide-react";
import type { HelperDetail } from "@/lib/data/admin-helpers";
import { STATE_LABEL, STATE_TONE } from "@/lib/admin-helper-states";
import { age } from "@/lib/admin-format";
import {
  addHelperNoteAction, approveProviderAction, assignReviewerAction,
  rejectProviderAction, requestHelperInfoAction,
} from "@/app/(admin)/admin/helpers/actions";

/*
  ONE APPLICATION, AND THE DECISION.

  THE CHECKS ARE FIVE SEPARATE FACTS, not a funnel. A helper can have a
  cleared background check and no photo; the old overview drew them in
  sequence and ended up reporting approvals sitting behind zero verified
  helpers. Each row here says what it knows and when it was last looked
  at.

  APPROVAL IS NOT READINESS, and the panel keeps them apart. Approving
  somebody does not make them reachable: they still have to be online,
  located, payout-ready and offering a service before dispatch can find
  them. That block sits below the decision, greyed, so nobody reads a
  green Approved as "this helper can take work".

  DECISIONS ASK TWICE. Approve and reject both open a confirmation with
  a note, because both notify the applicant and both land in the audit
  log under the name of whoever clicked.
*/

type Tab = "application" | "checks" | "activity";

export function HelperReviewPanel({
  detail, admins,
}: {
  detail: HelperDetail;
  admins: { id: string; name: string | null }[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [tab, setTab] = useState<Tab>("application");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const close = () => {
    const next = new URLSearchParams(params.toString());
    next.delete("open");
    router.replace(`/admin/helpers?${next.toString()}`, { scroll: false });
  };

  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) =>
    start(async () => {
      const result = await fn();
      setMessage({ ok: result.ok, text: result.ok ? (result.message ?? "Done.") : (result.error ?? "Failed.") });
      if (result.ok) router.refresh();
    });

  return (
    <aside className="bg-white rounded-2xl border border-slate-200 flex flex-col max-h-[calc(100vh-7rem)] sticky top-4 overflow-hidden">
      <header className="px-4 pt-4 pb-3 border-b border-slate-100">
        <div className="flex items-start gap-3">
          {detail.avatar_url ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={detail.avatar_url} alt="" className="w-12 h-12 rounded-full object-cover shrink-0" />
          ) : (
            <span className="w-12 h-12 rounded-full bg-slate-100 text-slate-500 grid place-items-center text-[14px] font-bold shrink-0">
              {(detail.name ?? "?").slice(0, 2).toUpperCase()}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="text-[19px] font-bold text-slate-900 leading-tight truncate">
              {detail.name ?? "Applicant"}
            </h2>
            <p className="text-[12px] text-slate-500">
              {detail.ref} · Applied {age((Date.now() - new Date(detail.created_at).getTime()) / 1000)} ago
            </p>
            <span className={`inline-block mt-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full ${
              STATE_TONE[detail.state]
            }`}>
              {STATE_LABEL[detail.state]}
            </span>
          </div>
          <Link href="/admin/users" title="Open full profile"
            className="w-8 h-8 grid place-items-center rounded-lg text-slate-400 hover:text-brand-700 hover:bg-slate-50">
            <ExternalLink className="w-4 h-4" />
          </Link>
          <button onClick={close} aria-label="Close"
            className="w-8 h-8 grid place-items-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-50">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-2 mt-3">
          <span className="text-[12px] text-slate-500">Owner</span>
          <select
            value={detail.owner?.id ?? ""}
            disabled={pending}
            onChange={(e) => run(() => assignReviewerAction(detail.user_id, e.target.value || null))}
            className="flex-1 bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[13px] text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-200"
          >
            <option value="">Unassigned</option>
            {admins.map((a) => <option key={a.id} value={a.id}>{a.name ?? a.id.slice(0, 8)}</option>)}
          </select>
        </div>

        <nav className="flex items-center gap-4 mt-3 -mb-3">
          {(["application", "checks", "activity"] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`text-[13px] font-semibold pb-2.5 border-b-2 capitalize ${
                tab === t ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800"
              }`}>
              {t}
              {t === "activity" && detail.events.length > 0 && (
                <span className="ml-1 text-[11px] text-slate-400">{detail.events.length}</span>
              )}
            </button>
          ))}
        </nav>
      </header>

      <div className="flex-1 overflow-y-auto">
        {tab === "application" && <Application detail={detail} />}
        {tab === "checks" && <Checks detail={detail} />}
        {tab === "activity" && <Activity detail={detail} onNote={(body) => run(() => addHelperNoteAction(detail.user_id, body))} pending={pending} />}
      </div>

      <Decision detail={detail} run={run} pending={pending} message={message} />
    </aside>
  );
}

function Application({ detail }: { detail: HelperDetail }) {
  return (
    <div className="px-4 py-3 space-y-4">
      <div>
        <h3 className="text-[12px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Summary</h3>
        <p className="flex items-center gap-1.5 text-[13px] text-slate-800">
          <MapPin className="w-3.5 h-3.5 text-slate-400" />
          {detail.base_address ?? detail.cities.join(", ") ?? detail.country ?? "No area given"}
        </p>
      </div>

      <div>
        <h3 className="text-[12px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
          Offered services
        </h3>
        {detail.services.length === 0 ? (
          <p className="text-[13px] text-slate-500">
            None chosen yet — dispatch matches on service, so nothing can reach them.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {detail.services.map((s) => (
              <span key={s} className="text-[12px] bg-brand-50 text-brand-700 px-2 py-0.5 rounded-full">{s}</span>
            ))}
          </div>
        )}
      </div>

      <ChecksList detail={detail} compact />

      {detail.bio && (
        <div>
          <h3 className="text-[12px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
            Application notes
          </h3>
          <p className="text-[13px] text-slate-800 bg-slate-50 rounded-xl px-3 py-2">{detail.bio}</p>
        </div>
      )}

      {/*
        WHAT THIS CONSOLE DOES NOT SHOW. Identity documents live with
        Stripe Identity; nothing in this estate stores or renders one,
        and a link that implied otherwise would be a promise we cannot
        keep. The verification RESULT is what the checks list carries.
      */}
      <p className="flex items-start gap-2 text-[11px] text-slate-500 bg-slate-50 rounded-xl px-3 py-2">
        <Lock className="w-3.5 h-3.5 mt-px shrink-0 text-slate-400" />
        Identity documents are held by Stripe Identity and never stored or shown here. This
        panel carries the verification result only.
      </p>
    </div>
  );
}

function ChecksList({ detail, compact = false }: { detail: HelperDetail; compact?: boolean }) {
  return (
    <div>
      <h3 className="text-[12px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
        Required checks
      </h3>
      <ul className="rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
        {detail.checks.map((check) => (
          <li key={check.key} className="flex items-start gap-2 px-3 py-2">
            {check.ok
              ? <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
              : <Clock className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />}
            <span className="text-[13px] text-slate-700">{check.label}</span>
            <span className={`ml-auto text-[12px] font-semibold ${
              check.ok ? "text-emerald-700" : "text-amber-700"
            }`}>
              {check.value}
            </span>
          </li>
        ))}
      </ul>
      {!compact && (
        <ul className="mt-2 space-y-1">
          {detail.checks.filter((c) => c.note).map((c) => (
            <li key={c.key} className="text-[11px] text-slate-500">
              <span className="font-semibold">{c.label}:</span> {c.note}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Checks({ detail }: { detail: HelperDetail }) {
  const d = detail.dispatch;
  return (
    <div className="px-4 py-3 space-y-4">
      <ChecksList detail={detail} />

      {/*
        Deliberately below, deliberately separate: this is what decides
        whether work can reach them, and it has nothing to do with the
        approval decision above it.
      */}
      <div>
        <h3 className="text-[12px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
          Dispatch readiness
        </h3>
        <div className={`rounded-xl border px-3 py-2 ${
          d.dispatchable ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50"
        }`}>
          <p className="text-[13px] font-semibold text-slate-900">
            {d.dispatchable ? "Can receive work right now" : "Cannot receive work right now"}
          </p>
          <ul className="mt-1 space-y-0.5 text-[12px] text-slate-600">
            <li>Online: {d.is_online ? "yes" : "no"}</li>
            <li>Vacation mode: {d.vacation_mode ? "on" : "off"}</li>
            <li>
              Location: {d.location_updated_at
                ? `${age((Date.now() - new Date(d.location_updated_at).getTime()) / 1000)} old`
                : "never reported"}
            </li>
            <li>Services chosen: {d.services_chosen}</li>
            <li>Radius: {d.service_radius_km ?? 20} km</li>
          </ul>
        </div>
        <p className="text-[11px] text-slate-500 mt-1.5">
          Approval and dispatch readiness are separate. Approving an application does not put
          anybody online.
        </p>
      </div>
    </div>
  );
}

function Activity({ detail, onNote, pending }: {
  detail: HelperDetail;
  onNote: (body: string) => void;
  pending: boolean;
}) {
  const [body, setBody] = useState("");
  return (
    <div className="px-4 py-3">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={2}
        placeholder="Internal note — the applicant never sees this."
        className="w-full text-[13px] border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-200"
      />
      <button
        disabled={pending || body.trim().length === 0}
        onClick={() => { onNote(body); setBody(""); }}
        className="mt-1.5 inline-flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-[12px] font-semibold px-3 py-1.5 rounded-lg"
      >
        <MessageSquarePlus className="w-3.5 h-3.5" /> Add note
      </button>

      <ul className="mt-4 space-y-3">
        {detail.events.length === 0 && (
          <li className="text-[13px] text-slate-500">Nothing recorded on this application yet.</li>
        )}
        {detail.events.map((event, i) => (
          <li key={i} className="text-[13px]">
            <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${
              event.kind === "approved" ? "bg-emerald-50 text-emerald-700"
                : event.kind === "rejected" ? "bg-rose-50 text-rose-700"
                : event.kind === "info_requested" ? "bg-amber-50 text-amber-800"
                : "bg-slate-100 text-slate-600"
            }`}>
              {event.kind.replace("_", " ")}
            </span>
            {event.body && <p className="text-slate-800 mt-1 whitespace-pre-wrap">{event.body}</p>}
            <p className="text-[11px] text-slate-400 mt-0.5">
              {event.actor} · {new Date(event.at).toLocaleString()}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Decision({ detail, run, pending, message }: {
  detail: HelperDetail;
  run: (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) => void;
  pending: boolean;
  message: { ok: boolean; text: string } | null;
}) {
  const [mode, setMode] = useState<null | "approve" | "reject" | "info">(null);
  const [note, setNote] = useState("");

  if (detail.status !== "pending") {
    return (
      <footer className="border-t border-slate-100 p-3">
        <p className="text-[12px] text-slate-600">
          {detail.status === "approved"
            ? `Approved${detail.approved_by ? ` by ${detail.approved_by}` : ""}${
                detail.approved_at ? ` on ${new Date(detail.approved_at).toLocaleDateString()}` : ""}.`
            : `Not active — ${detail.rejection_reason ?? detail.status}.`}
        </p>
        {message && (
          <p className={`text-[12px] mt-1 ${message.ok ? "text-emerald-700" : "text-rose-700"}`}>{message.text}</p>
        )}
      </footer>
    );
  }

  return (
    <footer className="border-t border-slate-100 p-3 space-y-2">
      {mode && (
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          autoFocus
          placeholder={
            mode === "reject" ? "Why is this being rejected? The applicant is told."
              : mode === "info" ? "What do you need from them? They receive this."
              : "Optional note for the record."
          }
          className="w-full text-[13px] border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-200"
        />
      )}

      {message && (
        <p className={`text-[12px] ${message.ok ? "text-emerald-700" : "text-rose-700"}`}>{message.text}</p>
      )}

      {!detail.actions.approve && detail.actions.approve_blocked_reason && (
        <p className="flex items-start gap-1.5 text-[11px] text-slate-500">
          <Info className="w-3.5 h-3.5 mt-px shrink-0 text-slate-400" />
          {detail.actions.approve_blocked_reason}
        </p>
      )}

      <div className="flex items-center gap-2">
        <button
          disabled={pending || !detail.actions.approve}
          onClick={() => {
            if (mode !== "approve") { setMode("approve"); return; }
            run(() => approveProviderAction(detail.user_id));
            setMode(null);
          }}
          className="flex-1 inline-flex items-center justify-center gap-1.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-40 text-white text-[12px] font-semibold px-3 py-2 rounded-xl"
        >
          {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
          {mode === "approve" ? "Confirm approval" : "Approve"}
        </button>

        <button
          disabled={pending}
          onClick={() => {
            if (mode !== "info") { setMode("info"); return; }
            run(() => requestHelperInfoAction(detail.user_id, note));
            setMode(null); setNote("");
          }}
          className="flex-1 inline-flex items-center justify-center gap-1.5 border border-slate-200 text-slate-700 hover:border-slate-300 disabled:opacity-50 text-[12px] font-semibold px-3 py-2 rounded-xl"
        >
          <AlertCircle className="w-3.5 h-3.5" />
          {mode === "info" ? "Send request" : "Request information"}
        </button>

        <button
          disabled={pending}
          onClick={() => {
            if (mode !== "reject") { setMode("reject"); return; }
            run(() => rejectProviderAction(detail.user_id, note));
            setMode(null); setNote("");
          }}
          className="flex-1 inline-flex items-center justify-center gap-1.5 border border-rose-200 text-rose-700 hover:bg-rose-50 disabled:opacity-50 text-[12px] font-semibold px-3 py-2 rounded-xl"
        >
          <Ban className="w-3.5 h-3.5" />
          {mode === "reject" ? "Confirm rejection" : "Reject"}
        </button>
      </div>

      <p className="text-[11px] text-slate-400">
        Decisions notify the applicant and are recorded in the audit log under your name.
      </p>
    </footer>
  );
}
