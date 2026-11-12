import Link from "next/link";
import {
  Rocket, Archive, FileText, ShieldCheck, Plus, UploadCloud, Search, Info,
  FlaskConical, Wrench, PencilRuler,
} from "lucide-react";
import { getCatalogueView, type ServiceRow } from "@/lib/data/admin-services";
import {
  MODEL_LABEL, STATUS_LABEL, STATUS_TONE, CHECK_LABEL, CHECK_TONE,
  PUBLICATION_SURFACES,
} from "@/lib/admin-service-states";
import { money } from "@/lib/admin-format";
import { ServiceEditorPanel } from "@/components/admin/ServiceEditorPanel";

/*
  SERVICES & PRICING.

  A DESIGN, STAMPED. The configuration shown is illustrative and every
  control that would change the catalogue is switched off. The editor
  that actually changes services today is still at
  /admin/services/classic, linked from this page — replacing a working
  tool with a drawing would be a worse outcome than an unfinished
  redesign.

  WHAT THE LAYOUT INSISTS ON:

    THE TWO MARKETS ARE COLUMNS, not a toggle on a single price, so a
    missing Canadian price is visible from the list rather than
    discovered at booking time.

    PUBLISHING IS A REVIEW. Prices apply to new quotes; anything
    already quoted keeps what it was told. The button opens a
    comparison of what changes and which surfaces it lands on.

    AND THE PUBLICATION CHECKS ARE NOT GREEN. In the mockup they are
    three ticks. A tick means somebody compared the app catalogue, the
    website directory, the city pages and the sitemap against this
    list — and nothing has. They read "Not checked" until a real check
    moves them, because a tick nobody earned is the one thing a
    publication screen must never show.
*/

export const dynamic = "force-dynamic";

const TABS = [
  { key: "launch", label: "Launch catalogue" },
  { key: "archived", label: "Archived" },
  { key: "drafts", label: "Drafts" },
  { key: "history", label: "Change history" },
] as const;

