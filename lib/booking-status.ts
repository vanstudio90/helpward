/**
 * What a booking's state is called, to the customer.
 *
 * The raw enum is not it. A booking held up by a bank challenge is
 * `scheduled` with `payment_status = 'pending'`, and showing that as
 * "Scheduled" told the customer a job was arranged when in fact nothing
 * could happen until they acted — while the dashboard simultaneously
 * said "Nothing in progress".
 */
export function bookingStatusLabel(
  status: string,
  paymentStatus?: string | null,
  hasIntent = true,
): { label: string; needsCustomer: boolean } {
  if (status === "scheduled" && hasIntent) {
    if (paymentStatus === "pending") {
      return { label: "Payment confirmation needed", needsCustomer: true };
    }
    if (paymentStatus === "failed") {
      return { label: "Card declined", needsCustomer: true };
    }
  }
  if (status === "in_progress") return { label: "In progress", needsCustomer: false };
  return {
    label: status[0].toUpperCase() + status.slice(1),
    needsCustomer: false,
  };
}

/** Tailwind tones, so the urgent states do not look like the calm ones. */
export function bookingStatusTone(status: string, needsCustomer: boolean): string {
  if (needsCustomer) return "bg-amber-50 text-amber-800 border border-amber-200";
  switch (status) {
    case "in_progress": return "bg-emerald-50 text-emerald-700";
    case "completed":   return "bg-emerald-50 text-emerald-700";
    case "cancelled":   return "bg-rose-50 text-rose-700";
    case "disputed":    return "bg-amber-50 text-amber-700";
    default:            return "bg-brand-50 text-brand-700";
  }
}
