import { redirect } from "next/navigation";
import { Shield } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ChallengeForm } from "./challenge-form";

export const metadata = {
  title: "Two-factor sign-in — Helpward",
  description: "Enter the 6-digit code from your authenticator app to finish signing in.",
};

export default async function MfaChallengePage({
  searchParams,
}: { searchParams: Promise<{ next?: string }> }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  // If the visitor doesn't have a pending password-stage session, bounce to /login.
  if (!user) redirect("/login");

  const { next } = await searchParams;
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";

  return (
    <div className="bg-white rounded-2xl shadow-xl shadow-brand-900/5 border border-slate-100 p-6 sm:p-8">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-9 h-9 rounded-xl bg-brand-50 inline-flex items-center justify-center">
          <Shield className="w-5 h-5 text-brand-600" />
        </span>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Two-step verification</h1>
          <p className="text-xs text-slate-500">
            Signed in as <strong>{user.email}</strong>.
          </p>
        </div>
      </div>

      <p className="text-sm text-slate-600 mb-5">
        Open your authenticator app and enter the 6-digit code.
      </p>

      <ChallengeForm next={safeNext} />
    </div>
  );
}
