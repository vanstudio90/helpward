import Link from "next/link";
import {
  CheckCircle2, Clock, Eye, XCircle, Download, Plus, Search, Wrench, Coins,
  ChevronLeft, ChevronRight, Info, RotateCcw, AlertTriangle, FlaskConical, CloudOff,
} from "lucide-react";
import { getRefundsView, type RefundRow } from "@/lib/data/admin-refunds";
import { REFUND_LABEL, REFUND_TONE, REFUND_MEANING } from "@/lib/admin-refund-states";
import { money } from "@/lib/admin-format";
import { PaymentFilters } from "@/components/admin/PaymentFilters";
import { RefundReviewPanel } from "@/components/admin/RefundReviewPanel";
import { NewRefundForm } from "@/components/admin/NewRefundForm";

/*
  REFUNDS.

  THIS SCREEN IS A DESIGN AND SAYS SO — same seam as Payments, same
  stamp, same switched-off controls.

  FOUR DISTINCTIONS THE LAYOUT EXISTS TO PROTECT:

    AWAITING REVIEW IS NOT A REFUND. It is a request somebody inside
    Helpward has made. Nothing has been sent, nobody has been told, and
    the card has not moved. It is counted as a number of REQUESTS, next
    to two columns of MONEY, and the difference is stated.

    SUCCEEDED IS NOT "THE CUSTOMER HAS THEIR MONEY". Stripe accepting a
    refund begins a journey through card networks that takes days.

    RELEASING A HOLD IS NOT A REFUND. Nothing was taken, so nothing
    goes back; that route lives on the payment, not here.

    A FAILED LOAD IS NOT ZERO REFUNDS. If the processor cannot be
    reached the page says so in place of the totals — never a confident
    CA$0.00.
*/

export const dynamic = "force-dynamic";

const TABS = [
  { key: "all", label: "All activity" },
  { key: "awaiting", label: "Awaiting review" },
  { key: "processing", label: "Processing" },
  { key: "succeeded", label: "Succeeded" },
  { key: "failed", label: "Failed" },
] as const;

