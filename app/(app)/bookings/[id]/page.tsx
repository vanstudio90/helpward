import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, MessageSquare, Phone, Star, MapPin, Calendar, AlertOctagon,
  CheckCircle2, Camera,
} from "lucide-react";
import { ServiceIcon } from "@/components/ServiceIcon";
import { MapBackdrop } from "@/components/MapBackdrop";
import { LiveProviderMap } from "@/components/LiveProviderMap";
import { CancelBookingButton } from "./cancel-button";
import { TipCard } from "./tip-card";
import { ClientDateTime } from "@/components/ClientDateTime";
import { FavoriteHelperButton } from "@/components/FavoriteHelperButton";
import { PortfolioRevokeButton, PortfolioBadge } from "./portfolio-revoke";
import { BookingDetailRealtimeRefresh } from "./realtime-refresh";

export const dynamic = "force-dynamic";

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
        user_id, slug, rating_avg,
        profile:profiles!provider_profiles_user_id_fkey(full_name, avatar_url, phone)
      ),
      request:requests(
        id, is_bundle, bundle_item_count,
        pickup:addresses!requests_pickup_address_id_fkey(formatted)
      ),
      conversation:conversations(id),
      review:reviews(id, rating)
    `)
    .eq("id", id)
    .single();

  if (!b) notFound();

  const provider = (b as { provider: { user_id: string; slug: string | null; rating_avg: number | null; profile: { full_name: string; avatar_url: string | null; phone: string | null } | null } | null }).provider;
  const providerHref = provider ? `/providers/${provider.slug ?? provider.user_id}` : null;
  const service = (b as { service: { title: string; image_url: string | null } | null }).service;
  const request = (b as { request: { id: string; is_bundle: boolean; bundle_item_count: number | null; pickup: { formatted: string } | null } | null }).request;
  const pickup = request?.pickup;
  const convo = (b as { conversation: { id: string }[] | null }).conversation?.[0];
  const review = (b as { review: { id: string; rating: number }[] | null }).review?.[0];

  // Pull bundle items if this booking is for a bundled request. RLS lets
  // the booking's owner read items (via the parent request's customer_id).
  let bundleItems: Array<{
    id: string; position: number; status: string; notes: string | null;
    item_price_cents: number; service: { title: string } | null;
  }> = [];
  if (request?.is_bundle) {
    const { data } = await supabase
      .from("request_bundle_items")
      .select("id, position, status, notes, item_price_cents, service:services(title)")
      .eq("request_id", request.id)
      .order("position");
    bundleItems = (data ?? []) as unknown as typeof bundleItems;
  }

  // Has the viewer already favourited this booking's helper? Drives the
  // initial state of the heart on the helper row + the post-completion
  // save-as-favorite prompt so neither flickers.
  const { data: { user } } = await supabase.auth.getUser();
  let helperIsFavorited = false;
  if (user && provider?.user_id) {
    const { data: fav } = await supabase
      .from("favorites")
      .select("user_id")
      .eq("user_id", user.id)
      .eq("kind", "provider")
      .eq("target_id", provider.user_id)
      .maybeSingle();
    helperIsFavorited = !!fav;
  }

  // Proof-of-completion photos uploaded by the helper. Shown to the customer
  // for any booking that has them — typically once the task hits in_progress
  // or completed. Bucket is private; signed URLs minted with service role.
  let completionPhotos: Array<{ id: string; url: string; caption: string | null; created_at: string; isPortfolio: boolean }> = [];
  {
    const { data: photoRows } = await supabase
      .from("booking_completion_photos")
      .select("id, storage_path, caption, created_at, is_portfolio")
      .eq("booking_id", id)
      .order("created_at", { ascending: true });
    const rows = (photoRows as Array<{ id: string; storage_path: string; caption: string | null; created_at: string; is_portfolio: boolean }> | null) ?? [];
    if (rows.length > 0) {
      const svc = createSupabaseServiceClient();
      const { data: signed } = await svc.storage
        .from("booking-photos")
        .createSignedUrls(rows.map((r) => r.storage_path), 3600);
      const urlByPath = new Map((signed ?? []).map((s) => [s.path ?? "", s.signedUrl ?? ""] as const));
      completionPhotos = rows
        .map((r) => ({
          id: r.id,
          url: urlByPath.get(r.storage_path) || "",
          caption: r.caption,
          created_at: r.created_at,
          isPortfolio: r.is_portfolio,
        }))
        .filter((p) => p.url);
    }
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-5 lg:py-8 max-w-3xl mx-auto pb-12">
      <BookingDetailRealtimeRefresh bookingId={b.id} />
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
                <Link href={providerHref!}>
                  <img src={provider.profile.avatar_url} className="w-12 h-12 rounded-full" alt="" />
                </Link>
              ) : (
                <div className="w-12 h-12 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 font-bold">
                  {provider.profile?.full_name?.[0] ?? "?"}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <Link href={providerHref!} className="text-sm font-bold text-slate-900 truncate hover:underline">
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
              <FavoriteHelperButton
                helperId={provider.user_id}
                initialSaved={helperIsFavorited}
                isAuthed={!!user}
                signupNext={`/bookings/${b.id}`}
                size="sm"
              />
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

          {/* Bundle items — shown only for multi-task bundles */}
          {bundleItems.length > 0 && (
            <div className="border-t border-slate-100 pt-4">
              <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Calendar className="w-3 h-3" /> {bundleItems.length}-stop bundle
              </div>
              <ol className="space-y-2">
                {bundleItems.map((it) => (
                  <li key={it.id} className="flex items-start gap-3 rounded-xl bg-slate-50 p-3">
                    <span className={
                      it.status === "completed"
                        ? "w-6 h-6 rounded-full bg-emerald-600 text-white text-xs font-bold inline-flex items-center justify-center shrink-0"
                        : it.status === "in_progress"
                        ? "w-6 h-6 rounded-full bg-amber-500 text-white text-xs font-bold inline-flex items-center justify-center shrink-0 animate-pulse"
                        : "w-6 h-6 rounded-full bg-white border border-slate-300 text-slate-500 text-xs font-bold inline-flex items-center justify-center shrink-0"
                    }>
                      {it.status === "completed" ? <CheckCircle2 className="w-3 h-3" /> : it.position}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold text-slate-900">{it.service?.title ?? "Stop"}</div>
                      {it.notes && <div className="text-xs text-slate-500 mt-0.5 leading-snug">{it.notes}</div>}
                    </div>
                    <div className="text-xs font-semibold text-slate-700 tabular-nums shrink-0">
                      ${(it.item_price_cents / 100).toFixed(2)}
                    </div>
                  </li>
                ))}
              </ol>
              <p className="text-[11px] text-slate-500 mt-2 leading-snug">
                One helper, one trip. Your helper marks each stop done as they go.
              </p>
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

          {/* Proof photos uploaded by the helper. Shown for any booking with
              attached photos so the customer can see in-progress evidence
              (e.g. front porch) and post-completion proof side by side. */}
          {completionPhotos.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-2 inline-flex items-center gap-1.5">
                <Camera className="w-3 h-3" /> Proof photos from your helper
              </div>
              <div className="grid grid-cols-3 gap-2">
                {completionPhotos.map((p) => (
                  <div key={p.id} className="space-y-1">
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noopener"
                      className="relative aspect-square rounded-lg overflow-hidden bg-slate-100 group block"
                    >
                      <img src={p.url} alt={p.caption ?? "Proof of completion"} className="w-full h-full object-cover transition group-hover:scale-105" />
                      {p.isPortfolio && <PortfolioBadge />}
                      {p.caption && (
                        <div className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[10px] px-1.5 py-1 leading-tight line-clamp-2">
                          {p.caption}
                        </div>
                      )}
                    </a>
                    {p.isPortfolio && <PortfolioRevokeButton photoId={p.id} />}
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-slate-500 mt-2 leading-snug">
                Tap a photo to view full-size. If anything looks wrong, you have 24 hours to
                <Link href={`/bookings/${b.id}/dispute`} className="text-rose-600 font-semibold underline ml-1">open a dispute</Link>.
              </p>
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
