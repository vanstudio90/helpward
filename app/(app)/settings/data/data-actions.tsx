"use client";

import { useActionState, useState, useTransition } from "react";
import {
  Download, Trash2, AlertTriangle, CheckCircle2, AlertCircle, Loader2, RotateCcw, Lock,
} from "lucide-react";
import {
  requestDataExportAction,
  requestAccountDeletionAction,
  cancelAccountDeletionAction,
} from "../actions";

export function DataExportCard({
  pendingExportAt,
}: { pendingExportAt: string | null }) {
  const [state, formAction, pending] = useActionState(requestDataExportAction, undefined);
  const [open, setOpen] = useState(false);
  const initialBanner = pendingExportAt && !state
    ? `An export is in progress — requested ${new Date(pendingExportAt).toLocaleDateString()}.`
    : null;

  return (
    <section className="rounded-2xl bg-white border border-slate-100 p-4 sm:p-5">
      <div className="flex items-start gap-3 mb-3">
        <span className="w-10 h-10 rounded-xl bg-brand-50 inline-flex items-center justify-center shrink-0">
          <Download className="w-5 h-5 text-brand-600" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold text-slate-900">Download my data</h2>
          <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
            Get a copy of everything your Helpward account holds — profile, bookings, messages, reviews, payment
            history — in a JSON archive. Auto-assembles within 30 minutes; a download link appears at the top of
            this page when ready.
          </p>
        </div>
      </div>

      {initialBanner && !state?.success && (
        <div className="mb-3 flex items-start gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-lg p-2.5">
          <Loader2 className="w-4 h-4 mt-0.5 shrink-0 animate-spin" /> {initialBanner}
        </div>
      )}
      {state?.error && (
        <div className="mb-3 flex items-start gap-2 text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-lg p-2.5">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {state.error}
        </div>
      )}
      {state?.success && (
        <div className="mb-3 flex items-start gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg p-2.5">
          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> {state.success}
        </div>
      )}

      {!open && !state?.success ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold"
        >
          <Download className="w-4 h-4" /> Request my data
        </button>
      ) : !state?.success ? (
        <form action={formAction} className="space-y-3 border-t border-slate-100 pt-3">
          <label className="block">
            <span className="text-xs font-semibold text-slate-700 inline-flex items-center gap-1">
              <Lock className="w-3 h-3" /> Confirm your password
            </span>
            <input
              type="password"
              name="password"
              required
              autoComplete="current-password"
              placeholder="Your account password"
              className="mt-1 w-full px-3 py-2 rounded-lg bg-white border border-slate-200 text-sm focus:outline-none focus:ring-4 focus:ring-brand-100 focus:border-brand-400"
            />
            <span className="text-[10px] text-slate-500 mt-1 block leading-snug">
              Re-entering your password protects the archive from anyone who might have momentary access to your session.
            </span>
          </label>
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={pending}
              className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-bold disabled:opacity-50"
            >
              {pending ? <><Loader2 className="w-4 h-4 animate-spin" /> Queuing…</> : <><Download className="w-4 h-4" /> Request my data</>}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={pending}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      <p className="text-[11px] text-slate-400 mt-3">
        Archives auto-assemble via cron. The download link expires after 7 days; request a new export anytime.
      </p>
    </section>
  );
}

export function DeleteAccountCard({
  pendingGraceUntil,
}: { pendingGraceUntil: string | null }) {
  const [state, formAction, pending] = useActionState(requestAccountDeletionAction, undefined);
  const [cancelPending, startCancel] = useTransition();
  const [cancelState, setCancelState] = useState<{ error?: string; success?: string } | undefined>(undefined);
  const [open, setOpen] = useState(false);

  // If a deletion is already pending, show the cancel flow instead of the
  // initiate flow. The user can hit Undo any time before grace_until passes.
  if (pendingGraceUntil && !cancelState?.success) {
    return (
      <section className="rounded-2xl bg-rose-50 border border-rose-200 p-4 sm:p-5">
        <div className="flex items-start gap-3 mb-3">
          <span className="w-10 h-10 rounded-xl bg-rose-100 inline-flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-rose-700" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold text-rose-900">Account deletion scheduled</h2>
            <p className="text-xs text-rose-700 mt-0.5 leading-relaxed">
              Your account will be permanently deleted on{" "}
              <strong>{new Date(pendingGraceUntil).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}</strong>.
              Sign back in any time before then and tap <em>Undo</em> to keep your account.
            </p>
          </div>
        </div>
        {cancelState?.error && (
          <div className="mb-3 text-xs text-rose-700 bg-white border border-rose-200 rounded-lg p-2.5">{cancelState.error}</div>
        )}
        <button
          type="button"
          disabled={cancelPending}
          onClick={() => {
            setCancelState(undefined);
            startCancel(async () => {
              const r = await cancelAccountDeletionAction();
              setCancelState(r);
            });
          }}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-rose-300 text-rose-700 text-sm font-semibold disabled:opacity-50"
        >
          {cancelPending ? "Cancelling…" : <><RotateCcw className="w-4 h-4" /> Undo — keep my account</>}
        </button>
      </section>
    );
  }

  return (
    <section className="rounded-2xl bg-white border border-rose-100 p-4 sm:p-5">
      <div className="flex items-start gap-3 mb-3">
        <span className="w-10 h-10 rounded-xl bg-rose-50 inline-flex items-center justify-center shrink-0">
          <Trash2 className="w-5 h-5 text-rose-600" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold text-slate-900">Delete my account</h2>
          <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
            Permanently delete your Helpward account after a 30-day grace period. You can sign back in within the
            window and cancel. Active bookings or unresolved disputes must be resolved first.
          </p>
        </div>
      </div>

      {cancelState?.success && (
        <div className="mb-3 flex items-start gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg p-2.5">
          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> {cancelState.success}
        </div>
      )}

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-rose-300 text-rose-700 text-sm font-semibold hover:bg-rose-50"
        >
          <Trash2 className="w-4 h-4" /> Delete my account
        </button>
      ) : (
        <form action={formAction} className="space-y-3 border-t border-slate-100 pt-3">
          {state?.error && (
            <div className="flex items-start gap-2 text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-lg p-2.5">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {state.error}
            </div>
          )}
          {state?.success && (
            <div className="flex items-start gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg p-2.5">
              <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> {state.success}
            </div>
          )}

          <label className="block">
            <span className="text-xs font-semibold text-slate-700">Why are you leaving? (optional, helps us improve)</span>
            <textarea
              name="reason"
              maxLength={500}
              rows={2}
              placeholder="What didn't work for you?"
              className="mt-1 w-full px-3 py-2 rounded-lg bg-white border border-slate-200 text-sm focus:outline-none focus:ring-4 focus:ring-brand-100 focus:border-brand-400"
            />
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-slate-700">
              Type <code className="bg-slate-100 px-1.5 py-0.5 rounded text-rose-700">DELETE</code> in all caps to confirm
            </span>
            <input
              name="confirm"
              required
              placeholder="DELETE"
              className="mt-1 w-full px-3 py-2 rounded-lg bg-white border border-slate-200 text-sm focus:outline-none focus:ring-4 focus:ring-rose-100 focus:border-rose-400"
            />
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-slate-700 inline-flex items-center gap-1">
              <Lock className="w-3 h-3" /> Confirm your password
            </span>
            <input
              type="password"
              name="password"
              required
              autoComplete="current-password"
              placeholder="Your account password"
              className="mt-1 w-full px-3 py-2 rounded-lg bg-white border border-slate-200 text-sm focus:outline-none focus:ring-4 focus:ring-rose-100 focus:border-rose-400"
            />
            <span className="text-[10px] text-slate-500 mt-1 block leading-snug">
              Required even for the scheduled-not-immediate flow — a leaked session shouldn&apos;t be enough to start
              the 30-day countdown.
            </span>
          </label>

          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={pending || !!state?.success}
              className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-rose-600 text-white text-sm font-bold disabled:opacity-50"
            >
              {pending ? "Scheduling…" : <><Trash2 className="w-4 h-4" /> Schedule deletion</>}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={pending}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700"
            >
              Keep account
            </button>
          </div>
        </form>
      )}

      <p className="text-[11px] text-slate-400 mt-3">
        Reviews and bookings you authored are anonymised (not deleted) so the other party&apos;s records remain
        accurate. Outstanding helper payouts continue to process after deletion.
      </p>
    </section>
  );
}
