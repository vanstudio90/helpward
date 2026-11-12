import Link from "next/link";
import {
  CheckCircle2, XCircle, HelpCircle, Clock, Download, Plus, Search, MapPin,
  ShieldCheck, Info, FlaskConical, Wrench, ChevronLeft, ChevronRight, AlertTriangle, CloudOff,
} from "lucide-react";
import { getVenuesView, type VenueRow } from "@/lib/data/admin-venues";
import {
  PERMISSION_LABEL, PERMISSION_TONE, REVIEW_LABEL, REVIEW_TONE,
} from "@/lib/admin-venue-states";
import { VenuePanel } from "@/components/admin/VenuePanel";
import { AddVenueDialog } from "@/components/admin/AddVenueDialog";

/*
  COVERAGE & VENUES.

  TWO TABS, AND THEY ARE NOT THE SAME QUESTION. Operating in Vancouver
  means we have helpers and services there. It says nothing about
  whether a particular shop will let somebody stand in a queue for
  money. A console that merges them invites an operator to read a green
  city as permission at every address in it.

  THE RULE BEHIND THIS SCREEN IS ALREADY ENFORCED. lib/venue-gate.ts
  runs on every Wait in Line request from both the website and the app:
  a refused venue is blocked, an unchecked one proceeds with the
  customer told plainly that nobody has asked. This page is a design
  for MANAGING those records — the records themselves are real, and
  today there are none, which is why every venue is unchecked.

  THREE EMPTINESSES, KEPT APART: no records at all, no records matching
  these filters, and a register that could not be read. The third is
  never drawn as the first.
*/

export const dynamic = "force-dynamic";

const TABS = [
  { key: "coverage", label: "Service coverage" },
  { key: "venues", label: "Venue permissions" },
] as const;

