"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  X, ExternalLink, Mail, Phone, Globe, Loader2, Lock, Info, Ban, ShieldOff,
  LifeBuoy, MessageSquarePlus, CreditCard, Clock, CalendarCheck, CheckCircle2,
  ChevronRight, Shield, ChevronDown, History,
} from "lucide-react";
import type { CustomerDetail } from "@/lib/data/admin-customers";
import { ACCOUNT_LABEL, ACCOUNT_TONE, ATTENTION_LABEL, ATTENTION_TONE } from "@/lib/admin-customer-states";
import { age, money } from "@/lib/admin-format";
import { ClientDateTime } from "@/components/ClientDateTime";
import {
  addCustomerNoteAction, assignCaseAction, openCustomerCaseAction,
  revealCustomerContactAction, setCustomerRestrictionAction,
} from "@/app/(admin)/admin/users/actions";
import { updateCaseAction } from "@/app/(admin)/admin/inbox/actions";

/*
  ONE CUSTOMER, WITH THE CONTEXT TO RESOLVE THEIR PROBLEM.

  Which record is open lives in the URL (`?open=<id>`), so the filters,
  the page and the scroll position all survive it and a panel can be
  linked into a thread.

  CONTACT DETAILS ARE MASKED and the real ones are not in this
  component's props at all — revealCustomerContactAction fetches them,
  and the database records who asked and why before it answers. One
  reveal returns both the email and the phone number, which is why
  either button says so: a second recorded reveal for the number nobody
  mentioned is noise in the audit log, not extra privacy.

  THE ACTIONS ARE THE SERVER'S TO OFFER. Every button is drawn from
  `actions`, computed in 0101 against the same rules the write functions
  enforce. Where something cannot be done the panel says why rather than
  hiding it: a missing button is indistinguishable from a bug, and the
  reason is usually the thing the operator needed to know.
*/

type Tab = "overview" | "bookings" | "payments" | "activity";

const STATUS_TONE: Record<string, string> = {
  scheduled: "bg-sky-50 text-sky-700",
  in_progress: "bg-emerald-50 text-emerald-700",
  completed: "bg-slate-100 text-slate-700",
  cancelled: "bg-rose-50 text-rose-700",
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

const PAYMENT_KIND: Record<string, { label: string; tone: string }> = {
  authorized: { label: "Hold placed", tone: "text-sky-700" },
  captured: { label: "Captured", tone: "text-emerald-700" },
  refunded: { label: "Refunded", tone: "text-amber-700" },
  failed: { label: "Failed", tone: "text-rose-700" },
};

export function CustomerPanel({
  detail, admins,
}: {
  detail: CustomerDetail;
  admins: { id: string; name: string | null }[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [tab, setTab] = useState<Tab>("overview");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const close = () => {
    const next = new URLSearchParams(params.toString());
    next.delete("open");
    router.replace(`/admin/users?${next.toString()}`, { scroll: false });
  };

  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) =>
    start(async () => {
      const result = await fn();
      setMessage({
        ok: result.ok,
        text: result.ok ? (result.message ?? "Done.") : (result.error ?? "Failed."),
      });
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
            <span className="w-12 h-12 rounded-full bg-brand-50 text-brand-700 grid place-items-center text-[14px] font-bold shrink-0">
              {initials(detail.name)}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="text-[19px] font-bold text-slate-900 leading-tight truncate">
              {detail.name ?? "Customer"}
            </h2>
            <p className="text-[12px] text-slate-500 tabular-nums">{detail.ref}</p>
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${ACCOUNT_TONE[detail.account_state]}`}>
                {ACCOUNT_LABEL[detail.account_state]}
              </span>
              {detail.attention !== "none" && (
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${ATTENTION_TONE[detail.attention]}`}>
                  {ATTENTION_LABEL[detail.attention]}
                </span>
              )}
              {detail.is_review_account && (
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800">
                  Review account
                </span>
              )}
            </div>
          </div>
          <Link href={`/admin/bookings?q=${encodeURIComponent(detail.name ?? detail.ref)}`}
            title="Open their bookings"
            className="w-8 h-8 grid place-items-center rounded-lg text-slate-400 hover:text-brand-700 hover:bg-slate-50">
            <ExternalLink className="w-4 h-4" />
          </Link>
          <button onClick={close} aria-label="Close"
            className="w-8 h-8 grid place-items-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-50">
            <X className="w-4 h-4" />
          </button>
        </div>

        <nav className="flex items-center gap-4 mt-3 -mb-3">
          {(["overview", "bookings", "payments", "activity"] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`text-[13px] font-semibold pb-2.5 border-b-2 capitalize ${
                tab === t ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800"
              }`}>
              {t}
              {t === "bookings" && detail.bookings.length > 0 && (
                <span className="ml-1 text-[11px] text-slate-400">{detail.stats.total_bookings}</span>
              )}
            </button>
          ))}
        </nav>
      </header>

      <div className="flex-1 overflow-y-auto">
        {tab === "overview" && (
          <Overview detail={detail} admins={admins} run={run} pending={pending} />
        )}
        {tab === "bookings" && <Bookings detail={detail} />}
        {tab === "payments" && <Payments detail={detail} />}
        {tab === "activity" && <Activity detail={detail} />}
      </div>

      <Footer detail={detail} run={run} pending={pending} message={message} />
    </aside>
  );
}

