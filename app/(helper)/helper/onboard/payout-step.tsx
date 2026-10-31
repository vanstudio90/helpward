"use client";

import { useActionState } from "react";
import { describeDisabledReason } from "@/lib/stripe-disabled-reason";
import { AlertTriangle, ExternalLink, RefreshCw } from "lucide-react";
import { startPayoutSetupAction, refreshPayoutStatusAction } from "./actions";

type Result = { error?: string; success?: string } | null;

export type PayoutState = {
  started: boolean;
  payable: boolean;
  detailsSubmitted: boolean;
  requirementsDue: string[];
  disabledReason: string | null;
};

// Stripe's requirement keys are API identifiers. Shown raw they read as
// gibberish to a helper trying to work out what is missing.
/* Stripe's requirement keys, in words.
 *
 * Only `individual.*` was mapped, but Stripe returns `representative.*`
 * for the accounts this platform creates — so a helper was shown the raw
 * tail of each key and the list read "Day", "Month", "Business type".
 * "Day" is not a thing anyone can go and supply.
 *
 * Both prefixes map to the same labels, because they mean the same thing
 * to the person reading them.
 */
const REQUIREMENT_LABELS: Record<string, string> = {
  "verification.document": "A photo of your ID",
  "id_number": "Your full SSN or SIN",
  "ssn_last_4": "The last 4 digits of your SSN",
  "dob.day": "Your date of birth",
  "dob.month": "Your date of birth",
  "dob.year": "Your date of birth",
  "address.line1": "Your home address",
  "address.city": "Your home address",
  "address.postal_code": "Your home address",
  "first_name": "Your legal first name",
  "last_name": "Your legal last name",
  "email": "Your email address",
  "phone": "Your phone number",
};

const FLAT_LABELS: Record<string, string> = {
  external_account: "A bank account to be paid into",
  business_type: "Whether you work as an individual or a business",
  "business_profile.url": "A website or profile link",
  "business_profile.mcc": "What kind of work you do",
  "business_profile.support_phone": "A phone number customers can reach you on",
  "tos_acceptance.date": "Accepting Stripe's terms",
  "tos_acceptance.ip": "Accepting Stripe's terms",
};

function describeRequirement(key: string): string {
  if (FLAT_LABELS[key]) return FLAT_LABELS[key];
  // individual.dob.day and representative.dob.day mean the same thing.
  const withoutPerson = key.replace(/^(individual|representative|company|owners?)\./, "");
  if (REQUIREMENT_LABELS[withoutPerson]) return REQUIREMENT_LABELS[withoutPerson];
  // Fall back to something readable rather than the raw key.
  return withoutPerson.split(".").pop()!.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

/** The same requirement can arrive as three keys; show it once. */
export function describeRequirements(keys: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of keys) {
    const label = describeRequirement(k);
    if (seen.has(label)) continue;
    seen.add(label);
    out.push(label);
  }
  return out;
}

export function PayoutStep({ state }: { state: PayoutState }) {
  const [startResult, start, starting] = useActionState<Result, FormData>(
    async () => (await startPayoutSetupAction()) ?? null,
    null,
  );
  const [refreshResult, refresh, refreshing] = useActionState<Result, FormData>(
    async () => (await refreshPayoutStatusAction()) ?? null,
    null,
  );

  const message = startResult ?? refreshResult;

  if (state.payable) {
    return (
      <p className="text-[13px] text-emerald-700 mt-1">
        Bank account connected. Earnings are paid out automatically.
      </p>
    );
  }

  const disabled = describeDisabledReason(state.disabledReason);

  return (
    <div className="mt-2 space-y-2">
      {/* Not every disabled_reason is a problem.
          This block used to render "Stripe has paused this account.
          Contact support@helpward.com." for ANY non-null reason — including
          requirements.past_due, which is simply what Stripe calls an
          account whose onboarding form was never finished. A helper who had
          not yet typed their date of birth was told their account had been
          paused, and sent to support for it. */}
      {disabled && (
        <p className={`text-[13px] flex items-start gap-1.5 ${
          disabled.serious ? "text-rose-700" : "text-amber-700"
        }`}>
          <AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0" aria-hidden="true" />
          {disabled.message}
        </p>
      )}

      {state.started && state.requirementsDue.length > 0 && (
        <div className="text-[13px] text-slate-600">
          <p className="font-semibold text-slate-700">Stripe still needs:</p>
          <ul className="mt-1 space-y-0.5 list-disc list-inside">
            {describeRequirements(state.requirementsDue).slice(0, 6).map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-[13px] text-slate-500">
        Stripe collects your bank and tax details on their own pages and handles your tax forms.
        Helpward never sees your account number.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <form action={start}>
          <button
            type="submit"
            disabled={starting}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-field bg-brand-600 text-white text-[13px] font-semibold disabled:opacity-50"
          >
            <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
            {starting ? "Opening Stripe…" : state.started ? "Finish payout setup" : "Set up payouts"}
          </button>
        </form>

        {state.started && (
          <form action={refresh}>
            <button
              type="submit"
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-field border border-slate-300 bg-white text-[13px] font-semibold text-slate-700 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} aria-hidden="true" />
              Check status
            </button>
          </form>
        )}
      </div>

      {message?.error && <p className="text-[13px] text-rose-700">{message.error}</p>}
      {message?.success && <p className="text-[13px] text-emerald-700">{message.success}</p>}
    </div>
  );
}
