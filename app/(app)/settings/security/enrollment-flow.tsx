"use client";

import { useActionState, useState, useTransition } from "react";
import {
  Shield, AlertCircle, CheckCircle2, Loader2, Smartphone, Copy, ChevronRight, KeyRound,
} from "lucide-react";
import {
  startEnrollmentAction, verifyEnrollmentAction,
} from "./mfa-actions";

type EnrollmentSeed = {
  factorId?: string;
  qrSvg?: string;
  uri?: string;
  secret?: string;
  error?: string;
};

// Three-step flow: explain → scan + enter code → save recovery codes.
// Recovery codes are surfaced ONCE; if the user navigates away without
// saving, they can regenerate from the same settings page but the old
// codes are then invalid.
export function EnrollmentFlow() {
  const [phase, setPhase] = useState<"idle" | "enrolling" | "verifying" | "saved">("idle");
  const [seed, setSeed] = useState<EnrollmentSeed | null>(null);
  const [pending, start] = useTransition();
  const [verifyState, verifyAction, verifying] = useActionState(
    seed?.factorId ? verifyEnrollmentAction.bind(null, seed.factorId) : noopVerify,
    undefined,
  );

  // Move to "saved" once codes come back from the server action.
  if (verifyState?.recoveryCodes && phase !== "saved") {
    setPhase("saved");
  }

  const begin = () => {
    setPhase("enrolling");
    start(async () => {
      const r = await startEnrollmentAction();
      if (r?.error) {
        setSeed({ error: r.error });
        setPhase("idle");
      } else {
        setSeed(r ?? null);
        setPhase("verifying");
      }
    });
  };

  if (phase === "idle") {
    return (
      <div className="rounded-2xl bg-white border border-slate-100 p-5">
        <div className="flex items-start gap-3 mb-3">
          <span className="w-10 h-10 rounded-xl bg-brand-50 inline-flex items-center justify-center shrink-0">
            <Shield className="w-5 h-5 text-brand-600" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold text-slate-900">Two-factor authentication</h2>
            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
              Add an extra step to sign-in with an authenticator app (Google Authenticator, 1Password, Authy,
              Microsoft Authenticator). After enrolling you&apos;ll enter a 6-digit code from your app every time
              you log in.
            </p>
          </div>
        </div>
        {seed?.error && (
          <div className="mb-3 flex items-start gap-2 text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded-lg p-2.5">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {seed.error}
          </div>
        )}
        <button
          type="button"
          onClick={begin}
          disabled={pending}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold disabled:opacity-50"
        >
          {pending ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Preparing…</>
          ) : (
            <><Shield className="w-4 h-4" /> Set up 2FA</>
          )}
        </button>
        <p className="mt-2 text-[11px] text-slate-400">
          You&apos;ll need an authenticator app installed first. We recommend 1Password, Authy, or Google
          Authenticator.
        </p>
      </div>
    );
  }

  if (phase === "verifying" && seed?.qrSvg) {
    return (
      <div className="rounded-2xl bg-white border border-slate-100 p-5">
        <h2 className="text-base font-bold text-slate-900 mb-2 inline-flex items-center gap-2">
          <Smartphone className="w-4 h-4 text-brand-600" /> Scan the QR code
        </h2>
        <p className="text-xs text-slate-500 mb-4">
          Open your authenticator app, tap &ldquo;Add account,&rdquo; and scan this code. Then type the 6-digit
          code your app shows.
        </p>

        <div className="grid sm:grid-cols-[200px_1fr] gap-4 mb-4">
          <div className="rounded-2xl bg-white border border-slate-200 p-3 inline-flex items-center justify-center">
            <div
              className="w-44 h-44"
              dangerouslySetInnerHTML={{ __html: seed.qrSvg }}
            />
          </div>
          <div className="text-xs text-slate-600 space-y-2">
            <div>
              <div className="font-semibold text-slate-900 mb-1">Can&apos;t scan?</div>
              <p className="leading-relaxed">
                Tap &ldquo;Enter setup key&rdquo; in your app and paste the secret below.
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-2.5 font-mono text-[11px] break-all">
              {seed.secret}
            </div>
            {seed.secret && (
              <CopyButton text={seed.secret} label="Copy secret" />
            )}
          </div>
        </div>

        <form action={verifyAction} className="space-y-3">
          {verifyState?.error && (
            <div className="flex items-start gap-2 text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded-lg p-2.5">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {verifyState.error}
            </div>
          )}
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
              placeholder="123456"
              className="mt-1 w-44 px-3 py-2.5 rounded-xl bg-white border border-slate-200 text-base font-mono tracking-widest focus:outline-none focus:ring-4 focus:ring-brand-100 focus:border-brand-400"
            />
          </label>
          <button
            type="submit"
            disabled={verifying}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold disabled:opacity-50"
          >
            {verifying ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Verifying…</>
            ) : (
              <>Verify and enable</>
            )}
          </button>
        </form>
      </div>
    );
  }

  if (phase === "saved" && verifyState?.recoveryCodes) {
    return <RecoveryCodesPanel codes={verifyState.recoveryCodes} />;
  }

  return null;
}

