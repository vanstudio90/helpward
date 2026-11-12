"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  X, ExternalLink, CreditCard, CheckCircle2, XCircle, Clock, Info,
  RotateCcw, CalendarDays, User, Users,
} from "lucide-react";
import type { PaymentDetail } from "@/lib/data/admin-payments";
import { PAYMENT_LABEL, PAYMENT_TONE, PAYMENT_MEANING } from "@/lib/admin-payment-states";
import { money } from "@/lib/admin-format";

/*
  ONE PAYMENT.

  THREE NUMBERS THAT ARE NOT THE SAME NUMBER, which is the whole reason
  this panel is laid out the way it is:

    THE BREAKDOWN is what the customer was charged, and it adds up to
    the captured total.

    THE ALLOCATION is what each party is owed on paper. It is NOT a
    payout — a transfer is its own event with its own state — and it
    excludes processor fees, so it will not match a bank statement.

    THE REFUND SUMMARY is what has gone back and what still could.

  A console that shows these three as one "total" is how somebody comes
  to believe a helper has been paid because a customer has been charged.
*/

type Tab = "summary" | "events" | "refunds";

export function PaymentDetailPanel({ detail, sample }: { detail: PaymentDetail; sample: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const [tab, setTab] = useState<Tab>("summary");

  const close = () => {
    const next = new URLSearchParams(params.toString());
    next.delete("open");
    router.replace(`/admin/payments?${next.toString()}`, { scroll: false });
  };

  return (
    <aside className="bg-white rounded-2xl border border-slate-200 flex flex-col max-h-[calc(100vh-7rem)] overflow-hidden">
      <header className="px-4 pt-3.5 pb-3 border-b border-slate-100">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h2 className="text-[17px] font-bold text-slate-900 leading-tight flex flex-wrap items-center gap-2">
              Payment {detail.id}
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${PAYMENT_TONE[detail.state]}`}
                title={PAYMENT_MEANING[detail.state]}>
                {PAYMENT_LABEL[detail.state]}
              </span>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                detail.mode === "live" ? "bg-brand-50 text-brand-700" : "bg-amber-100 text-amber-900"
              }`}>
                {detail.mode === "live" ? "Live" : "Test"}
              </span>
            </h2>
            <p className="text-[12px] text-slate-500 mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="w-3.5 h-3.5 text-slate-400" />
                {detail.service} <span className="text-brand-700 font-semibold">{detail.booking_ref}</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <User className="w-3.5 h-3.5 text-slate-400" /> {detail.customer_name}
              </span>
              {detail.helper_name && (
                <span className="inline-flex items-center gap-1">
                  <Users className="w-3.5 h-3.5 text-slate-400" /> {detail.helper_name}
                </span>
              )}
            </p>
          </div>
          <button
            type="button"
            title={sample ? "Sample data — there is no Stripe record behind this" : "Open in Stripe"}
            disabled={sample}
            className="w-8 h-8 grid place-items-center rounded-lg text-slate-400 hover:text-brand-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ExternalLink className="w-4 h-4" />
          </button>
          <button onClick={close} aria-label="Close"
            className="w-8 h-8 grid place-items-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-50">
            <X className="w-4 h-4" />
          </button>
        </div>

        <nav className="flex items-center gap-4 mt-3 -mb-3">
          {(["summary", "events", "refunds"] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`text-[13px] font-semibold pb-2.5 border-b-2 capitalize ${
                tab === t ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800"
              }`}>
              {t}
              {t === "refunds" && detail.refunds.length > 0 && (
                <span className="ml-1 text-[11px] text-slate-400">{detail.refunds.length}</span>
              )}
            </button>
          ))}
        </nav>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {tab === "summary" && (
          <>
            {/* THE HEADLINE FIGURE AND THE CARD IT CAME FROM */}
            <div className="flex items-center gap-3 border border-slate-200 rounded-xl px-3.5 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-[12px] text-slate-500">
                  {detail.state === "captured" || detail.state === "partially_refunded"
                    ? "Amount captured" : "Amount authorized"}
                </p>
                <p className="text-[26px] font-bold text-slate-900 leading-tight tabular-nums">
                  {money(detail.amount_cents, detail.currency)}
                </p>
              </div>
              {detail.card && (
                <div className="flex items-center gap-2 pl-3 border-l border-slate-100 shrink-0">
                  <span className="text-[11px] font-bold text-white bg-slate-900 px-1.5 py-0.5 rounded">
                    {detail.card.brand.toUpperCase()}
                  </span>
                  <span className="text-[13px] text-slate-700 tabular-nums">•••• {detail.card.last4}</span>
                </div>
              )}
            </div>

            <div className="grid sm:grid-cols-2 gap-2.5">
              {/* WHAT THEY WERE CHARGED */}
              <section className="border border-slate-200 rounded-xl px-3 py-2.5">
                <h3 className="text-[12px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Breakdown</h3>
                <dl className="space-y-1">
                  {detail.breakdown.map((line) => (
                    <div key={line.label}
                      className={`flex items-center gap-2 text-[13px] ${
                        line.emphasis ? "pt-1.5 mt-1 border-t border-slate-100 font-semibold text-slate-900" : "text-slate-700"
                      }`}>
                      <dt>{line.label}</dt>
                      <dd className="ml-auto tabular-nums">{money(line.amount_cents, detail.currency)}</dd>
                    </div>
                  ))}
                </dl>
                {detail.tip && (
                  <p className="text-[11px] text-slate-500 mt-2 flex items-start gap-1.5">
                    <Info className="w-3.5 h-3.5 text-brand-500 mt-px shrink-0" />
                    <span>
                      Tip {money(detail.tip.amount_cents, detail.currency)} · separate payment{" "}
                      <span className="font-semibold text-brand-700">{detail.tip.payment_id}</span>
                    </span>
                  </p>
                )}
              </section>

              {/* WHAT EACH PARTY IS OWED ON PAPER */}
              <section className="border border-slate-200 rounded-xl px-3 py-2.5">
                <h3 className="text-[12px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Allocation</h3>
                <dl className="space-y-1">
                  {detail.allocation.map((line) => (
                    <div key={line.label} className="flex items-center gap-2 text-[13px] text-slate-700">
                      <dt title={line.note ?? undefined}>{line.label}</dt>
                      <dd className="ml-auto tabular-nums">
                        {/* UNKNOWN IS NOT ZERO. A settlement nobody recorded
                            shows as unknown, because CA$0.00 here is how a
                            helper gets paid the wrong amount. */}
                        {line.amount_cents === null ? (
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900">
                            Not recorded
                          </span>
                        ) : money(line.amount_cents, detail.currency)}
                      </dd>
                    </div>
                  ))}
                </dl>
                <p className="text-[11px] text-slate-500 mt-2 flex items-start gap-1.5">
                  <Info className="w-3.5 h-3.5 text-slate-400 mt-px shrink-0" />
                  <span>
                    {detail.allocation_source} Excludes processor fees, and does not confirm a
                    payout — a transfer is its own event with its own outcome.
                  </span>
                </p>
              </section>
            </div>

            <div className="grid sm:grid-cols-2 gap-2.5">
              <section className="border border-slate-200 rounded-xl px-3 py-2.5">
                <h3 className="text-[12px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Timeline</h3>
                <ol className="space-y-2">
                  {detail.timeline.map((step) => (
                    <li key={step.label} className="flex items-center gap-2">
                      {step.state === "done" ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                        : step.state === "failed" ? <XCircle className="w-4 h-4 text-rose-500 shrink-0" />
                        : <Clock className="w-4 h-4 text-slate-300 shrink-0" />}
                      <span className="text-[13px] text-slate-800 flex-1">{step.label}</span>
                      <span className="text-[12px] text-slate-500 tabular-nums">{step.at}</span>
                    </li>
                  ))}
                </ol>
              </section>

              <section className="border border-slate-200 rounded-xl px-3 py-2.5">
                <h3 className="text-[12px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                  <RotateCcw className="w-3.5 h-3.5" /> Refund summary
                </h3>
                <dl className="space-y-1">
                  <div className="flex items-center gap-2 text-[13px] text-slate-700">
                    <dt>Refunded</dt>
                    <dd className="ml-auto tabular-nums">
                      {money(detail.refund_summary.refunded_cents, detail.currency)}
                    </dd>
                  </div>
                  <div className="flex items-center gap-2 text-[13px] text-slate-700">
                    <dt>Remaining refundable</dt>
                    <dd className="ml-auto tabular-nums">
                      {money(detail.refund_summary.remaining_refundable_cents, detail.currency)}
                    </dd>
                  </div>
                </dl>
                <div className="flex items-center gap-2 mt-2.5">
                  {/* The refund workflow lives on its own screen, where the
                      amount, the reason and the transfer effects are
                      reviewed before anything is submitted. */}
                  <Link href={`/admin/refunds?start=${detail.id}`}
                    className="text-[12px] font-semibold text-slate-700 bg-white border border-slate-200 hover:border-brand-300 px-2.5 py-1.5 rounded-lg">
                    Review refund
                  </Link>
                  {detail.booking_id ? (
                    <Link href={`/admin/bookings?open=booking:${detail.booking_id}`}
                      className="text-[12px] font-semibold text-white bg-brand-600 hover:bg-brand-700 px-2.5 py-1.5 rounded-lg">
                      Open booking
                    </Link>
                  ) : (
                    <button type="button" disabled
                      title="Sample data — no booking behind this"
                      className="text-[12px] font-semibold text-white bg-brand-600 px-2.5 py-1.5 rounded-lg opacity-40 cursor-not-allowed">
                      Open booking
                    </button>
                  )}
                </div>
              </section>
            </div>

            <p className="text-[11px] text-slate-500 flex items-start gap-1.5">
              <Info className="w-3.5 h-3.5 text-brand-500 mt-px shrink-0" />
              A refund confirmation shows the amount, the reason and what it does to the helper&apos;s
              transfer before anything is sent.
            </p>
          </>
        )}

        {tab === "events" && (
          <ol className="space-y-2.5">
            {detail.events.map((e, i) => (
              <li key={i} className="flex gap-2.5">
                <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                  e.source === "stripe" ? "bg-indigo-400" : "bg-slate-300"
                }`} />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-slate-900 break-words">{e.label}</p>
                  {e.detail && <p className="text-[12px] text-slate-600">{e.detail}</p>}
                  <p className="text-[11px] text-slate-400">
                    {e.source === "stripe" ? "From Stripe" : "From Helpward"} · {e.at}
                  </p>
                </div>
              </li>
            ))}
            <li className="text-[11px] text-slate-500 pt-1">
              Events from Stripe are what the processor told us. Events from Helpward are what this
              system did about it.
            </li>
          </ol>
        )}

        {tab === "refunds" && (
          detail.refunds.length === 0 ? (
            <p className="text-[13px] text-slate-500 py-6 text-center">
              Nothing has been refunded on this payment.
            </p>
          ) : (
            <ul className="space-y-2">
              {detail.refunds.map((r) => (
                <li key={r.id} className="border border-slate-200 rounded-xl px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-bold text-slate-900 tabular-nums">
                      {money(r.amount_cents, detail.currency)}
                    </span>
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800">
                      {r.state}
                    </span>
                    <span className="ml-auto text-[12px] text-slate-500">{r.at}</span>
                  </div>
                  {r.reason && <p className="text-[12px] text-slate-600 mt-1">{r.reason}</p>}
                  {r.transfer_effect && (
                    <p className="text-[11px] text-slate-500 mt-1">Transfer: {r.transfer_effect}</p>
                  )}
                </li>
              ))}
            </ul>
          )
        )}
      </div>

      <footer className="border-t border-slate-100 px-4 py-2.5 flex items-center gap-2">
        <button type="button" disabled={sample}
          title={sample ? "Sample data — there is no Stripe record behind this" : "Open this payment in Stripe"}
          className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-brand-700 disabled:text-slate-400 disabled:cursor-not-allowed">
          <ExternalLink className="w-3.5 h-3.5" /> Open in Stripe
        </button>
        <span className="text-slate-200">|</span>
        <p className="text-[11px] text-slate-500 flex-1">
          <CreditCard className="w-3 h-3 inline mr-1 text-slate-400" />
          Captured is money taken. A hold is not.
        </p>
      </footer>
    </aside>
  );
}
