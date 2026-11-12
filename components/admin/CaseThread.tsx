"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Mail, MessageSquare, Lock, Loader2, Send, CheckCircle2, MoreHorizontal,
  Clock, AlertTriangle, Paperclip, ChevronDown, RotateCcw, X, FileText,
  BellOff, Eye, PenLine, Download, Timer,
} from "lucide-react";
import type { CaseDetail } from "@/lib/data/admin-inbox";
import {
  STATUS_LABEL, STATUS_TONE, STATUS_MEANING, DELIVERY_LABEL, DELIVERY_TONE,
  CHANNEL_LABEL,
} from "@/lib/admin-inbox-states";
import { age } from "@/lib/admin-format";
import { ClientDateTime } from "@/components/ClientDateTime";
import { useCasePresence } from "@/components/admin/useCasePresence";
import {
  markCaseReadAction, sendReplyAction, snoozeCaseAction, updateCaseAction,
  type PendingAttachment,
} from "@/app/(admin)/admin/inbox/actions";

/*
  ONE CONVERSATION.

  THE COMPOSER NEVER CLAIMS A SEND IT DID NOT MAKE. Pressing Send
  writes the message down first; the result that comes back says what
  happened to it, and the badge under each outbound message is the
  column the server stamped, not a local assumption. A reply that
  Resend refused reads "Not sent" in the thread forever after, and the
  words stay in the box.

  "REPLY DUE" ONLY APPEARS IF SOMEBODY CONFIGURED A TARGET. With none
  set, due_at is null everywhere and this banner does not render —
  rather than measuring every case against a promise nobody made.

  PRESENCE IS HERE BECAUSE THIS IS A SHARED INBOX. Two people
  answering the same customer a minute apart is the failure mode a
  personal mailbox does not have, so who else is looking — and who is
  typing — sits next to the subject.
*/

const TEMPLATES = [
  {
    label: "Acknowledge and hold",
    body: "Thanks for writing in — I have your message and I'm looking into it now. I'll come back to you within a few hours with an answer.",
  },
  {
    label: "Ask for the booking details",
    body: "Thanks for letting us know. So I can look at the right job, could you tell me the booking reference and roughly when it was scheduled?",
  },
  {
    label: "Close the loop",
    body: "That's sorted now. I'll leave this open for a little while in case anything else comes up — just reply here and it comes straight back to me.",
  },
];

const SNOOZE_OPTIONS = [
  { label: "1 hour", hours: 1 },
  { label: "4 hours", hours: 4 },
  { label: "Tomorrow", hours: 24 },
  { label: "Next week", hours: 168 },
];

