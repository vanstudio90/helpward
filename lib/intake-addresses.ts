// Server-side resolution of address answers inside service intake.
//
// Intake fields of type "destination" are addresses a helper has to drive
// to. Until this file existed they were stored exactly as typed: never
// geocoded, never checked, never corrected. A comment in the form claimed
// otherwise — that destinations were "geocoded and boundary-checked
// server-side like the pickup" — and it was simply untrue.
//
// The distinction that matters, and that the Chicago booking exposed:
//
//   A COLLECTION point is where a helper is dispatched. It must be inside
//   a service area, because it is the place we are promising someone will
//   turn up at. The request's own address is that point, and it is
//   guarded by resolveDispatchableAddress.
//
//   A DROP-OFF is where the job ends. It must be a REAL, resolvable
//   address — otherwise the helper accepts a job they cannot finish — but
//   it may lie outside the service area. A ride out of town is a normal
//   request, and refusing it would be wrong.
//
// So drop-offs are resolved and stored resolved, not contained. The
// Chicago address was not a drop-off at all: it was a collection point
// asked for as an intake answer, which is how it escaped the containment
// check. That field is gone; the request address is the collection point
// now, labelled as such.

import type { IntakeField } from "@/lib/service-intake";
import { distanceKm } from "@/lib/trip-limits";

export type ResolvedIntakeAddress = {
  key: string;
  /** What the customer typed. */
  typed: string;
  /** What the geocoder resolved it to; what the helper is shown. */
  formatted: string;
  lat: number;
  lng: number;
  country: string | null;
  /**
   * Coarse locality — "Burnaby, BC". Safe to show a candidate helper
   * while the exact address is still withheld, so they can judge the
   * trip before accepting without being handed the endpoint.
   */
  area: string | null;
};

export type IntakeAddressOutcome =
  | { ok: true; resolved: ResolvedIntakeAddress[] }
  | { ok: false; error: string };

/** The intake fields that hold an address. */
export function addressFields(fields: IntakeField[]): IntakeField[] {
  return fields.filter((f) => f.type === "destination");
}

type ResolvedShape = {
  formatted: string; lat: number; lng: number; country: string | null;
  city?: string | null; region?: string | null;
};

type MinimalResolve =
  | { ok: true; address: ResolvedShape }
  | { ok: false; reason: string; candidates?: ResolvedShape[] };

/** "Burnaby, BC" from whatever parts the geocoder returned. */
function areaOf(a: ResolvedShape): string | null {
  const parts = [a.city, a.region].filter((p): p is string => !!p && p.trim().length > 0);
  return parts.length > 0 ? parts.join(", ") : null;
}

/** Resolve every address answer, or explain which one failed and why.
 *
 * `resolve` is injected so this is testable without a geocoder.
 *
 * An ambiguous drop-off is NOT bounced back to the customer with a
 * candidate picker the way the dispatch address is. A second picker on
 * the same form is a worse experience than it is worth, and the stakes
 * differ: picking the wrong collection point means nobody turns up,
 * while an ambiguous drop-off resolves to its best match and is visible
 * on the booking long before anyone drives anywhere. We take the top
 * candidate and store what we took, so what the helper reads is what we
 * resolved rather than what someone typed.
 */
export async function resolveIntakeAddresses(
  fields: IntakeField[],
  values: Record<string, string | string[]>,
  resolve: (text: string) => Promise<MinimalResolve>,
): Promise<IntakeAddressOutcome> {
  const out: ResolvedIntakeAddress[] = [];

  for (const field of addressFields(fields)) {
    const raw = values[field.key];
    const typed = (Array.isArray(raw) ? raw[0] : raw ?? "").trim();

    if (!typed) {
      if (field.required) {
        return { ok: false, error: `Please enter an address for “${field.label}”.` };
      }
      continue;
    }

    const r = await resolve(typed);

    const picked = r.ok
      ? r.address
      // A single best candidate is good enough for a drop-off; see above.
      : r.candidates?.[0];

    if (!picked) {
      return {
        ok: false,
        error: `We couldn’t find “${typed}” for “${field.label}”. Please check it and try again.`,
      };
    }

    out.push({
      key: field.key,
      typed,
      formatted: picked.formatted,
      lat: picked.lat,
      lng: picked.lng,
      country: picked.country ?? null,
      area: areaOf(picked),
    });
  }

  return { ok: true, resolved: out };
}

/** Write the resolved addresses back over the typed ones.
 *
 * The helper must read the address we actually resolved. Showing them
 * what was typed while routing on what was resolved is how the two drift
 * apart. The typed text is kept alongside under `<key>_typed` so a
 * dispute can see what the customer meant.
 */
export function applyResolvedAddresses<T extends Record<string, string | string[]>>(
  values: T,
  resolved: ResolvedIntakeAddress[],
  /** Where the helper is dispatched, so the trip length can be stored. */
  from?: { lat: number; lng: number },
): T {
  if (resolved.length === 0) return values;
  const next: Record<string, string | string[]> = { ...values };
  for (const r of resolved) {
    next[r.key] = r.formatted;
    if (r.typed !== r.formatted) next[`${r.key}_typed`] = r.typed;
    next[`${r.key}_lat`] = String(r.lat);
    next[`${r.key}_lng`] = String(r.lng);
    if (r.area) next[`${r.key}_area`] = r.area;
    // Computed once, server-side, from attested coordinates — so the
    // offer card can describe the trip without the exact address and
    // without trusting anything the client sent.
    if (from) next[`${r.key}_km`] = String(Math.round(distanceKm(from, r) * 10) / 10);
  }
  return next as T;
}
