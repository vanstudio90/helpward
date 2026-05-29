import Link from "next/link";
import { ArrowLeft, Bell, Shield } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NotificationPrefs } from "../preferences";

// Dedicated notifications page — same widget the user sees inline on /settings,
// but at a deep-linkable URL so "manage your preferences" links in emails
// and notification footers land directly here.

export const metadata = {
  title: "Notification preferences — Helpward",
  description: "Pick which Helpward notifications you receive by push, email, and SMS.",
};

export default async function NotificationsPrefsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: prefs } = await supabase
    .from("notification_prefs")
    .select("push_booking, push_messages, email_receipts, email_digest, sms_critical")
    .single();
  const initial = prefs ?? {
    push_booking: true, push_messages: true, email_receipts: true,
    email_digest: false, sms_critical: true,
  };

  return (
    <div className="px-4 lg:px-8 py-5 lg:py-8 max-w-2xl mx-auto pb-12">
      <Link
        href="/settings"
        className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 mb-4 hover:text-brand-800"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Back to settings
      </Link>

      <h1 className="text-2xl lg:text-3xl font-bold text-slate-900 inline-flex items-center gap-2">
        <Bell className="w-6 h-6 text-brand-600" /> Notification preferences
      </h1>
      <p className="text-sm text-slate-500 mt-1 mb-6">
        Pick which booking, message, receipt, and SMS notifications you want. Changes save automatically.
      </p>

      <div className="space-y-4">
        <NotificationPrefs initial={initial} />

        <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4 sm:p-5">
          <div className="text-sm font-bold text-slate-900 inline-flex items-center gap-2">
            <Shield className="w-4 h-4 text-emerald-600" /> Always sent — cannot be disabled
          </div>
          <ul className="mt-3 space-y-2 text-sm text-slate-700">
            <li className="flex items-start gap-2">
              <span className="text-slate-400 mt-1">•</span>
              <div>
                <strong>Account-security alerts.</strong> Password changes, new-device logins, suspicious activity.
                Disabling these would leave you blind to account takeover attempts.
              </div>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-slate-400 mt-1">•</span>
              <div>
                <strong>Active-task safety pings.</strong> Helper arrival, route deviation, dispute updates while a
                booking is in progress.
              </div>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-slate-400 mt-1">•</span>
              <div>
                <strong>Legal &amp; compliance notices.</strong> Terms updates, refund confirmations, 1099 tax forms
                (helpers only).
              </div>
            </li>
          </ul>
        </div>

        <p className="text-xs text-slate-500 leading-relaxed">
          Push and SMS delivery require linking a device or phone — those channels land when our OneSignal / Twilio
          integration ships. Your toggles are saved either way so they take effect automatically.{" "}
          <Link href="/help/manage-notifications" className="text-brand-700 font-semibold hover:underline">Read the full notification guide</Link>.
        </p>
      </div>
    </div>
  );
}
