import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { MapPin, Check, X, HelpCircle } from "lucide-react";
import { AddVenue, VenueForm, DeleteVenue, type VenueRow } from "./form";

/* The venue permission directory.
 *
 * A customer cannot give Helpward permission to break somebody else's
 * queue rules, so this records what we have actually asked venues — and,
 * just as importantly, what we have NOT asked. An unlisted venue is not a
 * forbidden one; it is an unchecked one, and the booking form says so
 * rather than implying approval we never obtained.
 */

const BADGE = {
  allowed: { icon: Check, cls: "text-emerald-700 bg-emerald-50 border-emerald-100", label: "Yes" },
  refused: { icon: X, cls: "text-rose-700 bg-rose-50 border-rose-100", label: "No" },
  unknown: { icon: HelpCircle, cls: "text-slate-500 bg-slate-50 border-slate-200", label: "Not checked" },
} as const;

function Badge({ value }: { value: string }) {
  const b = BADGE[(value as keyof typeof BADGE)] ?? BADGE.unknown;
  const Icon = b.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-semibold ${b.cls}`}>
      <Icon className="w-3 h-3" aria-hidden="true" /> {b.label}
    </span>
  );
}

export default async function AdminVenuesPage() {
  const { data } = await createSupabaseServiceClient()
    .from("venues")
    .select("*")
    .order("country")
    .order("name");

  const venues = (data ?? []) as VenueRow[];
  const blocked = venues.filter((v) => v.substitutes_allowed === "refused").length;
  const confirmed = venues.filter((v) => v.substitutes_allowed === "allowed").length;

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Venue permissions</h1>
          <p className="text-sm text-slate-500 mt-1">
            {venues.length === 0
              ? "Nothing checked yet. Bookings still go ahead — customers are told the venue is unverified."
              : `${confirmed} confirmed · ${blocked} blocked · ${venues.length} on file`}
          </p>
        </div>
        <AddVenue />
      </div>

      <div className="rounded-2xl bg-amber-50 border border-amber-100 p-4 mb-5">
        <p className="text-xs text-amber-900 leading-relaxed">
          <strong>What this list does.</strong> A venue recorded as refusing stand-ins blocks Wait in
          Line bookings outright — we already know the job can&rsquo;t be done, so taking the money
          would be wrong. A venue that isn&rsquo;t listed is <em>unchecked</em>, not forbidden: the
          booking proceeds, the customer is told we haven&rsquo;t verified it, and the helper checks
          with staff on arrival. If they&rsquo;re turned away, the customer isn&rsquo;t charged.
        </p>
      </div>

      {venues.length === 0 ? (
        <div className="rounded-2xl bg-white border border-slate-100 p-10 text-center">
          <MapPin className="w-6 h-6 text-slate-300 mx-auto" aria-hidden="true" />
          <p className="text-sm font-semibold text-slate-700 mt-2">No venues checked yet</p>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            Start with the handful of restaurants and shops you expect the first bookings at. Ask
            whether a paid stand-in is allowed and whether a place can be handed over.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {venues.map((v) => (
            <details key={v.id} className="rounded-2xl bg-white border border-slate-100 overflow-hidden">
              <summary className="p-4 cursor-pointer list-none flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-bold text-slate-900 truncate">{v.name}</div>
                  <div className="text-xs text-slate-500 mt-0.5 truncate">
                    {[v.city, v.region, v.country].filter(Boolean).join(", ") || "No location recorded"}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] text-slate-500">Stand-ins:</span>
                    <Badge value={v.substitutes_allowed} />
                    <span className="text-[11px] text-slate-500 ml-1">Handover:</span>
                    <Badge value={v.customer_may_replace} />
                  </div>
                  {v.confirmed_at && (
                    <div className="text-[11px] text-slate-400 mt-1.5">
                      Checked {new Date(v.confirmed_at).toLocaleDateString()}
                    </div>
                  )}
                </div>
                <DeleteVenue id={v.id} name={v.name} />
              </summary>
              <div className="border-t border-slate-100 p-4 bg-slate-50/50">
                <VenueForm venue={v} />
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
