"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { KeyRound, Smartphone, AlertCircle, Loader2 } from "lucide-react";
import { challengeMfaAction } from "./challenge-action";

export function ChallengeForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState(challengeMfaAction, undefined);
  const [mode, setMode] = useState<"totp" | "recovery">("totp");

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <input type="hidden" name="use_recovery" value={mode === "recovery" ? "1" : "0"} />

      {state?.error && (
        <div className="flex items-start gap-2 text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-xl p-3">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{state.error}</span>
        </div>
      )}

      {/* Mode switch */}
      <div className="inline-flex rounded-lg bg-slate-100 p-1 gap-1 text-xs font-semibold">
        <button
          type="button"
          onClick={() => setMode("totp")}
          className={`px-3 py-1.5 rounded inline-flex items-center gap-1 ${mode === "totp" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
        >
          <Smartphone className="w-3.5 h-3.5" /> Authenticator
        </button>
        <button
          type="button"
          onClick={() => setMode("recovery")}
          className={`px-3 py-1.5 rounded inline-flex items-center gap-1 ${mode === "recovery" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
        >
          <KeyRound className="w-3.5 h-3.5" /> Recovery code
        </button>
      </div>

      {mode === "totp" ? (
        <label className="block">
          <span className="text-xs font-semibold text-slate-700">6-digit code from your app</span>
          <input
            type="text"
            name="code"
            required
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            autoComplete="one-time-code"
            autoFocus
            placeholder="123456"
            className="mt-1 w-full px-4 py-3 rounded-xl bg-white border border-slate-200 text-xl font-mono tracking-widest text-center focus:outline-none focus:ring-4 focus:ring-brand-100 focus:border-brand-400"
          />
        </label>
      ) : (
        <label className="block">
          <span className="text-xs font-semibold text-slate-700">Recovery code (8 characters)</span>
          <input
            type="text"
            name="code"
            required
            maxLength={9}
            autoComplete="off"
            autoFocus
            placeholder="ABCD-EFGH"
            className="mt-1 w-full px-4 py-3 rounded-xl bg-white border border-slate-200 text-xl font-mono tracking-widest text-center focus:outline-none focus:ring-4 focus:ring-brand-100 focus:border-brand-400"
          />
          <p className="mt-1.5 text-[11px] text-slate-500 leading-relaxed">
            Single-use. The code you use here will be marked used and won&apos;t work again.
          </p>
        </label>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full py-3 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-50 inline-flex items-center justify-center gap-2"
      >
        {pending ? <><Loader2 className="w-4 h-4 animate-spin" /> Verifying…</> : "Verify and sign in"}
      </button>

      <p className="text-center text-[11px] text-slate-500 leading-relaxed">
        Lost both your authenticator and recovery codes? Email{" "}
        <a href="mailto:safety@helpward.com" className="text-brand-700 font-semibold hover:underline">
          safety@helpward.com
        </a>{" "}
        from your registered address — we&apos;ll verify identity through a different channel within 24–72 hours.
      </p>

      <div className="text-center">
        <Link href="/login" className="text-xs font-semibold text-slate-500 hover:text-slate-900">
          Sign in with a different account
        </Link>
      </div>
    </form>
  );
}
