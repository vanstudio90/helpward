import "server-only";
import {
  resolveAddressStrict, resolveCoordsStrict,
  RESOLVE_FAILURE_MESSAGE, type ResolvedAddress,
} from "@/lib/geocode";
import { type ServiceArea } from "@/lib/service-areas";
import { checkServiceArea, type BoundaryRpcClient } from "@/lib/service-area-check";

// One gate every dispatchable address must pass, used by both the one-shot
// request action and the recurring-series action so they cannot drift.
//
// Two independent checks, in order:
//   1. The address must geocode to real, VERIFIED coordinates. No
//      placeholder fallback exists any more.
//   2. The address must pass BOTH service-area stages: the preliminary
//      municipality-name match AND authoritative polygon containment
//      against official boundaries (lib/service-area-check.ts). Stage 2 is
//      fail-closed — with no boundary dataset loaded, nothing dispatches.
//
// Passing this does NOT mean a helper is available — that is the separate
// matching-distance question, decided per helper by their own radius.

export type GuardOk = { ok: true; address: ResolvedAddress; area: ServiceArea };

/** Minimal service-client shape needed to write an attested address. */
export type AttestingClient = {
  from: (table: string) => any;
};
export type GuardFail = { ok: false; error: string; code?: string };
export type GuardResult = GuardOk | GuardFail;

export async function resolveDispatchableAddress(opts: {
  text: string;
  lat?: number | null;
  lng?: number | null;
  /** Used for the authoritative polygon check. */
  client: BoundaryRpcClient;
}): Promise<GuardResult> {
  const hasCoords =
    opts.lat != null && opts.lng != null &&
    Number.isFinite(opts.lat) && Number.isFinite(opts.lng);

  const resolved = hasCoords
    ? await resolveCoordsStrict(opts.lat as number, opts.lng as number)
    : await resolveAddressStrict(opts.text);

  if (!resolved.ok) {
    return { ok: false, error: RESOLVE_FAILURE_MESSAGE[resolved.reason] };
  }

  const areaCheck = await checkServiceArea(
    opts.client,
    {
      country: resolved.address.country,
      region: resolved.address.region,
      city: resolved.address.city,
    },
    resolved.address.location,
  );
  if (!areaCheck.ok) return { ok: false, error: areaCheck.error, code: areaCheck.code };

  return { ok: true, address: resolved.address, area: areaCheck.area };
}

/**
 * Column payload for an `addresses` insert built from a passed guard.
 *
 * MUST be written with the SERVICE client, not the caller's authenticated
 * client. `geocode_verified` is a server attestation: migration 0036 forces
 * it to false for every non-service writer, so an insert through the
 * ordinary client silently produces an unverified, undispatchable row.
 * Prefer insertAttestedAddress() over calling this directly.
 */
export function addressInsertFields(a: ResolvedAddress, userId: string) {
  return {
    user_id: userId,
    formatted: a.formatted,
    location: a.location as unknown as string,
    country: a.country,
    region: a.region,
    city: a.city,
    postal_code: a.postalCode,
    // Set only on this path, so an unrepaired legacy row can never be
    // mistaken for a verified one.
    geocode_verified: true,
  };
}


/**
 * Insert a verified address using the service role, which is the only
 * writer permitted to set the attestation columns (migration 0036).
 *
 * The caller has already authenticated the user and the guard has already
 * verified the address; userId is set explicitly because the service client
 * bypasses RLS and cannot infer the owner.
 */
export async function insertAttestedAddress(
  admin: AttestingClient,
  address: ResolvedAddress,
  userId: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const { data, error } = await admin
    .from("addresses")
    .insert(addressInsertFields(address, userId))
    .select()
    .single();
  if (error || !data) {
    const msg = (error as { message?: string } | null)?.message ?? "unknown";
    return { ok: false, error: "Couldn't save the address: " + msg };
  }
  return { ok: true, id: (data as { id: string }).id };
}
