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

  // Verify HMAC — timingSafeEqual requires equal-length buffers; bail early if not.
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
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
    // Whitelist statuses Checkr documents: pending, clear, consider, suspended, dispute
    const ALLOWED = new Set(["pending", "clear", "consider", "suspended", "dispute"]);
    const safeStatus = status && ALLOWED.has(status) ? status : "unknown";
    // Checkr report IDs are alphanumeric+hyphen (UUID-like). Reject anything else.
    if (!id || !/^[a-zA-Z0-9_-]{8,64}$/.test(id)) {
      return NextResponse.json({ ok: false, reason: "bad_report_id" }, { status: 400 });
    }
    const admin = createSupabaseServiceClient();
    await admin
      .from("provider_profiles")
      .update({
        background_check_status: safeStatus,
        background_verified_at: safeStatus === "clear" ? new Date().toISOString() : null,
      })
      .eq("background_check_id", id);
  }

  return NextResponse.json({ ok: true });
}
