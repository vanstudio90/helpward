import Link from "next/link";
import {
  Database, Lock, RotateCcw, BarChart3, AlertTriangle, Download, Bookmark,
  ChevronLeft, ChevronRight, Info, Layers, Search, Columns3, FlaskConical,
} from "lucide-react";
import { getPaymentsView, type PaymentRow } from "@/lib/data/admin-payments";
import { PAYMENT_LABEL, PAYMENT_TONE, PAYMENT_MEANING, LEG_LABEL } from "@/lib/admin-payment-states";
import { money } from "@/lib/admin-format";
import { PaymentFilters } from "@/components/admin/PaymentFilters";
import { PaymentDetailPanel } from "@/components/admin/PaymentDetailPanel";

/*
  PAYMENTS.

  THIS SCREEN IS A DESIGN, AND IT SAYS SO. Every figure on it comes
  from the sample dataset in lib/data/admin-payments.ts; the badge in
  the title and the strip under it are not decoration, they are the
  only thing standing between a reader and the belief that Helpward
  took CA$1,240 last month. When getPaymentsView() is wired to real
  reads it sets `sample: false` and the stamps disappear on their own.

  THE ARITHMETIC THE LAYOUT IS BUILT AROUND:

    Captured is money we have taken. It is the only figure that is
    revenue.

    Open holds are the bank's, not ours. They sit in their own card and
    are never added to captured — the two cards are deliberately not
    side by side with a plus between them.

    Net captured is captures minus refunds, before fees and transfers.
    It is not profit and it is not what lands in the bank, and the line
    under the cards says exactly that.

    Tips are separate charges with their own payment ids, so a tip is
    its own row rather than a line inside the service payment.

  ONE CURRENCY AT A TIME, because CA$ and US$ are different money.
*/

export const dynamic = "force-dynamic";

const TABS = [
  { key: "all", label: "All payments" },
  { key: "holds", label: "Authorized holds" },
  { key: "captured", label: "Captured" },
  { key: "attention", label: "Needs attention" },
  { key: "refunded", label: "Refunded" },
] as const;