export default async function AdminVenuesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const tab = (TABS.find((t) => t.key === params.tab)?.key ?? "venues") as string;

  const view = await getVenuesView({
    tab,
    region: params.region ?? null,
    permission: params.permission ?? null,
    review: params.review ?? null,
    search: params.q ?? null,
    open: params.open ?? null,
  });

  const openId = params.open ?? view.selected?.id ?? null;
  const venue = openId && openId === view.selected?.id ? view.selected : null;
  const filtered = Boolean(params.q || params.region || params.permission || params.review);
  const noRecords = view.rows.length === 0 && !filtered && !view.load_error;
  const noMatches = view.rows.length === 0 && filtered && !view.load_error;

  const query = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (value) next.set(key, value);
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    return `/admin/venues?${next.toString()}`;
  };

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 pb-12 max-w-[1700px] mx-auto">
      <div className={venue && tab === "venues" ? "grid xl:grid-cols-[1fr_560px] gap-4 items-start" : ""}>
        <div className="min-w-0 space-y-4">
          <header className="flex flex-wrap items-start gap-3">
            <div className="min-w-0 flex-1">
              <h1 className="text-[28px] leading-tight font-bold text-slate-900 flex flex-wrap items-center gap-2.5">
                Coverage &amp; venues
                {!view.writable && (
            <div className="bg-sky-50 border border-sky-200 rounded-2xl px-4 py-3 flex items-start gap-2.5">
              <FlaskConical className="w-4 h-4 text-sky-600 mt-0.5 shrink-0" />
              <p className="text-[12px] text-sky-900">
                <span className="font-semibold">This is the real register, read live.</span>{" "}
                These are the venue answers checkVenue() consults on every Wait in Line request.
                Recording or changing an answer is still done in{" "}
                <Link href="/admin/venues/classic" className="font-semibold underline underline-offset-2">
                  the working directory
                </Link>.
              </p>
            </div>
          )}

              </h1>
              <p className="text-[14px] text-slate-500 mt-0.5">
                Keep location rules and venue permissions clear.
              </p>
            </div>
            <button type="button" disabled={!view.writable}
              className="inline-flex items-center gap-1.5 bg-white border border-slate-200 text-[13px] font-semibold text-slate-700 px-3 py-2.5 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed">
              <Download className="w-4 h-4" /> Export
            </button>
            <AddVenueDialog disabled={!view.can.create_venue} />
          </header>


          <nav className="flex flex-wrap items-center gap-5 border-b border-slate-200">
            {TABS.map((t) => (
              <Link key={t.key} href={query({ tab: t.key === "venues" ? null : t.key, open: null })}
                className={`text-[14px] font-semibold pb-2.5 border-b-2 ${
                  tab === t.key ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800"
                }`}>
                {t.label}
              </Link>
            ))}
            <Link href="/admin/venues/classic"
              className="ml-auto mb-2 inline-flex items-center gap-1.5 text-[12px] font-semibold text-slate-600 bg-white border border-slate-200 px-3 py-1.5 rounded-lg hover:border-brand-300 hover:text-brand-700">
              <Wrench className="w-3.5 h-3.5" /> Open the working directory
            </Link>
          </nav>

          {tab === "coverage" ? (
            <CoverageTab view={view} />
          ) : (
            <>
              <div className="bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-[13px] text-slate-700">
                <span className="font-semibold text-slate-500 text-[12px] uppercase tracking-wide mr-2">Service</span>
                {view.service}
                <span className="text-slate-400"> · permissions are recorded per service, because a venue
                  that minds a paid queue-stander may not mind a parcel being collected.</span>
              </div>

              {view.load_error ? (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-start gap-2.5">
                  <CloudOff className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-[13px] font-semibold text-amber-900">
                      The venue register could not be read
                    </p>
                    <p className="text-[12px] text-amber-800 mt-0.5">{view.load_error}</p>
                    <p className="text-[12px] text-amber-800 mt-1">
                      This is not an empty register. Bookings continue under the unchecked rule
                      until it can be read again.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
                    <Count icon={CheckCircle2} tone="emerald" label="Confirmed allowed" value={view.counts.allowed} />
                    <Count icon={XCircle} tone="rose" label="Confirmed refused" value={view.counts.refused} />
                    <Count icon={HelpCircle} tone="slate" label="Unchecked" value={view.counts.unchecked} />
                    <Count icon={Clock} tone="amber" label="Due for review" value={view.counts.due_for_review} />
                  </div>
                  <p className="text-[11px] text-slate-500 text-right -mt-2">
                    Records in this view.
                  </p>
                </>
              )}

              <div className="bg-brand-50/60 border border-brand-100 rounded-xl px-3.5 py-2.5 flex items-start gap-2.5">
                <ShieldCheck className="w-4 h-4 text-brand-600 mt-0.5 shrink-0" />
                <p className="text-[12px] text-slate-700 flex-1">
                  <span className="font-semibold">Refused venues block new requests. Unchecked venues carry a customer warning.</span>{" "}
                  Both already happen on the server, for the website and the app alike — an
                  unchecked venue is never labelled verified.
                </p>
                <Link href="/admin/venues/classic" className="text-[12px] font-semibold text-brand-700 shrink-0">
                  View booking rules →
                </Link>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="flex flex-wrap items-end gap-2 px-4 py-3">
                  <div className="relative flex-1 min-w-[200px]">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input placeholder="Search venue, branch or address…"
                      className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-brand-200" />
                  </div>
                  <Select label="Region" options={["All regions", "Vancouver", "San Diego"]} />
                  <Select label="Permission" options={["All", "Allowed", "Refused", "Unchecked", "Conditional"]} />
                  <Select label="Review due" options={["All", "Overdue", "Due soon", "Never checked"]} />
                </div>

                {noRecords ? (
                  <div className="px-6 py-14 text-center">
                    <span className="w-14 h-14 rounded-2xl bg-violet-50 grid place-items-center mx-auto">
                      <MapPin className="w-6 h-6 text-violet-400" />
                    </span>
                    <p className="text-[18px] font-bold text-slate-900 mt-3">No venue records yet</p>
                    <p className="text-[13px] text-slate-500 mt-1 max-w-sm mx-auto">
                      Nothing has been asked of any venue. Requests still go ahead — customers are
                      told the venue is unverified and helpers check with staff on arrival.
                    </p>
                    <div className="mt-4 flex justify-center">
                      <AddVenueDialog disabled={!view.can.create_venue} />
                    </div>
                  </div>
                ) : noMatches ? (
                  <div className="px-6 py-12 text-center">
                    <p className="text-[14px] font-semibold text-slate-700">No venues match these filters</p>
                    <p className="text-[13px] text-slate-500 mt-1">
                      There are {view.total_rows} records in the register.
                    </p>
                    <Link href="/admin/venues" className="inline-block mt-3 text-[13px] font-semibold text-brand-700">
                      Clear filters
                    </Link>
                  </div>
                ) : (
                  <>
                    <table className="w-full text-[13px]">
                      <thead>
                        <tr className="text-[11px] uppercase tracking-wide text-slate-400 bg-slate-50/60">
                          <th className="text-left font-semibold px-4 py-2">Venue &amp; branch</th>
                          <th className="text-left font-semibold px-2 py-2">Permission</th>
                          <th className="text-left font-semibold px-2 py-2">Last checked</th>
                          <th className="text-left font-semibold px-2 py-2">Reviewer</th>
                          <th className="text-left font-semibold px-2 py-2">Next review</th>
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
                        A decision applies to this branch and the queue it was recorded for — not to
                        the chain, and not to every door.
                      </p>
                      <span className="text-[11px] text-slate-500">
                        Showing 1–{view.rows.length} of {view.total_rows}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <span className="w-7 h-7 grid place-items-center rounded-lg text-slate-300">
                          <ChevronLeft className="w-3.5 h-3.5" />
                        </span>
                        <span className="w-7 h-7 grid place-items-center rounded-lg text-slate-500 border border-slate-200">
                          <ChevronRight className="w-3.5 h-3.5" />
                        </span>
                      </span>
                    </div>
                  </>
                )}
              </div>

              {view.counts.due_for_review > 0 && (
                <Link href={query({ review: "Overdue" })}
                  className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-center gap-2.5 hover:border-amber-300">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span className="text-[13px] text-amber-900 flex-1">
                    <span className="font-semibold">
                      {view.counts.due_for_review} venue records need rechecking.
                    </span>{" "}
                    The last answer still stands — it is just older than we said we would let it get.
                  </span>
                  <span className="text-[12px] font-semibold text-amber-800 shrink-0">View review queue →</span>
                </Link>
              )}

              <div className="bg-white rounded-2xl border border-slate-200 px-4 py-3 flex items-start gap-2.5">
                <Info className="w-4 h-4 text-brand-500 mt-0.5 shrink-0" />
                <p className="text-[12px] text-slate-600">
                  <span className="font-semibold text-slate-800">Permission is not a guarantee.</span>{" "}
                  An allowed venue can still be full, closed or having a bad day, and a helper
                  turned away on arrival is recorded as that outcome: an uncaptured hold is
                  released, and if money was already captured a refund is confirmed separately
                  rather than happening by itself. If a venue changes its mind, the open requests
                  at it are flagged for operations — never cancelled quietly.
                </p>
              </div>
            </>
          )}
        </div>

        {venue && tab === "venues" && <VenuePanel venue={venue} sample={false} can={view.can} />}
      </div>
    </div>
  );
}

