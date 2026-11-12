import Link from "next/link";
import {
  AlertTriangle, CalendarCheck, CheckCircle2, CircleAlert, Play, Users,
  ChevronLeft, ChevronRight, Info, CreditCard,
} from "lucide-react";
import {
  getActivity, getActivityDetail, getActiveServices,
  type WindowKey, type ActivityRow,
} from "@/lib/data/admin-overview";
import { getFilterOptions } from "@/lib/data/admin-filter-options";
import { age, money } from "@/lib/admin-format";
import { ActivityControls } from "@/components/admin/ActivityControls";
import { ActivityDetailPanel } from "@/components/admin/ActivityDetailPanel";

/*
  REQUESTS AND BOOKINGS, FOLLOWED FROM MATCHING TO SETTLEMENT.

  One list holding both, because an operator looking for RQ-1081 does
  not care which table it is in — and because the moment a request
  becomes a booking it must stop appearing twice. The union in
  admin_activity drops any request that has a booking, so a job moves
  through this list rather than multiplying in it.

  BOOKING STATUS AND PAYMENT STATUS ARE SEPARATE COLUMNS, and the strip
  under the table says so. They genuinely move independently: a
  completed booking can have a failed capture, a cancelled one can still
  be holding money. Collapsing them into a single "status" is how an
  operator comes to believe a refund already went out.
*/

export const dynamic = "force-dynamic";

const PAGE_SIZE = 7;

const STATUS_TONE: Record<string, string> = {
  matching: "bg-brand-50 text-brand-700",
  scheduled: "bg-sky-50 text-sky-700",
  in_progress: "bg-emerald-50 text-emerald-700",
  completed: "bg-slate-100 text-slate-700",
  cancelled: "bg-rose-50 text-rose-700",
  expired: "bg-slate-100 text-slate-500",
  disputed: "bg-amber-50 text-amber-800",
};

const PAYMENT_TONE: Record<string, string> = {
  pending: "bg-slate-100 text-slate-600",
  authorized: "bg-sky-50 text-sky-700",
  captured: "bg-emerald-50 text-emerald-700",
  refunded: "bg-amber-50 text-amber-800",
  partial_refund: "bg-amber-50 text-amber-800",
  failed: "bg-rose-50 text-rose-700",
};

const PAYMENT_LABEL: Record<string, string> = {
  pending: "Not authorized",
  authorized: "Authorized",
  captured: "Captured",
  refunded: "Refunded",
  partial_refund: "Partly refunded",
  failed: "Capture failed",
};

