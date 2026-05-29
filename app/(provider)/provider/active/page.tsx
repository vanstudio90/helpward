import { createSupabaseServerClient } from "@/lib/supabase/server";
import { MapBackdrop } from "@/components/MapBackdrop";
import { Activity, MessageSquare, Phone, CheckCircle2, Play } from "lucide-react";
import { OnlineToggle, BookingActions } from "./client";
import { ClientDateTime } from "@/components/ClientDateTime";
import { BundleChecklist, type BundleChecklistItem } from "./bundle-checklist";

export default async function ProviderActivePage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: pp } = await supabase
    .from("provider_profiles")
    .select("is_online, current_location, status")
    .eq("user_id", user.id)
    .single();

  // Find any current scheduled or in_progress booking for this provider
  const { data: bookings } = await supabase
    .from("bookings")
    .select(`
      id, status, scheduled_for, started_at, total_cents, payout_cents, currency, request_id,
      service:services(title, image_url),
      customer:profiles!bookings_customer_id_fkey(full_name, avatar_url, phone),
      pickup_addr:requests!bookings_request_id_fkey(
        id, is_bundle,
        pickup:addresses!requests_pickup_address_id_fkey(formatted)
      )
    `)
    .in("status", ["scheduled", "in_progress"])
    .order("created_at", { ascending: false })
    .limit(1);

  const booking = (bookings as Array<{ id: string; status: string; scheduled_for: string | null; started_at: string | null; total_cents: number; payout_cents: number; currency: string; request_id: string; service: { title: string; image_url: string | null }; customer: { full_name: string; avatar_url: string | null; phone: string | null }; pickup_addr: { id: string; is_bundle: boolean | null; pickup: { formatted: string } | null } | null }> | null)?.[0] ?? null;

  // If the booking's parent request is a bundle, pull the child stops so the
  // helper sees a tap-to-advance checklist for each task in the trip.
  let bundleItems: BundleChecklistItem[] = [];
  if (booking?.pickup_addr?.is_bundle && booking.request_id) {
    const { data: rows } = await supabase
      .from("request_bundle_items")
      .select("id, position, notes, item_price_cents, status, service:services(title)")
      .eq("request_id", booking.request_id)
      .order("position", { ascending: true });
    bundleItems = ((rows as Array<{ id: string; position: number; notes: string | null; item_price_cents: number; status: BundleChecklistItem["status"]; service: { title: string } | null }> | null) ?? []).map((r) => ({
      id: r.id,
      position: r.position,
      title: r.service?.title ?? "Task",
      notes: r.notes,
      itemPriceCents: r.item_price_cents,
      status: r.status,
    }));
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-3xl mx-auto">
      <div className="flex items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 flex items-center gap-2">
            <Activity className="w-6 h-6 text-emerald-600" />
            Active task
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {pp?.status === "approved"
              ? "Toggle yourself online to start receiving task offers."
              : "Finish onboarding to unlock task offers."}
          </p>
        </div>
        {pp?.status === "approved" && <OnlineToggle initialOnline={pp?.is_online ?? false} />}
      </div>

      {!booking ? (
        <div className="rounded-2xl bg-white border border-slate-100 p-8 sm:p-12 text-center">
          <span className="inline-flex w-14 h-14 rounded-2xl bg-slate-50 items-center justify-center mb-3">
            <Activity className="w-7 h-7 text-slate-400" />
          </span>
          <h2 className="text-lg font-bold text-slate-900">No active task</h2>
          <p className="mt-1 text-sm text-slate-500 max-w-sm mx-auto">
            {pp?.is_online
              ? "Waiting for an offer. Check your inbox for new task requests as they come in."
              : "You're currently offline. Toggle yourself online above to start receiving requests."}
          </p>
        </div>
      ) : (
        <div className="rounded-2xl bg-white border border-slate-100 overflow-hidden">
          {booking.service?.image_url && (
            <div className="h-40 bg-slate-100 relative">
              <img src={booking.service.image_url} alt="" className="w-full h-full object-cover" />
              <span className={`absolute top-3 right-3 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
                booking.status === "in_progress" ? "bg-emerald-50 text-emerald-700" : "bg-brand-50 text-brand-700"
              }`}>
                {booking.status === "in_progress" ? "In progress" : "Scheduled"}
              </span>
            </div>
          )}
          <div className="p-5 space-y-5">
            <div>
              <div className="text-base font-bold text-slate-900">{booking.service?.title}</div>
              <div className="text-xs text-slate-500 mt-0.5">
                Payout: ${(booking.payout_cents / 100).toFixed(2)} {booking.currency}
                {" · "}Customer pays ${(booking.total_cents / 100).toFixed(2)}
              </div>
            </div>

            <div className="flex items-center gap-3">
              {booking.customer?.avatar_url ? (
                <img src={booking.customer.avatar_url} className="w-12 h-12 rounded-full" alt="" />
              ) : (
                <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-500">
                  {booking.customer?.full_name?.[0] ?? "?"}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-slate-900 truncate">{booking.customer?.full_name ?? "Customer"}</div>
                <div className="text-xs text-slate-500">Customer · {booking.customer?.phone ?? "no phone"}</div>
              </div>
              <button aria-label="Call" className="p-2 rounded-lg border border-brand-200 text-brand-700">
                <Phone className="w-4 h-4" />
              </button>
              <a href="/provider/messages" aria-label="Message" className="p-2 rounded-lg border border-brand-200 text-brand-700">
                <MessageSquare className="w-4 h-4" />
              </a>
            </div>

            <div className="rounded-xl bg-slate-50 p-3 text-sm">
              <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Pickup</div>
              <div className="text-slate-900 mt-0.5">{booking.pickup_addr?.pickup?.formatted ?? "—"}</div>
              <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mt-2">When</div>
              <div className="text-slate-900 mt-0.5">
                {booking.scheduled_for ? <ClientDateTime iso={booking.scheduled_for} /> : "ASAP"}
              </div>
            </div>

            {bundleItems.length > 0 && (
              <BundleChecklist items={bundleItems} />
            )}

            <div className="relative rounded-xl overflow-hidden h-44 bg-slate-100">
              <MapBackdrop />
            </div>

            <BookingActions bookingId={booking.id} status={booking.status} />
          </div>
        </div>
      )}
    </div>
  );
}
