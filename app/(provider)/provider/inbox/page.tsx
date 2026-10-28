import { createSupabaseServerClient } from "@/lib/supabase/server";
import { one } from "@/lib/supabase/relation";
import { payoutFromEstimateCents, dollars } from "@/lib/pricing";
import { describeIntake } from "@/lib/service-intake";
import { Inbox, Check, X, MapPin, Clock, DollarSign, Heart } from "lucide-react";
import { InboxRow } from "./row";
import { ClientDateTime } from "@/components/ClientDateTime";
import { ProviderInboxRealtimeRefresh } from "./realtime-refresh";

export const dynamic = "force-dynamic";

/** The offer row's embedded request, as the page actually uses it. */
type OfferRequest = {
  id: string;
  status: string;
  scheduled_for: string | null;
  notes: string | null;
  estimated_price_cents: number | null;
  intake: Record<string, string | string[]> | null;
  service?: { id: string; title: string; blurb: string | null; base_price_cents: number;
              eta_label: string | null; image_url: string | null } | Array<{ id: string; title: string;
              blurb: string | null; base_price_cents: number; eta_label: string | null;
              image_url: string | null }> | null;
  // Snapshotted onto the request (migration 0048) rather than embedded
  // from addresses, which 0047 correctly hides from an un-accepted helper.
  pickup_city: string | null;
  pickup_region: string | null;
  customer?: { full_name: string; avatar_url: string | null }
           | Array<{ full_name: string; avatar_url: string | null }> | null;
};

