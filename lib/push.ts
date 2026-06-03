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
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<PushResult> {
  if (!isPushEnabled()) return { ok: true, skipped: true };

  const admin = createSupabaseServiceClient();
  const { data: rows, error } = await admin
    .from("push_subscriptions")
    .select("player_id")
    .eq("user_id", userId);
  if (error) return { ok: false, error: error.message };
  const ids = (rows ?? []).map((r) => r.player_id as string).filter(Boolean);
  if (ids.length === 0) return { ok: true, skipped: true };

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
  return { ok: true, sentTo: ids.length };
}
