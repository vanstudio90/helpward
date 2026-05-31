import Link from "next/link";
import { ArrowLeft, Shield, Download, AlertCircle } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DataExportCard, DeleteAccountCard } from "./data-actions";
import { signArchiveUrl } from "@/lib/data-export";
import { ClientDateTime } from "@/components/ClientDateTime";

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
  const [{ data: exportRow }, { data: delRow }, { data: readyExport }] = await Promise.all([
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
    supabase
      .from("data_export_requests")
      .select("id, archive_url, archive_size_bytes, expires_at, completed_at, requested_at")
      .eq("user_id", user.id)
      .eq("status", "ready")
      .gt("expires_at", new Date().toISOString())
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  // Mint a fresh 7-day signed URL for the most recent ready archive (if any).
  // Bucket is private — only the service-role-minted signed URL is readable.
  let archiveDownloadUrl: string | null = null;
  if (readyExport?.archive_url) {
    archiveDownloadUrl = await signArchiveUrl(readyExport.archive_url, 60 * 60 * 24 * 7);
  }

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
        {archiveDownloadUrl && readyExport && (
          <div className="rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <span className="w-10 h-10 rounded-xl bg-white inline-flex items-center justify-center shrink-0">
                <Download className="w-5 h-5 text-emerald-600" />
              </span>
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-bold text-emerald-900">Your archive is ready</h2>
                <p className="text-xs text-emerald-800/80 mt-0.5 leading-snug">
                  {readyExport.archive_size_bytes != null && (
                    <>{(readyExport.archive_size_bytes / 1024).toFixed(1)} KB · </>
                  )}
                  Completed <ClientDateTime iso={readyExport.completed_at ?? readyExport.requested_at} /> ·
                  Expires <ClientDateTime iso={readyExport.expires_at ?? new Date().toISOString()} mode="date" />.
                </p>
                <a
                  href={archiveDownloadUrl}
                  className="mt-3 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700"
                  download
                >
                  <Download className="w-3.5 h-3.5" /> Download JSON archive
                </a>
                <p className="text-[10px] text-emerald-700/70 mt-2 leading-snug inline-flex items-start gap-1">
                  <AlertCircle className="w-2.5 h-2.5 mt-0.5 shrink-0" />
                  The download link refreshes each time you reload this page. The file itself stops being
                  reachable after the expiry date — request a new export anytime.
                </p>
              </div>
            </div>
          </div>
        )}

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
