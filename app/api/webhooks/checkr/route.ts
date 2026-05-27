import { NextResponse, type NextRequest } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

/* Checkr background-check webhook.
 * Events: report.completed (with status clear / consider)
 * Endpoint: https://helpward.com/api/webhooks/checkr
 * Signing: HMAC SHA-256 with CHECKR_WEBHOOK_SECRET in X-Checkr-Signature
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CHECKR_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, reason: "missing_webhook_secret" }, { status: 503 });
  }

  const sig = req.headers.get("x-checkr-signature");
  const body = await req.text();
  if (!sig) return NextResponse.json({ ok: false, reason: "no_signature" }, { status: 400 });

  // Verify HMAC
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return NextResponse.json({ ok: false, reason: "bad_signature" }, { status: 400 });
  }

  let payload: { type?: string; data?: { object?: { id?: string; status?: string; candidate_id?: string } } };
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ ok: false, reason: "bad_body" }, { status: 400 });
  }

  if (payload.type === "report.completed" && payload.data?.object) {
    const { id, status } = payload.data.object;
    const admin = createSupabaseServiceClient();
    await admin
      .from("provider_profiles")
      .update({
        background_check_status: status ?? "unknown",
        background_verified_at: status === "clear" ? new Date().toISOString() : null,
      })
      .eq("background_check_id", id ?? "");
  }

  return NextResponse.json({ ok: true });
}
