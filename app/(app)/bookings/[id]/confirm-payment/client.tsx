"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { loadStripe } from "@stripe/stripe-js";
import { ShieldCheck, Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { startPaymentConfirmationAction, finishPaymentConfirmationAction } from "./actions";

let stripePromise: ReturnType<typeof loadStripe> | null = null;
function stripeClient(pk: string) {
  if (!stripePromise) stripePromise = loadStripe(pk);
  return stripePromise;
}

type Phase = "loading" | "ready" | "challenging" | "done" | "error";

/**
 * Completes a bank challenge (3D Secure) on a booking whose hold could not
 * be placed off-session.
 *
 * Elements is not used here: the card is already saved and the intent
 * already exists, so there is nothing to collect. handleNextAction runs
 * the bank's own challenge and nothing else.
 */
export function ConfirmPaymentClient({
  bookingId, publishableKey,
}: { bookingId: string; publishableKey: string | null }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [amount, setAmount] = useState<{ cents: number; currency: string } | null>(null);
  const [secret, setSecret] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const started = await startPaymentConfirmationAction(bookingId);
      if (cancelled) return;
      if ("error" in started && started.error) {
        // Already confirmed is not a failure — it is the happy ending
        // arriving before this page did.
        if (started.code === "already_authorized") {
          setPhase("done");
          setMessage("This payment is already confirmed.");
          return;
        }
        setPhase("error");
        setMessage(started.error);
        return;
      }
      setSecret(started.clientSecret ?? null);
      setAmount({ cents: started.amountCents ?? 0, currency: started.currency ?? "USD" });
      setPhase("ready");
    })();
    return () => { cancelled = true; };
  }, [bookingId]);

  async function runChallenge() {
    if (!publishableKey || !secret) return;
    setPhase("challenging");
    setMessage(null);

    const stripe = await stripeClient(publishableKey);
    if (!stripe) { setPhase("error"); setMessage("Could not reach Stripe."); return; }

    // confirmCardPayment, not handleNextAction.
    //
    // A card that always challenges fails the off-session confirm with
    // authentication_required, and the intent it leaves behind sits at
    // requires_payment_method with no next_action attached — so
    // handleNextAction has nothing to run and returns immediately as if
    // everything were fine. Confirming again, with the customer present
    // and the card already on the intent, is the documented recovery.
    const { error } = await stripe.confirmCardPayment(secret);
    if (error) {
      setPhase("error");
      setMessage(error.message ?? "Your bank didn't approve that.");
      return;
    }

    // The server re-reads the intent. This page does not get to decide.
    const finished = await finishPaymentConfirmationAction(bookingId);
    if (finished.error) { setPhase("error"); setMessage(finished.error); return; }
    setPhase("done");
    setMessage(finished.success ?? "Payment confirmed.");
  }

  const money = amount ? `$${(amount.cents / 100).toFixed(2)} ${amount.currency}` : "";

  return (
    <div className="rounded-2xl bg-white border border-slate-200 p-5 sm:p-6">
      {phase === "loading" && (
        <p className="text-sm text-slate-500 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Checking this payment…
        </p>
      )}

      {phase === "ready" && (
        <>
          <div className="flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-brand-600 mt-0.5 shrink-0" aria-hidden="true" />
            <div>
              <h2 className="text-base font-bold text-slate-900">Your bank needs to check it&rsquo;s you</h2>
              <p className="text-sm text-slate-600 mt-1">
                Confirming places a hold of {money}. You&rsquo;re charged when the job is finished,
                not now — and nothing is held until your bank approves this.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={runChallenge}
            className="mt-4 w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-semibold"
          >
            Confirm with my bank
          </button>
        </>
      )}

      {phase === "challenging" && (
        <p className="text-sm text-slate-600 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          Waiting for your bank…
        </p>
      )}

      {phase === "done" && (
        <div className="flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" aria-hidden="true" />
          <div>
            <h2 className="text-base font-bold text-slate-900">{message}</h2>
            <Link href={`/bookings/${bookingId}`} className="text-sm font-semibold text-brand-700 mt-2 inline-block">
              Back to the booking
            </Link>
          </div>
        </div>
      )}

      {phase === "error" && (
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <h2 className="text-base font-bold text-slate-900">That didn&rsquo;t go through</h2>
            <p className="text-sm text-slate-600 mt-1">{message}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {secret && (
                <button
                  type="button"
                  onClick={runChallenge}
                  className="px-3 py-2 rounded-xl bg-brand-600 text-white text-sm font-semibold"
                >
                  Try again
                </button>
              )}
              <Link
                href="/payments"
                className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-700"
              >
                Use a different card
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
