"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  X, ExternalLink, Info, AlertTriangle, Send, Save, CheckCircle2, History, Lock,
} from "lucide-react";
import {
  decideRefundAction, sendApprovedRefundAction, clearRefundQuarantineAction,
  type RefundResult,
} from "@/app/(admin)/admin/refunds/actions";
import type { RefundReview } from "@/lib/data/admin-refunds";
import {
  REFUND_LABEL, REFUND_TONE, REFUND_MEANING, REFUND_REASONS,
  EFFECT_LABEL, EFFECT_TONE,
} from "@/lib/admin-refund-states";
import { money } from "@/lib/admin-format";

/*
  REVIEWING A PROPOSED REFUND.

  NOTHING HERE HAS BEEN SENT. The panel is a proposal: an amount, a
  reason, and a preview of what it would do. "Review and confirm" is
  the first moment anything would reach Stripe, which is why the state
  badge says "Awaiting review" and why the button is the only control
  that is styled as a commitment.

  THE EFFECTS BLOCK IS THE POINT OF THE SCREEN. A refund has more than
  one outcome — the customer's money and the helper's transfer are
  separate operations that can fail separately — and where this
  product does not yet know what a partial refund does to a transfer
  that has already gone out, the panel says "requires review" and
  refuses to proceed. A proportional guess would be somebody's pay.

  AVAILABLE TO REFUND SUBTRACTS WHAT IS IN FLIGHT, because two
  reviewers each refunding "the remaining CA$94.50" is how a customer
  gets paid twice.
*/
export function RefundReviewPanel({
  review, sample, can,
}: {
  review: RefundReview;
  sample: boolean;
  can: { request: boolean; decide: boolean; send: boolean };
}) {
  /*
    APPROVING IS THE MOMENT MONEY MOVES, and nothing else on this
    screen does. The button says what it will do before it does it,
    and the outcome it reports is what the processor actually
    returned — not the fact that somebody clicked.
  */
  const [busy, setBusy] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<RefundResult | null>(null);

  const run = async (key: string, fn: () => Promise<RefundResult>) => {
    setBusy(key);
    setOutcome(null);
    try {
      const result = await fn();
      setOutcome(result);
      if (result.ok) router.refresh();
    } catch (e) {
      setOutcome({ ok: false, error: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  };

  const decide = (approve: boolean) => async () => {
    const why = window.prompt(
      approve
        ? can.send
          ? "Why is this refund being approved? It is recorded with your name, and the money is sent immediately after."
          : "Why is this refund being approved? It is recorded with your name. Sending is switched off, so NO money will move — the request will wait."
        : "Why is this refund being declined? The request stays on the record with your reason.",
    );
    if (why === null) return;
    setBusy(approve ? "approve" : "decline");
    setOutcome(null);
    try {
      const result = await decideRefundAction(review.id_uuid, review.updated_at, approve, why);
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
  const [kind, setKind] = useState<"partial" | "full">(review.proposal.kind);
  const [amount, setAmount] = useState((review.proposal.amount_cents / 100).toFixed(2));
  const [reason, setReason] = useState(review.proposal.reason ?? "");
  const [note, setNote] = useState(review.proposal.internal_note);
  const [notify, setNotify] = useState(review.proposal.notify_customer);

  const close = () => {
    const next = new URLSearchParams(params.toString());
    next.delete("open");
    router.replace(`/admin/refunds?${next.toString()}`, { scroll: false });
  };

  const blocked = Boolean(review.blocked_reason) || sample;
  const proposed = kind === "full" ? review.balances.available_cents : Math.round(Number(amount || 0) * 100);
  const overAvailable = proposed > review.balances.available_cents;

  return (
    <aside className="bg-white rounded-2xl border border-slate-200 flex flex-col max-h-[calc(100vh-7rem)] overflow-hidden">
      <header className="px-4 pt-3.5 pb-3 border-b border-slate-100 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="text-[17px] font-bold text-slate-900 leading-tight flex flex-wrap items-center gap-2">
            Review refund {review.id}
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${REFUND_TONE[review.state]}`}
              title={REFUND_MEANING[review.state]}>
              {REFUND_LABEL[review.state]}
            </span>
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
              review.mode === "live" ? "bg-emerald-50 text-emerald-700" : "bg-amber-100 text-amber-900"
            }`}>
              {review.mode === "live" ? "Live" : "Test"}
            </span>
          </h2>
          {review.state === "awaiting_review" && (
            <p className="text-[11px] text-slate-500 mt-1">
              This is an internal request. Nothing has been sent to Stripe and the customer has not
              been told.
            </p>
          )}
        </div>
        <button onClick={close} aria-label="Close"
          className="w-8 h-8 grid place-items-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-50">
          <X className="w-4 h-4" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {/* WHAT IS BEING REFUNDED */}
        <div className="grid sm:grid-cols-2 gap-3">
          <dl className="space-y-1.5">
            <Line label="Payment">
              {review.payment.service}{" "}
              <span className="font-semibold text-slate-900">{review.payment.booking_ref}</span>
            </Line>
            <Line label="Customer">{review.payment.customer_name}</Line>
            <Line label="Helper">{review.payment.helper_name ?? "—"}</Line>
            <Line label="Original payment">
              <span className="inline-flex items-center gap-1 font-semibold text-brand-700">
                {review.payment.ref}
                <ExternalLink className="w-3 h-3" />
              </span>
            </Line>
            <Line label="Card">
              {review.payment.card ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="text-[10px] font-bold text-white bg-slate-900 px-1.5 py-0.5 rounded">
                    {review.payment.card.brand.toUpperCase()}
                  </span>
                  <span className="tabular-nums">•••• {review.payment.card.last4}</span>
                </span>
              ) : "—"}
            </Line>
          </dl>

          <div className="space-y-2">
            <label className="block">
              <span className="text-[12px] font-semibold text-slate-600">Payment type</span>
              <select defaultValue={review.leg}
                className="mt-1 w-full bg-white border border-slate-200 rounded-lg px-2.5 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-brand-200">
                <option value="service">Service payment</option>
                <option value="tip">Tip payment</option>
              </select>
            </label>
            {/* A TIP IS A DIFFERENT CHARGE. Refunding one does not touch
                the other, and the panel names the one it is not doing. */}
            {review.separate_leg && (
              <p className="text-[12px]">
                <span className="text-brand-700 font-semibold underline underline-offset-2">
                  Separate {review.separate_leg.leg} {money(review.separate_leg.amount_cents, review.currency)}
                </span>{" "}
                <span className="text-slate-500">
                  · not included. It is payment {review.separate_leg.payment_ref} and has its own
                  refund history.
                </span>
              </p>
            )}
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          {/* THE BALANCES */}
          <section className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5">
            <dl className="space-y-1">
              <Row label="Captured" value={money(review.balances.captured_cents, review.currency)} />
              <Row label="Refunded" value={money(review.balances.refunded_cents, review.currency)} />
              <Row label="Refunds processing" value={money(review.balances.processing_cents, review.currency)} />
              <div className="flex items-center gap-2 text-[13px] font-semibold text-brand-800 bg-brand-50 -mx-3 -mb-2.5 mt-1.5 px-3 py-2 rounded-b-xl">
                <dt>Available to refund</dt>
                <dd className="ml-auto tabular-nums">{money(review.balances.available_cents, review.currency)}</dd>
              </div>
            </dl>
            <p className="sr-only">
              Available to refund subtracts refunds already in flight, and is rechecked when the
              refund is submitted.
            </p>
          </section>

          {/* THE AMOUNT */}
          <section>
            <h3 className="text-[13px] font-semibold text-slate-800 mb-1.5">Refund amount</h3>
            <div className="flex items-center gap-4 mb-2">
              {(["partial", "full"] as const).map((k) => (
                <label key={k} className="inline-flex items-center gap-1.5 text-[13px] text-slate-700">
                  <input type="radio" name="refund-kind" checked={kind === k} onChange={() => setKind(k)} />
                  {k === "partial" ? "Partial refund" : "Full refund"}
                </label>
              ))}
            </div>
            <div className="flex items-stretch">
              <span className="inline-flex items-center px-2.5 text-[13px] font-semibold text-slate-600 bg-slate-50 border border-r-0 border-slate-200 rounded-l-xl">
                {review.currency === "CAD" ? "CA$" : "US$"}
              </span>
              <input
                value={kind === "full" ? (review.balances.available_cents / 100).toFixed(2) : amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={kind === "full"}
                inputMode="decimal"
                className="flex-1 min-w-0 border border-slate-200 rounded-r-xl px-3 py-2 text-[14px] tabular-nums focus:outline-none focus:ring-2 focus:ring-brand-200 disabled:bg-slate-50 disabled:text-slate-500"
              />
            </div>
            {overAvailable && (
              <p className="text-[12px] text-rose-700 mt-1">
                That is more than is available to refund.
              </p>
            )}
          </section>
        </div>

        {/* WHY */}
        <div className="space-y-2">
          <label className="block">
            <span className="text-[12px] font-semibold text-slate-600">Reason</span>
            <select value={reason} onChange={(e) => setReason(e.target.value)}
              className="mt-1 w-full bg-white border border-slate-200 rounded-lg px-2.5 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-brand-200">
              <option value="">Choose a reason</option>
              {REFUND_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-[12px] font-semibold text-slate-600">Internal explanation</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
              className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-brand-200" />
            <span className="text-[11px] text-slate-400">
              Staff only. Recorded with your name and the time.
            </span>
          </label>
        </div>

        {/* THE EFFECTS */}
        <section className="border border-amber-200 bg-amber-50/60 rounded-xl px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <h3 className="text-[13px] font-semibold text-slate-900">Financial effects</h3>
            <span className="text-[11px] font-semibold bg-white text-slate-600 border border-slate-200 px-2 py-0.5 rounded-full">
              Preview before confirmation
            </span>
          </div>
          <dl className="space-y-1.5">
            {review.effects.map((effect) => (
              <div key={effect.key} className="flex items-start gap-2 text-[13px]">
                <dt className="text-slate-700 flex items-center gap-1">
                  {effect.label}
                  {effect.note && (
                    <span title={effect.note}>
                      <Info className="w-3.5 h-3.5 text-slate-400" />
                    </span>
                  )}
                </dt>
                <dd className="ml-auto text-right">
                  {effect.amount_cents === null ? (
                    /* UNKNOWN IS NOT ZERO. */
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${EFFECT_TONE[effect.state]}`}>
                      {EFFECT_LABEL[effect.state]}
                    </span>
                  ) : (
                    <span className="font-semibold text-slate-900 tabular-nums">
                      {money(effect.amount_cents, review.currency)}
                    </span>
                  )}
                </dd>
              </div>
            ))}
          </dl>

          {review.blocked_reason && (
            <p className="text-[12px] text-amber-900 mt-2 flex items-start gap-1.5">
              <AlertTriangle className="w-4 h-4 mt-px shrink-0" />
              <span>
                <span className="font-semibold">Verify transfer effects before proceeding.</span>{" "}
                {review.blocked_reason}
              </span>
            </p>
          )}
        </section>

        <label className="flex items-center gap-2 text-[13px] text-slate-800">
          <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
          Send customer confirmation
          <button type="button" disabled={sample}
            className="ml-auto inline-flex items-center gap-1 text-[12px] font-semibold text-brand-700 disabled:text-slate-400 disabled:cursor-not-allowed">
            <Send className="w-3.5 h-3.5" /> Preview message
          </button>
        </label>
        <p className="text-[11px] text-slate-500 -mt-1">
          The wording follows the refund&apos;s actual state: submitted is not settled, and the
          message says when the money is likely to appear rather than that it already has.
        </p>
      </div>

      <footer className="border-t border-slate-100 px-4 py-3 space-y-2 bg-slate-50/60">
        {outcome && (
          <div className={`rounded-xl px-3 py-2 border ${
            outcome.ok ? "bg-emerald-50 border-emerald-200"
              : outcome.conflict ? "bg-amber-50 border-amber-200"
              : "bg-rose-50 border-rose-200"
          }`}>
            <p className={`text-[12px] font-semibold ${
              outcome.ok ? "text-emerald-900" : outcome.conflict ? "text-amber-900" : "text-rose-900"
            }`}>
              {outcome.ok ? outcome.message : outcome.error}
            </p>
            {outcome.ok && outcome.detail && (
              <p className="text-[11px] text-slate-600 mt-0.5">{outcome.detail}</p>
            )}
            {!outcome.ok && outcome.conflict && (
              <button type="button" onClick={() => { setOutcome(null); router.refresh(); }}
                className="mt-1 text-[11px] font-semibold text-amber-900 underline underline-offset-2">
                Reload this refund and start from what is recorded now
              </button>
            )}
          </div>
        )}

        {/*
          A QUARANTINE BLOCKS EVERYTHING ON THE BOOKING until a person
          resolves it. It used to clear itself on the next event, which
          meant the protection expired without anybody looking.
        */}
        {review.quarantine && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
            <p className="text-[12px] font-semibold text-amber-900">
              A processor event disagreed with this record
            </p>
            <p className="text-[11px] text-amber-800 mt-0.5">{review.quarantine}</p>
            <button type="button"
              disabled={sample || busy !== null}
              onClick={() => {
                const why = window.prompt(
                  "What did you check at the processor, and what did you find? This is recorded with your name, and it unblocks every refund on this booking.",
                );
                if (why === null) return;
                void run("quarantine", () => clearRefundQuarantineAction(review.id_uuid, why));
              }}
              className="mt-1.5 text-[11px] font-semibold text-amber-900 underline underline-offset-2 disabled:no-underline disabled:text-slate-400">
              {busy === "quarantine" ? "Recording…" : "I have checked the processor — resolve this"}
            </button>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button type="button"
            disabled={sample || !can.decide || blocked || busy !== null}
            onClick={decide(false)}
            className="inline-flex items-center gap-1.5 bg-white border border-slate-200 text-[13px] font-semibold text-slate-700 px-3 py-2 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed">
            {busy === "decline" ? "Declining…" : "Decline"}
          </button>
          <button type="button"
            disabled={sample || !can.decide || blocked || overAvailable || busy !== null}
            onClick={decide(true)}
            title={review.blocked_reason ?? (overAvailable ? "More than is available" : undefined)}
            className="inline-flex items-center gap-1.5 bg-brand-600 text-white text-[13px] font-semibold px-3.5 py-2 rounded-xl disabled:bg-slate-200 disabled:text-slate-500 disabled:cursor-not-allowed">
            <CheckCircle2 className="w-4 h-4" />
            {busy === "approve"
              ? (can.send ? "Sending…" : "Recording…")
              : (can.send ? "Approve and send" : "Approve (will not send)")}
          </button>
          {/*
            AN APPROVED ROW THAT WAS NEVER SENT. Turning the switch on
            does not reach back and send these, and re-approving is not
            possible — the decision already happened. So sending one is
            its own deliberate act.
          */}
          {review.state === "processing" && !review.processor_refund_id && (
            <button type="button"
              disabled={sample || !can.send || busy !== null}
              title={can.send
                ? "Send this already-approved refund to the processor now."
                : "Sending is switched off. This request stays approved and unsent."}
              onClick={() => {
                if (!window.confirm(
                  "Send this approved refund to the processor now? The money moves immediately.",
                )) return;
                void run("send", () => sendApprovedRefundAction(review.id_uuid));
              }}
              className="inline-flex items-center gap-1.5 bg-white border border-brand-200 text-[13px] font-semibold text-brand-700 px-3 py-2 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed">
              {busy === "send" ? "Sending…" : "Send now"}
            </button>
          )}
          {blocked && review.blocked_reason && (
            <span className="inline-flex items-center gap-1.5 text-[12px] text-amber-800">
              <Lock className="w-3.5 h-3.5" /> {review.blocked_reason}
            </span>
          )}
        </div>
        {/*
          THE COPY FOLLOWS THE SWITCH. The server has refused to send
          since the safeguard went in; this paragraph went on promising
          the money would move immediately, which is the one thing an
          operator must not be told wrongly about a refund.
        */}
        {can.send ? (
          <p className="text-[11px] text-slate-500">
            Approving sends the refund to the processor immediately. What comes back — an id or an
            error — is written to this request, so a refund that failed is never shown as sent.
          </p>
        ) : (
          <p className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
            <span className="font-semibold">Sending is switched off.</span>{" "}
            Approving records the decision with your name and moves nothing. The request waits as
            approved-but-unsent until sending is enabled and somebody sends it deliberately — the
            end-to-end run against the processor has not been done yet.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
          <span>
            Requested by {review.requested_by ?? "staff"} · {review.requested_at ?? "—"}
          </span>
          <Link href="/admin/audit-log?action=refund.requested"
            className="ml-auto inline-flex items-center gap-1 font-semibold text-brand-700">
            <History className="w-3.5 h-3.5" /> View history
            {review.history_count > 0 && <span className="text-slate-400">({review.history_count})</span>}
          </Link>
        </div>
      </footer>
    </aside>
  );
}

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2 text-[13px]">
      <dt className="text-slate-500 w-[112px] shrink-0">{label}</dt>
      <dd className="text-slate-800 min-w-0 truncate">{children}</dd>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 text-[13px] text-slate-700">
      <dt>{label}</dt>
      <dd className="ml-auto tabular-nums">{value}</dd>
    </div>
  );
}
