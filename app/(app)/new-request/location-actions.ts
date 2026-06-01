"use server";

import { reverseGeocode, isGeocodingEnabled, PLACEHOLDER_COUNTRY } from "@/lib/geocode";

type ReverseResult =
  | { ok: true; formatted: string; lat: number; lng: number; country: string }
  | { ok: false; error: string };

// Resolve a browser-supplied lat/lng into a human-readable address. Called
// by the UseCurrentLocationButton after navigator.geolocation hands us
// coords. We don't accept text input here on purpose — the button's whole
// job is to BYPASS the typed-address path.
export async function reverseGeocodeAction(
  lat: number, lng: number,
): Promise<ReverseResult> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { ok: false, error: "Invalid coordinates." };
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return { ok: false, error: "Coordinates out of range." };
  }

  if (!isGeocodingEnabled()) {
    // No Mapbox key — return a coords-only fallback so the user can still
    // submit the booking. The address text will just be the lat/lng pair.
    return {
      ok: true,
      formatted: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
      lat,
      lng,
      country: PLACEHOLDER_COUNTRY,
    };
  }

  const r = await reverseGeocode(lat, lng);
  if (!r) {
    return { ok: false, error: "Couldn't look up that location. Type the address instead." };
  }
  return {
    ok: true,
    formatted: r.formatted,
    lat: r.lat,
    lng: r.lng,
    country: r.country,
  };
}
