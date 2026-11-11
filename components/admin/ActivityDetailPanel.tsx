"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  X, ExternalLink, AlertTriangle, User, ShieldCheck, MapPin, Flag, CalendarClock,
  Lock, MessageSquare, History, Ban, Loader2, Check,
} from "lucide-react";
import type { ActivityDetail } from "@/lib/data/admin-overview";
import { age, money } from "@/lib/admin-format";
import { addNoteAction, cancelRequestAction, revealPrivateDetailsAction } from "@/app/(admin)/admin/bookings/actions";

/*
  ONE PANEL, OPENED FROM ANYWHERE.

  Which record is open lives in the URL (`?open=booking:uuid`), so the
  filters, the page number and the scroll position all survive it, and a
  panel can be linked to. That was the brief's first requirement and it
  is the reason this is a column rather than a modal.

  THE ACTIONS ARE THE SERVER'S TO OFFER. Every button below is drawn
  from `actions`, computed in the database against the same rules the
  write functions enforce. Where something cannot be done the panel says
  why instead of hiding it — a missing button is indistinguishable from
  a bug, and the reason is usually the thing the operator needed to
  know.
*/

const STATUS_TONE: Record<string, string> = {
  matching: "bg-brand-50 text-brand-700",
  scheduled: "bg-sky-50 text-sky-700",
  in_progress: "bg-emerald-50 text-emerald-700",
  completed: "bg-slate-100 text-slate-700",
  cancelled: "bg-rose-50 text-rose-700",
  expired: "bg-slate-100 text-slate-500",
  disputed: "bg-amber-50 text-amber-800",
};

const PAYMENT_LABEL: Record<string, string> = {
  pending: "No hold placed",
  authorized: "Authorized",
  captured: "Captured",
  refunded: "Refunded",
  partial_refund: "Partly refunded",
  failed: "Capture failed",
};

type Tab = "details" | "timeline" | "payments" | "notes";

export function ActivityDetailPanel({ detail }: { detail: ActivityDetail }) {
  const router = useRouter();
  const params = useSearchParams();
  const [tab, setTab] = useState<Tab>("details");

  const close = () => {
    const next = new URLSearchParams(params.toString());
    next.delete("open");
    router.replace(`/admin/bookings?${next.toString()}`, { scroll: false });
  };

  const waitingSeconds = (Date.now() - new Date(detail.created_at).getTime()) / 1000;
  const warning =
    detail.status === "matching"
      ? `Waiting ${age(waitingSeconds)} · No helper accepted.`
      : detail.money.payment_status === "failed"
        ? "The card was declined after the work was done."
        : detail.status === "scheduled" && detail.scheduled_for
          && new Date(detail.scheduled_for).getTime() < Date.now() - 15 * 60_000
          ? "Booked time has passed and nobody has started."
          : null;

  return (
    <aside className="bg-white rounded-2xl border border-slate-200 flex flex-col max-h-[calc(100vh-7rem)] sticky top-4 overflow-hidden">
      <header className="px-4 pt-4 pb-3 border-b border-slate-100">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h2 className="text-[19px] font-bold text-slate-900 leading-tight truncate">
              {detail.service_title ?? detail.service_id}
            </h2>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[13px] text-slate-500 tabular-nums">{detail.ref}</span>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                STATUS_TONE[detail.status] ?? "bg-slate-100 text-slate-600"
              }`}>
                {detail.status.replace("_", " ")}
              </span>
            </div>
          </div>
          {detail.conversation_id && (
            <Link href="/admin/inbox" title="Open the conversation"
              className="w-8 h-8 grid place-items-center rounded-lg text-slate-400 hover:text-brand-700 hover:bg-slate-50">
              <ExternalLink className="w-4 h-4" />
            </Link>
          )}
          <button onClick={close} aria-label="Close"
            className="w-8 h-8 grid place-items-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-50">
            <X className="w-4 h-4" />
          </button>
        </div>

        {warning && (
          <p className="mt-3 flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 text-[12px] text-amber-900">
            <AlertTriangle className="w-4 h-4 mt-px shrink-0 text-amber-500" />
            {warning}
          </p>
        )}

        <nav className="flex items-center gap-4 mt-3 -mb-3">
          {(["details", "timeline", "payments", "notes"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`text-[13px] font-semibold pb-2.5 border-b-2 capitalize ${
                tab === t ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              {t}
              {t === "notes" && detail.notes.length > 0 && (
                <span className="ml-1 text-[11px] text-slate-400">{detail.notes.length}</span>
              )}
            </button>
          ))}
        </nav>
      </header>

      <div className="flex-1 overflow-y-auto">
        {tab === "details" && <Details detail={detail} />}
        {tab === "timeline" && <Timeline detail={detail} />}
        {tab === "payments" && <Payments detail={detail} />}
        {tab === "notes" && <Notes detail={detail} />}
      </div>

      <Footer detail={detail} />
    </aside>
  );
}