export default async function AdminServicesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const tab = (TABS.find((t) => t.key === params.tab)?.key ?? "launch") as string;

  const view = await getCatalogueView({
    tab,
    category: params.category ?? null,
    market: params.market ?? null,
    status: params.status ?? null,
    search: params.q ?? null,
    open: params.open ?? null,
  });

  const openId = params.open ?? view.selected?.id ?? null;
  const draft = openId && openId === view.selected?.id ? view.selected : null;

  const query = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (value) next.set(key, value);
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    return `/admin/services?${next.toString()}`;
  };

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 pb-12 max-w-[1700px] mx-auto">
      <div className={draft ? "grid xl:grid-cols-[1fr_560px] gap-4 items-start" : ""}>
        <div className="min-w-0 space-y-4">
          <header className="flex flex-wrap items-start gap-3">
            <div className="min-w-0 flex-1">
              <h1 className="text-[28px] leading-tight font-bold text-slate-900 flex flex-wrap items-center gap-2.5">
                Services &amp; pricing
                {!view.writable && (
            <div className="bg-sky-50 border border-sky-200 rounded-2xl px-4 py-3 flex items-start gap-2.5">
              <FlaskConical className="w-4 h-4 text-sky-600 mt-0.5 shrink-0" />
              <p className="text-[12px] text-sky-900">
                <span className="font-semibold">These are the real services, read live.</span>{" "}
                Prices, models and the quote preview come from the catalogue and the booking quote
                engine. Nothing on this page can change them yet — adding, editing and publishing
                are still done in{" "}
                <Link href="/admin/services/classic" className="font-semibold underline underline-offset-2">
                  the working editor
                </Link>.
              </p>
            </div>
          )}

          {view.sample && (
                  <span className="text-[11px] font-bold uppercase tracking-wide bg-violet-100 text-violet-800 px-2.5 py-1 rounded-md">
                    Design concept · sample configuration
                  </span>
                )}
              </h1>
              <p className="text-[14px] text-slate-500 mt-0.5">
                Manage the catalogue, booking rules and market prices.
              </p>
            </div>
            <button type="button" disabled={!view.writable}
              className="inline-flex items-center gap-1.5 bg-white border border-slate-200 text-[13px] font-semibold text-slate-700 px-3 py-2.5 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed">
              <Plus className="w-4 h-4" /> Add service
            </button>
            <button type="button" disabled={!view.writable}
              className="inline-flex items-center gap-1.5 bg-brand-600 text-white text-[13px] font-semibold px-4 py-2.5 rounded-xl disabled:bg-slate-200 disabled:text-slate-500 disabled:cursor-not-allowed">
              <UploadCloud className="w-4 h-4" /> Review changes
            </button>
          </header>

          {view.sample && (
            <div className="bg-violet-50 border border-violet-200 rounded-2xl px-4 py-3 flex items-start gap-2.5">
              <FlaskConical className="w-4 h-4 text-violet-600 mt-0.5 shrink-0" />
              <p className="text-[12px] text-violet-900">
                <span className="font-semibold">This configuration is illustrative.</span>{" "}
                It is not read from the catalogue and nothing here can change a price. The editor
                that does change services is still working at{" "}
                <Link href="/admin/services/classic" className="font-semibold underline underline-offset-2">
                  /admin/services/classic
                </Link>. Wiring this design is one function:{" "}
                <code className="text-[11px] bg-white/70 px-1 py-0.5 rounded">getCatalogueView()</code>{" "}
                in <code className="text-[11px] bg-white/70 px-1 py-0.5 rounded">lib/data/admin-services.ts</code>.
              </p>
            </div>
          )}

          {/* FOUR COUNTS */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
            <Count icon={Rocket} tone="brand" label="Launch services" value={String(view.counts.launch_services)} />
            <Count icon={Archive} tone="slate" label="Archived" value={String(view.counts.archived)} />
            <Count icon={FileText} tone="amber" label="Draft changes" value={String(view.counts.draft_changes)} />
            {/*
              NOT "0 ISSUES". Zero is a result; nothing has validated
              anything, and claiming a clean bill of health is exactly
              the kind of reassurance this console should not invent.
            */}
            <Count icon={ShieldCheck} tone="slate"
              label="Validation issues"
              value={view.counts.validation_issues === null ? "—" : String(view.counts.validation_issues)}
              note={view.counts.validation_issues === null ? "Not validated yet" : "From the last check"} />
          </div>

          <nav className="flex flex-wrap items-center gap-1.5">
            {TABS.map((t) => (
              <Link key={t.key} href={query({ tab: t.key === "launch" ? null : t.key })}
                className={`text-[13px] font-semibold px-3 py-1.5 rounded-lg ${
                  tab === t.key ? "bg-brand-600 text-white" : "bg-white border border-slate-200 text-slate-600 hover:border-slate-300"
                }`}>
                {t.label}
              </Link>
            ))}
            <Link href="/admin/services/classic"
              className="ml-auto inline-flex items-center gap-1.5 text-[12px] font-semibold text-slate-600 bg-white border border-slate-200 px-3 py-1.5 rounded-lg hover:border-brand-300 hover:text-brand-700">
              <Wrench className="w-3.5 h-3.5" /> Open the working editor
            </Link>
          </nav>

          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="flex flex-wrap items-end gap-2 px-4 py-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input placeholder="Search name or service ID"
                  className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-brand-200" />
              </div>
              <Select label="Category" options={["All", "Errands", "Home", "Companionship"]} />
              <Select label="Market" options={["Both", "United States", "Canada"]} />
              <Select label="Status" options={["Published", "Draft", "Archived"]} />
            </div>

            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-slate-400 bg-slate-50/60">
                  <th className="text-left font-semibold px-4 py-2">Service</th>
                  <th className="text-left font-semibold px-2 py-2">Model</th>
                  <th className="text-left font-semibold px-2 py-2">US base</th>
                  <th className="text-left font-semibold px-2 py-2">CA base</th>
                  <th className="text-left font-semibold px-2 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {view.rows.map((row) => (
                  <Row key={row.id} row={row} href={query({ open: row.id })} selected={openId === row.id} />
                ))}
              </tbody>
            </table>

            <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-t border-slate-100">
              <p className="text-[11px] text-slate-500 flex-1">
                Base amounts exclude the service fee and applicable additions. The two columns are
                separate prices, not a conversion.
              </p>
              <span className="text-[11px] text-slate-500">{view.rows.length} services displayed.</span>
            </div>
          </div>

          {/* PUBLICATION CHECKS — honest states */}
          <section className="bg-white rounded-2xl border border-slate-200 px-4 py-3">
            <div className="grid sm:grid-cols-[1fr_auto] gap-4">
              <div>
                <h2 className="text-[14px] font-bold text-slate-900 mb-2">Publication checks</h2>
                <ul className="space-y-1.5">
                  {view.checks.map((check) => (
                    <li key={check.key} className="flex items-start gap-2">
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${CHECK_TONE[check.state]}`}>
                        {CHECK_LABEL[check.state]}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[13px] font-semibold text-slate-800">{check.label}</span>
                        <span className="block text-[11px] text-slate-500">{check.detail}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="sm:w-[220px] sm:border-l sm:border-slate-100 sm:pl-4 flex flex-col justify-center">
                <button type="button" disabled={!view.writable}
                  className="w-full text-[13px] font-semibold text-brand-700 border border-brand-200 bg-white hover:bg-brand-50 px-3 py-2 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed">
                  Review publication impact
                </button>
                <p className="text-[11px] text-slate-500 mt-2">
                  A publication has to land on all of it: {PUBLICATION_SURFACES.join(", ").toLowerCase()}.
                  These rows describe what would be compared — nothing has inspected anything yet.
                </p>
              </div>
            </div>
          </section>

          {/* ARCHIVE */}
          <section className="bg-white rounded-2xl border border-slate-200 px-4 py-3 flex flex-wrap items-center gap-3">
            <div className="flex -space-x-2 shrink-0">
              {view.archived_preview.map((a) => (
                <span key={a.id}
                  title={a.title}
                  className="w-10 h-10 rounded-xl bg-slate-100 border-2 border-white grid place-items-center text-[10px] font-bold text-slate-500">
                  {a.title.slice(0, 2).toUpperCase()}
                </span>
              ))}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-slate-900">
                Archived services keep their photos, intake and pricing.
              </p>
              <p className="text-[12px] text-slate-500">
                There is no restore-everything control on purpose: each one is restored on its own,
                after checking it still fits the app&apos;s submitted catalogue.
              </p>
            </div>
            <Link href={query({ tab: "archived" })}
              className="text-[13px] font-semibold text-slate-700 bg-white border border-slate-200 hover:border-brand-300 px-3 py-2 rounded-xl shrink-0">
              Browse archive
            </Link>
          </section>

          <div className="bg-white rounded-2xl border border-slate-200 px-4 py-3 flex items-start gap-2.5">
            <Info className="w-4 h-4 text-brand-500 mt-0.5 shrink-0" />
            <p className="text-[12px] text-slate-600">
              <span className="font-semibold text-slate-800">A price change never touches a quote that already exists.</span>{" "}
              Requests and bookings keep the amount they were quoted, in the currency they were
              quoted in. Before anything publishes, both markets are checked at their boundaries —
              the shortest and longest durations, extra items, helper counts, required answers and
              what happens when a country has no price of its own.
            </p>
          </div>
        </div>

        {draft && <ServiceEditorPanel can={view.can} draft={draft} sample={!view.writable} />}
      </div>
    </div>
  );
}

function Count({ icon: Icon, label, value, tone, note }: {
  icon: typeof Rocket; label: string; value: string;
  tone: "brand" | "slate" | "amber"; note?: string;
}) {
  const tones = { brand: "text-brand-600", slate: "text-slate-500", amber: "text-amber-600" }[tone];
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 flex items-center gap-3 min-w-0">
      <span className="w-10 h-10 rounded-xl bg-slate-50 grid place-items-center shrink-0">
        <Icon className={`w-5 h-5 ${tones}`} />
      </span>
      <span className="min-w-0">
        <span className="block text-[12px] font-semibold text-slate-600 truncate">{label}</span>
        <span className="block text-[22px] font-bold text-slate-900 leading-none tabular-nums whitespace-nowrap mt-0.5">
          {value}
        </span>
        {note && <span className="block text-[10px] text-slate-500 leading-snug">{note}</span>}
      </span>
    </div>
  );
}

function Select({ label, options }: { label: string; options: string[] }) {
  return (
    <label className="text-[11px] font-semibold text-slate-500">
      {label}
      <select className="mt-1 block appearance-none bg-white border border-slate-200 rounded-xl px-3 py-2 text-[13px] font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-200">
        {options.map((o) => <option key={o}>{o}</option>)}
      </select>
    </label>
  );
}

function Row({ row, href, selected }: { row: ServiceRow; href: string; selected: boolean }) {
  return (
    <tr className={`border-t border-slate-100 ${selected ? "bg-brand-50/60" : "hover:bg-slate-50"}`}>
      <td className="px-4 py-2.5">
        <Link href={href} className="flex items-center gap-2.5 min-w-0">
          <span className="w-9 h-9 rounded-lg bg-slate-100 grid place-items-center shrink-0 text-[10px] font-bold text-slate-400">
            <PencilRuler className="w-4 h-4" />
          </span>
          <span className="min-w-0">
            <span className="block font-semibold text-slate-900 truncate">{row.title}</span>
            <span className="block text-[11px] text-slate-400 truncate">{row.id}</span>
          </span>
        </Link>
      </td>
      <td className="px-2 py-2.5 text-slate-600">
        <Link href={href}>{MODEL_LABEL[row.model]}</Link>
      </td>
      <td className="px-2 py-2.5 tabular-nums text-slate-700">
        <Link href={href}>
          {row.us_base_cents === null
            ? <span className="text-amber-700 text-[12px] font-semibold">No US price</span>
            : money(row.us_base_cents, "USD")}
        </Link>
      </td>
      <td className="px-2 py-2.5 tabular-nums text-slate-700">
        <Link href={href}>
          {row.ca_base_cents === null
            ? <span className="text-amber-700 text-[12px] font-semibold">No CA price</span>
            : money(row.ca_base_cents, "CAD")}
        </Link>
      </td>
      <td className="px-2 py-2.5">
        <Link href={href} className="inline-flex items-center gap-1.5">
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_TONE[row.status]}`}>
            {STATUS_LABEL[row.status]}
          </span>
          {row.has_draft && (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800">
              Draft
            </span>
          )}
        </Link>
      </td>
    </tr>
  );
}
