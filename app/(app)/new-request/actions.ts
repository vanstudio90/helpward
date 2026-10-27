"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";
import { createSeriesAction } from "@/app/(app)/bookings/series/actions";
import { MAX_BUNDLE_ITEMS } from "@/lib/bundle-pure";
import { quoteOneShotCents, quoteBundleCents } from "@/lib/pricing";
import { collectSubmitted, type SubmittedValues } from "@/lib/request-form";
import { resolveDispatchableAddress, insertAttestedAddress } from "@/lib/dispatch-guard";
import { broadcastRequestBestEffort } from "@/lib/broadcast";
import { reviewResolution } from "@/lib/address-confirmation";
import { validateIntake, type IntakeValues } from "@/lib/service-intake";

/**
 * Pull the intake answers off the form. Checkbox groups arrive as repeated
 * keys, so they are collected as arrays; everything else is a single value.
 */
function collectIntake(formData: FormData): IntakeValues {
  const out: IntakeValues = {};
  for (const [name, value] of formData.entries()) {
    if (!name.startsWith("intake_")) continue;
    const key = name.slice("intake_".length);
    const v = String(value);
    const existing = out[key];
    if (existing === undefined) out[key] = v;
    else if (Array.isArray(existing)) existing.push(v);
    else out[key] = [existing as string, v];
  }
  // A single checked box looks like a scalar; the spec says otherwise.
  return out;
}

/**
 * Turn a guard result that needs the customer into something the form can
 * render. The change notes are computed server-side so the client never
 * has to reason about what the geocoder did.
 */
function toAddressPrompt(
  guard: Extract<Awaited<ReturnType<typeof resolveDispatchableAddress>>, { candidates: unknown }>,
): AddressPrompt {
  const top = guard.candidates[0];
  return {
    mode: guard.code === "needs_selection" ? "needs_selection" : "needs_confirmation",
    typed: guard.typed,
    message: guard.error,
    candidates: guard.candidates.map((c) => ({
      formatted: c.formatted, lng: c.lng, lat: c.lat,
      city: c.city, region: c.region, postalCode: c.postalCode,
      country: c.country, confidence: c.confidence, token: c.token,
    })),
    changes: top ? reviewResolution(guard.typed, top.formatted).changes : [],
  };
}

export type AddressPrompt = {
  mode: "needs_confirmation" | "needs_selection";
  typed: string;
  message: string;
  candidates: Array<{
    formatted: string; lng: number; lat: number;
    city: string | null; region: string | null; postalCode: string | null;
    /** ISO alpha-2 of the resolved address — what the quote's currency follows. */
    country: string;
    confidence: "exact" | "high" | "medium" | "low" | null;
    token: string;
  }>;
  changes: Array<{ kind: string; from: string; to: string; significant: boolean; note: string }>;
};

type State = {
  error?: string;
  success?: string;
  /** The address needs the customer's eyes before we can dispatch to it. */
  addressPrompt?: AddressPrompt;
  /** Present on every non-success result. See SubmittedValues. */
  submitted?: SubmittedValues;
} | undefined;

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
   Marks the request 'matching' and calls broadcast_request, which offers it
   to approved + online providers within the radius who list this service in
   provider_services. If no provider qualifies, the request stays in
   'matching' until the expire-stale-requests cron retires it. */
/**
 * Public entry point. Attaches the submitted values to every result that
 * is not a success, so the form can be refilled.
 *
 * A wrapper rather than a line at each `return`: this action has more than
 * a dozen failure exits, and the one that mattered — the address prompt —
 * is exactly the kind that gets missed.
 */
export async function createRequestAction(
  prev: State,
  formData: FormData,
): Promise<State> {
  const result = await createRequestActionInner(prev, formData);
  if (!result || result.success) return result;
  return { ...result, submitted: collectSubmitted(formData) };
}

