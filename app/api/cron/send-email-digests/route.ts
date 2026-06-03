import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { sendEmail, isEmailEnabled } from "@/lib/email";

// Vercel Cron pings this daily at 13:00 UTC (see vercel.json) — roughly
// 6am Pacific / 9am Eastern, a sane window for the digest to land before
// most North American customers check their morning email.
//
// What it does: for every user with notification_prefs.email_digest = true
// who got at least one notification in the last 24h, build a short HTML
// summary email and fire it via Resend. Service-role for everything since
// notifications RLS only allows the owning user to read their own rows.
//
// Idempotency: at-most-once is NOT required for a digest — a same-day
// re-run would just duplicate the email. Since Vercel cron doesn't retry
// failed cron runs we don't bother stamping a last-sent column; if a run
// half-fails partway through, manual ops can decide whether to re-trigger.
//
// Posture when RESEND_API_KEY is unset: sendEmail() returns ok=true with
// skipped=true so this whole endpoint becomes a counter of who WOULD have
// been emailed without actually firing anything. Lets us deploy the
// wiring before the Resend account is provisioned.

const BATCH_LIMIT = 200;
const LOOKBACK_HOURS = 24;

export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req.headers.get("authorization"))) {
    return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }

  const admin = createSupabaseServiceClient();
  const since = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000).toISOString();

  // 1. Find every user opted into digests. Cap at BATCH_LIMIT per run so
  //    one cron tick can't fan out 50k emails synchronously; if traffic
  //    ever gets there we'll switch to a paginated queue.
  const { data: optedIn, error: prefsErr } = await admin
    .from("notification_prefs")
    .select("user_id")
    .eq("email_digest", true)
    .limit(BATCH_LIMIT);
  if (prefsErr) {
    return NextResponse.json({ ok: false, error: prefsErr.message }, { status: 500 });
  }
  if (!optedIn || optedIn.length === 0) {
    return NextResponse.json({ ok: true, recipients: 0 });
  }
  const userIds = optedIn.map((p) => p.user_id);

  // 2. Pull last-24h notifications for all opted-in users in one round-trip
  //    via .in(). Sorted by created_at so the digest renders newest-first.
  const { data: notifRows, error: notifErr } = await admin
    .from("notifications")
    .select("user_id, type, payload, created_at")
    .in("user_id", userIds)
    .gte("created_at", since)
    .order("created_at", { ascending: false });
  if (notifErr) {
    return NextResponse.json({ ok: false, error: notifErr.message }, { status: 500 });
  }

  // 3. Bucket by user_id. Skip users with no notifications — empty
  //    digests are a worse experience than no email.
  const byUser = new Map<string, typeof notifRows>();
  for (const n of notifRows ?? []) {
    const list = byUser.get(n.user_id) ?? [];
    list.push(n);
    byUser.set(n.user_id, list);
  }
  const sendList = userIds.filter((id) => (byUser.get(id)?.length ?? 0) > 0);

  // 4. Fetch the auth-side email for every sendable user in one query via
  //    schema-qualified select on auth.users — service-role can read it.
  const emailById = new Map<string, string>();
  if (sendList.length > 0) {
    const { data: users } = await admin
      .schema("auth")
      .from("users")
      .select("id, email")
      .in("id", sendList);
    for (const u of (users ?? []) as Array<{ id: string; email: string | null }>) {
      if (u.email) emailById.set(u.id, u.email);
    }
  }

  // 5. Compose + send. Tally outcomes for the JSON response so an admin
  //    hitting the route manually can see what happened.
  let sent = 0;
  let skipped = 0;
  const failures: { user_id: string; error: string }[] = [];
  for (const userId of sendList) {
    const to = emailById.get(userId);
    if (!to) { skipped += 1; continue; }
    const notifs = byUser.get(userId) ?? [];
    const html = renderDigestHtml(notifs);
    const subject = notifs.length === 1
      ? "Your Helpward update"
      : `${notifs.length} updates from Helpward`;
    const r = await sendEmail({ to, subject, html });
    if (!r.ok) {
      failures.push({ user_id: userId, error: r.error });
      continue;
    }
    if (r.skipped) skipped += 1; else sent += 1;
  }

  return NextResponse.json({
    ok: failures.length === 0,
    emailEnabled: isEmailEnabled(),
    optedIn: userIds.length,
    candidatesWithActivity: sendList.length,
    sent,
    skipped,
    failures: failures.length > 0 ? failures : undefined,
  });
}

// Compose a plain, readable HTML digest. Inline styles only — most email
// clients strip <style>. Keep it short: per-notification one-line label +
// timestamp, plus a single CTA back to the app.
function renderDigestHtml(notifs: Array<{ type: string; payload: Record<string, unknown>; created_at: string }>): string {
  const rows = notifs.slice(0, 20).map((n) => {
    const label = labelFor(n.type);
    const when = new Date(n.created_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
    return `<tr><td style="padding:8px 0;border-bottom:1px solid #f1f5f9;color:#0f172a;font-size:14px;">${escapeHtml(label)}</td><td style="padding:8px 0;border-bottom:1px solid #f1f5f9;color:#64748b;font-size:12px;text-align:right;white-space:nowrap;">${escapeHtml(when)}</td></tr>`;
  }).join("");

  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,Segoe UI,Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 12px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:16px;border:1px solid #e2e8f0;padding:24px;">
        <tr><td>
          <div style="font-size:20px;font-weight:800;color:#0f172a;margin-bottom:4px;">Your Helpward digest</div>
          <div style="font-size:13px;color:#64748b;margin-bottom:20px;">${notifs.length} update${notifs.length === 1 ? "" : "s"} from the last 24 hours</div>
          <table width="100%" cellpadding="0" cellspacing="0">${rows}</table>
          <div style="margin-top:24px;">
            <a href="https://helpward.com/dashboard" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 20px;border-radius:10px;">Open Helpward</a>
          </div>
          <div style="margin-top:24px;padding-top:16px;border-top:1px solid #f1f5f9;font-size:11px;color:#94a3b8;">
            You're getting this because you turned on email digests in your <a href="https://helpward.com/settings" style="color:#475569;">notification settings</a>.
            Turn it off any time.
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

// Mirror of the NotificationBell labelFor — same strings so the in-app
// bell and email digest stay in lockstep. Duplicated rather than imported
// because the bell is a client component and pulling it into the cron
// edge runtime would drag in lucide-react etc.
function labelFor(type: string): string {
  switch (type) {
    case "new_request_offered": return "New task offer";
    case "booking_accepted": return "A provider accepted your request";
    case "booking_cancelled": return "A booking was cancelled";
    case "booking_auto_cancelled": return "Booking auto-cancelled — provider didn't arrive";
    case "booking_no_show": return "You missed a scheduled booking";
    case "booking_auto_completed": return "Your task was auto-completed";
    case "request_expired": return "Your request expired — no providers available";
    case "task_started": return "Your task has started";
    case "task_completed": return "Your task is complete";
    case "dispute_opened": return "A dispute was opened";
    case "provider_approved": return "You're approved! You can now accept tasks";
    case "provider_rejected": return "Your provider application was reviewed";
    case "data_export_ready": return "Your data export is ready to download";
    case "portfolio_photo_featured": return "Your helper featured a photo from your booking";
    case "review_received": return "You received a new review";
    case "booking_reminder": return "Your task starts soon";
    case "helper_booking_reminder": return "You have a task starting soon";
    default: return type.replace(/_/g, " ");
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
