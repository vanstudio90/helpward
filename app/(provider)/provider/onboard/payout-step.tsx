"use client";

import { useActionState } from "react";
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
const REQUIREMENT_LABELS: Record<string, string> = {
  "individual.verification.document": "A photo of your ID",
  "individual.id_number": "Your full SSN or SIN",
  "individual.ssn_last_4": "The last 4 digits of your SSN",
  "individual.dob.day": "Your date of birth",
  "individual.address.line1": "Your home address",
  "individual.first_name": "Your legal first name",
  "individual.last_name": "Your legal last name",
  "individual.email": "Your email address",
  "individual.phone": "Your phone number",
  external_account: "A bank account to be paid into",
  "business_profile.url": "A website or profile link",
  "business_profile.mcc": "What kind of work you do",
  "tos_acceptance.date": "Accepting Stripe's terms",
};

function describeRequirement(key: string): string {
  if (REQUIREMENT_LABELS[key]) return REQUIREMENT_LABELS[key];
  // Fall back to something readable rather than the raw key.
  return key.split(".").pop()!.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
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
      <p className="text-xs text-emerald-700 mt-1">
        Bank account connected. Earnings are paid out automatically.
      </p>
    );
  }

  return (
    <div className="mt-2 space-y-2">
      {state.disabledReason && (
        <p className="text-xs text-rose-700 flex items-start gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0" aria-hidden="true" />
          Stripe has paused this account. Contact support@helpward.com.
        </p>
      )}

      {state.started && state.requirementsDue.length > 0 && (
        <div className="text-xs text-slate-600">
          <p className="font-semibold text-slate-700">Stripe still needs:</p>
          <ul className="mt-1 space-y-0.5 list-disc list-inside">
            {state.requirementsDue.slice(0, 6).map((r) => (
              <li key={r}>{describeRequirement(r)}</li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs text-slate-500">
        Stripe collects your bank and tax details on their own pages and handles your tax forms.
        Helpward never sees your account number.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <form action={start}>
          <button
            type="submit"
            disabled={starting}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-brand-600 text-white text-xs font-semibold disabled:opacity-50"
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
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-700 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} aria-hidden="true" />
              Check status
            </button>
          </form>
        )}
      </div>

      {message?.error && <p className="text-xs text-rose-700">{message.error}</p>}
      {message?.success && <p className="text-xs text-emerald-700">{message.success}</p>}
    </div>
  );
}