async function createRequestActionInner(
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
  // Present only when the customer pressed "Use this address" on a
  // medium-confidence match. Signed by the server; see lib/address-token.
  const addressConfirmation = String(formData.get("address_confirmation") ?? "") || null;

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

  // Service-specific answers, checked against the spec server-side. The
  // form can be bypassed, and a helper accepting a job with half the brief
  // missing is exactly what this prevents.
  const intakeRaw = collectIntake(formData);
  const intakeCheck = validateIntake(serviceId, intakeRaw);
  if (!intakeCheck.ok) return { error: intakeCheck.error };
  const intake = intakeCheck.values;

  // Client-supplied coords come from the saved-address chips or the Use my
  // current location button. They are trusted as coordinates, but the guard
  // still reverse-geocodes them to learn the municipality for the
  // service-area check.
  const latRaw = String(formData.get("address_lat") ?? "");
  const lngRaw = String(formData.get("address_lng") ?? "");
  const clientLat = latRaw ? Number(latRaw) : null;
  const clientLng = lngRaw ? Number(lngRaw) : null;

  // Preferred helper — from the favorite-helper "Book again" flow.
  // Validate it's a real approved provider before persisting; if not, fall
  // through to the normal broadcast as if the param wasn't there.
  const preferredHelperRaw = String(formData.get("preferred_helper_id") ?? "").trim();
  let preferredHelperId: string | null = null;
  if (preferredHelperRaw && /^[0-9a-f-]{36}$/i.test(preferredHelperRaw)) {
    const { data: pp } = await supabase
      .from("provider_profiles")
      .select("user_id")
      .eq("user_id", preferredHelperRaw)
      .eq("status", "approved")
      .maybeSingle();
    if (pp) preferredHelperId = pp.user_id;
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

    // Geocode + service-area gate. Refuses rather than falling back to a
    // placeholder point, so a bundle can never be dispatched to an address
    // we could not verify or do not serve.
    const guard = await resolveDispatchableAddress({
      text: addressText, lat: clientLat, lng: clientLng, client: supabase,
      userId: user.id, confirmationToken: addressConfirmation,
    });
    if (!guard.ok) {
      // Bundles get the confirmation UI too. This used to return only
      // guard.error, so a multi-stop request whose address merely needed
      // confirming was refused outright with no way to confirm it.
      return "candidates" in guard
        ? { addressPrompt: toAddressPrompt(guard) }
        : { error: guard.error };
    }
    // Service client: geocode_verified is a server attestation and the
    // authenticated client is forbidden from setting it (migration 0036).
    const bundleAddr = await insertAttestedAddress(
      createSupabaseServiceClient(), guard.address, user.id);
    if (!bundleAddr.ok) return { error: bundleAddr.error };

    const itemsSubtotal = bundleItems.reduce((s, it) => s + (lookup.get(it.serviceId)?.base_price_cents ?? 0), 0);
    const totalCents = quoteBundleCents(itemsSubtotal);

    // Parent service_id = the first item's service. The matching engine
    // routes on the parent's service_id, so the bundle gets dispatched to
    // helpers who offer that category. Cross-category bundles in v2.
    const primaryServiceId = bundleItems[0].serviceId;
    const { data: parentRequest, error: parentErr } = await createSupabaseServiceClient()
      .from("requests")
      .insert({
        customer_id: user.id,
        service_id: primaryServiceId,
        pickup_address_id: bundleAddr.id,
        scheduled_for: scheduledFor,
        notes,
        estimated_price_cents: totalCents,
        estimated_duration_min: 30 * bundleItems.length, // rough — refine when we have real timing data
        status: "matching",
        is_bundle: true,
        bundle_item_count: bundleItems.length,
        preferred_helper_id: preferredHelperId,
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
    // Service client: bundle stops are a server-authored quote. Migration
    // 0036 rejects every non-service INSERT on request_bundle_items and
    // overwrites the price from the catalog, so writing these through the
    // caller's client would fail outright.
    const admin = createSupabaseServiceClient();
    const { error: itemsErr } = await admin.from("request_bundle_items").insert(itemRows);
    if (itemsErr) {
      // Don't leave the parent as a half-built bundle. Mark it cancelled.
      await admin.from("requests").update({ status: "cancelled" }).eq("id", parentRequest.id);
      return { error: "Couldn't save bundle stops: " + itemsErr.message };
    }

    // Freeze the quote the customer was shown. accept_request recomputes
    // this fingerprint and refuses if the bundle changed after offering.
    const { error: fpErr } = await admin.rpc("seal_bundle_quote", {
      p_request_id: parentRequest.id,
    });
    if (fpErr) {
      await admin.from("requests").update({ status: "cancelled" }).eq("id", parentRequest.id);
      return { error: "Couldn't finalise the bundle quote: " + fpErr.message };
    }

    // Broadcast just like a one-shot request.
    await broadcastRequestBestEffort(createSupabaseServiceClient(), parentRequest.id, { label: "bundle" });

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

  // Geocode + service-area gate. find_nearby_providers reads the resulting
  // POINT for proximity matching, so it must be a real coordinate — there
  // is no placeholder fallback any more.
  const guard = await resolveDispatchableAddress({
    text: addressText, lat: clientLat, lng: clientLng, client: supabase,
    userId: user.id, confirmationToken: addressConfirmation,
  });
  if (!guard.ok) {
    return "candidates" in guard
      ? { addressPrompt: toAddressPrompt(guard) }
      : { error: guard.error };
  }
  // Service client: see the bundle path above.
  const addr = await insertAttestedAddress(
    createSupabaseServiceClient(), guard.address, user.id);
  if (!addr.ok) return { error: addr.error };

  // The authoritative subtotal, from the same rules acceptance will use.
  // Computed in the DATABASE rather than here: a price this action
  // calculated would still be a price the server merely believed, and
  // accept_request has to arrive at the same number independently.
  const { data: pricedRow, error: priceErr } = await createSupabaseServiceClient()
    .rpc("price_service_cents", { p_service_id: serviceId, p_intake: intake });
  if (priceErr) return { error: "Could not price that request." };
  const pricedSubtotal = Number(pricedRow ?? service.base_price_cents);

  // Create the request
  const { data: request, error: reqErr } = await supabase
    .from("requests")
    .insert({
      customer_id: user.id,
      service_id: serviceId,
      pickup_address_id: addr.id,
      scheduled_for: scheduledFor,
      notes,
      // Includes the flat service fee so the saved estimate matches the
      // quote the customer was shown pre-submit (HW-03).
      // Priced from the customer's answers, not the flat catalog number.
      // Dog walking quoted $24.50 for both 30 minutes and eight hours
      // until this read the intake (migration 0053).
      estimated_price_cents: quoteOneShotCents(pricedSubtotal),
      // Duration comes from the brief when the service asks for one, so a
      // 4-hour companion booking is not quoted as a 45-minute job.
      estimated_duration_min: Number(intake.duration_min) || 45,
      status: "matching",
      intake,
      preferred_helper_id: preferredHelperId,
    })
    .select()
    .single();

  if (reqErr || !request) {
    return { error: "Couldn't create the request: " + (reqErr?.message ?? "unknown") };
  }

  // Seal the answers that set the price, BEFORE any helper is offered the
  // job. The price now depends on the customer's own intake, and
  // req_update (0002) lets them edit their own request — so without this,
  // "8 hours" could become "30 minutes" after a helper accepted an
  // eight-hour job, and acceptance would price the shorter one.
  //
  // Fatal, unlike the broadcast below: accept_request refuses an unsealed
  // request, so a request that reached helpers without a seal is one
  // nobody could ever accept.
  const { error: sealErr } = await createSupabaseServiceClient()
    .rpc("seal_request_quote", { p_request_id: request.id });
  if (sealErr) {
    await createSupabaseServiceClient()
      .from("requests")
      .update({ status: "cancelled" })
      .eq("id", request.id);
    console.error("could not seal request quote", request.id, sealErr);
    return { error: "Couldn't lock in that quote. Please try again." };
  }

  // Broadcast to nearby providers — runs as service role so it can insert
  // match_attempts + notifications on behalf of providers. Non-fatal: the
  // request exists, an admin can re-broadcast, and the expire-stale cron
  // retires it if no helper ever sees it.
  await broadcastRequestBestEffort(createSupabaseServiceClient(), request.id, { label: "one-shot" });

  revalidatePath("/dashboard", "page");
  revalidatePath("/bookings", "page");
  redirect(`/new-request/submitted/${request.id}`);
}
