import Link from "next/link";
import {
  AlertTriangle, Users, UserPlus, CalendarCheck, LifeBuoy, Shield,
  ChevronLeft, ChevronRight, Download, Lock, CreditCard, UserX, Info,
} from "lucide-react";
import { getCustomerList, getCustomerDetail, type CustomerRow } from "@/lib/data/admin-customers";
import { getAdmins } from "@/lib/data/admin-helpers";
import {
  ACCOUNT_LABEL, ACCOUNT_TONE, ATTENTION_LABEL, ATTENTION_TONE,
} from "@/lib/admin-customer-states";
import { CustomerControls } from "@/components/admin/CustomerControls";
import { CustomerPanel } from "@/components/admin/CustomerPanel";
import { ClientDateTime } from "@/components/ClientDateTime";

/*
  CUSTOMERS.

  The page this replaces was a directory: a hundred rows of name,
  country, currency, joined. It answered "does this person exist",
  which is not the question anybody opens it with. Staff arrive holding
  an email address and a complaint.

  SO THE LIST IS ORGANISED BY WHO NEEDS SOMETHING. Account state and
  attention are separate columns because they are separate questions —
  an account can be perfectly healthy and have a failed capture this
  morning, and a restricted one can need nothing today. Both come from
  one definition in 0101, so the chip here and the banner in the panel
  cannot disagree about the same person.

  CONTACT DETAILS ARE MASKED and this page never receives them.
  Searching still matches on the real email and phone, inside the
  database function, which returns no contact field at all: looking
  somebody up is not the same as reading their details, and only the
  second one is a disclosure worth recording.
*/

export const dynamic = "force-dynamic";

const PAGE_SIZE = 7;

const TABS = [
  { key: "all", label: "All customers" },
  { key: "active", label: "Active bookings" },
  { key: "attention", label: "Needs attention" },
  { key: "deletion", label: "Deletion requests" },
] as const;