function noopVerify(_: unknown): undefined { return undefined; }

// Shown once. After this the only way to retrieve codes is to regenerate
// (which invalidates the previous set).
export function RecoveryCodesPanel({
  codes, title = "Save your recovery codes",
}: { codes: string[]; title?: string }) {
  const [confirmed, setConfirmed] = useState(false);

  if (confirmed) {
    return (
      <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-5 flex items-start gap-3">
        <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
        <div>
          <div className="text-sm font-bold text-emerald-900">Two-factor authentication is on</div>
          <div className="text-xs text-emerald-800 mt-0.5">
            You&apos;ll be asked for a code from your app every time you sign in.
          </div>
        </div>
      </div>
    );
  }

  const text = codes.join("\n");
  return (
    <div className="rounded-2xl bg-amber-50 border border-amber-200 p-5">
      <div className="flex items-start gap-3 mb-3">
        <span className="w-10 h-10 rounded-xl bg-white inline-flex items-center justify-center shrink-0 shadow-sm">
          <KeyRound className="w-5 h-5 text-amber-700" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold text-amber-900">{title}</h2>
          <p className="text-xs text-amber-800 mt-0.5 leading-relaxed">
            Store these somewhere safe — a password manager, a printed page in a drawer, a sealed envelope.
            They&apos;re the only way to sign in if you lose access to your authenticator app. We&apos;ll never
            show them again.
          </p>
        </div>
      </div>

      <ul className="my-4 grid grid-cols-2 gap-2 font-mono text-sm">
        {codes.map((c) => (
          <li
            key={c}
            className="bg-white border border-amber-200 rounded-lg px-3 py-2 text-amber-900 tracking-widest"
          >
            {c}
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-2">
        <CopyButton text={text} label="Copy all" tone="amber" />
        <a
          href={`data:text/plain;charset=utf-8,${encodeURIComponent("Helpward recovery codes\n\n" + text + "\n\nKeep these safe. Each code works once.")}`}
          download="helpward-recovery-codes.txt"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-amber-300 text-amber-900 text-xs font-semibold hover:bg-amber-50"
        >
          Download as .txt
        </a>
        <span className="grow" />
        <button
          type="button"
          onClick={() => setConfirmed(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700"
        >
          I&apos;ve saved them <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

function CopyButton({ text, label, tone }: { text: string; label: string; tone?: "amber" }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {/* ignore */}
  };
  const cls = tone === "amber"
    ? "bg-white border border-amber-300 text-amber-900 hover:bg-amber-50"
    : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50";
  return (
    <button
      type="button"
      onClick={copy}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold ${cls}`}
    >
      {copied ? <><CheckCircle2 className="w-3.5 h-3.5" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> {label}</>}
    </button>
  );
}