export default async function AdminActivityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const windowKey: WindowKey = params.window === "today" || params.window === "30d"
    ? params.window : "7d";
  const page = Math.max(1, Number(params.page) || 1);
  const kind = params.tab === "requests" || params.tab === "bookings" ? params.tab : "all";

  /* The panel's read is keyed off ?open=kind:id in the URL, so it is
     resolved here with the list rather than after it. */
  const open = params.open?.split(":");
  const detailKey = open && (open[0] === "booking" || open[0] === "request") && open[1]
    ? { kind: open[0] as "booking" | "request", id: open[1] } : null;

  const [list, services, options, detail] = await Promise.all([
    getActivity({
      window: windowKey,
      includeReview: params.review === "1",
      region: params.region || null,
      service: params.service || null,
      currency: params.currency || null,
      kind,
      flag: params.flag || null,
      search: params.q || null,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
    getActiveServices(),
    /*
      THE TWO DROPDOWNS' OWN QUESTION. This fetched the entire
      operations snapshot for a region list and a currency list — and
      the currency list it took from the snapshot was then unioned with
      CAD and USD anyway, so on this data it contributed nothing at all.
    */
    getFilterOptions({ includeReview: params.review === "1" }),
    detailKey ? getActivityDetail(detailKey.kind, detailKey.id) : Promise.resolve(null),
  ]);

  if (!list.ok) {
    return (
      <div className="px-6 py-10 max-w-3xl mx-auto">
        <div className="bg-white rounded-2xl border border-amber-200 p-6 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
          <div>
            <h1 className="text-lg font-bold text-slate-900">This list could not be loaded</h1>
            <p className="text-[14px] text-slate-600 mt-1">{list.error}</p>
          </div>
        </div>
      </div>
    );
  }

  const data = list.data;
  const pages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
  const regions = options.regions;
  const currencies = options.currencies;
  const paymentIssues = data.rows.filter((r) => r.payment_status === "failed").length;

  const query = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (value) next.set(key, value);
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    return `/admin/bookings?${next.toString()}`;
  };

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 pb-12 max-w-[1600px] mx-auto">
      <div className={detail?.ok && detail.data ? "grid xl:grid-cols-[1fr_440px] gap-4 items-start" : ""}>
        <div className="min-w-0 space-y-4">
          <header>
            <h1 className="text-[28px] leading-tight font-bold text-slate-900">Requests &amp; bookings</h1>
            <p className="text-[14px] text-slate-500 mt-0.5">
              Follow every request from matching to settlement.
            </p>
          </header>

          <ActivityControls regions={regions} services={services} currencies={currencies} />
          {/*
            AN EMPTY FILTER EXPLAINS ITSELF. A dropdown with nothing in
            it reads as broken; saying that every request with a city
            belongs to a test account turns it into information.
          */}
          {options.note && (
            <p className="flex items-start gap-1.5 text-[11px] text-slate-500 mt-1.5">
              <Info className="w-3.5 h-3.5 text-slate-400 mt-px shrink-0" />
              {options.note}
            </p>
          )}

          {/* Counters describe the same filtered set as the table below. */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
            <Counter icon={CircleAlert} label="Needs attention" value={data.counts.needs_attention}
              href={query({ flag: "attention", page: null })} tone="amber" />
            <Counter icon={Users} label="Matching" value={data.counts.matching}
              href={query({ flag: null, page: null })} tone="brand" />
            <Counter icon={CalendarCheck} label="Scheduled" value={data.counts.scheduled}
              href={query({ flag: null, page: null })} tone="sky" />
            <Counter icon={Play} label="In progress" value={data.counts.in_progress}
              href={query({ flag: null, page: null })} tone="emerald" />
            <Counter icon={CheckCircle2} label="Completed" value={data.counts.completed}
              href={query({ flag: null, page: null })} tone="slate" />
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <nav className="flex items-center gap-5 px-4 pt-3 border-b border-slate-100">
              {[
                { key: "all", label: "All activity" },
                { key: "requests", label: "Requests" },
                { key: "bookings", label: "Bookings" },
              ].map((t) => (
                <Link
                  key={t.key}
                  href={query({ tab: t.key === "all" ? null : t.key, page: null })}
                  className={`text-[13px] font-semibold pb-2.5 border-b-2 ${
                    kind === t.key || (kind === "all" && t.key === "all")
                      ? "border-brand-600 text-brand-700"
                      : "border-transparent text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {t.label}
                </Link>
              ))}
            </nav>

            {data.rows.length === 0 ? (
              <p className="px-4 py-10 text-center text-[13px] text-slate-500">
                Nothing matches these filters.
              </p>
            ) : (
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wide text-slate-400 bg-slate-50/60">
                    <th className="text-left font-semibold px-4 py-2">Service &amp; ID</th>
                    <th className="text-left font-semibold px-2 py-2">Customer · helper</th>
                    <th className="text-left font-semibold px-2 py-2">Status</th>
                    <th className="text-left font-semibold px-2 py-2">Payment</th>
                    <th className="text-right font-semibold px-2 py-2">Total</th>
                    <th className="text-right font-semibold px-4 py-2">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row) => (
                    <ActivityTableRow
                      key={`${row.kind}-${row.id}`}
                      row={row}
                      href={query({ open: `${row.kind}:${row.id}` })}
                      selected={params.open === `${row.kind}:${row.id}`}
                    />
                  ))}
                </tbody>
              </table>
            )}

            <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-slate-100">
              <span className="text-[12px] text-slate-500">
                {data.total === 0
                  ? "Nothing to show"
                  : `Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, data.total)} of ${data.total}`}
              </span>
              <div className="flex items-center gap-1">
                <PageLink href={query({ page: String(page - 1) })} disabled={page <= 1}>
                  <ChevronLeft className="w-3.5 h-3.5" /> Previous
                </PageLink>
                {Array.from({ length: Math.min(3, pages) }, (_, i) => {
                  const n = Math.min(Math.max(1, page - 1), Math.max(1, pages - 2)) + i;
                  if (n > pages) return null;
                  return (
                    <Link key={n} href={query({ page: String(n) })}
                      className={`w-8 h-8 grid place-items-center rounded-lg text-[12px] font-semibold ${
                        n === page ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-100"
                      }`}>
                      {n}
                    </Link>
                  );
                })}
                <PageLink href={query({ page: String(page + 1) })} disabled={page >= pages}>
                  Next <ChevronRight className="w-3.5 h-3.5" />
                </PageLink>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 px-4 py-3 flex items-start gap-2.5">
            <Info className="w-4 h-4 text-brand-500 mt-0.5 shrink-0" />
            <p className="text-[12px] text-slate-600">
              <span className="font-semibold text-slate-800">
                Booking status and payment status are tracked separately.
              </span>{" "}
              A request can be matching, scheduled, in progress, completed or cancelled, while
              payment is independently not authorized, authorized, captured or refunded.
            </p>
          </div>

          {paymentIssues > 0 && (
            <Link href={query({ flag: "payment", page: null })}
              className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-center gap-2.5 hover:border-amber-300">
              <CreditCard className="w-4 h-4 text-amber-600 shrink-0" />
              <span className="text-[13px] text-amber-900">
                <span className="font-semibold">
                  {paymentIssues} capture{paymentIssues === 1 ? "" : "s"} need review.
                </span>{" "}
                Open payment issues →
              </span>
            </Link>
          )}
        </div>

        {detail?.ok && detail.data && <ActivityDetailPanel detail={detail.data} />}
      </div>
    </div>
  );
}

function Counter({ icon: Icon, label, value, href, tone }: {
  icon: typeof Users; label: string; value: number; href: string;
  tone: "amber" | "brand" | "sky" | "emerald" | "slate";
}) {
  const tones = {
    amber: "bg-amber-50 border-amber-200 text-amber-700",
    brand: "bg-brand-50 border-brand-200 text-brand-700",
    sky: "bg-sky-50 border-sky-200 text-sky-700",
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-700",
    slate: "bg-white border-slate-200 text-slate-600",
  }[tone];
  return (
    <Link href={href} className={`rounded-2xl border px-3 py-2.5 hover:shadow-sm transition ${tones}`}>
      <span className="flex items-center gap-1.5 text-[12px] font-semibold">
        <Icon className="w-4 h-4" /> {label}
      </span>
      <span className="block text-[22px] font-bold text-slate-900 leading-tight mt-0.5 tabular-nums">
        {value}
      </span>
    </Link>
  );
}

function ActivityTableRow({ row, href, selected }: {
  row: ActivityRow; href: string; selected: boolean;
}) {
  return (
    <tr className={`border-t border-slate-100 ${selected ? "bg-brand-50/60" : "hover:bg-slate-50"}`}>
      <td className="px-4 py-2.5">
        <Link href={href} className="block">
          <span className="block font-semibold text-slate-900 leading-tight">{row.service_title}</span>
          <span className="block text-[12px] text-slate-500 tabular-nums">{row.ref}</span>
        </Link>
      </td>
      <td className="px-2 py-2.5 text-slate-700">
        <Link href={href} className="block truncate">
          {row.customer_name ?? "—"}
          <span className="text-slate-400"> · </span>
          {row.helper_name ?? <span className="text-slate-400">Unassigned</span>}
        </Link>
      </td>
      <td className="px-2 py-2.5">
        <Link href={href}>
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
            STATUS_TONE[row.status] ?? "bg-slate-100 text-slate-600"
          }`}>
            {row.status.replace("_", " ")}
          </span>
        </Link>
      </td>
      <td className="px-2 py-2.5">
        <Link href={href}>
          {row.payment_status ? (
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
              PAYMENT_TONE[row.payment_status] ?? "bg-slate-100 text-slate-600"
            }`}>
              {PAYMENT_LABEL[row.payment_status] ?? row.payment_status}
            </span>
          ) : (
            <span className="text-[11px] text-slate-400">No payment yet</span>
          )}
        </Link>
      </td>
      <td className="px-2 py-2.5 text-right tabular-nums text-slate-900 font-medium">
        <Link href={href}>{row.total_cents == null ? "—" : money(row.total_cents, row.currency)}</Link>
      </td>
      <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">
        <Link href={href}>{age((Date.now() - new Date(row.updated_at).getTime()) / 1000)}</Link>
      </td>
    </tr>
  );
}

function PageLink({ href, disabled, children }: {
  href: string; disabled: boolean; children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-slate-300 px-2.5 py-1.5">
        {children}
      </span>
    );
  }
  return (
    <Link href={href}
      className="inline-flex items-center gap-1 text-[12px] font-semibold text-slate-600 hover:text-brand-700 px-2.5 py-1.5">
      {children}
    </Link>
  );
}
