"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type State = { error?: string; success?: string } | undefined;

/* Create a request from the New Request form.
   For now (Phase 3 not done), we mark it 'matching' and the matching engine
   will pick it up in a later phase. */
export async function createRequestAction(
  _prev: State,
  formData: FormData
): Promise<State> {
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

  revalidatePath("/dashboard", "page");
  revalidatePath("/bookings", "page");
  redirect(`/new-request/submitted/${request.id}`);
}