/* ---------------------------------------------------------------- overview */

function Overview({
  detail, admins, run, pending,
}: {
  detail: CustomerDetail;
  admins: { id: string; name: string | null }[];
  run: (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) => void;
  pending: boolean;
}) {
  return (
    <div className="px-4 py-3 space-y-4">
      {detail.restriction && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl px-3 py-2.5">
          <p className="text-[13px] font-semibold text-rose-900 flex items-center gap-1.5">
            <Ban className="w-4 h-4" /> Restricted account
          </p>
          <p className="text-[12px] text-rose-800 mt-0.5">
            {detail.restriction.reason ?? "No reason recorded."}
          </p>
          <p className="text-[11px] text-rose-700/80 mt-1">
            {detail.restriction.by ? `${detail.restriction.by} · ` : ""}
            <ClientDateTime iso={detail.restriction.at} mode="date" />
            {" · they cannot open new requests while this stands"}
          </p>
        </div>
      )}

      <Contact detail={detail} />

      <div className="grid grid-cols-3 gap-2">
        <Stat icon={CheckCircle2} label="Completed jobs" value={detail.stats.completed_jobs} />
        <Stat icon={CalendarCheck} label="Active bookings" value={detail.stats.active_bookings} />
        <Stat icon={LifeBuoy} label="Open cases" value={detail.stats.open_cases}
          tone={detail.stats.open_cases > 0 ? "amber" : "slate"} />
      </div>

      {/* LATEST BOOKING */}
      <section>
        <h3 className="text-[12px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
          Latest booking
        </h3>
        {!detail.latest_booking ? (
          <p className="text-[13px] text-slate-500">This customer has never booked.</p>
        ) : (
          <div className="border border-slate-200 rounded-xl px-3 py-2.5">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-slate-900 truncate">
                  {detail.latest_booking.service ?? "Service"}
                </p>
                <p className="text-[12px] text-slate-500 tabular-nums">
                  {detail.latest_booking.ref} ·{" "}
                  <ClientDateTime iso={detail.latest_booking.scheduled_for ?? detail.latest_booking.created_at} mode="date" />
                </p>
              </div>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                STATUS_TONE[detail.latest_booking.status] ?? "bg-slate-100 text-slate-600"
              }`}>
                {detail.latest_booking.status.replace("_", " ")}
              </span>
            </div>
            <dl className="mt-2 space-y-1">
              <Field label="Helper" value={detail.latest_booking.helper ?? "Unassigned"} />
              <Field label="Quote"
                value={detail.latest_booking.total_cents == null
                  ? "—"
                  : money(detail.latest_booking.total_cents, detail.latest_booking.currency ?? "CAD")} />
              <Field label="Payment"
                value={PAYMENT_LABEL[detail.latest_booking.payment_status ?? ""] ?? "No payment yet"} />
            </dl>
            <Link href={`/admin/bookings?open=booking:${detail.latest_booking.id}`}
              className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-brand-700 hover:text-brand-800">
              Open booking <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        )}
      </section>

      {/* OPEN CASES */}
      {detail.cases.length > 0 && (
        <section>
          <h3 className="text-[12px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
            Open support {detail.cases.length === 1 ? "case" : "cases"}
          </h3>
          <div className="space-y-2">
            {detail.cases.map((c) => (
              <div key={c.id} className="border border-amber-200 bg-amber-50/60 rounded-xl px-3 py-2.5">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold text-slate-900">
                      {c.ref} ·{" "}
                      <span className="capitalize font-medium">
                        {c.kind === "support"
                          ? (c.category === "in_app" ? "In-app conversation" : "Email conversation")
                          : c.category.replace("_", " ")}
                      </span>
                    </p>
                    <p className="text-[12px] text-slate-700 mt-0.5 line-clamp-3">{c.description}</p>
                  </div>
                  <span className="text-[11px] font-semibold text-amber-800 shrink-0 flex items-center gap-1">
                    <Clock className="w-3 h-3" /> {age(c.age_seconds)}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-[12px] text-slate-500">Owner</span>
                  <select
                    value={c.owner_id ?? ""}
                    disabled={pending}
                    onChange={(e) => run(() => c.kind === "support"
                      ? updateCaseAction(c.id, { assignee: e.target.value })
                      : assignCaseAction(c.id, e.target.value || null))}
                    className="flex-1 bg-white border border-slate-200 rounded-lg px-2 py-1 text-[12px] text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-200"
                  >
                    <option value="">Unassigned</option>
                    {admins.map((a) => (
                      <option key={a.id} value={a.id}>{a.name ?? a.id.slice(0, 8)}</option>
                    ))}
                  </select>
                  {/* Each kind of case is worked somewhere different, so
                      the link goes where the work is rather than to a
                      generic record. */}
                  {c.kind === "support" ? (
                    <Link href={`/admin/inbox?open=${c.id}`}
                      className="text-[12px] font-semibold text-brand-700 hover:text-brand-800 shrink-0">
                      Open conversation
                    </Link>
                  ) : c.booking_id ? (
                    <Link href={`/admin/bookings?open=booking:${c.booking_id}`}
                      className="text-[12px] font-semibold text-brand-700 hover:text-brand-800 shrink-0">
                      Open {c.booking_ref}
                    </Link>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <Money detail={detail} />

      {detail.privacy.deletion || detail.privacy.export ? (
        <section>
          <h3 className="text-[12px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
            Privacy requests
          </h3>
          <dl className="space-y-1">
            {detail.privacy.deletion && (
              <Field
                label="Account deletion"
                value={`${detail.privacy.deletion.status}${
                  detail.privacy.deletion.grace_until && detail.privacy.deletion.status === "pending"
                    ? ` · acts after ${new Date(detail.privacy.deletion.grace_until).toLocaleDateString("en-CA")}`
                    : ""
                }`}
              />
            )}
            {detail.privacy.export && (
              <Field label="Data export" value={detail.privacy.export.status} />
            )}
          </dl>
          <Link href="/admin/data-requests"
            className="mt-1.5 inline-flex items-center gap-1 text-[12px] font-semibold text-brand-700 hover:text-brand-800">
            Open data requests <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </section>
      ) : null}

      <Note detail={detail} run={run} pending={pending} />
    </div>
  );
}

/*
  THE CONTACT CARD. Masked values come from the server; the real ones
  arrive only from a recorded reveal and live in this component's state
  for as long as the panel is open — never in the page's props, never in
  the HTML that was sent before anybody asked.
*/
function Contact({ detail }: { detail: CustomerDetail }) {
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");
  const [shown, setShown] = useState<{ email: string | null; phone: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const reveal = () =>
    start(async () => {
      setError(null);
      const result = await revealCustomerContactAction(detail.id, reason);
      if (!result.ok) setError(result.error);
      else {
        setShown({ email: result.email, phone: result.phone });
        setAsking(false);
      }
    });

  return (
    <section>
      <div className="flex items-center gap-2 mb-1.5">
        <h3 className="text-[12px] font-semibold text-slate-500 uppercase tracking-wide">Contact</h3>
        {!shown && detail.actions.reveal_contact && (
          <button onClick={() => setAsking((v) => !v)}
            className="ml-auto text-[12px] font-semibold text-brand-700 hover:text-brand-800 inline-flex items-center gap-1">
            <Lock className="w-3.5 h-3.5" /> Masked · Reveal with reason
          </button>
        )}
      </div>

      <dl className="space-y-1">
        <div className="flex items-center gap-2 text-[13px]">
          <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <dt className="text-slate-500">Email</dt>
          <dd className="ml-auto text-slate-900 text-right truncate">
            {shown?.email ?? detail.contact.email_masked ?? "None on file"}
          </dd>
        </div>
        <div className="flex items-center gap-2 text-[13px]">
          <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <dt className="text-slate-500">Phone</dt>
          <dd className="ml-auto text-slate-900 text-right truncate">
            {shown?.phone ?? detail.contact.phone_masked ?? "None on file"}
            {detail.contact.has_phone && !detail.contact.phone_verified && (
              <span className="text-[11px] text-slate-400"> · unverified</span>
            )}
          </dd>
        </div>
        <div className="flex items-center gap-2 text-[13px]">
          <Globe className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <dt className="text-slate-500">Account country</dt>
          <dd className="ml-auto text-slate-900">{detail.contact.country ?? "—"}</dd>
        </div>
      </dl>

      {asking && !shown && (
        <div className="mt-2 space-y-2">
          <p className="text-[11px] text-slate-500">
            One reveal shows the email and the phone number together, and records your name,
            this customer and your reason in the audit log.
          </p>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="Why do you need these? e.g. replying to case CS-0042"
            className="w-full text-[13px] border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-200"
          />
          {error && <p className="text-[12px] text-rose-700">{error}</p>}
          <button
            disabled={pending}
            onClick={reveal}
            className="inline-flex items-center gap-1.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-[12px] font-semibold px-3 py-1.5 rounded-lg"
          >
            {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />}
            Reveal and record
          </button>
        </div>
      )}

      {shown && (
        <p className="text-[11px] text-slate-400 mt-1.5">Recorded in the audit log.</p>
      )}

      <p className="text-[11px] text-slate-500 mt-2 flex items-start gap-1.5">
        <Info className="w-3.5 h-3.5 text-brand-500 mt-px shrink-0" />
        <span>
          Joined <ClientDateTime iso={detail.created_at} mode="date" />
          {detail.contact.account_currency
            ? `. Their account currency is ${detail.contact.account_currency}, but the currency charged is set per booking.`
            : ". The currency charged is set per booking."}
        </span>
      </p>
    </section>
  );
}

/*
  MONEY, PER CURRENCY AND PER STATE. Captured counts the capture event,
  so a later refund does not unmake it, and refunds are their own line.
  Nothing is netted and nothing is added across currencies — CA$ and US$
  are different money. Holds that never captured are named separately
  because a hold is not revenue.
*/
function Money({ detail }: { detail: CustomerDetail }) {
  if (detail.money.length === 0) {
    return (
      <section>
        <h3 className="text-[12px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
          Financial summary
        </h3>
        <p className="text-[13px] text-slate-500">No payments on this account yet.</p>
      </section>
    );
  }

  return (
    <section>
      <h3 className="text-[12px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
        Financial summary
      </h3>
      <div className="space-y-2">
        {detail.money.map((m) => (
          <div key={m.currency} className="border border-slate-200 rounded-xl px-3 py-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-semibold text-slate-700">{m.currency}</span>
              <span className="text-[11px] text-slate-400 tabular-nums">
                {m.captured_count} captured {m.captured_count === 1 ? "payment" : "payments"}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-1.5">
              <div>
                <p className="text-[11px] text-slate-500">Captured</p>
                <p className="text-[17px] font-bold text-slate-900 tabular-nums leading-tight">
                  {money(m.captured_cents, m.currency)}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-slate-500">Refunded</p>
                <p className="text-[17px] font-bold text-slate-900 tabular-nums leading-tight">
                  {money(m.refunded_cents, m.currency)}
                </p>
              </div>
            </div>
            {m.holds_open > 0 && (
              <p className="text-[11px] text-slate-500 mt-1.5">
                {m.holds_open} authorized {m.holds_open === 1 ? "hold has" : "holds have"} not
                captured — excluded from both figures.
              </p>
            )}
          </div>
        ))}
      </div>
      <p className="text-[11px] text-slate-500 mt-1.5">
        Captured and refunded are never netted, and currencies are never added together.
        Test activity and uncaptured holds are excluded.
      </p>
      {/* Their bookings, where each payment is shown as the events it
          was. /admin/payments is a stub and sending somebody there
          reads as a broken console. */}
      <Link href={`/admin/bookings?q=${encodeURIComponent(detail.name ?? detail.ref)}&tab=bookings`}
        className="mt-1 inline-flex items-center gap-1 text-[12px] font-semibold text-brand-700 hover:text-brand-800">
        View payments <ChevronRight className="w-3.5 h-3.5" />
      </Link>
    </section>
  );
}

function Note({
  detail, run, pending,
}: {
  detail: CustomerDetail;
  run: (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) => void;
  pending: boolean;
}) {
  const [body, setBody] = useState("");
  return (
    <section>
      <h3 className="text-[12px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
        Internal note
      </h3>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={2}
        placeholder="What should the next person know?"
        className="w-full text-[13px] border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-200"
      />
      <div className="flex items-center gap-2 mt-1.5">
        <button
          disabled={pending || body.trim().length === 0}
          onClick={() => run(async () => {
            const result = await addCustomerNoteAction(detail.id, body);
            if (result.ok) setBody("");
            return result;
          })}
          className="inline-flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-[12px] font-semibold px-3 py-1.5 rounded-lg"
        >
          <MessageSquarePlus className="w-3.5 h-3.5" /> Save note
        </button>
        <span className="text-[11px] text-slate-400">Staff only. The customer never sees it.</span>
      </div>

      {detail.notes.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {detail.notes.slice(0, 4).map((n, i) => (
            <li key={i} className="text-[12px] text-slate-700 border-l-2 border-slate-200 pl-2">
              {n.body}
              <span className="block text-[11px] text-slate-400">
                {n.author} · <ClientDateTime iso={n.at} mode="date" />
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ---------------------------------------------------------------- tabs */

function Bookings({ detail }: { detail: CustomerDetail }) {
  if (detail.bookings.length === 0) {
    return <p className="px-4 py-8 text-center text-[13px] text-slate-500">No bookings on this account.</p>;
  }
  return (
    <div className="px-4 py-3">
      <ul className="divide-y divide-slate-100">
        {detail.bookings.map((b) => (
          <li key={b.id} className="py-2.5 flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <Link href={`/admin/bookings?open=booking:${b.id}`}
                className="text-[13px] font-semibold text-slate-900 hover:text-brand-700 block truncate">
                {b.service ?? "Service"}
              </Link>
              <p className="text-[12px] text-slate-500 tabular-nums">
                {b.ref} · <ClientDateTime iso={b.scheduled_for ?? b.created_at} mode="date" />
                {b.helper ? ` · ${b.helper}` : " · Unassigned"}
              </p>
            </div>
            <div className="text-right shrink-0">
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                STATUS_TONE[b.status] ?? "bg-slate-100 text-slate-600"
              }`}>
                {b.status.replace("_", " ")}
              </span>
              <p className="text-[12px] text-slate-700 tabular-nums mt-0.5">
                {b.total_cents == null ? "—" : money(b.total_cents, b.currency ?? "CAD")}
              </p>
            </div>
          </li>
        ))}
      </ul>
      {detail.stats.total_bookings > detail.bookings.length && (
        <p className="text-[11px] text-slate-400 pt-1">
          Showing the {detail.bookings.length} most recent of {detail.stats.total_bookings}.
        </p>
      )}
    </div>
  );
}

