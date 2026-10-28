// How far a job may take a helper from where they were dispatched.
//
// Drop-offs are deliberately NOT confined to the service area: a ride or
// delivery that ends out of town is a normal booking, and refusing it
// would reject real work. But "not confined" was taken literally, and a
// Vancouver collection with a CHICAGO destination was accepted and
// quoted at CA$16.50 — the local base rate, for a 3,000 km drive. No
// helper can do that job at that price, so the request can only waste
// everybody's time.
//
// So the limit is not the service-area polygon. It is the length of the
// trip itself, measured from the collection point.

/**
 * The furthest a drop-off may be from the collection point.
 *
 * Chosen to clear every genuine regional trip out of the two launch
 * cities — Vancouver to Whistler is ~120 km, San Diego to Temecula ~100
 * km — while refusing journeys that the published rate plainly does not
 * cover.
 *
 * THIS NUMBER IS A BUSINESS DECISION, not a technical constant. It is
 * here, named, with its reasoning, so it can be changed in one place
 * once there is real data about the trips people actually ask for.
 */
export const MAX_TRIP_KM = 150;

export type Point = { lat: number; lng: number };

/** Great-circle distance in kilometres. */
export function distanceKm(a: Point, b: Point): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2
          + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export type TripCheck =
  | { ok: true; km: number }
  | { ok: false; km: number; error: string };

/**
 * Is this trip one we can quote at the standard rate?
 *
 * Straight-line distance, not driving distance, and deliberately so: it
 * is always an UNDER-estimate of the real journey, so anything this
 * refuses would be worse by road. Using it to refuse is safe; it would
 * not be safe to use it to price.
 *
 * The refusal says what the limit is and what to do instead, because
 * "unavailable" with no number leaves someone guessing at which part of
 * their request was wrong.
 */
export function checkTrip(
  from: Point,
  to: Point,
  label: string,
  maxKm: number = MAX_TRIP_KM,
): TripCheck {
  const km = distanceKm(from, to);
  if (km <= maxKm) return { ok: true, km };
  return {
    ok: false,
    km,
    error:
      `That ${label} is about ${Math.round(km)} km from the collection address, ` +
      `which is further than we can cover at the standard rate (${maxKm} km). ` +
      `Pick a closer drop-off, or message us about a long-distance trip — ` +
      `we don't have an automatic quote for those yet.`,
  };
}

/** A coarse, shareable description of where a trip goes. */
export function describeTrip(km: number, area: string | null): string {
  const rounded = km < 1 ? "under 1 km" : `~${Math.round(km)} km`;
  return area ? `${area} · ${rounded} away` : `${rounded} away`;
}