export default async function AdminPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const tab = (TABS.find((t) => t.key === params.tab)?.key ?? "all") as string;

  const view = await getPaymentsView({
    window: params.window,
    region: params.region ?? null,
    currency: params.currency,
    mode: params.mode === "test" ? "test" : "live",
    tab,
    open: params.open ?? null,
  });

  /*
    The sample carries one worked example (PY-1040). Opening any other
    row says so rather than showing that example under somebody else's
    reference — a panel that silently displays the wrong payment is the
    habit this screen must not start with.
  */
  const openId = params.open ?? view.detail?.id ?? null;
  const detail = openId && openId === view.detail?.id ? view.detail : null;
  const missingDetail = Boolean(openId && !detail);

  const query = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (value) next.set(key, value);
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    return `/admin/payments?${next.toString()}`;
  };

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 pb-12 max-w-[1700px] mx-auto">
      <div className={detail || missingDetail ? "grid xl:grid-cols-[1fr_520px] gap-4 items-start" : ""}>
        <div className="min-w-0 space-y-4">
          <header className="flex flex-wrap items-start gap-3">
            <div className="min-w-0 flex-1">
              <h1 className="text-[28px] leading-tight font-bold text-slate-900 flex flex-wrap items-center gap-2.5">
                Payments
                {view.sample && (
                  <span className="text-[11px] font-bold uppercase tracking-wide bg-violet-100 text-violet-800 px-2.5 py-1 rounded-md">
                    Design concept · sample data
                  </span>
                )}
              </h1>
              <p className="text-[14px] text-slate-500 mt-0.5">
                Track authorizations, captures and settlement issues.
              </p>
            </div>
            <button type="button" disabled={view.sample}
              title={view.sample ? "Nothing real to export yet" : "Export the filtered payments"}
              className="inline-flex items-center gap-1.5 bg-white border border-slate-200 text-[13px] font-semibold text-slate-700 px-3 py-2.5 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed">
              <Download className="w-4 h-4" /> Export
            </button>
            <button type="button" disabled={view.sample}
              title={view.sample ? "Saved views arrive with the wiring" : "Saved views"}
              className="inline-flex items-center gap-1.5 bg-white border border-slate-200 text-[13px] font-semibold text-slate-700 px-3 py-2.5 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed">
              <Bookmark className="w-4 h-4" /> Saved views
            </button>
          </header>

          {/*
            THE STAMP. A payments screen that looks real and is not is
            the most expensive mistake this console could make, so this
            sits above the numbers rather than in a footnote.
          */}
          {view.sample && (
            <div className="bg-violet-50 border border-violet-200 rounded-2xl px-4 py-3 flex items-start gap-2.5">
              <FlaskConical className="w-4 h-4 text-violet-600 mt-0.5 shrink-0" />
              <p className="text-[12px] text-violet-900">
                <span className="font-semibold">Every number on this page is invented.</span>{" "}
                This is the agreed design with sample data in it — no Stripe record, booking or
                refund behind any of it, and the buttons that would move money are switched off.
                Wiring it is one function: <code className="text-[11px] bg-white/70 px-1 py-0.5 rounded">getPaymentsView()</code>{" "}
                in <code className="text-[11px] bg-white/70 px-1 py-0.5 rounded">lib/data/admin-payments.ts</code>.
              </p>
            </div>
          )}

          {/*
            A PROMINENT TEST BANNER, because the most expensive
            confusion on this screen is reading test traffic as
            revenue. The toggle alone is not enough — it is one chip
            among several, and somebody arriving at a shared screen did
            not set it.
          */}
          {view.mode === "test" && (
            <div className="bg-amber-400/20 border-2 border-amber-400 rounded-2xl px-4 py-3 flex items-start gap-2.5">
              <FlaskConical className="w-5 h-5 text-amber-700 mt-0.5 shrink-0" />
              <p className="text-[13px] text-amber-950">
                <span className="font-bold">Test mode.</span> These are Stripe test-key
                transactions — review accounts and App Review bookings. No real money is involved
                and none of these figures belong in a revenue number.
              </p>
            </div>
          )}

          <PaymentFilters asOf={view.as_of} />

          {/* THE FIVE FIGURES */}
          <div className="grid grid-cols-2 sm:grid-cols-3 2xl:grid-cols-5 gap-2.5">
            <Figure icon={Database} label="Captured" tone="slate"
              value={money(view.totals.captured_cents, view.currency)}
              note={view.totals.captured_dating} />
            <Figure icon={Lock} label="Open holds" tone="sky"
              value={money(view.totals.open_holds_cents, view.currency)}
              note={view.totals.holds_as_of} />
            <Figure icon={RotateCcw} label="Refunded" tone="amber"
              value={money(view.totals.refunded_cents, view.currency)}
              note={view.totals.refunded_dating} />
            <Figure icon={BarChart3} label="Net captured" tone="emerald"
              value={money(view.totals.net_captured_cents, view.currency)}
              note="Captures minus refunds" />
            <Figure icon={AlertTriangle} label="Needs attention" tone="rose"
              value={String(view.totals.needs_attention)} href={query({ tab: "attention" })} />
          </div>

          <p className="text-[12px] text-slate-500 flex items-start gap-1.5">
            <Info className="w-3.5 h-3.5 text-slate-400 mt-px shrink-0" />
            Net captured = captures minus refunds, before fees and transfers. It is not profit, it
            is not platform revenue, and it is not what lands in the bank. Captures are dated by
            capture and refunds by refund, so a January charge refunded in March counts in each
            month separately; open holds are a balance right now rather than a period total. All
            figures are in {view.currency}, and currencies are never added together.
          </p>

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

            <div className="flex items-center gap-2 px-4 py-2.5">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  placeholder="Search payment ID, booking or customer…"
                  className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-brand-200"
                />
              </div>
              <button type="button" disabled={view.sample}
                className="ml-auto inline-flex items-center gap-1.5 text-[12px] font-semibold text-slate-700 bg-white border border-slate-200 px-2.5 py-2 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed">
                <Columns3 className="w-3.5 h-3.5" /> Columns
              </button>
            </div>

            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-slate-400 bg-slate-50/60">
                  <th className="text-left font-semibold px-4 py-2">Payment &amp; booking</th>
                  <th className="text-left font-semibold px-2 py-2">Customer</th>
                  <th className="text-left font-semibold px-2 py-2">Leg</th>
                  <th className="text-left font-semibold px-2 py-2">Status</th>
                  <th className="text-right font-semibold px-2 py-2">Amount</th>
                  <th className="text-right font-semibold px-4 py-2">Updated</th>
                </tr>
              </thead>
              <tbody>
                {view.rows.map((row) => (
                  <Row key={row.id} row={row}
                    href={query({ open: row.id })}
                    selected={(params.open ?? view.detail?.id) === row.id} />
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
                {[1, 2, 3, 4, 5].map((n) => (
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
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            {/* NEEDS ATTENTION */}
            <section className="bg-white rounded-2xl border border-slate-200 px-4 py-3">
              <h2 className="text-[13px] font-semibold text-slate-800 flex items-center gap-1.5 mb-2">
                <AlertTriangle className="w-4 h-4 text-rose-500" /> Needs attention
              </h2>
              <ul className="divide-y divide-slate-100">
                {view.attention.map((item) => (
                  <li key={item.key} className="flex items-center gap-2 py-2">
                    <span className="text-[13px] text-slate-700 flex-1">{item.label}</span>
                    <span className={`text-[11px] font-bold w-5 h-5 grid place-items-center rounded-full ${
                      item.tone === "critical" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-800"
                    }`}>
                      {item.count}
                    </span>
                    <Link href={item.href}
                      className="text-[12px] font-semibold text-brand-700 hover:text-brand-800 shrink-0">
                      {item.action} →
                    </Link>
                  </li>
                ))}
              </ul>
              <p className="text-[11px] text-slate-500 mt-2">
                A capture that failed is retried from the booking. Bank confirmation cannot be done
                for somebody: staff open the recovery flow and the customer completes the check
                with their own bank.
              </p>
            </section>

            {/* RECONCILIATION */}
            <section className="bg-white rounded-2xl border border-slate-200 px-4 py-3 flex flex-col">
              <h2 className="text-[13px] font-semibold text-slate-800 flex items-center gap-1.5 mb-2">
                <Layers className="w-4 h-4 text-brand-600" /> Reconciliation
              </h2>
              <div className="flex items-center gap-2 text-[13px] py-1">
                <span className="text-slate-600 flex-1">Last successful check</span>
                <span className="font-semibold text-slate-900">{view.reconciliation.last_check_at ?? "Never"}</span>
              </div>
              <p className="text-[13px] text-slate-600 py-1">
                {view.reconciliation.items_to_investigate} item
                {view.reconciliation.items_to_investigate === 1 ? "" : "s"} to investigate
              </p>
              <p className="text-[11px] text-slate-500 mt-auto pb-2">{view.reconciliation.note}</p>
              <button type="button" disabled={view.sample}
                className="w-full text-[13px] font-semibold text-brand-700 border border-brand-200 bg-white hover:bg-brand-50 px-3 py-2 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed">
                View reconciliation
              </button>
            </section>
          </div>

          <div className="bg-brand-50/60 border border-brand-100 rounded-2xl px-4 py-3 flex items-start gap-2.5">
            <Info className="w-4 h-4 text-brand-600 mt-0.5 shrink-0" />
            <p className="text-[12px] text-slate-700">
              <span className="font-semibold">Tips are separate transactions. Holds are not captured funds.</span>{" "}
              A tip has its own payment id and its own capture; an authorized hold is the bank
              reserving money we have not taken, and releasing one charges nobody.
            </p>
          </div>
        </div>

        {detail && <PaymentDetailPanel detail={detail} sample={view.sample} />}

        {missingDetail && (
          <aside className="bg-white rounded-2xl border border-slate-200 px-5 py-10 text-center">
            <Layers className="w-7 h-7 text-slate-300 mx-auto" />
            <p className="text-[14px] font-semibold text-slate-700 mt-3">
              No worked example for {openId}
            </p>
            <p className="text-[13px] text-slate-500 mt-1 max-w-xs mx-auto">
              The sample dataset carries one payment in full — {view.detail?.id}. Every other row
              is a list entry only, because inventing a second complete record would make this
              design harder to check, not easier.
            </p>
            <Link href={query({ open: view.detail?.id ?? null })}
              className="inline-block mt-3 text-[13px] font-semibold text-brand-700">
              Open {view.detail?.id}
            </Link>
          </aside>
        )}
      </div>
    </div>
  );
}

function Figure({ icon: Icon, label, value, tone, href, note }: {
  icon: typeof Database; label: string; value: string;
  tone: "slate" | "sky" | "amber" | "emerald" | "rose"; href?: string; note?: string;
}) {
  const tones = {
    slate: "bg-white border-slate-200 text-slate-500",
    sky: "bg-white border-slate-200 text-sky-600",
    amber: "bg-white border-slate-200 text-amber-600",
    emerald: "bg-white border-slate-200 text-emerald-600",
    rose: "bg-white border-rose-200 text-rose-600",
  }[tone];

  /*
    THE FIGURE MUST NOT BE CLIPPED. A money card that shows "CA$1,2…"
    is worse than one that shows nothing: it reads as a number. So the
    amount never wraps, never truncates, and shrinks a step at the
    widths where five cards share a narrow column.
  */
  const body = (
    <>
      <span className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-600 min-w-0">
        <Icon className="w-4 h-4 shrink-0" />
        <span className="truncate">{label}</span>
      </span>
      <span className="block text-[19px] sm:text-[21px] font-bold text-slate-900 leading-none tabular-nums whitespace-nowrap mt-1.5">
        {value}
      </span>
      {note && <span className="block text-[11px] text-slate-500 leading-snug mt-1">{note}</span>}
    </>
  );

  return href ? (
    <Link href={href} className={`rounded-2xl border px-3.5 py-3 min-w-0 hover:shadow-sm transition ${tones}`}>
      {body}
    </Link>
  ) : (
    <div className={`rounded-2xl border px-3.5 py-3 min-w-0 ${tones}`}>{body}</div>
  );
}

function Row({ row, href, selected }: { row: PaymentRow; href: string; selected: boolean }) {
  return (
    <tr className={`border-t border-slate-100 ${selected ? "bg-brand-50/60" : "hover:bg-slate-50"}`}>
      <td className="px-4 py-2.5">
        <Link href={href} className="inline-flex items-center gap-1.5">
          <span className="font-semibold text-brand-700 tabular-nums">{row.id}</span>
          <span className="text-slate-300">·</span>
          <span className="text-slate-600 tabular-nums">{row.booking_ref}</span>
        </Link>
      </td>
      <td className="px-2 py-2.5 text-slate-700">
        <Link href={href} className="block truncate">{row.customer_name}</Link>
      </td>
      <td className="px-2 py-2.5 text-slate-600">
        <Link href={href}>{LEG_LABEL[row.leg]}</Link>
      </td>
      <td className="px-2 py-2.5">
        <Link href={href} title={PAYMENT_MEANING[row.state]}>
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${PAYMENT_TONE[row.state]}`}>
            {PAYMENT_LABEL[row.state]}
          </span>
        </Link>
      </td>
      <td className="px-2 py-2.5 text-right tabular-nums font-medium text-slate-900">
        {/*
          ONE AMOUNT IS NOT ENOUGH FOR A PARTIALLY REFUNDED ROW: the
          figure beside it has to say of what, and what is left.
        */}
        <Link href={href} className="block">
          {money(row.amount_cents, row.currency)}
          {row.state === "partially_refunded" && row.captured_cents != null && (
            <span className="block text-[11px] font-normal text-slate-500">
              {money(row.captured_cents, row.currency)} captured ·{" "}
              {money(row.refunded_cents ?? 0, row.currency)} refunded
            </span>
          )}
          {row.state === "authorized" && (
            <span className="block text-[11px] font-normal text-sky-700">Held, not taken</span>
          )}
          {row.state === "hold_released" && (
            <span className="block text-[11px] font-normal text-slate-500">Nobody was charged</span>
          )}
        </Link>
      </td>
      <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">
        <Link href={href}>{row.updated_at}</Link>
      </td>
    </tr>
  );
}