function Payments({ detail }: { detail: CustomerDetail }) {
  if (detail.payments.length === 0) {
    return <p className="px-4 py-8 text-center text-[13px] text-slate-500">No payment events on this account.</p>;
  }
  return (
    <div className="px-4 py-3">
      <p className="text-[11px] text-slate-500 mb-2 flex items-start gap-1.5">
        <CreditCard className="w-3.5 h-3.5 text-brand-500 mt-px shrink-0" />
        Four different things, each with its own time: a hold placed, a capture taken,
        a refund sent, a capture that failed.
      </p>
      <ul className="divide-y divide-slate-100">
        {detail.payments.map((p, i) => {
          const kind = PAYMENT_KIND[p.kind] ?? { label: p.kind, tone: "text-slate-700" };
          return (
            <li key={i} className="py-2 flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className={`text-[13px] font-semibold ${kind.tone}`}>{kind.label}</p>
                <p className="text-[12px] text-slate-500 tabular-nums">
                  {p.booking_ref} · <ClientDateTime iso={p.at} mode="datetime" />
                </p>
                {p.detail && <p className="text-[11px] text-slate-500">{p.detail}</p>}
              </div>
              <span className="text-[13px] font-semibold text-slate-900 tabular-nums shrink-0">
                {p.amount_cents == null ? "—" : money(p.amount_cents, p.currency ?? "CAD")}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="text-[11px] text-slate-400 pt-1">The 20 most recent events.</p>
    </div>
  );
}

function Activity({ detail }: { detail: CustomerDetail }) {
  if (detail.activity.length === 0) {
    return <p className="px-4 py-8 text-center text-[13px] text-slate-500">Nothing recorded yet.</p>;
  }
  return (
    <ol className="px-4 py-3 space-y-2.5">
      {detail.activity.map((e, i) => (
        <li key={i} className="flex gap-2.5">
          <span className="w-1.5 h-1.5 rounded-full bg-slate-300 mt-1.5 shrink-0" />
          <div className="min-w-0">
            <p className="text-[13px] text-slate-900 font-medium">{e.label}</p>
            {e.detail && <p className="text-[12px] text-slate-600 break-words">{e.detail}</p>}
            <p className="text-[11px] text-slate-400">
              <ClientDateTime iso={e.at} mode="datetime" />
              {e.actor ? ` · ${e.actor}` : ""}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/* ---------------------------------------------------------------- footer */

function Footer({
  detail, run, pending, message,
}: {
  detail: CustomerDetail;
  run: (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) => void;
  pending: boolean;
  message: { ok: boolean; text: string } | null;
}) {
  const [open, setOpen] = useState<null | "case" | "restrict">(null);
  const [category, setCategory] = useState("other");
  const [description, setDescription] = useState("");
  const [reason, setReason] = useState("");

  return (
    <div className="border-t border-slate-100 px-4 py-3 space-y-2 bg-slate-50/60">
      {message && (
        <p className={`text-[12px] rounded-lg px-2.5 py-1.5 ${
          message.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"
        }`}>
          {message.text}
        </p>
      )}

      {open === "case" && (
        <div className="space-y-2 bg-white border border-slate-200 rounded-xl p-3">
          <p className="text-[12px] text-slate-600">
            The case attaches to {detail.actions.open_case_booking_ref}, their most recent booking,
            and is assigned to you.
          </p>
          <select value={category} onChange={(e) => setCategory(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[13px]">
            {["billing", "quality", "no_show", "damage", "safety", "other"].map((c) => (
              <option key={c} value={c}>{c.replace("_", " ")}</option>
            ))}
          </select>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
            placeholder="What has the customer told us? At least a sentence."
            className="w-full text-[13px] border border-slate-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-brand-200" />
          <div className="flex items-center gap-2">
            <button
              disabled={pending || description.trim().length < 10}
              onClick={() => run(async () => {
                const result = await openCustomerCaseAction(detail.id, category, description);
                if (result.ok) { setDescription(""); setOpen(null); }
                return result;
              })}
              className="inline-flex items-center gap-1.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-[12px] font-semibold px-3 py-1.5 rounded-lg">
              {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LifeBuoy className="w-3.5 h-3.5" />}
              Open case
            </button>
            <button onClick={() => setOpen(null)} className="text-[12px] font-semibold text-slate-500">Cancel</button>
          </div>
        </div>
      )}

      {open === "restrict" && (
        <div className="space-y-2 bg-white border border-rose-200 rounded-xl p-3">
          <p className="text-[12px] text-rose-900 font-semibold">
            A restricted account cannot open new requests.
          </p>
          <p className="text-[11px] text-slate-600">
            The database refuses the insert, so this holds whatever the app does. Existing
            bookings are untouched. The reason stays internal; the customer is told only to
            contact support.
          </p>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2}
            placeholder="Why is this account being restricted?"
            className="w-full text-[13px] border border-slate-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-rose-200" />
          <div className="flex items-center gap-2">
            <button
              disabled={pending || reason.trim().length < 8}
              onClick={() => run(async () => {
                const result = await setCustomerRestrictionAction(detail.id, true, reason);
                if (result.ok) { setReason(""); setOpen(null); }
                return result;
              })}
              className="inline-flex items-center gap-1.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-[12px] font-semibold px-3 py-1.5 rounded-lg">
              {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Ban className="w-3.5 h-3.5" />}
              Restrict account
            </button>
            <button onClick={() => setOpen(null)} className="text-[12px] font-semibold text-slate-500">Cancel</button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        {detail.actions.open_case ? (
          <button
            onClick={() => setOpen(open === "case" ? null : "case")}
            disabled={pending}
            className="flex-1 inline-flex items-center justify-center gap-1.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-[13px] font-semibold px-3 py-2 rounded-xl"
          >
            <LifeBuoy className="w-4 h-4" /> Open support case
          </button>
        ) : (
          <span className="flex-1 text-[12px] text-slate-500 bg-white border border-slate-200 rounded-xl px-3 py-2">
            {detail.actions.open_case_blocked_reason}
          </span>
        )}

        {/*
          ACCOUNT ACTIONS, as a menu rather than a row of buttons: these
          are the moves nobody should make by brushing past them. Each
          one still says what it does before it does it.
        */}
        <details className="relative shrink-0 group">
          <summary className="list-none cursor-pointer inline-flex items-center gap-1.5 bg-white border border-slate-200 hover:border-slate-300 text-[13px] font-semibold text-slate-700 px-3 py-2 rounded-xl">
            <Shield className="w-4 h-4" /> Account actions
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 group-open:rotate-180 transition" />
          </summary>
          <div className="absolute right-0 bottom-full mb-1.5 w-60 bg-white border border-slate-200 rounded-xl shadow-lg p-1 z-10">
            {detail.actions.lift_restriction ? (
              <button
                onClick={() => run(() => setCustomerRestrictionAction(detail.id, false, null))}
                disabled={pending}
                className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-slate-50 text-[13px] font-semibold text-slate-800 flex items-center gap-2"
              >
                <ShieldOff className="w-4 h-4 text-slate-500" /> Lift restriction
              </button>
            ) : (
              <button
                onClick={() => setOpen(open === "restrict" ? null : "restrict")}
                disabled={pending}
                className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-rose-50 text-[13px] font-semibold text-rose-700 flex items-center gap-2"
              >
                <Ban className="w-4 h-4" /> Restrict account
                <span className="ml-auto text-[11px] font-medium text-slate-400">stops booking</span>
              </button>
            )}
            <Link href="/admin/data-requests"
              className="block px-2.5 py-2 rounded-lg hover:bg-slate-50 text-[13px] font-semibold text-slate-800 flex items-center gap-2">
              <Shield className="w-4 h-4 text-slate-500" /> Data &amp; deletion requests
            </Link>
            <Link href={`/admin/audit-log?target=${detail.id}`}
              className="block px-2.5 py-2 rounded-lg hover:bg-slate-50 text-[13px] font-semibold text-slate-800 flex items-center gap-2">
              <History className="w-4 h-4 text-slate-500" /> Who looked at this account
            </Link>
          </div>
        </details>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- bits */

function Stat({ icon: Icon, label, value, tone = "slate" }: {
  icon: typeof CheckCircle2; label: string; value: number; tone?: "slate" | "amber";
}) {
  return (
    <div className={`rounded-xl border px-2.5 py-2 ${
      tone === "amber" ? "bg-amber-50 border-amber-200" : "bg-white border-slate-200"
    }`}>
      <span className="flex items-center gap-1 text-[11px] font-semibold text-slate-500">
        <Icon className="w-3.5 h-3.5" /> {label}
      </span>
      <span className="block text-[20px] font-bold text-slate-900 leading-tight tabular-nums">{value}</span>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 text-[13px]">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-slate-900 ml-auto text-right truncate">{value}</dd>
    </div>
  );
}

function initials(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}
