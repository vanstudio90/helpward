import Link from "next/link";
import { ArrowLeft, Shield } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getRecoveryCodeStatus } from "@/lib/data/mfa";
import { ChangePasswordForm } from "./change-password-form";
import { EnrollmentFlow } from "./enrollment-flow";
import { Manage2FA } from "./manage-2fa";

export const metadata = {
  title: "Security — Helpward Settings",
  description: "Change your password and manage two-factor authentication on Helpward.",
};

export default async function SecurityPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Detect whether the user already has a verified TOTP factor — drives the
  // branch between enrollment flow vs management UI.
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const hasVerified = (factors?.totp ?? []).some((f) => f.status === "verified");
  const recovery = hasVerified && user
    ? await getRecoveryCodeStatus(user.id)
    : { total: 0, remaining: 0 };

  return (
    <div className="px-4 lg:px-8 py-5 lg:py-8 max-w-2xl mx-auto pb-12">
      <Link
        href="/settings"
        className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 mb-4 hover:text-brand-800"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Back to settings
      </Link>

      <h1 className="text-2xl lg:text-3xl font-bold text-slate-900 inline-flex items-center gap-2">
        <Shield className="w-6 h-6 text-brand-600" /> Security
      </h1>
      <p className="text-sm text-slate-500 mt-1 mb-6">
        Manage your password and two-factor authentication.
      </p>

      <div className="space-y-5">
        <section className="rounded-2xl bg-white border border-slate-100 p-4 sm:p-5">
          <h2 className="text-base font-bold text-slate-900 mb-3">Change password</h2>
          <ChangePasswordForm />
        </section>

        {hasVerified ? (
          <Manage2FA recoveryRemaining={recovery.remaining} recoveryTotal={recovery.total} />
        ) : (
          <EnrollmentFlow />
        )}

        <section className="rounded-2xl bg-white border border-slate-100 p-4 sm:p-5">
          <h2 className="text-base font-bold text-slate-900 mb-2">Active sessions</h2>
          <p className="text-xs text-slate-500">
            Signed in on this device. Session-management UI ships once we move sessions off the default Supabase
            JWT-only model to per-device tokens.
          </p>
        </section>

        <p className="text-[11px] text-slate-400 leading-relaxed">
          Lost access to your authenticator <em>and</em> your recovery codes? Email{" "}
          <a href="mailto:safety@helpward.com" className="text-brand-700 font-semibold hover:underline">
            safety@helpward.com
          </a>{" "}
          from your registered email address. We&apos;ll verify your identity through a different channel before
          removing the factor — expect 24–72 hours.
        </p>
      </div>
    </div>
  );
}
