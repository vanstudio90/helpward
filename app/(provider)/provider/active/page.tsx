import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";
import { one } from "@/lib/supabase/relation";
import { describeIntake } from "@/lib/service-intake";
import { MapBackdrop } from "@/components/MapBackdrop";
import { Activity, MessageSquare, Phone, CheckCircle2, Play } from "lucide-react";
import { OnlineToggle, BookingActions } from "./client";
import { ClientDateTime } from "@/components/ClientDateTime";
import { BundleChecklist, type BundleChecklistItem } from "./bundle-checklist";
import { CompletionPhotos, type CompletionPhoto } from "./completion-photos";
import { ProviderActiveRealtimeRefresh } from "./realtime-refresh";

export const dynamic = "force-dynamic";

/** The active booking as PostgREST returns it, embeds unnormalised. */
type ActiveBookingRow = {
  id: string; status: string; scheduled_for: string | null; started_at: string | null;
  total_cents: number; payout_cents: number; currency: string; request_id: string;
  intake: Record<string, string | string[]> | null;
  payment_status: string;
  service?: { id: string; title: string; image_url: string | null }
          | Array<{ id: string; title: string; image_url: string | null }> | null;
  customer?: { full_name: string; avatar_url: string | null; phone: string | null }
           | Array<{ full_name: string; avatar_url: string | null; phone: string | null }> | null;
  pickup_addr?: { id: string; is_bundle: boolean | null; notes: string | null;
                  pickup: { formatted: string } | { formatted: string }[] | null }
              | Array<{ id: string; is_bundle: boolean | null; notes: string | null;
                  pickup: { formatted: string } | { formatted: string }[] | null }> | null;
};

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
      intake, payment_status,
      service:services(id, title, image_url),
      customer:profiles!bookings_customer_id_fkey(full_name, avatar_url, phone),
      pickup_addr:requests!bookings_request_id_fkey(
        id, is_bundle, notes,
        pickup:addresses!requests_pickup_address_id_fkey(formatted)
      )
    `)
    .in("status", ["scheduled", "in_progress"])
    .order("created_at", { ascending: false })
    .limit(1);

  // one() rather than a cast: PostgREST embeds a to-one relation as an
  // object and a to-many as an array, and the generated types do not
  // reliably say which. A wrong cast renders nothing and throws nothing.
  const bookingRow = one(bookings as ActiveBookingRow | ActiveBookingRow[] | null);
  const booking = bookingRow
    ? {
        ...bookingRow,
        service: one(bookingRow.service),
        customer: one(bookingRow.customer),
        pickup_addr: one(bookingRow.pickup_addr),
      }
    : null;

  // The brief the helper accepted on. It was shown at offer stage and then
  // disappeared the moment they took the job — duration, dog size, lead
  // location, access instructions, all of it — leaving them to work from
  // memory. It is carried on the booking by accept_request precisely so it
  // survives the request being tidied away.
  const brief = booking
    ? describeIntake(booking.service?.id ?? "", booking.intake)
    : [];
  const customerNotes = booking ? one(bookingRow!.pickup_addr)?.notes ?? null : null;

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

  // Pull proof-of-completion photos the helper has already uploaded so the
  // tile re-hydrates correctly between renders. Signed URLs are minted with
  // service role since the bucket is private — they expire in an hour which
  // is well past any active session.
  let completionPhotos: CompletionPhoto[] = [];
  if (booking?.status === "in_progress") {
    const { data: rows } = await supabase
      .from("booking_completion_photos")
      .select("id, storage_path, caption")
      .eq("booking_id", booking.id)
      .order("created_at", { ascending: true });
    const list = (rows as Array<{ id: string; storage_path: string; caption: string | null }> | null) ?? [];
    if (list.length > 0) {
      const svc = createSupabaseServiceClient();
      const { data: signed } = await svc.storage
        .from("booking-photos")
        .createSignedUrls(list.map((r) => r.storage_path), 3600);
      const urlByPath = new Map((signed ?? []).map((s) => [s.path ?? "", s.signedUrl ?? ""] as const));
      completionPhotos = list.map((r) => ({
        id: r.id,
        previewUrl: urlByPath.get(r.storage_path) || null,
        caption: r.caption,
      }));
    }
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-3xl mx-auto">
      <ProviderActiveRealtimeRefresh userId={user.id} />
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
              <div className="text-slate-900 mt-0.5">
                {one(booking.pickup_addr?.pickup)?.formatted ?? "—"}
              </div>
              <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mt-2">When</div>
              <div className="text-slate-900 mt-0.5">
                {booking.scheduled_for ? <ClientDateTime iso={booking.scheduled_for} /> : "ASAP"}
              </div>
            </div>

            {/* The brief, kept visible for the whole job.
                It was shown at offer stage and then vanished on
                acceptance, so a helper mid-task had no way to recheck the
                dog's size, the access code or where the lead is kept —
                exactly when they need it. accept_request copies intake
                onto the booking for this reason. */}
            {(brief.length > 0 || customerNotes) && (
              <div className="rounded-xl bg-amber-50/60 border border-amber-100 p-3 text-sm">
                <div className="text-[11px] font-semibold text-amber-800 uppercase tracking-wide">
                  The brief
                </div>
                {brief.length > 0 && (
                  <dl className="mt-1.5 space-y-1">
                    {brief.map((item) => (
                      <div key={item.label} className="flex gap-2 text-xs">
                        <dt className="text-slate-500 shrink-0">{item.label}</dt>
                        <dd className="text-slate-900 font-medium min-w-0">{item.value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                {customerNotes && (
                  <p className="mt-2 text-xs text-slate-700 whitespace-pre-wrap border-t border-amber-100 pt-2">
                    <span className="text-slate-500">Notes: </span>{customerNotes}
                  </p>
                )}
              </div>
            )}

            {bundleItems.length > 0 && (
              <BundleChecklist items={bundleItems} />
            )}

            <div className="relative rounded-xl overflow-hidden h-44 bg-slate-100">
              <MapBackdrop />
            </div>

            {booking.status === "in_progress" && (
              <CompletionPhotos bookingId={booking.id} initial={completionPhotos} />
            )}

            {/* Why Start is unavailable. start_booking refuses an
                unauthorized booking (migration 0043), and without this the
                helper got a bare error with no idea what to do about it —
                the answer being nothing: it is the customer's bank. */}
            {booking.payment_status === "pending" && booking.status === "scheduled" && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
                <span className="font-bold">Waiting on the customer&rsquo;s bank.</span>{" "}
                Their card needs confirming before you can start. We&rsquo;ve asked them —
                message them if it stays like this.
              </div>
            )}
            {booking.payment_status === "failed" && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-950">
                <span className="font-bold">This booking can&rsquo;t be paid for.</span>{" "}
                The customer&rsquo;s card was declined. Don&rsquo;t start work — contact support.
              </div>
            )}
            <BookingActions
              bookingId={booking.id}
              status={booking.status}
              paymentStatus={booking.payment_status}
            />
          </div>
        </div>
      )}
    </div>
  );
}
