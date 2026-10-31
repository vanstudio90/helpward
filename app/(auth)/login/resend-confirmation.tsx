"use client";

import { useActionState } from "react";
import { MailCheck, AlertCircle, CheckCircle2 } from "lucide-react";
import { resendConfirmationAction } from "../auth/actions";

/* Offered only when a sign-in was refused because the address is
 * unconfirmed. Telling someone to "check your inbox" is no help when the
 * original link is a week old or never arrived, so the recovery is on the
 * screen where they hit the wall rather than in a support email. */
export function ResendConfirmation({ email }: { email: string }) {
  const [state, formAction, pending] = useActionState(resendConfirmationAction, undefined);

  if (state?.success) {
    return (
      <p className="mt-2 flex items-start gap-2 text-xs text-emerald-700">
        <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
        {state.success}
      </p>
    );
  }

  return (
    <form action={formAction} className="mt-2">
      <input type="hidden" name="email" value={email} />
      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-800 underline underline-offset-2 hover:text-rose-900 disabled:opacity-50"
      >
        <MailCheck className="w-3.5 h-3.5" aria-hidden="true" />
        {pending ? "Sending…" : "Send the link again"}
      </button>
      {state?.error && (
        <p className="mt-1.5 flex items-start gap-1.5 text-xs text-rose-700">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" /> {state.error}
        </p>
      )}
    </form>
  );
}
