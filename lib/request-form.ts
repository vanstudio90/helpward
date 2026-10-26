// Fields the new-request form owns, captured so a failed submit can be
// refilled.
//
// Lives here rather than in the server action because a "use server"
// module may only export async functions — and this needs to be directly
// testable: the bug it fixes is a silent one. The form came back asking
// the customer to confirm an address and simply lost everything else they
// had typed.

/**
 * What the customer typed, echoed back so the form can be refilled.
 *
 * React 19 resets an uncontrolled form once its action resolves. That is
 * fine for a success, and wrong for everything else: a request that came
 * back needing address confirmation lost the notes and every
 * service-specific answer, and the resubmit then failed required-field
 * validation on fields the customer had already filled in.
 *
 * Only genuinely uncontrolled fields are affected. The address, the
 * ASAP/scheduled choice, the chosen time and the bundle all live in React
 * state and survive on their own — "restoring" those would have cleared
 * them.
 */
export type SubmittedValues = {
  serviceId: string;
  address: string;
  notes: string;
  /** ISO string the picker submits; the visible input is unnamed. */
  scheduledFor: string;
  bundleItems: string;
  preferredHelperId: string;
  /** intake_<key> fields, with their `intake_` prefix removed. */
  intake: Record<string, string | string[]>;
};

/** Read every field the form owns, so a failed submit can be refilled. */
export function collectSubmitted(formData: FormData): SubmittedValues {
  const intake: Record<string, string | string[]> = {};
  for (const key of new Set(formData.keys())) {
    if (!key.startsWith("intake_")) continue;
    const all = formData.getAll(key).map(String);
    // Checkbox groups submit repeated keys; everything else is scalar.
    intake[key.slice("intake_".length)] = all.length > 1 ? all : all[0] ?? "";
  }
  const str = (k: string) => String(formData.get(k) ?? "");
  return {
    serviceId: str("service_id"),
    address: str("address"),
    notes: str("notes"),
    scheduledFor: str("scheduled_for"),
    bundleItems: str("bundle_items"),
    preferredHelperId: str("preferred_helper_id"),
    intake,
  };
}