export function CaseThread({
  detail, admins, me,
}: {
  detail: CaseDetail;
  admins: { id: string; name: string | null }[];
  me: { id: string; name: string };
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState<"reply" | "note">("reply");
  const [body, setBody] = useState("");
  const [draftSaved, setDraftSaved] = useState(false);
  const [files, setFiles] = useState<PendingAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const bottom = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const { others, setTyping } = useCasePresence(detail.id, me);
  const draftKey = `helpward.support.draft.${detail.id}.${mode}`;

  /* Opening a conversation is what marks it read, per staff member. */
  useEffect(() => {
    void markCaseReadAction(detail.id);
  }, [detail.id, detail.messages.length]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(draftKey);
      setBody(saved ?? "");
      setDraftSaved(Boolean(saved));
    } catch {
      setBody("");
    }
  }, [draftKey]);

  useEffect(() => {
    const id = setTimeout(() => {
      try {
        if (body.trim()) {
          window.localStorage.setItem(draftKey, body);
          setDraftSaved(true);
        } else {
          window.localStorage.removeItem(draftKey);
          setDraftSaved(false);
        }
      } catch {
        /* Private browsing. The composer still works; it just cannot promise a draft. */
        setDraftSaved(false);
      }
    }, 500);
    return () => clearTimeout(id);
  }, [body, draftKey]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [detail.id, detail.messages.length]);

  const close = () => {
    const next = new URLSearchParams(params.toString());
    next.delete("open");
    router.replace(`/admin/inbox?${next.toString()}`, { scroll: false });
  };

  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) =>
    start(async () => {
      const result = await fn();
      setMessage({ ok: result.ok, text: result.ok ? (result.message ?? "Done.") : (result.error ?? "Failed.") });
      router.refresh();
    });

  const upload = async (list: FileList | null) => {
    if (!list?.length) return;
    setUploading(true);
    for (const file of Array.from(list)) {
      const form = new FormData();
      form.set("file", file);
      form.set("case_id", detail.id);
      try {
        const response = await fetch("/api/admin/support/attachments", { method: "POST", body: form });
        const json = await response.json();
        if (!response.ok) {
          setMessage({ ok: false, text: json.error ?? "That file could not be uploaded." });
          continue;
        }
        setFiles((current) => [...current, json as PendingAttachment]);
      } catch (error) {
        setMessage({ ok: false, text: `Upload failed: ${(error as Error).message}` });
      }
    }
    setUploading(false);
    if (fileInput.current) fileInput.current.value = "";
  };

  const send = () =>
    run(async () => {
      const result = await sendReplyAction(detail.id, body, mode === "note", files);
      /*
        The draft is only dropped when the server took the message. A
        failed send leaves the words where the operator can see them —
        retyping a reply because the mail key was missing is the sort of
        thing that makes people stop using a console.
      */
      if (result.ok) {
        setBody("");
        setFiles([]);
        try { window.localStorage.removeItem(draftKey); } catch { /* ignore */ }
      }
      return result;
    });

  const snoozedUntil = detail.snoozed_until ? new Date(detail.snoozed_until) : null;
  const snoozed = snoozedUntil !== null && snoozedUntil.getTime() > Date.now();
  const overdue = detail.due_at ? new Date(detail.due_at).getTime() < Date.now() : false;
  const dueSeconds = detail.due_at ? (new Date(detail.due_at).getTime() - Date.now()) / 1000 : null;
  const to = detail.actions.email_to;
  const typing = others.find((o) => o.typing);

  return (
    <section className="bg-white rounded-2xl border border-slate-200 flex flex-col max-h-[calc(100vh-7rem)] overflow-hidden">
      <header className="px-4 py-3 border-b border-slate-100">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h2 className="text-[18px] font-bold text-slate-900 leading-tight truncate">{detail.subject}</h2>
            <p className="text-[12px] text-slate-500 tabular-nums flex items-center gap-1.5">
              {detail.ref} ·
              {detail.channel === "email"
                ? <><Mail className="w-3.5 h-3.5" /> Email</>
                : <><MessageSquare className="w-3.5 h-3.5" /> In-app</>}
            </p>
          </div>

          <select
            value={detail.status}
            disabled={pending}
            onChange={(e) => run(() => updateCaseAction(detail.id, { status: e.target.value }))}
            title={STATUS_MEANING[detail.status]}
            className={`appearance-none text-[12px] font-semibold rounded-lg px-2.5 py-1.5 pr-6 border-0 focus:outline-none focus:ring-2 focus:ring-brand-200 ${STATUS_TONE[detail.status]}`}
          >
            <option value="open">Open</option>
            <option value="waiting">Waiting</option>
            <option value="resolved">Resolved</option>
          </select>

          <select
            value={detail.assignee?.id ?? ""}
            disabled={pending}
            onChange={(e) => run(() => updateCaseAction(detail.id, { assignee: e.target.value }))}
            className="appearance-none text-[12px] font-medium rounded-lg px-2.5 py-1.5 bg-white border border-slate-200 text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-200 max-w-[140px]"
          >
            <option value="">Unassigned</option>
            {admins.map((a) => <option key={a.id} value={a.id}>{a.name ?? a.id.slice(0, 8)}</option>)}
          </select>

          <details className="relative shrink-0">
            <summary className="list-none cursor-pointer w-8 h-8 grid place-items-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-50">
              <MoreHorizontal className="w-4 h-4" />
            </summary>
            <div className="absolute right-0 top-full mt-1 w-60 bg-white border border-slate-200 rounded-xl shadow-lg p-1 z-20">
              {detail.actions.reopen ? (
                <button onClick={() => run(() => updateCaseAction(detail.id, { status: "open" }))}
                  className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-slate-50 text-[13px] font-semibold text-slate-800 flex items-center gap-2">
                  <RotateCcw className="w-4 h-4 text-slate-500" /> Reopen case
                </button>
              ) : (
                <button onClick={() => run(() => updateCaseAction(detail.id, { status: "resolved" }))}
                  className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-slate-50 text-[13px] font-semibold text-slate-800 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Mark resolved
                </button>
              )}

              {/* SNOOZE. A case that needs chasing on Thursday should not
                  be in Tuesday's queue — and a customer writing in ends
                  it, so nobody is hidden while they wait. */}
              {snoozed ? (
                <button onClick={() => run(() => snoozeCaseAction(detail.id, null))}
                  className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-slate-50 text-[13px] font-semibold text-slate-800 flex items-center gap-2">
                  <BellOff className="w-4 h-4 text-amber-600" /> Wake it now
                </button>
              ) : detail.actions.snooze ? (
                <div className="px-2.5 py-1.5">
                  <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Snooze for</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {SNOOZE_OPTIONS.map((o) => (
                      <button key={o.label}
                        onClick={() => run(() => snoozeCaseAction(
                          detail.id, new Date(Date.now() + o.hours * 3600_000).toISOString()))}
                        className="text-[11px] font-semibold px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700">
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {detail.customer && (
                <Link href={`/admin/users?open=${detail.customer.id}`}
                  className="px-2.5 py-2 rounded-lg hover:bg-slate-50 text-[13px] font-semibold text-slate-800 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-slate-500" /> Open customer record
                </Link>
              )}
              <button onClick={close}
                className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-slate-50 text-[13px] font-semibold text-slate-800 flex items-center gap-2">
                <X className="w-4 h-4 text-slate-500" /> Close conversation
              </button>
            </div>
          </details>
        </div>

        {/* WHO ELSE IS HERE */}
        {others.length > 0 && (
          <p className="mt-2 text-[12px] font-semibold text-brand-700 bg-brand-50 border border-brand-100 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5">
            {typing ? <PenLine className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            {typing
              ? `${typing.name} is typing a reply…`
              : `${others.map((o) => o.name).join(", ")} ${others.length === 1 ? "is" : "are"} looking at this too`}
          </p>
        )}
      </header>

      {/* THE CLOCK — only when somebody configured a target. */}
      {detail.reply_target_minutes !== null && detail.due_at && detail.status !== "resolved" && !snoozed && (
        <div className={`px-4 py-2 flex items-center gap-2 text-[13px] font-semibold ${
          overdue ? "bg-rose-50 text-rose-800" : "bg-amber-50 text-amber-900"
        }`}>
          {overdue ? <AlertTriangle className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
          {overdue
            ? `Reply overdue by ${age(Math.abs(dueSeconds ?? 0))}`
            : `Reply due in ${age(dueSeconds ?? 0)}`}
          <span className="font-normal text-[12px] opacity-80">
            · target is {formatTarget(detail.reply_target_minutes)} from their last message
          </span>
        </div>
      )}

      {snoozed && (
        <div className="px-4 py-2 flex items-center gap-2 text-[13px] font-semibold bg-slate-100 text-slate-700">
          <BellOff className="w-4 h-4" />
          Snoozed until <ClientDateTime iso={detail.snoozed_until} mode="datetime" />
          <span className="font-normal text-[12px] opacity-80">· a reply from them wakes it immediately</span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {detail.messages.length === 0 && (
          <p className="text-[13px] text-slate-500 text-center py-8">
            Nothing in this thread yet.
          </p>
        )}
        {detail.messages.map((m) => (
          <Message key={m.id} m={m} caseRef={detail.ref} />
        ))}
        <div ref={bottom} />
      </div>

      {/* THE COMPOSER */}
      <div className="border-t border-slate-100">
        <nav className="flex items-center gap-4 px-4 pt-2.5">
          <button onClick={() => setMode("reply")}
            className={`text-[13px] font-semibold pb-2 border-b-2 inline-flex items-center gap-1.5 ${
              mode === "reply" ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800"
            }`}>
            {detail.channel === "email" ? <Mail className="w-4 h-4" /> : <MessageSquare className="w-4 h-4" />}
            {detail.channel === "email" ? "Email reply" : "In-app reply"}
          </button>
          <button onClick={() => setMode("note")}
            className={`text-[13px] font-semibold pb-2 border-b-2 inline-flex items-center gap-1.5 ${
              mode === "note" ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800"
            }`}>
            <Lock className="w-4 h-4" /> Internal note
          </button>
        </nav>

        <div className="px-4 py-3 space-y-2 bg-slate-50/60">
          {mode === "reply" ? (
            <div className="space-y-1.5">
              <Row label="From">
                <span className="text-[13px] text-slate-700">
                  {detail.channel === "email" ? "Helpward Support <support@helpward.com>" : "Helpward Support · in-app"}
                </span>
              </Row>
              <Row label="To">
                <span className="text-[13px] text-slate-700 truncate">
                  {detail.channel === "email"
                    ? (to ?? "No address on this case")
                    : (detail.customer?.name ?? "This customer") + "'s app"}
                </span>
              </Row>
            </div>
          ) : (
            <p className="text-[12px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
              Staff only. The customer cannot read internal notes — the policy on the table enforces it, not this tab.
            </p>
          )}

          <textarea
            value={body}
            onChange={(e) => { setBody(e.target.value); setTyping(e.target.value.trim().length > 0); }}
            onBlur={() => setTyping(false)}
            rows={4}
            placeholder={mode === "reply" ? "Write your reply…" : "What should the next person know?"}
            className="w-full text-[13px] bg-white border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-200"
          />

          {files.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {files.map((f) => (
                <li key={f.path}
                  className="inline-flex items-center gap-1.5 text-[12px] bg-white border border-slate-200 rounded-lg px-2 py-1">
                  <Paperclip className="w-3 h-3 text-slate-400" />
                  <span className="max-w-[160px] truncate">{f.filename}</span>
                  <span className="text-slate-400 tabular-nums">{fileSize(f.size)}</span>
                  <button onClick={() => setFiles((c) => c.filter((x) => x.path !== f.path))}
                    aria-label={`Remove ${f.filename}`} className="text-slate-400 hover:text-rose-600">
                    <X className="w-3 h-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {message && (
            <p className={`text-[12px] rounded-lg px-2.5 py-1.5 ${
              message.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"
            }`}>
              {message.text}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <input ref={fileInput} type="file" multiple hidden
              onChange={(e) => void upload(e.target.files)} />
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              disabled={uploading || pending}
              title="Attach a file — up to 10MB each"
              className="w-8 h-8 grid place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-brand-700 hover:border-brand-300 disabled:opacity-50"
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
            </button>

            <details className="relative">
              <summary className="list-none cursor-pointer inline-flex items-center gap-1.5 text-[12px] font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 hover:border-slate-300">
                Saved replies <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </summary>
              <div className="absolute left-0 bottom-full mb-1.5 w-72 bg-white border border-slate-200 rounded-xl shadow-lg p-1 z-20">
                {TEMPLATES.map((t) => (
                  <button key={t.label} onClick={() => setBody((b) => (b ? `${b}\n\n${t.body}` : t.body))}
                    className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-slate-50">
                    <span className="block text-[13px] font-semibold text-slate-800">{t.label}</span>
                    <span className="block text-[11px] text-slate-500 line-clamp-2">{t.body}</span>
                  </button>
                ))}
              </div>
            </details>

            <span className="text-[12px] text-slate-400 inline-flex items-center gap-1">
              {draftSaved ? <><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Draft saved in this browser</> : "No draft"}
            </span>

            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={send}
                disabled={pending || uploading || body.trim().length === 0}
                className="inline-flex items-center gap-1.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-[13px] font-semibold px-3.5 py-2 rounded-xl"
              >
                {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {pending ? "Sending…" : mode === "note" ? "Save note" : detail.channel === "email" ? "Send email" : "Send message"}
              </button>
              {detail.actions.resolve && (
                <button
                  onClick={() => run(() => updateCaseAction(detail.id, { status: "resolved" }))}
                  disabled={pending}
                  className="inline-flex items-center gap-1.5 bg-white border border-slate-200 hover:border-slate-300 text-[13px] font-semibold text-slate-700 px-3 py-2 rounded-xl"
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Resolve
                </button>
              )}
            </div>
          </div>

          <p className="text-[11px] text-slate-500">
            {detail.channel === "email"
              ? "Sending goes through Resend from support@helpward.com. Replies arrive in that mailbox — they appear here once inbound mail is pointed at the webhook."
              : "The reply lands in their app as a notification they can open and answer."}
          </p>
        </div>
      </div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[12px] font-semibold text-slate-500 w-10 shrink-0">{label}:</span>
      <span className="min-w-0 flex-1 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 truncate">
        {children}
      </span>
    </div>
  );
}

function Message({ m, caseRef }: { m: CaseDetail["messages"][number]; caseRef: string }) {
  if (m.kind === "note") {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
        <p className="text-[12px] font-semibold text-amber-900 flex items-center gap-1.5">
          <Lock className="w-3.5 h-3.5" /> Internal note · {m.author ?? "Staff"}
          <span className="font-normal text-amber-700/80 ml-auto">
            <ClientDateTime iso={m.at} mode="time" />
          </span>
        </p>
        <p className="text-[13px] text-slate-800 mt-1 whitespace-pre-wrap">{m.body}</p>
        <Attachments items={m.attachments} />
      </div>
    );
  }

  const inbound = m.kind === "inbound";
  return (
    <div className={`rounded-xl px-3 py-2.5 border ${
      inbound ? "bg-white border-slate-200" : "bg-brand-50/50 border-brand-100"
    }`}>
      <div className="flex items-start gap-2">
        <span className={`w-8 h-8 rounded-full grid place-items-center text-[11px] font-bold shrink-0 ${
          inbound ? "bg-slate-100 text-slate-600" : "bg-brand-600 text-white"
        }`}>
          {inbound ? initials(m.author ?? m.from_address ?? "?") : "HW"}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-slate-900">
            {inbound ? (m.author ?? m.from_address ?? "Customer") : (m.author ?? "Helpward Support")}
          </p>
          {m.from_address && <p className="text-[11px] text-slate-500 truncate">{m.from_address}</p>}
          {m.to_address && !inbound && <p className="text-[11px] text-slate-500 truncate">To: {m.to_address}</p>}
        </div>
        <span className="text-[11px] text-slate-400 shrink-0">
          <ClientDateTime iso={m.at} mode="datetime" />
        </span>
      </div>
      <p className="text-[13px] text-slate-800 mt-2 whitespace-pre-wrap">{m.body}</p>
      <Attachments items={m.attachments} />

      {/* WHAT HAPPENED TO IT — the server's column, not an assumption. */}
      {!inbound && (
        <p className="mt-2 flex items-center gap-1.5">
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${DELIVERY_TONE[m.delivery_status]}`}>
            {DELIVERY_LABEL[m.delivery_status]}
          </span>
          {m.channel && (
            <span className="text-[11px] text-slate-400">{CHANNEL_LABEL[m.channel]} · {caseRef}</span>
          )}
          {m.delivery_error && <span className="text-[11px] text-rose-700 truncate">{m.delivery_error}</span>}
        </p>
      )}
    </div>
  );
}

function Attachments({ items }: { items: CaseDetail["messages"][number]["attachments"] }) {
  if (!items?.length) return null;
  return (
    <ul className="flex flex-wrap gap-1.5 mt-2">
      {items.map((a) => (
        <li key={a.id}>
          {/* A download is a signed URL minted per click, never a path
              into the bucket. */}
          <a href={`/api/admin/support/attachments/${a.id}`}
            className="inline-flex items-center gap-1.5 text-[12px] font-medium bg-white border border-slate-200 hover:border-brand-300 hover:text-brand-700 rounded-lg px-2 py-1">
            <Download className="w-3 h-3 text-slate-400" />
            <span className="max-w-[180px] truncate">{a.filename}</span>
            {a.size_bytes != null && (
              <span className="text-slate-400 tabular-nums">{fileSize(a.size_bytes)}</span>
            )}
          </a>
        </li>
      ))}
    </ul>
  );
}

function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

export function formatTarget(minutes: number): string {
  if (minutes % 1440 === 0) return `${minutes / 1440}d`;
  if (minutes % 60 === 0) return `${minutes / 60}h`;
  return `${minutes}m`;
}

function initials(name: string): string {
  const parts = name.trim().split(/[\s@._-]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}
