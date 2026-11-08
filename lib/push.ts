// Server-side push delivery via OneSignal's REST API.
//
// Posture when ONESIGNAL_APP_ID + ONESIGNAL_REST_API_KEY are unset:
//   * isPushEnabled() → false
//   * sendPushToUser() returns { ok: true, skipped: true } without making
//     any request, so cron handlers and notify call sites can deploy and
//     run safely during the pre-key window.
// Same pattern as lib/email.ts (Resend) + lib/geocode.ts (Mapbox). Ship
// the wiring; light up the integration when the key lands without a
// re-deploy.

import "server-only";
import { sendApns, apnsConfigured, type ApnsEnvironment } from "@/lib/apns";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

const ENDPOINT = "https://onesignal.com/api/v1/notifications";

export function isPushEnabled(): boolean {
  return (
    typeof process.env.ONESIGNAL_APP_ID === "string" && process.env.ONESIGNAL_APP_ID.length > 0
    && typeof process.env.ONESIGNAL_REST_API_KEY === "string" && process.env.ONESIGNAL_REST_API_KEY.length > 0
  );
}

// NEXT_PUBLIC_ONESIGNAL_APP_ID — same value as ONESIGNAL_APP_ID but exposed
// to the browser for the SDK init call. We export both checks to keep the
// client-side enable button honest about whether push will actually work.
export function isPushPublicConfigured(): boolean {
  return typeof process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID === "string"
    && process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID.length > 0;
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string; // Deep-link the click target — OneSignal's `url` field
};

export type PushResult =
  | { ok: true; skipped?: boolean; sentTo?: number }
  | { ok: false; error: string };

// Send a push to every registered subscription for the given user. Looks
// up player_ids via the service-role client (cron / notify call sites are
// already running with service role anyway), then fires ONE OneSignal POST
// with the array of include_player_ids.
export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
  opts: {
    /**
     * The notification_prefs column that governs this push.
     *
     * Was not here, and nothing else consulted the preferences either:
     * the settings screen wrote push_booking to a row that no sender
     * ever read, so turning it off changed nothing. A switch that saves
     * a value nobody reads is not a setting, it is a decoration.
     */
    pref?: "push_booking";
    /**
     * Allowed through Focus and a locked screen, the way a ride request
     * is. For a job offer that expires — not for anything that can wait.
     */
    timeSensitive?: boolean;
    /** Replaces an earlier notification with the same id. */
    collapseId?: string;
  } = {},
): Promise<PushResult> {
  /*
    OneSignal being unconfigured no longer means "no push".

    This used to return here, which was right when OneSignal was the
    only route. Native APNs is now the route we actually use, so the
    check moved down to the OneSignal leg and this function decides per
    transport instead of refusing outright.
  */
  if (!isPushEnabled() && !apnsConfigured()) return { ok: true, skipped: true };

  const admin = createSupabaseServiceClient();

  if (opts.pref) {
    const { data: prefs } = await admin
      .from("notification_prefs")
      .select(opts.pref)
      .eq("user_id", userId)
      .maybeSingle();
    // Absent row means defaults, and the default is on. Only an explicit
    // false silences it.
    if (prefs && (prefs as Record<string, unknown>)[opts.pref] === false) {
      return { ok: true, skipped: true };
    }
  }

  /*
    NATIVE FIRST, and for this app the only one.

    Tokens are grouped by environment because sandbox and production
    APNs are different hosts and reject each other's tokens — a
    TestFlight build and an App Store build of the same app land in
    different buckets.

    A token APNs calls dead is retired rather than deleted, so a device
    that comes back can be told apart from one never seen.
  */
  let nativeSent = 0;
  if (apnsConfigured()) {
    const { data: devices } = await admin
      .from("device_tokens")
      .select("token, environment")
      .eq("user_id", userId)
      .is("disabled_at", null);

    const groups = new Map<ApnsEnvironment, string[]>();
    for (const row of devices ?? []) {
      const env = (row.environment as ApnsEnvironment) ?? "production";
      groups.set(env, [...(groups.get(env) ?? []), row.token as string]);
    }

    for (const [env, tokens] of groups) {
      const result = await sendApns(tokens, env, {
        title: payload.title,
        body: payload.body,
        data: payload.url ? { url: payload.url } : undefined,
        timeSensitive: opts.timeSensitive,
        collapseId: opts.collapseId,
      });
      nativeSent += result.sent;
      if (result.dead.length > 0) {
        await admin
          .from("device_tokens")
          .update({ disabled_at: new Date().toISOString(), disabled_reason: "apns_unregistered" })
          .in("token", result.dead);
      }
      for (const failure of result.errors) {
        console.error("apns send failed", failure.reason);
      }
    }
  }

  if (!isPushEnabled()) {
    return nativeSent > 0
      ? { ok: true, sentTo: nativeSent }
      : { ok: true, skipped: true };
  }

  const { data: rows, error } = await admin
    .from("push_subscriptions")
    .select("player_id")
    .eq("user_id", userId);
  if (error) return { ok: false, error: error.message };
  const ids = (rows ?? []).map((r) => r.player_id as string).filter(Boolean);
  if (ids.length === 0) {
    return nativeSent > 0 ? { ok: true, sentTo: nativeSent } : { ok: true, skipped: true };
  }

  const body: Record<string, unknown> = {
    app_id: process.env.ONESIGNAL_APP_ID,
    include_player_ids: ids,
    headings: { en: payload.title },
    contents: { en: payload.body },
  };
  if (payload.url) body.url = payload.url;

  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Basic ${process.env.ONESIGNAL_REST_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(12_000),
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "network error" };
  }
  if (!res.ok) {
    let detail = "";
    try { detail = (await res.text()).slice(0, 300); } catch {}
    return { ok: false, error: `OneSignal ${res.status}: ${detail}` };
  }
  return { ok: true, sentTo: ids.length + nativeSent };
}
