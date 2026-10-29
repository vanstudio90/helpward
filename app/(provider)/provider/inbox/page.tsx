import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { one } from "@/lib/supabase/relation";
import { payoutFromEstimateCents, dollars } from "@/lib/pricing";
import { describeIntake } from "@/lib/service-intake";
import {
  Inbox, MapPin, Clock, DollarSign, Heart, ListChecks, Calendar, Volume2,
} from "lucide-react";
import {
  PageHeader, Card, Action, EmptyState, Hint,
} from "@/components/provider/ui";
import { cn } from "@/lib/cn";
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

  // Whether offers can reach this helper at all is the first question
  // this screen has to answer — an empty list means something completely
  // different when you are offline.
  const { data: pp } = await supabase
    .from("provider_profiles").select("is_online").eq("user_id", user.id).maybeSingle();
  const online = pp?.is_online === true;

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
    <div className="space-y-4">
      <PageHeader
        title="Offers"
        subtitle={offers.length === 0
          ? "New work, ready for you to review."
          : `${offers.length} open offer${offers.length === 1 ? "" : "s"} — first to accept wins.`}
      />

      {/* Online state and connection state, side by side. They answer
          different halves of "why is this empty": nothing is being sent
          to me, or nothing is reaching me. */}
      <Card className="flex items-center gap-3 p-4">
        <span className={cn("w-3 h-3 rounded-full shrink-0", online ? "bg-emerald-500" : "bg-slate-300")} />
        <span className="flex-1 text-[17px] font-extrabold text-slate-900">
          {online ? "You're online" : "You're offline"}
        </span>
        <ProviderInboxRealtimeRefresh userId={user.id} inline />
      </Card>

      {offers.length === 0 ? (
        <>
          <EmptyState
            icon={Inbox}
            title={online ? "No offers right now" : "You're offline, so nothing is being sent"}
            body={online
              ? "Offers for your selected services will appear here when customers nearby request help."
              : "Go online from Active and offers for your selected services will appear here."}
          >
            <Action href="/provider/profile" icon={ListChecks} trailingChevron>Manage my services</Action>
            <Action href="/provider/schedule" icon={Calendar} variant="quiet">View availability</Action>
          </EmptyState>

          <Hint icon={Volume2}>
            <strong className="font-bold text-slate-800">Keep an ear out.</strong>{" "}
            You&rsquo;ll hear a ping when a new offer arrives, if sound is enabled on Active.
          </Hint>

          <p className="text-center text-[14px] text-slate-500 pt-1">
            Accepted a request?{" "}
            <Link href="/provider/active" className="font-bold text-brand-700 underline underline-offset-2">
              Find it in Active.
            </Link>
          </p>
        </>
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
                className={`rounded-card border overflow-hidden ${
                  preferred
                    ? "bg-gradient-to-br from-rose-50 to-pink-50 border-rose-200 ring-2 ring-rose-100"
                    : "bg-white border-slate-100"
                }`}
              >
                {preferred && customer && (
                  <div className="px-4 py-2.5 bg-rose-600 text-white flex items-center gap-2.5 text-[13px]">
                    {customer.avatar_url ? (
                      <img src={customer.avatar_url} className="w-6 h-6 rounded-full ring-2 ring-white shrink-0" alt="" />
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-rose-700 ring-2 ring-white flex items-center justify-center text-[12px] font-bold shrink-0">
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
                      <div className="text-[18px] font-extrabold text-slate-900">{service?.title}</div>
                      <div className="text-[13px] text-slate-500 mt-1 line-clamp-2">{service?.blurb}</div>
                    </div>
                    <span className={`text-[12px] font-bold uppercase tracking-wide px-2 py-1 rounded-full shrink-0 ${
                      preferred ? "text-rose-700 bg-white" : "text-amber-700 bg-amber-50"
                    }`}>
                      {preferred ? "Exclusive 2 min" : "Live"}
                    </span>
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-2 text-[13px]">
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
                      <dl className="mt-3 rounded-field bg-brand-50/70 border border-brand-100 p-2.5 space-y-1">
                        {brief.map((b) => (
                          <div key={b.label} className="flex items-start gap-2 text-[13px]">
                            <dt className="text-brand-900/70 shrink-0 min-w-[7rem]">{b.label}</dt>
                            <dd className="text-brand-950 font-medium min-w-0">{b.value}</dd>
                          </div>
                        ))}
                      </dl>
                    );
                  })()}
                  {req.notes && (
                    <div className="mt-3 text-[13px] text-slate-600 bg-slate-50 rounded-field p-2.5">
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
      <div className="text-[12px] font-semibold text-slate-500 uppercase tracking-wide inline-flex items-center gap-1">
        {icon} {label}
      </div>
      <div className="text-[13px] text-slate-900 mt-0.5">{value}</div>
    </div>
  );
}
