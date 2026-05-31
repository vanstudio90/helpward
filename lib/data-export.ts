// Server-side data-export archive builder. Reads everything we hold about
// a user across the visible business tables, stitches it into one JSON blob,
// uploads to the private `data-exports` bucket, and returns the storage path
// + size. Cron at /api/cron/process-data-exports drives this for every
// pending row in data_export_requests.
//
// What's included: profile, customer + provider profile rows, addresses,
// requests, bookings, reviews (given + received), favorites, saved
// addresses, notification preferences, notifications, audit-log entries
// the user generated, message conversations + messages they're a party to.
//
// What's excluded for now (until we negotiate the right disclosure with
// counsel): Stripe payment-method details (we only store last4 anyway),
// staff-side dispute moderation notes, system-internal scoring fields.

import { createSupabaseServiceClient } from "@/lib/supabase/server";

export type ArchiveResult = {
  storagePath: string;
  bytes: number;
};

const EXPIRES_DAYS = 7;

export function exportExpiresAt(): string {
  return new Date(Date.now() + EXPIRES_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

// Build the JSON payload + upload it. Returns storagePath + bytes for the
// caller to persist on the data_export_requests row. Throws on error so the
// cron can capture the failure_reason.
export async function buildAndUploadArchive(
  userId: string,
  requestId: string,
): Promise<ArchiveResult> {
  const admin = createSupabaseServiceClient();

  // Pull each section in parallel — every query is RLS-bypass via service
  // role so we get the full set the user is entitled to. We don't filter
  // out anything beyond what the catalogue notes (no internal scoring).
  const [
    profileR, customerR, providerR, addressesR, savedAddressesR,
    requestsR, bookingsR, reviewsGivenR, reviewsReceivedR,
    favoritesR, prefsR, notificationsR, auditR,
    conversationsR,
  ] = await Promise.all([
    admin.from("profiles").select("*").eq("id", userId).maybeSingle(),
    admin.from("customers").select("*").eq("user_id", userId).maybeSingle(),
    admin.from("provider_profiles").select("*").eq("user_id", userId).maybeSingle(),
    admin.from("addresses").select("*").eq("user_id", userId),
    admin.from("saved_addresses").select("*").eq("user_id", userId),
    admin.from("requests").select("*").eq("customer_id", userId),
    admin.from("bookings").select("*").or(`customer_id.eq.${userId},provider_id.eq.${userId}`),
    admin.from("reviews").select("*").eq("customer_id", userId),
    admin.from("reviews").select("*").eq("provider_id", userId),
    admin.from("favorites").select("*").eq("user_id", userId),
    admin.from("notification_prefs").select("*").eq("user_id", userId).maybeSingle(),
    admin.from("notifications").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(2000),
    admin.from("audit_log").select("*").eq("actor_id", userId).order("created_at", { ascending: false }).limit(2000),
    admin.from("conversations").select("id, booking_id, customer_id, provider_id, created_at")
      .or(`customer_id.eq.${userId},provider_id.eq.${userId}`),
  ]);

  const conversationIds = (conversationsR.data ?? []).map((c) => c.id as string);
  let messages: unknown[] = [];
  if (conversationIds.length > 0) {
    const { data } = await admin
      .from("messages")
      .select("*")
      .in("conversation_id", conversationIds)
      .order("created_at", { ascending: true })
      .limit(10_000);
    messages = data ?? [];
  }

  const payload = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    export_request_id: requestId,
    user_id: userId,
    profile: profileR.data ?? null,
    customer: customerR.data ?? null,
    provider_profile: providerR.data ?? null,
    addresses: addressesR.data ?? [],
    saved_addresses: savedAddressesR.data ?? [],
    requests: requestsR.data ?? [],
    bookings: bookingsR.data ?? [],
    reviews_given: reviewsGivenR.data ?? [],
    reviews_received: reviewsReceivedR.data ?? [],
    favorites: favoritesR.data ?? [],
    notification_prefs: prefsR.data ?? null,
    notifications: notificationsR.data ?? [],
    audit_log: auditR.data ?? [],
    conversations: conversationsR.data ?? [],
    messages,
    notes: {
      excluded: [
        "Stripe payment-method full details (we only retain last4).",
        "Staff-side dispute moderation notes.",
        "Internal scoring + ranking fields used by the matching engine.",
      ],
      retention: `Archive expires ${EXPIRES_DAYS} days after generation; we delete the storage object then.`,
    },
  };

  const json = JSON.stringify(payload, null, 2);
  const bytes = new TextEncoder().encode(json);
  const storagePath = `${userId}/${requestId}.json`;

  const { error: upErr } = await admin.storage
    .from("data-exports")
    .upload(storagePath, bytes, { contentType: "application/json", upsert: true });
  if (upErr) {
    throw new Error("Storage upload failed: " + upErr.message);
  }

  return { storagePath, bytes: bytes.length };
}

// Mint a 7-day signed URL for an already-uploaded archive. Used by
// /settings/data when surfacing the download to the user.
export async function signArchiveUrl(storagePath: string, ttlSec = 7 * 24 * 60 * 60): Promise<string | null> {
  const admin = createSupabaseServiceClient();
  const { data, error } = await admin.storage
    .from("data-exports")
    .createSignedUrl(storagePath, ttlSec);
  if (error || !data) return null;
  return data.signedUrl;
}
