"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { signupAction } from "../auth/actions";
import { Mail, Lock, User, AlertCircle, Globe } from "lucide-react";
import { cn } from "@/lib/cn";
import { ReferralBanner } from "./referral-banner";

export default function SignupPage() {
  const [state, formAction, pending] = useActionState(signupAction, undefined);
  const [role, setRole] = useState<"customer" | "provider">("customer");

  return (
    <div className="bg-white rounded-2xl shadow-xl shadow-brand-900/5 border border-slate-100 p-6 sm:p-8">
      <h1 className="text-2xl font-bold text-slate-900">Create your account</h1>
      <p className="text-sm text-slate-500 mt-1">Start using Helpward today.</p>

      <ReferralBanner rewardLabel="$10" />

      {/* Role selector */}
      <div className="mt-5 grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl">
        <button
          type="button"
          onClick={() => setRole("customer")}
          className={cn(
            "py-2 rounded-lg text-sm font-semibold transition",
            role === "customer" ? "bg-white text-brand-700 shadow-sm" : "text-slate-500"
          )}
        >
          I need help
        </button>
        <button
          type="button"
          onClick={() => setRole("provider")}
          className={cn(
            "py-2 rounded-lg text-sm font-semibold transition",
            role === "provider" ? "bg-white text-brand-700 shadow-sm" : "text-slate-500"
          )}
        >
          I want to earn
        </button>
      </div>

      {state?.error && (
        <div className="mt-5 flex items-start gap-2 text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-xl p-3">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{state.error}</span>
        </div>
      )}

      <form action={formAction} className="mt-5 space-y-4">
        <input type="hidden" name="role" value={role} />

        <label className="block">
          <span className="text-xs font-semibold text-slate-700">Full Name</span>
          <div className="mt-1 relative">
            <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              name="full_name"
              required
              autoComplete="name"
              placeholder="Alex Morgan"
              className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-white border border-slate-200 text-sm focus:outline-none focus:ring-4 focus:ring-brand-100 focus:border-brand-400"
            />
          </div>
        </label>

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
          <span className="text-xs font-semibold text-slate-700">Password</span>
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

        <label className="block">
          <span className="text-xs font-semibold text-slate-700">Country</span>
          <div className="mt-1 relative">
            <Globe className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <select
              name="country"
              defaultValue="US"
              className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-white border border-slate-200 text-sm focus:outline-none focus:ring-4 focus:ring-brand-100 focus:border-brand-400 appearance-none"
            >
              <option value="US">United States</option>
              <option value="CA">Canada</option>
            </select>
          </div>
        </label>

        <button
          type="submit"
          disabled={pending}
          className="w-full py-3 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-50"
        >
          {pending ? "Creating account…" : "Create account"}
        </button>

        <p className="text-[11px] text-slate-500 text-center leading-snug">
          By creating an account you agree to our{" "}
          <Link href="/terms" className="underline">Terms</Link> and{" "}
          <Link href="/privacy" className="underline">Privacy Policy</Link>.
        </p>
      </form>

      <p className="mt-6 text-center text-sm text-slate-600">
        Already have an account? <Link href="/login" className="text-brand-700 font-semibold">Log in</Link>
      </p>
    </div>
  );
}
