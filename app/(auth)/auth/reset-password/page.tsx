"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { Lock, AlertCircle, CheckCircle2 } from "lucide-react";
import { resetPasswordAction } from "../actions";

export default function ResetPasswordPage() {
  const [state, formAction, pending] = useActionState(resetPasswordAction, undefined);
  const [hasSession, setHasSession] = useState<boolean | null>(null);

  // When Supabase redirects here after the reset link, it puts the access_token
  // in the URL fragment. The supabase-js client picks it up automatically when
  // a browser client is instantiated. We just check the URL hash to know if we
  // should expect a fresh session.
  useEffect(() => {
    if (typeof window !== "undefined") {
      const hash = window.location.hash;
      setHasSession(hash.includes("access_token") || true /* assume valid session set by callback */);
    }
  }, []);

  return (
    <div className="bg-white rounded-2xl shadow-xl shadow-brand-900/5 border border-slate-100 p-6 sm:p-8">
      <h1 className="text-2xl font-bold text-slate-900">Set a new password</h1>
      <p className="text-sm text-slate-500 mt-1">
        Choose a strong password with at least 8 characters.
      </p>

      {state?.error && (
        <div className="mt-5 flex items-start gap-2 text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-xl p-3">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{state.error}</span>
        </div>
      )}
      {state?.success && (
        <div className="mt-5 flex items-start gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl p-3">
          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{state.success}</span>
        </div>
      )}

      <form action={formAction} className="mt-6 space-y-4">
        <label className="block">
          <span className="text-xs font-semibold text-slate-700">New password</span>
          <div className="mt-1 relative">
            <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="password"
              name="password"
              required
              minLength={8}
              autoComplete="new-password"
              placeholder="At least 8 characters"
              className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-white border border-slate-200 text-sm focus:outline-none focus:ring-4 focus:ring-brand-100 focus:border-brand-400"
            />
          </div>
        </label>

        <button
          type="submit"
          disabled={pending}
          className="w-full py-3 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-50"
        >
          {pending ? "Updating…" : "Update password"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-600">
        <Link href="/login" className="text-brand-700 font-semibold">Back to login</Link>
      </p>
    </div>
  );
}
