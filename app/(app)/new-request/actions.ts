"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";
import { createSeriesAction } from "@/app/(app)/bookings/series/actions";

type State = { error?: string; success?: string } | undefined;

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
