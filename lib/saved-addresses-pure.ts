// Pure helpers for saved addresses — safe to import from both client
// components and server actions. Kept outside the "use server" boundary
// so the validation rules stay shared.

export const MAX_LABEL_LEN = 40;
export const MAX_FORMATTED_LEN = 300;

// Common label suggestions surfaced in the add form so users can one-tap a
// canonical name instead of inventing one. We keep this short to avoid
// decision fatigue.
export const LABEL_SUGGESTIONS = ["Home", "Work", "Gym", "Mom's", "Office"] as const;

export type SavedAddressDraft = {
  label: string;
  formatted: string;
};

export function validateSavedAddress(d: SavedAddressDraft): string | null {
  const label = d.label.trim();
  const formatted = d.formatted.trim();
  if (label.length === 0) return "Add a short label like \"Home\" or \"Office\".";
  if (label.length > MAX_LABEL_LEN) return `Label is too long — max ${MAX_LABEL_LEN} characters.`;
  if (formatted.length < 3) return "Address is too short.";
  if (formatted.length > MAX_FORMATTED_LEN) return `Address is too long — max ${MAX_FORMATTED_LEN} characters.`;
  return null;
}
