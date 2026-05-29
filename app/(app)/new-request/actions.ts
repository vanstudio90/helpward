"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";
import { createSeriesAction } from "@/app/(app)/bookings/series/actions";
import {
  MAX_BUNDLE_ITEMS, BUNDLE_SERVICE_FEE_CENTS,
} from "@/lib/bundle-pure";

type State = { error?: string; success?: string } | undefined;

type BundleItemInput = {
  serviceId: string;
  notes: string;
};

// Parse the bundle payload off the form. The picker serialises items as a
// JSON blob in a single hidden field — keeps the form simple and avoids
// per-index name collisions like "items[0][serviceId]".
function parseBundleItems(formData: FormData): BundleItemInput[] | null {
  const raw = String(formData.get("bundle_items") ?? "");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed
      .map((it) => ({
        serviceId: typeof it?.serviceId === "string" ? it.serviceId : "",
        notes: typeof it?.notes === "string" ? it.notes.slice(0, 500) : "",
      }))
      .filter((it) => it.serviceId);
  } catch {
    return null;
  }
}

/* Create a request from the New Request form.
   For now (Phase 3 not done), we mark it 'matching' and the matching engine
   will pick it up in a later phase. */
export async function createRequestAction(
  _prev: State,
  formData: FormData
): Promise<State> {
  // Branch on the recurrence picker — if the user toggled "Repeat this task"
  // we route to createSeriesAction which writes a booking_series row and
  // materialises the first occurrence. Otherwise it's a one-shot request.
  if (formData.get("repeat_on") === "1") {
    const r = await createSeriesAction(undefined, formData);
    if (r?.error) return { error: r.error };
    if (r?.seriesId) redirect(`/bookings/series/${r.seriesId}`);
    return { error: "Couldn't create the series." };
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: "You must be logged in." };
  }

  const serviceId = String(formData.get("service_id") ?? "");
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const scheduledForRaw = String(formData.get("scheduled_for") ?? "").trim();
  const scheduledFor = scheduledForRaw ? new Date(scheduledForRaw).toISOString() : null;
  const addressText = String(formData.get("address") ?? "").trim();

  if (!serviceId) {
    return { error: "Please pick a service." };
  }
  if (!addressText) {
    return { error: "Please enter an address." };
  }
  if (addressText.length > 300) {
    return { error: "Address is too long (max 300 chars)." };
  }
  if (notes && notes.length > 1000) {
    return { error: "Notes are too long (max 1000 chars)." };
  }

  // Bundle path — when the picker has 2+ stops, we build a parent request
  // with is_bundle=true and insert one row per stop into request_bundle_items.
  // Validation: every stop must reference an active service; total capped at
  // MAX_BUNDLE_ITEMS to keep helper trips reasonable.
  const bundleItems = formData.get("is_bundle") === "1" ? parseBundleItems(formData) : null;
  if (bundleItems) {
    if (bundleItems.length < 2) return { error: "A bundle needs at least 2 stops." };
    if (bundleItems.length > MAX_BUNDLE_ITEMS) return { error: `Bundles are capped at ${MAX_BUNDLE_ITEMS} stops.` };

    // Pull every referenced service in one go + verify they're all active.
    const ids = Array.from(new Set(bundleItems.map((i) => i.serviceId)));
    const { data: svcs } = await supabase
      .from("services")
      .select("id, base_price_cents, active")
      .in("id", ids);
    const lookup = new Map((svcs ?? []).map((s) => [s.id, s]));
    for (const it of bundleItems) {
      const s = lookup.get(it.serviceId);
      if (!s || !s.active) return { error: `One of the stops references an unavailable service.` };
    }

    // Address row reuses the same fake-Vancouver POINT until Mapbox lands.
    const { data: bundleAddress, error: bundleAddrErr } = await supabase
      .from("addresses")
      .insert({
        user_id: user.id,
        formatted: addressText,
        location: "POINT(-123.1207 49.2827)" as unknown as string,
        country: "US",
      })
      .select()
      .single();
    if (bundleAddrErr || !bundleAddress) return { error: "Couldn't save the address." };

    const itemsSubtotal = bundleItems.reduce((s, it) => s + (lookup.get(it.serviceId)?.base_price_cents ?? 0), 0);
    const totalCents = itemsSubtotal + BUNDLE_SERVICE_FEE_CENTS;

    // Parent service_id = the first item's service. The matching engine
    // routes on the parent's service_id, so the bundle gets dispatched to
    // helpers who offer that category. Cross-category bundles in v2.
    const primaryServiceId = bundleItems[0].serviceId;
    const { data: parentRequest, error: parentErr } = await supabase
      .from("requests")
      .insert({
        customer_id: user.id,
        service_id: primaryServiceId,
        pickup_address_id: bundleAddress.id,
        scheduled_for: scheduledFor,
        notes,
        estimated_price_cents: totalCents,
        estimated_duration_min: 30 * bundleItems.length, // rough — refine when we have real timing data
        status: "matching",
        is_bundle: true,
        bundle_item_count: bundleItems.length,
      })
      .select()
      .single();
    if (parentErr || !parentRequest) {
      return { error: "Couldn't create the bundle: " + (parentErr?.message ?? "unknown") };
    }

    // Insert child items. If this fails partway, the parent request is now
    // an empty bundle — cron expires it as a stale matching request and the
    // customer can retry. Acceptable failure mode for v1.
    const itemRows = bundleItems.map((it, i) => ({
      request_id: parentRequest.id,
      position: i + 1,
      service_id: it.serviceId,
      notes: it.notes || null,
      item_price_cents: lookup.get(it.serviceId)?.base_price_cents ?? 0,
    }));
    const { error: itemsErr } = await supabase.from("request_bundle_items").insert(itemRows);
    if (itemsErr) {
      // Don't leave the parent as a half-built bundle. Mark it expired.
      await supabase.from("requests").update({ status: "cancelled" }).eq("id", parentRequest.id);
      return { error: "Couldn't save bundle stops: " + itemsErr.message };
    }

    // Broadcast just like a one-shot request.
    try {
      const admin = createSupabaseServiceClient();
      await admin.rpc("broadcast_request", { p_request_id: parentRequest.id, p_radius_km: 20 });
    } catch (e) {
      console.error("broadcast_request failed for bundle:", e);
    }

    revalidatePath("/dashboard", "page");
    revalidatePath("/bookings", "page");
    redirect(`/new-request/submitted/${parentRequest.id}`);
  }

  // Look up service to fill in estimated price + duration
  const { data: service, error: svcErr } = await supabase
    .from("services")
    .select("*")
    .eq("id", serviceId)
    .single();
  if (svcErr || !service) {
    return { error: "That service isn't available right now." };
  }

  // Create the address row (Phase: no geocoder yet — store text only, coords set later)
  // PostGIS REQUIRES a geography point, so we use Vancouver default for now.
  // TODO Phase 3: integrate Mapbox geocoding to convert addressText → real lat/lng.
  const { data: address, error: addrErr } = await supabase
    .from("addresses")
    .insert({
      user_id: user.id,
      formatted: addressText,
      location: "POINT(-123.1207 49.2827)" as unknown as string, // Vancouver downtown placeholder
      country: "US",
    })
    .select()
    .single();
  if (addrErr || !address) {
    return { error: "Couldn't save the address: " + (addrErr?.message ?? "unknown") };
  }

  // Create the request
  const { data: request, error: reqErr } = await supabase
    .from("requests")
    .insert({
      customer_id: user.id,
      service_id: serviceId,
      pickup_address_id: address.id,
      scheduled_for: scheduledFor,
      notes,
      estimated_price_cents: service.base_price_cents,
      estimated_duration_min: 45,
      status: "matching",
    })
    .select()
    .single();

  if (reqErr || !request) {
    return { error: "Couldn't create the request: " + (reqErr?.message ?? "unknown") };
  }

  // Broadcast to nearby providers — runs as service role so it can insert
  // match_attempts + notifications on behalf of providers.
  try {
    const admin = createSupabaseServiceClient();
    await admin.rpc("broadcast_request", { p_request_id: request.id, p_radius_km: 20 });
  } catch (e) {
    console.error("broadcast_request failed:", e);
    // Non-fatal — request is created, admin can manually re-broadcast
  }

  revalidatePath("/dashboard", "page");
  revalidatePath("/bookings", "page");
  redirect(`/new-request/submitted/${request.id}`);
}