export default async function AdminRefundsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const tab = (TABS.find((t) => t.key === params.tab)?.key ?? "all") as string;

  const view = await getRefundsView({
    window: params.window,
    currency: params.currency,
    mode: params.mode === "test" ? "test" : "live",
    region: params.region ?? null,
    tab,
    open: params.open ?? null,
    start: params.start ?? null,
    state: params.state ?? null,
    search: params.q ?? null,
    includeReview: params.review === "1",
  });

  const openId = params.open ?? view.review?.id ?? null;
  const review = openId && openId === view.review?.id ? view.review : null;
  const missingReview = Boolean(openId && !review);
  const empty = view.rows.length === 0 && !view.sync_error;

  const query = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (value) next.set(key, value);
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    return `/admin/refunds?${next.toString()}`;
  };

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 pb-12 max-w-[1700px] mx-auto">
      <div className={review || missingReview ? "grid xl:grid-cols-[1fr_600px] gap-4 items-start" : ""}>
        <div className="min-w-0 space-y-4">
          <header className="flex flex-wrap items-start gap-3">
            <div className="min-w-0 flex-1">
              <h1 className="text-[28px] leading-tight font-bold text-slate-900 flex flex-wrap items-center gap-2.5">
                Refunds
              </h1>
              <p className="text-[14px] text-slate-500 mt-0.5">
                Review requests. Track processing. Confirm outcomes.
              </p>
            </div>
            <button type="button" disabled
              title="Exporting refunds has not been built."
              className="inline-flex items-center gap-1.5 bg-white border border-slate-200 text-[13px] font-semibold text-slate-700 px-3 py-2.5 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed">
              <Download className="w-4 h-4" /> Export
            </button>
            {/* A refund starts from a captured payment, so this sends you
                to the payments list rather than opening a blank form. */}
            <Link href="/admin/payments?tab=captured"
              className="inline-flex items-center gap-1.5 bg-brand-600 hover:bg-brand-700 text-white text-[13px] font-semibold px-4 py-2.5 rounded-xl">
              <Plus className="w-4 h-4" /> Start refund
            </Link>
          </header>

          {/*
            A FAILED READ IS NOT ZERO REFUNDS. On this screen a zero
            reads as "nobody asked for their money back", which is a
            very different thing from "we cannot see who did".
          */}
          {view.load_error && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
              <p className="text-[12px] text-amber-900">
                <span className="font-semibold">The refunds could not be read.</span>{" "}
                {view.load_error} Nothing is shown rather than zeroes.
              </p>
            </div>
          )}

          {/*
            WHO CARRIES A REFUND IS DECIDED BY ITS REASON, not by
            whoever happens to approve it. Saying so here is what stops
            a helper paying for an apology they had no part in.
          */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5 flex items-start gap-2.5">
            <Info className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
            <p className="text-[12px] text-slate-700">
              <span className="font-semibold">The reason decides who pays.</span>{" "}
              Work that was done and refunded as goodwill, a duplicate charge or our own pricing
              error is carried by Helpward — the helper keeps their share. Work that was not
              delivered takes the helper&apos;s share back with it. Each request shows which before
              anybody approves it.
            </p>
          </div>

          {/*
            THE FORM THE LINK FROM A PAYMENT LEADS TO. Before this,
            "Review refund" arrived at an empty table with no way to
            create anything.
          */}
          {view.start && (
            <NewRefundForm target={view.start} canRequest={view.can.request} />
          )}
          {params.start && !view.start && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
              <p className="text-[12px] text-amber-900">
                <span className="font-semibold">{params.start} is not a payment this console can refund.</span>{" "}
                It may be outside the window, in another currency, or on the other processor. Nothing
                is offered under its reference rather than a form against the wrong charge.
              </p>
            </div>
          )}

          <PaymentFilters asOf={view.as_of} />

          {/*
            A FAILED SYNC IS NOT ZERO REFUNDS. When the processor cannot
            be reached this replaces the totals rather than letting them
            read as confident numbers.
          */}
          {view.sync_error ? (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-start gap-2.5">
              <CloudOff className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-[13px] font-semibold text-amber-900">
                  Refund records could not be synchronised
                </p>
                <p className="text-[12px] text-amber-800 mt-0.5">{view.sync_error}</p>
                <p className="text-[12px] text-amber-800 mt-1">
                  These totals are not shown because they would be wrong, not because they are zero.
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-2.5">
                <Figure icon={CheckCircle2} tone="emerald" label="Succeeded"
                  value={money(view.totals.succeeded_cents, view.currency)}
                  note="Accepted by Stripe" />
                <Figure icon={Clock} tone="amber" label="Processing"
                  value={money(view.totals.processing_cents, view.currency)}
                  note="Submitted, not settled" />
                <Figure icon={Eye} tone="violet" label="Awaiting review"
                  value={String(view.totals.awaiting_review_count)}
                  note="Requests, not refunds" />
                <Figure icon={XCircle} tone="rose" label="Failed"
                  value={String(view.totals.failed_count)}
                  note="Check before retrying" />
              </div>

              <p className="text-[12px] text-slate-500 flex items-start gap-1.5">
                <Info className="w-3.5 h-3.5 text-slate-400 mt-px shrink-0" />
                {view.totals.dating_note} Two of these cards are money and two are counts of
                requests — an awaiting-review request has not been sent to Stripe, and
                &ldquo;succeeded&rdquo; means Stripe accepted it, not that the customer&apos;s bank
                has shown it yet.
              </p>
            </>
          )}

          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <nav className="flex items-center gap-5 px-4 pt-3 border-b border-slate-100 overflow-x-auto">
              {TABS.map((t) => (
                <Link key={t.key} href={query({ tab: t.key === "all" ? null : t.key, page: null })}
                  className={`text-[13px] font-semibold pb-2.5 border-b-2 whitespace-nowrap ${
                    tab === t.key ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800"
                  }`}>
                  {t.label}
                </Link>
              ))}
            </nav>

            <div className="px-4 py-2.5">
              <div className="relative max-w-md">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input placeholder="Search refund, booking or customer"
                  className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-brand-200" />
              </div>
            </div>

            {empty ? (
              /* THE EMPTY STATE, only when the list is genuinely empty —
                 and never beside rows. */
              <div className="px-6 py-14 text-center">
                <span className="w-14 h-14 rounded-2xl bg-violet-50 grid place-items-center mx-auto">
                  <RotateCcw className="w-6 h-6 text-violet-400" />
                </span>
                <p className="text-[18px] font-bold text-slate-900 mt-3">No refunds to show</p>
                <p className="text-[13px] text-slate-500 mt-1">
                  Change filters or open a payment to start a refund.
                </p>
                <div className="flex items-center justify-center gap-2 mt-4">
                  <Link href="/admin/refunds"
                    className="text-[13px] font-semibold text-slate-700 bg-white border border-slate-200 hover:border-slate-300 px-3.5 py-2 rounded-xl">
                    Clear filters
                  </Link>
                  <Link href="/admin/payments"
                    className="text-[13px] font-semibold text-white bg-brand-600 hover:bg-brand-700 px-3.5 py-2 rounded-xl">
                    View payments
                  </Link>
                </div>
              </div>
            ) : (
              <>
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-wide text-slate-400 bg-slate-50/60">
                      <th className="w-8 px-4 py-2" />
                      <th className="text-left font-semibold px-2 py-2">Refund &amp; booking</th>
                      <th className="text-left font-semibold px-2 py-2">Customer</th>
                      <th className="text-left font-semibold px-2 py-2">Type</th>
                      <th className="text-right font-semibold px-2 py-2">Amount</th>
                      <th className="text-left font-semibold px-2 py-2">Status</th>
                      <th className="text-right font-semibold px-4 py-2">Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.rows.map((row) => (
                      <Row key={row.id} row={row}
                        href={query({ open: row.id })}
                        selected={openId === row.id} />
                    ))}
                  </tbody>
                </table>

                <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-slate-100">
                  <span className="text-[12px] text-slate-500">
                    Showing 1–{view.rows.length} of {view.total_rows}
                  </span>
                  <div className="flex items-center gap-1">
                    <span className="w-8 h-8 grid place-items-center text-slate-300">
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </span>
                    {[1, 2, 3].map((n) => (
                      <span key={n}
                        className={`w-8 h-8 grid place-items-center rounded-lg text-[12px] font-semibold ${
                          n === 1 ? "bg-brand-600 text-white" : "text-slate-600"
                        }`}>
                        {n}
                      </span>
                    ))}
                    <span className="w-8 h-8 grid place-items-center text-slate-400">
                      <ChevronRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>

          {view.failures.length > 0 && (
            <Link href={view.failures[0].href}
              className="bg-rose-50 border border-rose-200 rounded-2xl px-4 py-3 flex items-center gap-2.5 hover:border-rose-300">
              <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span className="text-[13px] text-rose-900 flex-1">
                <span className="font-semibold">
                  {view.failures.length} refund{view.failures.length === 1 ? "" : "s"} failed
                </span>{" "}
                · {view.failures[0].reason}
              </span>
              <span className="text-[12px] font-semibold text-rose-700 shrink-0">Review failure →</span>
            </Link>
          )}

          <div className="bg-white rounded-2xl border border-slate-200 px-4 py-3 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
            <p className="text-[12px] text-slate-600">
              <span className="font-semibold text-slate-800">Before retrying anything, check whether the first attempt went through.</span>{" "}
              A refund that failed here may still have been accepted by Stripe, and a second
              attempt pays the customer twice. Refunds raised outside this console appear after a
              synchronisation, so a record you cannot see is not the same as a refund that did not
              happen. Releasing an uncaptured hold is not a refund and is done from the payment.
            </p>
          </div>
        </div>

        {review && <RefundReviewPanel review={review} sample={false} can={view.can} />}

        {missingReview && (
          <aside className="bg-white rounded-2xl border border-slate-200 px-5 py-10 text-center">
            <RotateCcw className="w-7 h-7 text-slate-300 mx-auto" />
            <p className="text-[14px] font-semibold text-slate-700 mt-3">
              No worked example for {openId}
            </p>
            <p className="text-[13px] text-slate-500 mt-1 max-w-xs mx-auto">
              The sample carries one refund in full — {view.review?.id}. The other rows are list
              entries only.
            </p>
            <Link href={query({ open: view.review?.id ?? null })}
              className="inline-block mt-3 text-[13px] font-semibold text-brand-700">
              Open {view.review?.id}
            </Link>
          </aside>
        )}
      </div>
    </div>
  );
}