export default async function ProviderInboxPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // match_attempts where the current helper was offered and hasn't responded.
  // We also pull the customer's full_name (and avatar) when the attempt is
  // flagged preferred so the helper sees who specifically requested them.
  const { data } = await supabase
    .from("match_attempts")
    .select(`
      id, distance_km, rank_score, notified_at, preferred,
      request:requests(
        id, status, scheduled_for, notes, estimated_price_cents, intake,
        pickup_city, pickup_region,
        service:services(id, title, blurb, base_price_cents, eta_label, image_url),
        customer:profiles!requests_customer_id_fkey(full_name, avatar_url)
      )
    `)
    .is("responded_at", null)
    .order("preferred", { ascending: false })
    .order("notified_at", { ascending: false });

  // Filter out attempts whose request has already been taken
  const offers = (data ?? []).filter((row) => {
    const req = one((row as { request?: OfferRequest | OfferRequest[] | null }).request);
    return !!req && req.status === "matching";
  });

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-3xl mx-auto">
      <ProviderInboxRealtimeRefresh userId={user.id} />
      <div className="flex items-center gap-3 mb-1">
        <Inbox className="w-6 h-6 text-brand-600" />
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Inbox</h1>
      </div>
      <p className="text-sm text-slate-500 mb-6">
        {offers.length === 0 ? "No open task offers right now." : `${offers.length} open offer${offers.length === 1 ? "" : "s"} — first to accept wins.`}
      </p>

      {offers.length === 0 ? (
        <div className="rounded-2xl bg-white border border-slate-100 p-8 sm:p-12 text-center">
          <span className="inline-flex w-14 h-14 rounded-2xl bg-slate-50 items-center justify-center mb-3">
            <Inbox className="w-7 h-7 text-slate-400" />
          </span>
          <h2 className="text-lg font-bold text-slate-900">All quiet</h2>
          <p className="mt-1 text-sm text-slate-500 max-w-sm mx-auto">
            New task offers will appear here when customers request a service you offer near you.
            Make sure you're <strong>online</strong> from the Active task page.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {offers.map((row) => {
            // PostgREST embeds a to-one relation as an object and a
            // to-many as an array, and the generated types do not reliably
            // say which. one() asks what actually arrived instead of
            // asserting a shape — the casts this replaces were wrong in
            // both directions and failed silently, rendering nothing.
            const req = one((row as { request?: OfferRequest | OfferRequest[] | null }).request)!;
            const preferred = (row as { preferred: boolean }).preferred;
            const service = one(req.service);
            const customer = one(req.customer);
            return (
              <li
                key={row.id}
                className={`rounded-2xl border overflow-hidden ${
                  preferred
                    ? "bg-gradient-to-br from-rose-50 to-pink-50 border-rose-200 ring-2 ring-rose-100"
                    : "bg-white border-slate-100"
                }`}
              >
                {preferred && customer && (
                  <div className="px-4 py-2.5 bg-rose-600 text-white flex items-center gap-2.5 text-xs">
                    {customer.avatar_url ? (
                      <img src={customer.avatar_url} className="w-6 h-6 rounded-full ring-2 ring-white shrink-0" alt="" />
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-rose-700 ring-2 ring-white flex items-center justify-center text-[10px] font-bold shrink-0">
                        {customer.full_name?.[0] ?? "?"}
                      </div>
                    )}
                    <div className="font-bold inline-flex items-center gap-1.5">
                      <Heart className="w-3 h-3 fill-current" />
                      {customer.full_name?.split(" ")[0] ?? "A customer"} specifically requested you
                    </div>
                  </div>
                )}
                {service?.image_url && (
                  <div className="h-32 bg-slate-100 relative">
                    <img src={service.image_url} alt="" className="w-full h-full object-cover" />
                  </div>
                )}
                <div className="p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-base font-bold text-slate-900">{service?.title}</div>
                      <div className="text-xs text-slate-500 mt-1 line-clamp-2">{service?.blurb}</div>
                    </div>
                    <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full shrink-0 ${
                      preferred ? "text-rose-700 bg-white" : "text-amber-700 bg-amber-50"
                    }`}>
                      {preferred ? "Exclusive 2 min" : "Live"}
                    </span>
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    {/* Area, not the doorstep. An exact address at offer
                        stage is an address handed to everyone the request
                        was broadcast to, including everyone who declines.
                        The street address unlocks on acceptance — see
                        migration 0047. */}
                    <Field
                      icon={<MapPin className="w-3 h-3" />}
                      label="Area"
                      value={
                        req.pickup_city
                          ? `${req.pickup_city}${req.pickup_region ? `, ${req.pickup_region}` : ""}`
                          : "—"
                      }
                    />
                    <Field icon={<Clock className="w-3 h-3" />} label="When" value={req.scheduled_for ? <ClientDateTime iso={req.scheduled_for} /> : "ASAP"} />
                    <Field icon={<DollarSign className="w-3 h-3" />} label="Est. payout (80%)" value={`$${dollars(payoutFromEstimateCents(req.estimated_price_cents ?? 0))}`} />
                    <Field icon={<MapPin className="w-3 h-3" />} label="Distance" value={`${row.distance_km} km`} />
                  </dl>
                  {/* The brief. A helper deciding whether to accept needs
                      the destination, the crew size, the stairs — not just a
                      price and a pin. */}
                  {(() => {
                    // forOffer: this payload goes to every candidate,
                    // including everyone who declines. Access codes are
                    // withheld until someone is accountable for the job.
                    const brief = describeIntake(
                      service?.id ?? "",
                      (req as { intake?: Record<string, string | string[]> }).intake,
                      { forOffer: true },
                    );
                    if (brief.length === 0) return null;
                    return (
                      <dl className="mt-3 rounded-lg bg-brand-50/70 border border-brand-100 p-2.5 space-y-1">
                        {brief.map((b) => (
                          <div key={b.label} className="flex items-start gap-2 text-[11px]">
                            <dt className="text-brand-900/70 shrink-0 min-w-[7rem]">{b.label}</dt>
                            <dd className="text-brand-950 font-medium min-w-0">{b.value}</dd>
                          </div>
                        ))}
                      </dl>
                    );
                  })()}
                  {req.notes && (
                    <div className="mt-3 text-xs text-slate-600 bg-slate-50 rounded-lg p-2.5">
                      <span className="font-semibold">Note: </span>{req.notes}
                    </div>
                  )}
                  <InboxRow requestId={req.id} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Field({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide inline-flex items-center gap-1">
        {icon} {label}
      </div>
      <div className="text-xs text-slate-900 mt-0.5">{value}</div>
    </div>
  );
}
