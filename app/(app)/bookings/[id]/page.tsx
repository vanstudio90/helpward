import { createSupabaseServerClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, MessageSquare, Phone, Star, MapPin, Calendar, AlertOctagon,
  CheckCircle2,
} from "lucide-react";
import { ServiceIcon } from "@/components/ServiceIcon";
import { MapBackdrop } from "@/components/MapBackdrop";
import { LiveProviderMap } from "@/components/LiveProviderMap";
import { CancelBookingButton } from "./cancel-button";
import { TipCard } from "./tip-card";
import { ClientDateTime } from "@/components/ClientDateTime";

const STATUS_TONE: Record<string, string> = {
  scheduled: "bg-brand-50 text-brand-700",
  in_progress: "bg-emerald-50 text-emerald-700",
  completed: "bg-emerald-50 text-emerald-700",
  cancelled: "bg-rose-50 text-rose-700",
  disputed: "bg-amber-50 text-amber-700",
};

export default async function BookingDetailPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: b } = await supabase
    .from("bookings")
    .select(`
      *,
      service:services(id, title, image_url),
      provider:provider_profiles!bookings_provider_id_fkey(
        user_id, rating_avg,
        profile:profiles!provider_profiles_user_id_fkey(full_name, avatar_url, phone)
      ),
      request:requests(
        pickup:addresses!requests_pickup_address_id_fkey(formatted)
      ),
      conversation:conversations(id),
      review:reviews(id, rating)
    `)
    .eq("id", id)
    .single();

  if (!b) notFound();

  const provider = (b as { provider: { user_id: string; rating_avg: number | null; profile: { full_name: string; avatar_url: string | null; phone: string | null } | null } | null }).provider;
  const service = (b as { service: { title: string; image_url: string | null } | null }).service;
  const pickup = (b as { request: { pickup: { formatted: string } | null } | null }).request?.pickup;
  const convo = (b as { conversation: { id: string }[] | null }).conversation?.[0];
  const review = (b as { review: { id: string; rating: number }[] | null }).review?.[0];

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-5 lg:py-8 max-w-3xl mx-auto pb-12">
      <Link href="/bookings" className="inline-flex items-center gap-1 text-sm text-slate-500 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to bookings
      </Link>

      <div className="rounded-2xl bg-white border border-slate-100 overflow-hidden">
        {service?.image_url && (
          <div className="relative h-40 bg-slate-100">
            <img src={service.image_url} alt="" className="w-full h-full object-cover" />
            <span className={`absolute top-3 right-3 inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_TONE[b.status]}`}>
              {b.status === "in_progress" ? "In progress" : b.status[0].toUpperCase() + b.status.slice(1)}
            </span>
          </div>
        )}

        <div className="p-5 space-y-5">
          <div>
            <h1 className="text-xl font-bold text-slate-900">{service?.title}</h1>
            <div className="text-xs text-slate-500 mt-0.5">Booking #{b.id.slice(0, 8)}</div>
          </div>

          {/* Provider */}
          {provider && (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50">
              {provider.profile?.avatar_url ? (
                <Link href={`/providers/${provider.user_id}`}>
                  <img src={provider.profile.avatar_url} className="w-12 h-12 rounded-full" alt="" />
                </Link>
              ) : (
                <div className="w-12 h-12 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 font-bold">
                  {provider.profile?.full_name?.[0] ?? "?"}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <Link href={`/providers/${provider.user_id}`} className="text-sm font-bold text-slate-900 truncate hover:underline">
                  {provider.profile?.full_name}
                </Link>
                {provider.rating_avg && (
                  <div className="text-xs text-brand-700 font-semibold">★ {provider.rating_avg}</div>
                )}
              </div>
              {convo && (
                <Link href={`/messages/${convo.id}`} aria-label="Message" className="p-2 rounded-lg border border-brand-200 text-brand-700">
                  <MessageSquare className="w-4 h-4" />
                </Link>
              )}
              <a href={`tel:${provider.profile?.phone ?? ""}`} aria-label="Call" className="p-2 rounded-lg border border-brand-200 text-brand-700">
                <Phone className="w-4 h-4" />
              </a>
            </div>
          )}

          {/* Pickup / Drop-off */}
          {pickup && (
            <div>
              <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Address</div>
              <div className="text-sm text-slate-900 inline-flex items-center gap-2">
                <MapPin className="w-4 h-4 text-brand-600" /> {pickup.formatted}
              </div>
            </div>
          )}

          {/* Schedule */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-slate-50 p-3">
              <div className="text-[11px] font-semibold text-slate-500 flex items-center gap-1.5 uppercase tracking-wide"><Calendar className="w-3 h-3" />Scheduled</div>
              <div className="font-semibold text-slate-900 mt-1">
                <ClientDateTime iso={b.scheduled_for} />
              </div>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{b.completed_at ? "Completed" : "Created"}</div>
              <div className="font-semibold text-slate-900 mt-1">
                <ClientDateTime iso={b.completed_at ?? b.created_at} />
              </div>
            </div>
          </div>

          {/* Payment */}
          <div className="border-t border-slate-100 pt-4">
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Payment</div>
            <dl className="text-sm space-y-1.5">
              <div className="flex justify-between"><dt className="text-slate-500">Base</dt><dd className="font-medium">${(b.base_price_cents / 100).toFixed(2)}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Service fee</dt><dd className="font-medium">${(b.service_fee_cents / 100).toFixed(2)}</dd></div>
              {b.tip_cents > 0 && (
                <div className="flex justify-between"><dt className="text-slate-500">Tip</dt><dd className="font-medium">${(b.tip_cents / 100).toFixed(2)}</dd></div>
              )}
              <div className="flex justify-between pt-2 border-t border-slate-100">
                <dt className="text-base font-bold text-slate-900">Total</dt>
                <dd className="text-base font-bold text-slate-900">${(b.total_cents / 100).toFixed(2)} {b.currency}</dd>
              </div>
              <div className="text-[11px] text-slate-400 pt-1">
                Payment {b.payment_status} {b.stripe_payment_intent_id ? `(${b.stripe_payment_intent_id.slice(0, 14)}…)` : "(pending Stripe wiring)"}
              </div>
            </dl>
          </div>

          {/* Live tracking (if in_progress) */}
          {b.status === "in_progress" && provider && (
            <div>
              <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Live tracking</div>
              <LiveProviderMap
                providerId={provider.user_id}
                providerAvatar={provider.profile?.avatar_url ?? null}
                providerInitial={provider.profile?.full_name?.[0] ?? "?"}
              />
            </div>
          )}

          {/* Tip card — only after completion */}
          {b.status === "completed" && provider && (
            <TipCard
              bookingId={b.id}
              basePriceCents={b.base_price_cents}
              currentTipCents={b.tip_cents ?? 0}
              currency={b.currency}
              helperName={provider.profile?.full_name?.split(" ")[0] ?? "your helper"}
            />
          )}

          {/* CTAs */}
          <div className="space-y-2 pt-2">
            {b.status === "completed" && !review && (
              <Link href={`/bookings/${b.id}/rate`} className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-brand-600 text-white text-sm font-semibold">
                <Star className="w-4 h-4" /> Rate this task
              </Link>
            )}
            {b.status === "completed" && review && (
              <div className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-50 text-emerald-700 text-sm font-semibold">
                <CheckCircle2 className="w-4 h-4" /> You rated this {review.rating}/5
              </div>
            )}
            {(b.status === "scheduled" || b.status === "in_progress") && (
              <>
                <Link href={`/bookings/${b.id}/dispute`} className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl border border-amber-200 text-amber-700 text-sm font-semibold">
                  <AlertOctagon className="w-4 h-4" /> Report an issue
                </Link>
                <CancelBookingButton bookingId={b.id} />
              </>
            )}
            {b.status === "completed" && (
              <Link href={`/bookings/${b.id}/dispute`} className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl border border-rose-200 text-rose-700 text-sm font-semibold">
                <AlertOctagon className="w-4 h-4" /> Open dispute
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
