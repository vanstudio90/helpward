"use client";

import { useActionState, useState } from "react";
import {
  ShieldCheck, KeyRound, AlertCircle, Loader2, RefreshCw, ShieldOff,
} from "lucide-react";
import { regenerateRecoveryCodesAction, unenrollAction } from "./mfa-actions";
import { RecoveryCodesPanel } from "./enrollment-flow";

// Shown when the user already has 2FA enabled. Two flows: regenerate
// recovery codes, and disable 2FA. Both require fresh TOTP verification.

export function Manage2FA({
  recoveryRemaining, recoveryTotal,
}: { recoveryRemaining: number; recoveryTotal: number }) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-5">
        <div className="flex items-start gap-3">
          <span className="w-10 h-10 rounded-xl bg-white inline-flex items-center justify-center shrink-0 shadow-sm">
            <ShieldCheck className="w-5 h-5 text-emerald-700" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold text-emerald-900">Two-factor authentication is enabled</h2>
            <p className="text-xs text-emerald-800 mt-0.5 leading-relaxed">
              You&apos;ll enter a 6-digit code from your authenticator app every time you sign in.
              {recoveryTotal > 0 && (
                <>
                  {" "}You have <strong>{recoveryRemaining} of {recoveryTotal}</strong> recovery codes unused.
                  {recoveryRemaining <= 3 && (
                    <span className="block mt-1 text-amber-800 font-semibold">
                      Running low — consider regenerating a fresh set.
                    </span>
                  )}
                </>
              )}
            </p>
          </div>
        </div>
      </div>

      <RegeneratePanel />
      <DisablePanel />
    </div>
  );
}

function RegeneratePanel() {
  const [state, formAction, pending] = useActionState(regenerateRecoveryCodesAction, undefined);
  const [open, setOpen] = useState(false);

  if (state?.recoveryCodes) {
    return <RecoveryCodesPanel codes={state.recoveryCodes} title="Save your new recovery codes" />;
  }

  return (
    <section className="rounded-2xl bg-white border border-slate-100 p-5">
      <div className="flex items-start gap-3 mb-3">
        <span className="w-10 h-10 rounded-xl bg-amber-50 inline-flex items-center justify-center shrink-0">
          <KeyRound className="w-5 h-5 text-amber-700" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-slate-900">Regenerate recovery codes</h3>
          <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
            Get a fresh set of 10 codes. The previous set stops working immediately.
          </p>
        </div>
      </div>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Regenerate codes
        </button>
      ) : (
        <form action={formAction} className="border-t border-slate-100 pt-4 space-y-3">
          {state?.error && (
            <div className="flex items-start gap-2 text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded-lg p-2.5">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {state.error}
            </div>
          )}
          <label className="block">
            <span className="text-xs font-semibold text-slate-700">Verify a fresh 6-digit code from your app</span>
            <input
              type="text"
              name="code"
              required
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              autoComplete="one-time-code"
              placeholder="123456"
              className="mt-1 w-44 px-3 py-2 rounded-xl bg-white border border-slate-200 text-base font-mono tracking-widest focus:outline-none focus:ring-4 focus:ring-amber-100 focus:border-amber-400"
            />
          </label>
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={pending}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-600 text-white text-xs font-bold disabled:opacity-50"
            >
              {pending ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Regenerating…</> : "Verify and regenerate"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-3 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

function DisablePanel() {
  const [state, formAction, pending] = useActionState(unenrollAction, undefined);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"totp" | "recovery">("totp");

  if (state?.success) {
    return (
      <div className="rounded-2xl bg-white border border-slate-100 p-5 text-sm text-slate-700">
        {state.success}
      </div>
    );
  }

  return (
    <section className="rounded-2xl bg-white border border-rose-100 p-5">
      <div className="flex items-start gap-3 mb-3">
        <span className="w-10 h-10 rounded-xl bg-rose-50 inline-flex items-center justify-center shrink-0">
          <ShieldOff className="w-5 h-5 text-rose-600" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-slate-900">Disable two-factor authentication</h3>
          <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
            Verify your identity with a fresh authenticator code or one of your recovery codes. The recovery code
            you use will be consumed.
          </p>
        </div>
      </div>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-rose-300 text-xs font-semibold text-rose-700 hover:bg-rose-50"
        >
          <ShieldOff className="w-3.5 h-3.5" /> Disable 2FA
        </button>
      ) : (
        <form action={formAction} className="border-t border-slate-100 pt-4 space-y-3">
          <input type="hidden" name="use_recovery" value={mode === "recovery" ? "1" : "0"} />
          {state?.error && (
            <div className="flex items-start gap-2 text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded-lg p-2.5">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {state.error}
            </div>
          )}

          <div className="inline-flex rounded-lg bg-slate-100 p-1 gap-1 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setMode("totp")}
              className={`px-3 py-1.5 rounded ${mode === "totp" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
            >
              Authenticator code
            </button>
            <button
              type="button"
              onClick={() => setMode("recovery")}
              className={`px-3 py-1.5 rounded ${mode === "recovery" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
            >
              Recovery code
            </button>
          </div>

          <label className="block">
            <span className="text-xs font-semibold text-slate-700">
              {mode === "totp" ? "6-digit code from your app" : "Recovery code (8 chars)"}
            </span>
            {mode === "totp" ? (
              <input
                type="text"
                name="code"
                required
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                autoComplete="one-time-code"
                placeholder="123456"
                className="mt-1 w-44 px-3 py-2 rounded-xl bg-white border border-slate-200 text-base font-mono tracking-widest focus:outline-none focus:ring-4 focus:ring-rose-100 focus:border-rose-400"
              />
            ) : (
              <input
                type="text"
                name="code"
                required
                maxLength={9}
                autoComplete="off"
                placeholder="ABCD-EFGH"
                className="mt-1 w-44 px-3 py-2 rounded-xl bg-white border border-slate-200 text-base font-mono tracking-widest focus:outline-none focus:ring-4 focus:ring-rose-100 focus:border-rose-400"
              />
            )}
          </label>

          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={pending}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-rose-600 text-white text-xs font-bold disabled:opacity-50"
            >
              {pending ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Disabling…</> : "Verify and disable"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-3 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
