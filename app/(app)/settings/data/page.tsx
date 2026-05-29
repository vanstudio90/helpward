import Link from "next/link";
import { ArrowLeft, Shield } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DataExportCard, DeleteAccountCard } from "./data-actions";

export const metadata = {
  title: "Your data — Helpward Settings",
  description: "Download your Helpward data or delete your account. CCPA, PIPEDA, and GDPR compliant.",
};

export default async function YourDataPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // Pull the user's most recent pending request from each table so the UI
  // can flip into "already queued" / "deletion scheduled" mode immediately
  // without an extra round-trip after the action runs.
  const [{ data: exportRow }, { data: delRow }] = await Promise.all([
    supabase
      .from("data_export_requests")
      .select("requested_at, status")
      .eq("user_id", user.id)
      .in("status", ["pending", "processing"])
      .order("requested_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("account_deletion_requests")
      .select("grace_until, status")
      .eq("user_id", user.id)
      .eq("status", "pending")
      .maybeSingle(),
  ]);

  return (
    <div className="px-4 lg:px-8 py-5 lg:py-8 max-w-2xl mx-auto pb-12">
      <Link
        href="/settings"
        className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 mb-4 hover:text-brand-800"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Back to settings
      </Link>

      <h1 className="text-2xl lg:text-3xl font-bold text-slate-900 inline-flex items-center gap-2">
        <Shield className="w-6 h-6 text-brand-600" /> Your data
      </h1>
      <p className="text-sm text-slate-500 mt-1 mb-6">
        Download a full archive of your Helpward data, or schedule your account for permanent deletion.
        Both flows comply with CCPA (California), PIPEDA (Canada), and GDPR (EU/EEA).
      </p>

      <div className="space-y-5">
        <DataExportCard pendingExportAt={exportRow?.requested_at ?? null} />
        <DeleteAccountCard pendingGraceUntil={delRow?.grace_until ?? null} />
      </div>

      <p className="text-[11px] text-slate-400 mt-6 leading-relaxed">
        Questions about your data? Read our{" "}
        <Link href="/privacy" className="text-brand-700 hover:underline font-semibold">Privacy Policy</Link>,{" "}
        the <Link href="/help/download-or-delete-your-data" className="text-brand-700 hover:underline font-semibold">data guide</Link>,{" "}
        or email{" "}
        <a href="mailto:privacy@helpward.com" className="text-brand-700 hover:underline font-semibold">privacy@helpward.com</a>.
      </p>
    </div>
  );
}
