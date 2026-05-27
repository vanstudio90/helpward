"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Mail, AlertCircle, CheckCircle2 } from "lucide-react";
import { forgotPasswordAction } from "../(auth)/auth/actions";

export default function ForgotPasswordPage() {
  const [state, formAction, pending] = useActionState(forgotPasswordAction, undefined);

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 via-white to-sky-50 flex flex-col">
      <header className="px-4 sm:px-6 lg:px-8 h-16 flex items-center max-w-6xl mx-auto w-full">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-brand-600 text-white flex items-center justify-center font-bold">H</div>
          <span className="text-lg font-bold tracking-tight">Helpward</span>
        </Link>
      </header>
      <main className="flex-1 flex items-start sm:items-center justify-center px-4 py-6 sm:py-12">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl shadow-brand-900/5 border border-slate-100 p-6 sm:p-8">
          <h1 className="text-2xl font-bold text-slate-900">Reset your password</h1>
          <p className="text-sm text-slate-500 mt-1">Enter the email you signed up with — we&apos;ll send you a reset link.</p>

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
              <span className="text-xs font-semibold text-slate-700">Email</span>
              <div className="mt-1 relative">
                <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="email"
                  name="email"
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                  className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-white border border-slate-200 text-sm focus:outline-none focus:ring-4 focus:ring-brand-100 focus:border-brand-400"
                />
              </div>
            </label>

            <button
              type="submit"
              disabled={pending}
              className="w-full py-3 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-50"
            >
              {pending ? "Sending…" : "Send reset link"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-600">
            Remember it? <Link href="/login" className="text-brand-700 font-semibold">Back to login</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
