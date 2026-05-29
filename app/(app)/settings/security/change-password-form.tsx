"use client";

import { useActionState, useState } from "react";
import { Lock, Eye, EyeOff, AlertCircle, CheckCircle2 } from "lucide-react";
import { changePasswordAction } from "@/app/(auth)/auth/actions";

export function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState(changePasswordAction, undefined);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [newPwd, setNewPwd] = useState("");

  // Cheap client-side meter — server still enforces 8-128. Just user UX.
  const strength = scorePassword(newPwd);

  return (
    <form action={formAction} className="space-y-3">
      {state?.error && (
        <div className="flex items-start gap-2 text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-lg p-3">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {state.error}
        </div>
      )}
      {state?.success && (
        <div className="flex items-start gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg p-3">
          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> {state.success} You stay signed in on this device.
        </div>
      )}

      <PasswordField
        label="Current password"
        name="current_password"
        autoComplete="current-password"
        show={showCurrent}
        onToggle={() => setShowCurrent((v) => !v)}
      />

      <div>
        <PasswordField
          label="New password"
          name="new_password"
          autoComplete="new-password"
          show={showNew}
          value={newPwd}
          onChange={(v) => setNewPwd(v)}
          onToggle={() => setShowNew((v) => !v)}
          minLength={8}
          maxLength={128}
        />
        {newPwd.length > 0 && (
          <div className="mt-2">
            <div className="h-1 rounded-full bg-slate-100 overflow-hidden">
              <div
                className={`h-full transition-all ${
                  strength.score < 2 ? "bg-rose-500 w-1/4"
                  : strength.score < 3 ? "bg-amber-500 w-2/4"
                  : strength.score < 4 ? "bg-emerald-500 w-3/4"
                  : "bg-emerald-600 w-full"
                }`}
              />
            </div>
            <div className="text-[11px] text-slate-500 mt-1">{strength.label}</div>
          </div>
        )}
      </div>

      <button
        type="submit"
        disabled={pending}
        className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold disabled:opacity-50"
      >
        {pending ? "Updating…" : "Update password"}
      </button>

      <p className="text-[11px] text-slate-400">
        Forgot your current password? Use{" "}
        <a href="/forgot-password" className="text-brand-700 font-semibold hover:underline">Forgot password</a>{" "}
        on the login page instead.
      </p>
    </form>
  );
}

function PasswordField({
  label, name, autoComplete, show, onToggle, value, onChange, minLength, maxLength,
}: {
  label: string; name: string; autoComplete: string; show: boolean;
  onToggle: () => void; value?: string; onChange?: (v: string) => void;
  minLength?: number; maxLength?: number;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-slate-700">{label}</span>
      <div className="mt-1 relative">
        <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type={show ? "text" : "password"}
          name={name}
          required
          minLength={minLength}
          maxLength={maxLength}
          autoComplete={autoComplete}
          value={value}
          onChange={onChange ? (e) => onChange(e.target.value) : undefined}
          className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-white border border-slate-200 text-sm focus:outline-none focus:ring-4 focus:ring-brand-100 focus:border-brand-400"
        />
        <button
          type="button"
          onClick={onToggle}
          aria-label={show ? "Hide password" : "Show password"}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </label>
  );
}

function scorePassword(p: string): { score: number; label: string } {
  let s = 0;
  if (p.length >= 8) s += 1;
  if (p.length >= 12) s += 1;
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) s += 1;
  if (/\d/.test(p)) s += 1;
  if (/[^A-Za-z0-9]/.test(p)) s += 1;
  const labels = ["Too short", "Weak", "OK", "Strong", "Very strong"];
  return { score: Math.min(s, 4), label: labels[Math.min(s, 4)] };
}
