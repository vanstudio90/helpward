import Link from "next/link";
import { ArrowLeft, Shield, Smartphone } from "lucide-react";
import { ChangePasswordForm } from "./change-password-form";

export const metadata = {
  title: "Security — Helpward Settings",
  description: "Change your password and manage account security on Helpward.",
};

export default function SecurityPage() {
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
        Manage your password and account security.
      </p>

      <div className="space-y-5">
        <section className="rounded-2xl bg-white border border-slate-100 p-4 sm:p-5">
          <h2 className="text-base font-bold text-slate-900 mb-3">Change password</h2>
          <ChangePasswordForm />
        </section>

        <section className="rounded-2xl bg-white border border-slate-100 p-4 sm:p-5">
          <div className="flex items-start gap-3 mb-3">
            <span className="w-10 h-10 rounded-xl bg-slate-50 inline-flex items-center justify-center shrink-0">
              <Smartphone className="w-4 h-4 text-slate-500" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-bold text-slate-900">Two-factor authentication</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Add an extra step to sign-in with an authenticator app (Google Authenticator, 1Password, Authy).
              </p>
            </div>
            <button
              disabled
              title="Supabase TOTP enrollment ships next round"
              className="text-xs font-semibold text-slate-400 bg-slate-50 px-3 py-2 rounded-lg cursor-not-allowed shrink-0"
            >
              Coming soon
            </button>
          </div>
        </section>

        <section className="rounded-2xl bg-white border border-slate-100 p-4 sm:p-5">
          <h2 className="text-base font-bold text-slate-900 mb-2">Active sessions</h2>
          <p className="text-xs text-slate-500">
            Signed in on this device. Session-management UI ships once we move sessions off the default Supabase
            JWT-only model to per-device tokens.
          </p>
        </section>
      </div>
    </div>
  );
}