function Figure({ icon: Icon, label, value, note, tone }: {
  icon: typeof Clock; label: string; value: string; note: string;
  tone: "emerald" | "amber" | "violet" | "rose";
}) {
  const tones = {
    emerald: "text-emerald-600",
    amber: "text-amber-600",
    violet: "text-violet-600",
    rose: "text-rose-600",
  }[tone];
  /* Same rule as Payments: the amount never wraps and never truncates,
     because a clipped figure still reads as a number. */
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-3.5 py-3 min-w-0">
      <span className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-600 min-w-0">
        <Icon className={`w-4 h-4 shrink-0 ${tones}`} />
        <span className="truncate">{label}</span>
      </span>
      <span className="block text-[19px] sm:text-[21px] font-bold text-slate-900 leading-none tabular-nums whitespace-nowrap mt-1.5">
        {value}
      </span>
      <span className="block text-[11px] text-slate-500 leading-snug mt-1">{note}</span>
    </div>
  );
}

function Row({ row, href, selected }: { row: RefundRow; href: string; selected: boolean }) {
  return (
    <tr className={`border-t border-slate-100 ${selected ? "bg-brand-50/60" : "hover:bg-slate-50"}`}>
      <td className="px-4 py-2.5">
        <Link href={href} aria-label={`Open ${row.id}`}
          className={`block w-4 h-4 rounded-full border-2 ${
            selected ? "border-brand-600 bg-brand-600 ring-2 ring-white ring-inset" : "border-slate-300"
          }`} />
      </td>
      <td className="px-2 py-2.5">
        <Link href={href} className="block">
          <span className="block font-semibold text-slate-900 tabular-nums">{row.id}</span>
          <span className="block text-[12px] text-slate-500 tabular-nums">{row.booking_ref}</span>
        </Link>
      </td>
      <td className="px-2 py-2.5 text-slate-700">
        <Link href={href} className="block truncate">{row.customer_name}</Link>
      </td>
      <td className="px-2 py-2.5">
        <Link href={href} className="inline-flex items-center gap-1.5 text-slate-600">
          {row.leg === "tip"
            ? <Coins className="w-3.5 h-3.5 text-slate-400" />
            : <Wrench className="w-3.5 h-3.5 text-slate-400" />}
          {row.leg === "tip" ? "Tip" : "Service"}
        </Link>
      </td>
      <td className="px-2 py-2.5 text-right tabular-nums font-medium text-slate-900">
        <Link href={href}>{money(row.amount_cents, row.currency)}</Link>
      </td>
      <td className="px-2 py-2.5">
        <Link href={href} title={REFUND_MEANING[row.state]}>
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${REFUND_TONE[row.state]}`}>
            {REFUND_LABEL[row.state]}
          </span>
          {row.origin === "stripe_sync" && (
            <span className="ml-1 text-[10px] text-slate-400" title="Raised outside this console and found during a synchronisation">
              via Stripe
            </span>
          )}
        </Link>
      </td>
      <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">
        <Link href={href}>{row.updated_at}</Link>
      </td>
    </tr>
  );
}
