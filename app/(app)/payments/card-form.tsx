"use client";

import { useState, useTransition } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements, PaymentElement, useStripe, useElements,
} from "@stripe/react-stripe-js";
import { Plus, Trash2, Check, Loader2, Lock } from "lucide-react";
import { beginCardSetupAction, saveCardAction, removeCardAction, setDefaultCardAction } from "./actions";

// Loaded once, lazily: the publishable key is safe in the browser, but the
// script is ~60KB and most visits to this page never add a card.
let stripePromise: ReturnType<typeof loadStripe> | null = null;
function stripeClient(pk: string) {
  if (!stripePromise) stripePromise = loadStripe(pk);
  return stripePromise;
}

export type CardRow = {
  id: string;
  brand: string | null;
  last4: string | null;
  exp_month: number | null;
  exp_year: number | null;
  is_default: boolean;
};

/** The card number never touches Helpward — PaymentElement is a Stripe iframe. */
function SetupForm({ onDone, onCancel }: { onDone: (msg: string) => void; onCancel: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setBusy(true);
    setError(null);

    const { error: confirmError, setupIntent } = await stripe.confirmSetup({
      elements,
      // Stay on the page unless the bank demands a redirect for 3DS.
      redirect: "if_required",
      confirmParams: { return_url: `${window.location.origin}/payments` },
    });

    if (confirmError) {
      setError(confirmError.message ?? "That card could not be saved.");
      setBusy(false);
      return;
    }
    if (!setupIntent?.id) {
      setError("That card could not be confirmed. Please try again.");
      setBusy(false);
      return;
    }

    // The server re-reads the intent from Stripe; this id is a pointer,
    // not a claim that the card is valid.
    const saved = await saveCardAction(setupIntent.id);
    setBusy(false);
    if (saved.error) setError(saved.error);
    else onDone(saved.success ?? "Card saved.");
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <PaymentElement options={{ layout: "tabs" }} />
      {error && <p className="text-xs text-rose-700">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={!stripe || busy}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-brand-600 text-white text-sm font-semibold disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Lock className="w-4 h-4" aria-hidden="true" />}
          {busy ? "Saving…" : "Save card"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-700 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
      <p className="text-[11px] text-slate-500">
        Your card details go straight to Stripe. Helpward stores only the brand, last four digits and expiry.
      </p>
    </form>
  );
}

export function CardManager({
  cards, publishableKey,
}: { cards: CardRow[]; publishableKey: string | null }) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!publishableKey) {
    return (
      <div className="rounded-2xl bg-white border border-slate-100 p-6 text-center">
        <p className="text-sm text-slate-500">Card payments are not configured on this environment.</p>
      </div>
    );
  }

  async function startAdding() {
    setError(null);
    setMessage(null);
    const begun = await beginCardSetupAction();
    if (begun.error) setError(begun.error);
    else setClientSecret(begun.clientSecret ?? null);
  }

  return (
    <div className="space-y-3">
      {cards.length > 0 && (
        <ul className="rounded-2xl bg-white border border-slate-100 divide-y divide-slate-100 overflow-hidden">
          {cards.map((c) => (
            <li key={c.id} className="p-4 flex items-center gap-3">
              <span className="inline-flex w-10 h-7 rounded items-center justify-center text-white text-[10px] font-bold bg-slate-700 shrink-0">
                {c.brand?.slice(0, 4).toUpperCase() ?? "CARD"}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-slate-900">
                  {c.brand} •••• {c.last4}
                  {c.is_default && (
                    <span className="ml-2 text-[10px] font-bold uppercase tracking-wide text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                      Default
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-500">
                  Expires {String(c.exp_month).padStart(2, "0")}/{c.exp_year}
                </div>
              </div>
              {!c.is_default && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => startTransition(async () => {
                    const r = await setDefaultCardAction(c.id);
                    if (r.error) setError(r.error); else setMessage(r.success ?? null);
                  })}
                  className="text-xs font-semibold text-brand-700 px-2 py-1.5 rounded-lg hover:bg-brand-50 disabled:opacity-50"
                >
                  <Check className="w-3.5 h-3.5 inline mr-1" aria-hidden="true" />Make default
                </button>
              )}
              <button
                type="button"
                disabled={pending}
                onClick={() => startTransition(async () => {
                  const r = await removeCardAction(c.id);
                  if (r.error) setError(r.error); else setMessage(r.success ?? null);
                })}
                className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:text-rose-700 hover:border-rose-200 disabled:opacity-50"
                aria-label={`Remove card ending ${c.last4}`}
              >
                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {clientSecret ? (
        <div className="rounded-2xl bg-white border border-slate-100 p-4">
          <Elements
            stripe={stripeClient(publishableKey)}
            options={{ clientSecret, appearance: { theme: "stripe" } }}
          >
            <SetupForm
              onDone={(msg) => { setClientSecret(null); setMessage(msg); }}
              onCancel={() => setClientSecret(null)}
            />
          </Elements>
        </div>
      ) : (
        <div className={cards.length === 0 ? "rounded-2xl bg-white border border-slate-100 p-6 text-center" : ""}>
          {cards.length === 0 && (
            <p className="text-sm text-slate-500 mb-3">
              Add a card so a helper can be dispatched. You are only charged when a job is finished.
            </p>
          )}
          <button
            type="button"
            onClick={startAdding}
            className="inline-flex items-center gap-2 text-xs font-semibold text-brand-700 border border-brand-200 px-3 py-2 rounded-lg hover:bg-brand-50"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" /> Add payment method
          </button>
        </div>
      )}

      {message && <p className="text-xs text-emerald-700">{message}</p>}
      {error && <p className="text-xs text-rose-700">{error}</p>}
    </div>
  );
}
