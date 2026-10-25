import "server-only";

// Two-stage service-area eligibility.
//
//   STAGE 1 (preliminary) — municipality name from the geocoder, matched
//     against the launch allowlist in lib/service-areas.ts. Cheap, and it
//     produces the error copy a customer can act on ("we don't serve
//     Abbotsford"). NOT sufficient on its own: Mapbox's `context.place` is a
//     label, not a boundary, so unincorporated land next to a launch city
//     can carry that city's name.
//
//   STAGE 2 (authoritative) — polygon containment against official
//     municipal boundaries in PostGIS (migration 0033).
//
// BOTH must pass. Stage 2 is fail-closed: if no official boundary set is
// active, is_point_serviceable() returns 'no_dataset' and nothing is
// dispatchable. We do not fall back to stage 1 alone, because that is
// exactly the weakening of the city-limits requirement the launch review
// rejected.

import { resolveServiceArea, OUT_OF_AREA_MESSAGE, type ServiceArea } from "@/lib/service-areas";

export type BoundaryVerdict = "serviceable" | "outside_boundary" | "no_dataset";

export type AreaCheckResult =
  | { ok: true; area: ServiceArea; boundaryVerdict: "serviceable" }
  | { ok: false; code: "not_in_launch_area"; error: string }
  | { ok: false; code: "outside_boundary"; error: string }
  | { ok: false; code: "no_dataset"; error: string }
  | { ok: false; code: "boundary_check_failed"; error: string };

export const AREA_MESSAGES: Record<Exclude<AreaCheckResult, { ok: true }>["code"], string> = {
  not_in_launch_area: OUT_OF_AREA_MESSAGE,
  // Distinct from the above on purpose. The customer's city name looked
  // right but the pin is outside the actual municipal boundary — e.g. an
  // unincorporated address that geocodes as "San Diego". Telling them "we
  // don't serve San Diego" would be wrong and confusing.
  outside_boundary:
    "That address sits just outside the city limits we currently serve. " +
    "We cover incorporated city limits only, so we can't send a helper there yet.",
  no_dataset:
    "We can't confirm service coverage right now, so we're not taking the request. " +
    "Please try again shortly.",
  boundary_check_failed:
    "We couldn't verify that address against our coverage map. Please try again shortly.",
};

/** Minimal client shape: just the boundary RPC. Injectable for tests. */
export type BoundaryRpcClient = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
};

/**
 * Run both stages. `point` is WKT "POINT(lng lat)" as stored on addresses.
 *
 * Note the order: the preliminary check runs first purely so the customer
 * gets the more useful message when their city is plainly not served. A
 * passing stage 1 grants nothing.
 */
export async function checkServiceArea(
  client: BoundaryRpcClient,
  place: { country: string | null; region: string | null; city: string | null },
  point: string,
): Promise<AreaCheckResult> {
  const area = resolveServiceArea({
    country: place.country,
    region: place.region,
    place: place.city,
  });
  if (!area) {
    return { ok: false, code: "not_in_launch_area", error: AREA_MESSAGES.not_in_launch_area };
  }

  let verdict: BoundaryVerdict;
  try {
    const res = await client.rpc("is_point_serviceable", { p_point: point });
    if (res.error) {
      console.error("is_point_serviceable failed:", res.error);
      return { ok: false, code: "boundary_check_failed", error: AREA_MESSAGES.boundary_check_failed };
    }
    verdict = String(res.data ?? "no_dataset") as BoundaryVerdict;
  } catch (e) {
    console.error("is_point_serviceable threw:", e);
    return { ok: false, code: "boundary_check_failed", error: AREA_MESSAGES.boundary_check_failed };
  }

  if (verdict === "serviceable") {
    return { ok: true, area, boundaryVerdict: "serviceable" };
  }
  if (verdict === "outside_boundary") {
    return { ok: false, code: "outside_boundary", error: AREA_MESSAGES.outside_boundary };
  }
  // 'no_dataset' or anything unrecognised — refuse. Never degrade to the
  // preliminary check.
  return { ok: false, code: "no_dataset", error: AREA_MESSAGES.no_dataset };
}
