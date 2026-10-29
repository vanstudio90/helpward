import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { withBearerAuth } from "@/lib/api/bearer";
import { quoteOneShotCents } from "@/lib/pricing";
import { resolveDispatchableAddress, insertAttestedAddress } from "@/lib/dispatch-guard";
import { broadcastRequestBestEffort } from "@/lib/broadcast";
import { reviewResolution } from "@/lib/address-confirmation";
import { validateIntake, SERVICE_INTAKE, type IntakeValues } from "@/lib/service-intake";
import { resolveIntakeAddresses, applyResolvedAddresses } from "@/lib/intake-addresses";
import { checkTrip } from "@/lib/trip-limits";
import { resolveAddressStrict } from "@/lib/geocode";
import { sealIntakeCountry } from "@/lib/country-price";
import { checkVenue } from "@/lib/venue-gate";

/*
  Creating a request from the native app.

  This is deliberately a RE-USE of createRequestAction's one-shot path,
  not a reimplementation: the same guard, the same intake validation, the
  same trip check, the same country seal, the same database pricer, the
  same quote seal, the same broadcast — in the same order. Every one of
  those steps exists because something went wrong without it, and a
  second creation path that skipped any of them would re-open the hole.

  What it does NOT cover, on purpose:
    * bundles — BUNDLING_ENABLED is false and the app has no picker;
    * recurrence — a series is a different row and a different flow;
    * preferred helpers — the app has no "book again" entry point yet.
  Each would be a silent half-feature here, so each is simply absent.
*/

type Body = {
  serviceId?: string;
  address?: string;
  addressLat?: number | null;
  addressLng?: number | null;
  /** Signed server token from a previous needs_confirmation answer. */
  addressConfirmation?: string | null;
  scheduledFor?: string | null;
  notes?: string | null;
  intake?: Record<string, string | string[]>;
};

