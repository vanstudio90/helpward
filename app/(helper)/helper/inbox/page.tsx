import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { one } from "@/lib/supabase/relation";
import { payoutFromEstimateCents, dollars } from "@/lib/pricing";
import { describeHandover, handoverFor } from "@/lib/handover";
import {
  Inbox, MapPin, Clock, DollarSign, Heart, ListChecks, Calendar, Volume2,
} from "lucide-react";
import {
  PageHeader, Card, Action, EmptyState, Hint,
} from "@/components/ui/kit";
import { cn } from "@/lib/cn";
import { InboxRow } from "./row";
import { ClientDateTime } from "@/components/ClientDateTime";
import { HelperInboxRealtimeRefresh } from "./realtime-refresh";

export const dynamic = "force-dynamic";

/** The offer row's embedded request, as the page actually uses it. */
/*
  One row of `my_offers()` — flat, and deliberately narrow.

  No `intake`, no address id, no notes, no destination, no recipient.
  The brief is `offer_summary`, which the server computed with
  describeIntake(forOffer) when the request was created.
*/
type OfferRow = {
  attempt_id: string;
  request_id: string;
  notified_at: string | null;
  preferred: boolean;
  distance_km: number | null;
  rank_score: number | null;
  service_id: string | null;
  service_title: string | null;
  service_blurb: string | null;
  service_image_url: string | null;
  service_eta_label: string | null;
  status: string;
  scheduled_for: string | null;
  is_bundle: boolean;
  bundle_item_count: number | null;
  // The approximate area (0048), not the address.
  pickup_city: string | null;
  pickup_region: string | null;
  estimated_price_cents: number | null;
  customer_name: string | null;
  customer_avatar_url: string | null;
  offer_summary: Array<{ label: string; value: string; withheld?: boolean }> | null;
  handover_details: unknown;
};

export default async function HelperInboxPage() {
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
  /*
    THE OFFER PAYLOAD COMES FROM THE SERVER, NOT FROM THE REQUEST ROW.

    This used to embed `requests(... intake ...)` and withhold the
    sensitive answers while rendering them. That withheld nothing: the
    row was readable over PostgREST with a helper token, so every
    candidate could read the destination the screen labelled "shared
    once you accept".

    `my_offers()` (0084) returns approved columns only — service, area,
    schedule, the pre-computed brief and the payout. There is no
    `intake` in it to leak, which is also why old requests are safe:
    their private answers are still in that column and this never asks
    for it.
  */
  const { data } = await supabase.rpc("my_offers");

  const offers = (data ?? []) as OfferRow[];

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
        <HelperInboxRealtimeRefresh userId={user.id} inline />
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
            <Action href="/helper/profile" icon={ListChecks} trailingChevron>Manage my services</Action>
            <Action href="/helper/schedule" icon={Calendar} variant="quiet">View availability</Action>
          </EmptyState>

          <Hint icon={Volume2}>
            <strong className="font-bold text-slate-800">Keep an ear out.</strong>{" "}
            You&rsquo;ll hear a ping when a new offer arrives, if sound is enabled on Active.
          </Hint>

          <p className="text-center text-[14px] text-slate-500 pt-1">
            Accepted a request?{" "}
            <Link href="/helper/active" className="font-bold text-brand-700 underline underline-offset-2">
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
            // Shaped back into the objects this markup already reads,
            // so the change is the DATA SOURCE and not the layout.
            const req = {
              id: row.request_id,
              status: row.status,
              scheduled_for: row.scheduled_for,
              estimated_price_cents: row.estimated_price_cents,
              pickup_city: row.pickup_city,
              pickup_region: row.pickup_region,
              // There is no `notes` in an offer any more: free text the
              // customer wrote for their helper is not something to hand
              // to every candidate.
              notes: null as string | null,
            };
            const preferred = row.preferred;
            const service = row.service_id
              ? {
                  id: row.service_id,
                  title: row.service_title ?? "",
                  blurb: row.service_blurb,
                  eta_label: row.service_eta_label,
                  image_url: row.service_image_url,
                }
              : null;
            const customer = row.customer_name
              ? { full_name: row.customer_name, avatar_url: row.customer_avatar_url }
              : null;
            return (
              <li
                key={row.attempt_id}
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
                    /*
                      The brief as the SERVER approved it.

                      Computed by describeIntake(forOffer) at creation and
                      stored on the request, so this screen renders what
                      it was given rather than deciding what to hide. An
                      older request has none, and shows none.
                    */
                    const brief = row.offer_summary ?? [];
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
                  {(() => {
                    /*
                      WHAT A CANDIDATE NEEDS TO JUDGE THE JOB.

                      Only the shareable half exists on the request —
                      stairs, parking, which handover method. The meeting
                      point and the recipient are in
                      request_private_details, which this helper's policy
                      does not open until they are assigned. Nothing is
                      filtered here; there is nothing to filter.
                    */
                    const spec = handoverFor(service?.id ?? "");
                    if (!spec) return null;
                    const lines = describeHandover(service?.id ?? "", row.handover_details ?? null);
                    if (lines.length === 0) return null;
                    return (
                      <dl className="mt-3 rounded-field bg-indigo-50/70 border border-indigo-100 p-2.5 space-y-1">
                        <div className="text-[12px] font-semibold text-indigo-900/70 uppercase tracking-wide">
                          {spec.label}
                        </div>
                        {lines.map((b) => (
                          <div key={b.section + b.label} className="flex items-start gap-2 text-[13px]">
                            <dt className="text-indigo-900/70 shrink-0 min-w-[7rem]">{b.label}</dt>
                            <dd className="text-indigo-950 font-medium min-w-0">{b.value}</dd>
                          </div>
                        ))}
                        <div className="text-[12px] text-indigo-900/60 pt-1">
                          Exact meeting point and contact details are shared once you accept.
                        </div>
                      </dl>
                    );
                  })()}
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