export default async function AdminCustomersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const tab = (TABS.find((t) => t.key === params.tab)?.key ?? "all") as
    "all" | "active" | "attention" | "deletion";

  /* The panel's read is keyed off ?open=, not off the list, so it
     travels with it rather than after it. */
  const [list, admins, detail] = await Promise.all([
    getCustomerList({
      tab,
      region: params.region || null,
      joined: params.joined || null,
      status: params.status || null,
      attention: params.attention || null,
      search: params.q || null,
      includeReview: params.review === "1",
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
    getAdmins(),
    params.open ? getCustomerDetail(params.open) : Promise.resolve(null),
  ]);


  /* A failed read says so. It must never render as an empty directory. */
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

  const query = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (value) next.set(key, value);
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    return `/admin/users?${next.toString()}`;
  };

  const exportHref = (() => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value && key !== "open" && key !== "page") next.set(key, value);
    }
    return `/api/admin/customers/export?${next.toString()}`;
  })();

  const followUp = [
    data.follow_up.cases_unassigned > 0 && {
      icon: LifeBuoy,
      text: `${data.follow_up.cases_unassigned} support ${
        data.follow_up.cases_unassigned === 1 ? "case has" : "cases have"
      } nobody assigned`,
      action: "View cases",
      href: "/admin/disputes",
    },
    data.follow_up.payments_to_review > 0 && {
      icon: CreditCard,
      text: `${data.follow_up.payments_to_review} ${
        data.follow_up.payments_to_review === 1 ? "customer has a payment" : "customers have payments"
      } that need review`,
      action: "Open payments",
      href: query({ tab: "attention", attention: "payment_issue", page: null }),
    },
    data.follow_up.deletions_scheduled > 0 && {
      icon: UserX,
      text: `${data.follow_up.deletions_scheduled} deletion ${
        data.follow_up.deletions_scheduled === 1 ? "request is" : "requests are"
      } scheduled`,
      action: "View requests",
      href: "/admin/data-requests",
    },
  ].filter(Boolean) as { icon: typeof LifeBuoy; text: string; action: string; href: string }[];

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 pb-12 max-w-[1600px] mx-auto">
      <div className={detail?.ok && detail.data ? "grid xl:grid-cols-[1fr_440px] gap-4 items-start" : ""}>
        <div className="min-w-0 space-y-4">
          <header className="flex flex-wrap items-start gap-3">
            <div className="min-w-0 flex-1">
              <h1 className="text-[28px] leading-tight font-bold text-slate-900">Customers</h1>
              <p className="text-[14px] text-slate-500 mt-0.5">
                Understand each customer. Resolve issues with context.
              </p>
            </div>
            <a
              href={exportHref}
              className="inline-flex items-center gap-1.5 bg-white border border-slate-200 hover:border-slate-300 text-[13px] font-semibold text-slate-700 px-3 py-2 rounded-xl"
            >
              <Download className="w-4 h-4" /> Export
            </a>
          </header>

          {/* VIEWS, not saved views: each is a link to these filters, so it
              can be bookmarked and shared. Nothing is stored per person,
              and nothing pretends to be. */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[12px] font-semibold text-slate-500 mr-0.5">Views</span>
            {[
              { label: "Everyone", href: query({ tab: null, attention: null, status: null, joined: null, page: null }) },
              { label: "Needs attention", href: query({ tab: "attention", attention: null, status: null, page: null }) },
              { label: "New this month", href: query({ tab: null, joined: "30d", attention: null, status: null, page: null }) },
              { label: "Restricted", href: query({ tab: null, status: "restricted", attention: null, page: null }) },
              { label: "Deletion requests", href: query({ tab: "deletion", attention: null, status: null, page: null }) },
            ].map((v) => (
              <Link key={v.label} href={v.href}
                className="text-[12px] font-medium px-2.5 py-1 rounded-full bg-white border border-slate-200 text-slate-600 hover:border-brand-300 hover:text-brand-700">
                {v.label}
              </Link>
            ))}
          </div>

          <CustomerControls regions={data.regions} />

          {/* The counters count every customer, not the filtered page, so
              they do not move when a tab changes under them. */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
            <Counter icon={Users} label="Total customers" value={data.counts.total_customers}
              href={query({ tab: null, status: null, attention: null, page: null })} tone="slate" />
            <Counter icon={UserPlus} label="New this month" value={data.counts.new_this_month}
              href={query({ joined: "30d", page: null })} tone="brand" />
            <Counter icon={CalendarCheck} label="With active bookings" value={data.counts.with_active_bookings}
              href={query({ tab: "active", page: null })} tone="emerald" />
            <Counter icon={LifeBuoy} label="Open support cases" value={data.counts.open_support_cases}
              href={query({ tab: "attention", attention: "support_case", page: null })} tone="amber" />
            <Counter icon={Shield} label="Deletion requests" value={data.counts.deletion_requests}
              href={query({ tab: "deletion", page: null })} tone="rose" />
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <nav className="flex items-center gap-5 px-4 pt-3 border-b border-slate-100 overflow-x-auto">
              {TABS.map((t) => (
                <Link
                  key={t.key}
                  href={query({ tab: t.key === "all" ? null : t.key, page: null })}
                  className={`text-[13px] font-semibold pb-2.5 border-b-2 whitespace-nowrap ${
                    tab === t.key
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
                No customers match these filters.
              </p>
            ) : (
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wide text-slate-400 bg-slate-50/60">
                    <th className="text-left font-semibold px-4 py-2">Customer</th>
                    <th className="text-left font-semibold px-2 py-2">Region</th>
                    <th className="text-right font-semibold px-2 py-2">Bookings</th>
                    <th className="text-left font-semibold px-2 py-2">Account</th>
                    <th className="text-left font-semibold px-2 py-2">Attention</th>
                    <th className="text-right font-semibold px-4 py-2">Last booking</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row) => (
                    <Row key={row.id} row={row}
                      href={query({ open: row.id })}
                      selected={params.open === row.id} />
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
                {pages > 3 && page < pages - 1 && (
                  <span className="text-[12px] text-slate-400 px-1">… {pages}</span>
                )}
                <PageLink href={query({ page: String(page + 1) })} disabled={page >= pages}>
                  Next <ChevronRight className="w-3.5 h-3.5" />
                </PageLink>
              </div>
            </div>
          </div>

          {followUp.length > 0 && (
            <section className="bg-white rounded-2xl border border-slate-200 px-4 py-3">
              <h2 className="text-[13px] font-semibold text-slate-800 mb-2">Needs follow-up</h2>
              <ul className="space-y-1.5">
                {followUp.map((item) => (
                  <li key={item.text} className="flex items-center gap-2.5">
                    <item.icon className="w-4 h-4 text-amber-600 shrink-0" />
                    <span className="text-[13px] text-slate-700">{item.text}</span>
                    <Link href={item.href}
                      className="ml-auto text-[12px] font-semibold text-brand-700 hover:text-brand-800 shrink-0">
                      {item.action} →
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="bg-white rounded-2xl border border-slate-200 px-4 py-3 flex items-start gap-2.5">
            <Lock className="w-4 h-4 text-brand-500 mt-0.5 shrink-0" />
            <p className="text-[12px] text-slate-600">
              <span className="font-semibold text-slate-800">
                Contact details are masked by default.
              </span>{" "}
              Search still matches the real email and phone number, inside the database — the
              list never receives either. Revealing them records your name, the customer and
              your reason in the audit log. Exports carry no contact details at all, and every
              export is recorded before the file is produced.
            </p>
          </div>

          {!list.ok ? null : (
            <p className="text-[11px] text-slate-400 flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5" />
              {params.review === "1"
                ? "Review and test accounts are included in these numbers."
                : "Review and test accounts are excluded."}
            </p>
          )}
        </div>

        {detail?.ok && detail.data && (
          <CustomerPanel detail={detail.data} admins={admins} />
        )}
      </div>
    </div>
  );
}

function Counter({ icon: Icon, label, value, href, tone }: {
  icon: typeof Users; label: string; value: number; href: string;
  tone: "slate" | "brand" | "emerald" | "amber" | "rose";
}) {
  const tones = {
    slate: "bg-white border-slate-200 text-slate-600",
    brand: "bg-brand-50 border-brand-200 text-brand-700",
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-700",
    amber: "bg-amber-50 border-amber-200 text-amber-700",
    rose: "bg-rose-50 border-rose-200 text-rose-700",
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

function Row({ row, href, selected }: { row: CustomerRow; href: string; selected: boolean }) {
  return (
    <tr className={`border-t border-slate-100 ${selected ? "bg-brand-50/60" : "hover:bg-slate-50"}`}>
      <td className="px-4 py-2.5">
        <Link href={href} className="flex items-center gap-2.5 min-w-0">
          {row.avatar_url ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={row.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
          ) : (
            <span className="w-8 h-8 rounded-full bg-brand-50 text-brand-700 grid place-items-center text-[11px] font-bold shrink-0">
              {initials(row.name)}
            </span>
          )}
          <span className="min-w-0">
            <span className="block font-semibold text-slate-900 leading-tight truncate">
              {row.name ?? "Unnamed"}
            </span>
            <span className="block text-[12px] text-slate-500 tabular-nums">{row.ref}</span>
          </span>
        </Link>
      </td>
      <td className="px-2 py-2.5 text-slate-700">
        <Link href={href} className="block truncate">{row.region ?? "—"}</Link>
      </td>
      <td className="px-2 py-2.5 text-right tabular-nums text-slate-900">
        <Link href={href} className="block">
          {row.bookings_total}
          {row.bookings_active > 0 && (
            <span className="block text-[11px] text-emerald-700 font-semibold">
              {row.bookings_active} active
            </span>
          )}
        </Link>
      </td>
      <td className="px-2 py-2.5">
        <Link href={href}>
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${ACCOUNT_TONE[row.account_state]}`}>
            {ACCOUNT_LABEL[row.account_state]}
          </span>
        </Link>
      </td>
      <td className="px-2 py-2.5">
        <Link href={href}>
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${ATTENTION_TONE[row.attention]}`}>
            {ATTENTION_LABEL[row.attention]}
            {row.attention === "support_case" && row.open_cases > 1 ? ` ×${row.open_cases}` : ""}
          </span>
        </Link>
      </td>
      <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">
        <Link href={href}>
          {row.last_booking_at
            ? <ClientDateTime iso={row.last_booking_at} mode="date" />
            : <span className="text-slate-400">Never</span>}
        </Link>
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

function initials(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}