export const POST = withBearerAuth(async ({ user, supabase }, request) => {
  let body: Body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const serviceId = String(body.serviceId ?? "").trim();
  const addressText = String(body.address ?? "").trim();
  const notes = (body.notes ?? "")?.toString().trim() || null;
  const scheduledForRaw = (body.scheduledFor ?? "")?.toString().trim();
  const scheduledFor = scheduledForRaw ? new Date(scheduledForRaw).toISOString() : null;
  const addressConfirmation = body.addressConfirmation || null;

  if (!serviceId) return Response.json({ error: "Please pick a service." }, { status: 400 });
  if (!addressText) return Response.json({ error: "Please enter an address." }, { status: 400 });
  if (addressText.length > 300) {
    return Response.json({ error: "Address is too long (max 300 chars)." }, { status: 400 });
  }
  if (notes && notes.length > 1000) {
    return Response.json({ error: "Notes are too long (max 1000 chars)." }, { status: 400 });
  }

  // Service-specific answers, checked against the spec server-side. The
  // client can be bypassed, and a helper accepting a job with half the
  // brief missing is exactly what this prevents.
  const intakeRaw = (body.intake ?? {}) as IntakeValues;
  const intakeCheck = validateIntake(serviceId, intakeRaw);
  if (!intakeCheck.ok) return Response.json({ error: intakeCheck.error }, { status: 400 });

  // Address ANSWERS (a drop-off, a delivery destination) are real places a
  // helper has to drive to, so they are geocoded too — and the resolved
  // text replaces the typed text, so the helper reads the same address the
  // booking routes on.
  const intakeSpec = SERVICE_INTAKE[serviceId];
  const addrCheck = await resolveIntakeAddresses(
    intakeSpec?.fields ?? [],
    intakeCheck.values,
    resolveAddressStrict,
  );
  if (!addrCheck.ok) return Response.json({ error: addrCheck.error }, { status: 400 });
  let intake = applyResolvedAddresses(intakeCheck.values, addrCheck.resolved);

  const { data: service } = await supabase
    .from("services")
    .select("id, base_price_cents, active")
    .eq("id", serviceId)
    .maybeSingle();
  if (!service || !service.active) {
    return Response.json({ error: "That service isn't available right now." }, { status: 400 });
  }

  /*
    Geocode + service-area gate.

    find_nearby_providers reads the resulting POINT for proximity
    matching, so it has to be a real coordinate — there is no placeholder
    fallback. When the geocoder is unsure, the guard hands back candidates
    instead of guessing, and the app has to ask. Answering a confirmation
    prompt by picking for the customer is how a booking ends up at the
    right-looking wrong address.
  */
  const guard = await resolveDispatchableAddress({
    text: addressText,
    lat: typeof body.addressLat === "number" ? body.addressLat : null,
    lng: typeof body.addressLng === "number" ? body.addressLng : null,
    client: supabase,
    userId: user.id,
    confirmationToken: addressConfirmation,
  });

  if (!guard.ok) {
    if (!("candidates" in guard)) {
      return Response.json({ error: guard.error }, { status: 400 });
    }
    const top = guard.candidates[0];
    return Response.json({
      needsAddress: {
        mode: guard.code === "needs_selection" ? "needs_selection" : "needs_confirmation",
        typed: guard.typed,
        message: guard.error,
        candidates: guard.candidates.map((c) => ({
          formatted: c.formatted, lat: c.lat, lng: c.lng,
          city: c.city, region: c.region, confidence: c.confidence, token: c.token,
        })),
        changes: top ? reviewResolution(guard.typed, top.formatted).changes : [],
      },
    }, { status: 409 });
  }

  // Service client: geocode_verified is a server attestation and the
  // authenticated role is forbidden from setting it (migration 0036).
  const admin = createSupabaseServiceClient();
  const addr = await insertAttestedAddress(admin, guard.address, user.id);
  if (!addr.ok) return Response.json({ error: addr.error }, { status: 400 });

  // How far the job goes, now that both ends are resolved. A Vancouver
  // collection with a Chicago destination was once accepted and quoted at
  // the local base rate — a job no helper could ever deliver.
  const fromPoint = { lat: guard.address.lat, lng: guard.address.lng };
  for (const dest of addrCheck.resolved) {
    const field = (intakeSpec?.fields ?? []).find((q) => q.key === dest.key);
    const trip = checkTrip(fromPoint, dest, (field?.label ?? "destination").toLowerCase());
    if (!trip.ok) return Response.json({ error: trip.error }, { status: 400 });
  }
  intake = applyResolvedAddresses(intakeCheck.values, addrCheck.resolved, fromPoint);

  // Venue permission, for the one service where it decides whether the job
  // is possible at all.
  if (serviceId === "wait-in-line") {
    const venueName = String(intakeCheck.values.venue_name ?? "").trim();
    if (venueName) {
      const { data: venueRows } = await admin.rpc("lookup_venue", {
        p_name: venueName, p_country: guard.area.country,
      });
      const row = Array.isArray(venueRows) ? venueRows[0] : null;
      const verdict = checkVenue(
        row
          ? {
              name: row.name,
              substitutesAllowed: row.substitutes_allowed,
              customerMayReplace: row.customer_may_replace,
              fullPartyRequired: row.full_party_required,
              numbersTransferable: row.numbers_transferable,
              earlyTurnPolicy: row.early_turn_policy,
              confirmedAt: row.confirmed_at,
            }
          : null,
        String(intakeCheck.values.handover ?? ""),
      );
      if (!verdict.allow) return Response.json({ error: verdict.reason }, { status: 400 });
    }
  }

  // The attested country, so the database pricer charges the local rate.
  // guard.area is the same authority that decided the address was
  // serviceable at all — not a client field and not the address text.
  intake = sealIntakeCountry(intake, guard.area.country);

  // The authoritative subtotal, computed in the DATABASE, because
  // accept_request has to arrive at the same number independently.
  const { data: pricedRow, error: priceErr } = await admin.rpc("price_service_cents", {
    p_service_id: serviceId, p_intake: intake,
  });
  if (priceErr) return Response.json({ error: "Could not price that request." }, { status: 400 });
  const pricedSubtotal = Number(pricedRow ?? service.base_price_cents);

  // Inserted as the CUSTOMER, so RLS is what decides the row is theirs.
  const { data: created, error: reqErr } = await supabase
    .from("requests")
    .insert({
      customer_id: user.id,
      service_id: serviceId,
      pickup_address_id: addr.id,
      scheduled_for: scheduledFor,
      notes,
      estimated_price_cents: quoteOneShotCents(pricedSubtotal),
      estimated_duration_min: Number(intake.duration_min) || 45,
      status: "matching",
      intake,
    })
    .select("id")
    .single();

  if (reqErr || !created) {
    return Response.json(
      { error: "Couldn't create the request: " + (reqErr?.message ?? "unknown") },
      { status: 400 },
    );
  }

  /*
    Seal the answers that set the price, BEFORE any helper is offered it.

    req_update lets a customer edit their own request, so without this
    "8 hours" could become "30 minutes" after a helper accepted an
    eight-hour job, and acceptance would price the shorter one.

    Fatal, unlike the broadcast below: accept_request refuses an unsealed
    request, so one that reached helpers without a seal is one nobody
    could ever accept.
  */
  const { error: sealErr } = await admin.rpc("seal_request_quote", { p_request_id: created.id });
  if (sealErr) {
    await admin.from("requests").update({ status: "cancelled" }).eq("id", created.id);
    console.error("could not seal request quote", created.id, sealErr);
    return Response.json({ error: "Couldn't lock in that quote. Please try again." }, { status: 400 });
  }

  // Best-effort: the request exists, an admin can re-broadcast, and the
  // expire-stale cron retires it if no helper ever sees it.
  await broadcastRequestBestEffort(admin, created.id, { label: "ios-one-shot" });

  return Response.json({
    requestId: created.id,
    // The ATTESTED coordinates, so the app can show the search area over a
    // real map rather than over whatever the customer typed.
    pickup: { formatted: guard.address.formatted, lat: fromPoint.lat, lng: fromPoint.lng },
    estimatedTotalCents: quoteOneShotCents(pricedSubtotal),
    currency: guard.area.country === "CA" ? "CAD" : "USD",
  });
});
