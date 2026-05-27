"use client";

import { useActionState } from "react";
import Link from "next/link";
import { loginAction } from "../auth/actions";
import { Mail, Lock, AlertCircle } from "lucide-react";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(loginAction, undefined);

  return (
    <div className="bg-white rounded-2xl shadow-xl shadow-brand-900/5 border border-slate-100 p-6 sm:p-8">
      <h1 className="text-2xl font-bold text-slate-900">Welcome back</h1>
      <p className="text-sm text-slate-500 mt-1">Log in to continue with Helpward.</p>

      {state?.error && (
        <div className="mt-5 flex items-start gap-2 text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-xl p-3">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{state.error}</span>
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

        <label className="block">
          <span className="text-xs font-semibold text-slate-700 flex items-center justify-between">
            Password
            <Link href="/forgot-password" className="text-brand-700 font-medium">Forgot?</Link>
          </span>
          <div className="mt-1 relative">
            <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="password"
              name="password"
              required
              autoComplete="current-password"
              className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-white border border-slate-200 text-sm focus:outline-none focus:ring-4 focus:ring-brand-100 focus:border-brand-400"
            />
          </div>
        </label>

        <button
          type="submit"
          disabled={pending}
          className="w-full py-3 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-50"
        >
          {pending ? "Logging in…" : "Log in"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-600">
        New here? <Link href="/signup" className="text-brand-700 font-semibold">Create an account</Link>
      </p>
    </div>
  );
}