function CoverageTab({ view }: { view: Awaited<ReturnType<typeof getVenuesView>> }) {
  return (
    <>
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-slate-400 bg-slate-50/60">
              <th className="text-left font-semibold px-4 py-2">Area</th>
              <th className="text-left font-semibold px-2 py-2">Region</th>
              <th className="text-right font-semibold px-2 py-2">Helpers available</th>
              <th className="text-right font-semibold px-2 py-2">Services live</th>
              <th className="text-right font-semibold px-4 py-2">Venues recorded</th>
            </tr>
          </thead>
          <tbody>
            {view.coverage.map((area) => (
              <tr key={area.area} className="border-t border-slate-100">
                <td className="px-4 py-2.5 font-semibold text-slate-900">{area.area}</td>
                <td className="px-2 py-2.5 text-slate-600">{area.region} · {area.country}</td>
                <td className="px-2 py-2.5 text-right tabular-nums text-slate-900">
                  {area.helpers_available}
                  {/*
                    ZERO HAS TWO MEANINGS AND THEY ARE NOT THE SAME.
                    Nobody approved is a market that has not launched;
                    approved but offline is a quiet hour. Printing a
                    bare 0 lets a reader pick the wrong one.
                  */}
                  {area.helpers_available === 0 && (
                    <span className="block text-[11px] font-semibold text-amber-700">
                      {area.helpers_approved === 0
                        ? "No approved helpers"
                        : `None online — ${area.helpers_approved} approved`}
                    </span>
                  )}
                  {area.helpers_available > 0 && area.helpers_approved > area.helpers_available && (
                    <span className="block text-[11px] text-slate-500">
                      of {area.helpers_approved} approved
                    </span>
                  )}
                </td>
                <td className="px-2 py-2.5 text-right tabular-nums text-slate-900">{area.services_live}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-slate-900">
                  {area.venues_recorded}
                  {area.venues_unchecked > 0 && (
                    <span className="block text-[11px] text-slate-500">
                      {area.venues_unchecked} unchecked
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 px-4 py-3 flex items-start gap-2.5">
        <Info className="w-4 h-4 text-brand-500 mt-0.5 shrink-0" />
        <p className="text-[12px] text-slate-600">
          <span className="font-semibold text-slate-800">Operating in a city is not permission at a venue.</span>{" "}
          Coverage says we have helpers and services here. Whether a particular shop, theatre or
          clinic will allow a paid stand-in is a separate answer, recorded one branch at a time on
          the other tab — which is why these are two tabs and not one table.
        </p>
      </div>
    </>
  );
}

function Count({ icon: Icon, label, value, tone }: {
  icon: typeof Clock; label: string; value: number;
  tone: "emerald" | "rose" | "slate" | "amber";
}) {
  const tones = {
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-600",
    rose: "bg-rose-50 border-rose-200 text-rose-600",
    slate: "bg-white border-slate-200 text-slate-500",
    amber: "bg-amber-50 border-amber-200 text-amber-600",
  }[tone];
  return (
    <div className={`rounded-2xl border px-3.5 py-3 min-w-0 ${tones}`}>
      <span className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-700 min-w-0">
        <Icon className="w-4 h-4 shrink-0" />
        <span className="truncate">{label}</span>
      </span>
      <span className="block text-[22px] font-bold text-slate-900 leading-none tabular-nums whitespace-nowrap mt-1.5">
        {value}
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

function Row({ row, href, selected }: { row: VenueRow; href: string; selected: boolean }) {
  return (
    <tr className={`border-t border-slate-100 ${selected ? "bg-brand-50/60" : "hover:bg-slate-50"}`}>
      <td className="px-4 py-2.5">
        <Link href={href} className="block">
          <span className="font-semibold text-slate-900">{row.name}</span>
          <span className="text-slate-300"> • </span>
          <span className="text-slate-600">{row.branch}</span>
          <span className="block text-[11px] text-slate-400">{row.address} · {row.id}</span>
        </Link>
      </td>
      <td className="px-2 py-2.5">
        <Link href={href}>
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${PERMISSION_TONE[row.permission]}`}>
            {PERMISSION_LABEL[row.permission]}
          </span>
        </Link>
      </td>
      <td className="px-2 py-2.5 text-slate-600">
        {/* NEVER A DATE WHERE THERE WAS NO CHECK. */}
        <Link href={href}>{row.last_checked ?? <span className="text-slate-400">Never</span>}</Link>
      </td>
      <td className="px-2 py-2.5 text-slate-600">
        <Link href={href}>{row.reviewer ?? <span className="text-slate-400">Unassigned</span>}</Link>
      </td>
      <td className="px-2 py-2.5">
        <Link href={href} className="inline-flex items-center gap-1.5">
          {row.next_review ?? <span className="text-slate-400">Not set</span>}
          {row.review_state === "overdue" && (
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${REVIEW_TONE.overdue}`}>
              {REVIEW_LABEL.overdue}
            </span>
          )}
        </Link>
      </td>
    </tr>
  );
}
