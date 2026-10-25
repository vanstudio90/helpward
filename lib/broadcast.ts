import "server-only";

// Minimal shape of the Supabase client this helper needs. Declared
// structurally (rather than importing SupabaseClient) so a test can pass a
// fake, and so the thenable-vs-Promise distinction stays visible: a
// Postgrest builder implements `then` ONLY. Calling `.catch()` on one
// throws a TypeError, which is exactly how the recurring-series cron was
// silently dying at its broadcast step.
export type RpcCapable = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ error: unknown }>;
};

export const DEFAULT_BROADCAST_RADIUS_KM = 20;

/**
 * Offer a request to nearby helpers, best-effort.
 *
 * The request already exists at this point, so a broadcast failure must not
 * fail the caller — an admin can re-broadcast, and the expire-stale-requests
 * cron will retire the request if nobody ever sees it. Returns whether the
 * broadcast was attempted cleanly, for logging only.
 *
 * Must use try/catch, never `.catch()`: see RpcCapable above.
 */
export async function broadcastRequestBestEffort(
  admin: RpcCapable,
  requestId: string,
  opts: { radiusKm?: number; label?: string } = {},
): Promise<{ ok: boolean; error?: unknown }> {
  const radiusKm = opts.radiusKm ?? DEFAULT_BROADCAST_RADIUS_KM;
  try {
    const res = await admin.rpc("broadcast_request", {
      p_request_id: requestId,
      p_radius_km: radiusKm,
    });
    if (res && res.error) {
      console.error(`broadcast_request${opts.label ? ` (${opts.label})` : ""} returned an error:`, res.error);
      return { ok: false, error: res.error };
    }
    return { ok: true };
  } catch (e) {
    console.error(`broadcast_request${opts.label ? ` (${opts.label})` : ""} threw:`, e);
    return { ok: false, error: e };
  }
}