function Row({ icon: Icon, label, children }: {
  icon: typeof User; label: string; children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5 px-4 py-2.5 border-b border-slate-50 last:border-0">
      <Icon className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
      <span className="text-[13px] text-slate-500 w-28 shrink-0">{label}</span>
      <span className="text-[13px] text-slate-900 flex-1 min-w-0">{children}</span>
    </div>
  );
}

function Details({ detail }: { detail: ActivityDetail }) {
  return (
    <div>
      <Row icon={User} label="Customer">
        <span className="flex items-center justify-between gap-2">
          <span className="truncate">{detail.customer?.name ?? "—"}</span>
          {detail.customer && (
            <Link href="/admin/users" className="text-[12px] font-semibold text-brand-700 shrink-0">
              View profile
            </Link>
          )}
        </span>
      </Row>
      <Row icon={ShieldCheck} label="Assigned helper">
        {detail.helper?.name ? (
          <span className="flex items-center justify-between gap-2">
            <span className="truncate">{detail.helper.name}</span>
            <Link href="/admin/helpers" className="text-[12px] font-semibold text-brand-700 shrink-0">
              View profile
            </Link>
          </span>
        ) : (
          <span className="italic text-slate-400">Not assigned</span>
        )}
      </Row>
      {detail.pickup && (
        <Row icon={MapPin} label="Pickup">
          <span className="block">{detail.pickup.formatted}</span>
          {!detail.pickup.verified && (
            <span className="text-[11px] text-amber-700">Address never passed geocode verification</span>
          )}
        </Row>
      )}
      {detail.dropoff && (
        <Row icon={Flag} label="Drop-off">{detail.dropoff.formatted}</Row>
      )}
      <Row icon={CalendarClock} label="Scheduled">
        {detail.scheduled_for
          ? new Date(detail.scheduled_for).toLocaleString()
          : "As soon as possible"}
        {detail.crew_size && detail.crew_size > 1 ? ` · crew of ${detail.crew_size}` : ""}
      </Row>

      {detail.intake && Object.keys(detail.intake).length > 0 && (
        <div className="px-4 py-3 border-t border-slate-100">
          <h3 className="text-[12px] font-semibold text-slate-500 uppercase tracking-wide mb-2">
            Service details
          </h3>
          <dl className="space-y-1">
            {Object.entries(detail.intake).map(([key, value]) => (
              <div key={key} className="flex gap-2 text-[13px]">
                <dt className="text-slate-500 capitalize">{key.replace(/_/g, " ")}</dt>
                <dd className="text-slate-900 ml-auto text-right">{String(value)}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      <PrivateInstructions detail={detail} />
    </div>
  );
}

/*
  THE RESTRICTED HALF.

  RLS keeps meeting points and recipients for the assigned helper
  (0083). An admin may read them — support cannot settle a dispute about
  a doorstep they are not allowed to see — but the reveal is an act with
  a reason that lands in audit_log, not a field that renders in every
  browser that happens to open this panel.
*/
function PrivateInstructions({ detail }: { detail: ActivityDetail }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [revealed, setRevealed] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!detail.has_private_details) {
    return (
      <div className="px-4 py-3 border-t border-slate-100 flex items-center gap-2 text-[13px] text-slate-500">
        <Lock className="w-4 h-4 text-slate-400" />
        No private instructions on this request.
      </div>
    );
  }

  return (
    <div className="px-4 py-3 border-t border-slate-100">
      <div className="flex items-center gap-2">
        <Lock className="w-4 h-4 text-slate-400" />
        <span className="text-[13px] font-semibold text-slate-700">Private instructions</span>
        {!revealed && (
          <button onClick={() => setOpen((v) => !v)} className="ml-auto text-[12px] font-semibold text-brand-700">
            Restricted · Reveal with reason
          </button>
        )}
      </div>

      {open && !revealed && (
        <div className="mt-2 space-y-2">
          <p className="text-[11px] text-slate-500">
            Meeting points and recipient names reach the assigned helper only. Revealing them
            records your name, this request and your reason in the audit log.
          </p>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="Why do you need to see these? e.g. resolving dispute DSP-2201"
            className="w-full text-[13px] border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-200"
          />
          {error && <p className="text-[12px] text-rose-700">{error}</p>}
          <button
            disabled={pending || !detail.request_id}
            onClick={() => start(async () => {
              setError(null);
              const result = await revealPrivateDetailsAction(detail.request_id!, reason);
              if (!result.ok) setError(result.error);
              else if (result.details) setRevealed(result.details);
              else setError(result.note ?? "Nothing to show.");
            })}
            className="inline-flex items-center gap-1.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-[12px] font-semibold px-3 py-1.5 rounded-lg"
          >
            {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />}
            Reveal and record
          </button>
        </div>
      )}

      {revealed && (
        <dl className="mt-2 space-y-1">
          {Object.entries(revealed)
            .filter(([key]) => key !== "version")
            .flatMap(([section, values]) =>
              Object.entries((values ?? {}) as Record<string, string>).map(([key, value]) => (
                <div key={`${section}.${key}`} className="flex gap-2 text-[13px]">
                  <dt className="text-slate-500 capitalize">{key.replace(/_/g, " ")}</dt>
                  <dd className="text-slate-900 ml-auto text-right">{value}</dd>
                </div>
              )))}
          <p className="text-[11px] text-slate-400 pt-1">Recorded in the audit log.</p>
        </dl>
      )}
    </div>
  );
}

function Timeline({ detail }: { detail: ActivityDetail }) {
  const events = detail.timeline ?? [];
  return (
    <div className="px-4 py-4">
      {events.length === 0 ? (
        <p className="text-[13px] text-slate-500">Nothing has been recorded for this record yet.</p>
      ) : (
        <ol className="space-y-0">
          {events.map((event, i) => (
            <li key={i} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span className="w-2.5 h-2.5 rounded-full bg-brand-500 mt-1.5 shrink-0" />
                {i < events.length - 1 && <span className="w-px flex-1 bg-slate-200 my-1" />}
              </div>
              <div className="pb-4 min-w-0">
                <div className="text-[13px] font-semibold text-slate-900">{event.label}</div>
                {event.detail && <div className="text-[12px] text-slate-500">{event.detail}</div>}
                <div className="text-[11px] text-slate-400">{new Date(event.at).toLocaleString()}</div>
              </div>
            </li>
          ))}
        </ol>
      )}

      {detail.offers.length > 0 && (
        <div className="mt-2 border-t border-slate-100 pt-3">
          <h3 className="text-[12px] font-semibold text-slate-500 uppercase tracking-wide mb-2">
            Offers sent ({detail.offers.length})
          </h3>
          <ul className="space-y-1">
            {detail.offers.map((offer, i) => (
              <li key={i} className="flex items-center gap-2 text-[12px]">
                <span className="text-slate-700 truncate">{offer.helper_name ?? "Helper"}</span>
                {offer.distance_km != null && (
                  <span className="text-slate-400">{offer.distance_km} km</span>
                )}
                <span className={`ml-auto px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                  offer.response === "accept" ? "bg-emerald-50 text-emerald-700"
                    : offer.response === "decline" ? "bg-rose-50 text-rose-700"
                    : offer.response === "timeout" ? "bg-slate-100 text-slate-500"
                    : "bg-amber-50 text-amber-700"
                }`}>
                  {offer.response === "timeout" ? "another helper first" : offer.response}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Payments({ detail }: { detail: ActivityDetail }) {
  const m = detail.money;
  const currency = m.currency ?? "CAD";
  const line = (label: string, cents: number | null | undefined, hint?: string) =>
    cents == null ? null : (
      <div className="flex items-baseline gap-2 text-[13px] py-1">
        <span className="text-slate-500">{label}</span>
        {hint && <span className="text-[11px] text-slate-400">{hint}</span>}
        <span className="ml-auto font-semibold text-slate-900 tabular-nums">{money(cents, currency)}</span>
      </div>
    );

  return (
    <div className="px-4 py-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[13px] font-bold text-slate-900">Price summary</h3>
        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
          {PAYMENT_LABEL[m.payment_status ?? ""] ?? m.payment_status ?? "No payment"}
        </span>
      </div>

      <div className="mt-2">
        {line("Quote", m.quote_cents)}
        {line("Base", m.base_cents)}
        {line("Service fee", m.service_fee_cents)}
        {line("Tip", m.tip_cents)}
        {line("Platform fee", m.platform_fee_cents)}
        {line("Helper payout", m.payout_cents)}
      </div>

      <div className="mt-3 border-t border-slate-100 pt-2 space-y-1 text-[12px] text-slate-600">
        <div>Authorized: {m.authorized_at ? new Date(m.authorized_at).toLocaleString() : "—"}</div>
        <div>Captured: {m.captured_at ? new Date(m.captured_at).toLocaleString() : "—"}</div>
        {m.payment_error && <div className="text-rose-700">Error: {m.payment_error}</div>}
      </div>

      {m.refunds.length > 0 && (
        <div className="mt-3 border-t border-slate-100 pt-2">
          <h4 className="text-[12px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Refunds</h4>
          {m.refunds.map((refund, i) => (
            <div key={i} className="flex items-baseline gap-2 text-[13px] py-0.5">
              <span className="text-slate-500">{refund.status}</span>
              <span className="text-[11px] text-slate-400">{new Date(refund.created_at).toLocaleDateString()}</span>
              <span className="ml-auto font-semibold text-slate-900 tabular-nums">
                {money(refund.amount_cents, currency)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* The sentence that stops the two states being read as one. */}
      <p className="mt-3 text-[11px] text-slate-500">
        {m.payment_status === "pending"
          ? "Authorization starts after a helper accepts. No money is reserved yet."
          : m.payment_status === "authorized"
            ? "This money is reserved on the card, not taken. Capture happens when the job is completed."
            : "Booking status and payment status move separately."}
      </p>
    </div>
  );
}

function Notes({ detail }: { detail: ActivityDetail }) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  return (
    <div className="px-4 py-4">
      <div className="space-y-2">
        <textarea
          value={body}
          onChange={(e) => { setBody(e.target.value); setSaved(false); }}
          rows={3}
          placeholder="Internal note — the customer and helper never see this."
          className="w-full text-[13px] border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-200"
        />
        {error && <p className="text-[12px] text-rose-700">{error}</p>}
        <button
          disabled={pending || body.trim().length === 0}
          onClick={() => start(async () => {
            setError(null);
            const result = await addNoteAction(detail.kind, detail.id, body);
            if (!result.ok) setError(result.error);
            else { setBody(""); setSaved(true); }
          })}
          className="inline-flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-[12px] font-semibold px-3 py-1.5 rounded-lg"
        >
          {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : saved ? <Check className="w-3.5 h-3.5" /> : <MessageSquare className="w-3.5 h-3.5" />}
          {saved ? "Saved" : "Add note"}
        </button>
      </div>

      <ul className="mt-4 space-y-3">
        {detail.notes.map((note, i) => (
          <li key={i} className="text-[13px]">
            <p className="text-slate-800 whitespace-pre-wrap">{note.body}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {note.author} · {new Date(note.at).toLocaleString()}
            </p>
          </li>
        ))}
        {detail.notes.length === 0 && (
          <li className="text-[13px] text-slate-500">No notes yet.</li>
        )}
      </ul>
    </div>
  );
}

function Footer({ detail }: { detail: ActivityDetail }) {
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  return (
    <footer className="border-t border-slate-100 p-3 space-y-2">
      {confirming && (
        <div className="space-y-2">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="Why is this being cancelled? Recorded in the audit log."
            className="w-full text-[13px] border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-rose-200"
          />
          {error && <p className="text-[12px] text-rose-700">{error}</p>}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Link
          href="/admin/audit-log"
          className="flex-1 inline-flex items-center justify-center gap-1.5 border border-slate-200 text-slate-700 hover:border-slate-300 text-[12px] font-semibold px-3 py-2 rounded-xl"
        >
          <History className="w-3.5 h-3.5" /> View request history
        </Link>

        {detail.actions.cancel_request ? (
          <button
            disabled={pending}
            onClick={() => {
              if (!confirming) { setConfirming(true); return; }
              start(async () => {
                setError(null);
                const result = await cancelRequestAction(detail.request_id!, reason);
                if (!result.ok) setError(result.error);
                else { setConfirming(false); router.refresh(); }
              });
            }}
            className="flex-1 inline-flex items-center justify-center gap-1.5 border border-rose-200 text-rose-700 hover:bg-rose-50 disabled:opacity-60 text-[12px] font-semibold px-3 py-2 rounded-xl"
          >
            {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Ban className="w-3.5 h-3.5" />}
            {confirming ? "Confirm cancellation" : "Cancel request"}
          </button>
        ) : detail.actions.cancel_booking_reason ? (
          <span className="flex-1 text-[11px] text-slate-500 leading-snug px-2">
            {detail.actions.cancel_booking_reason}
          </span>
        ) : null}
      </div>
    </footer>
  );
}
