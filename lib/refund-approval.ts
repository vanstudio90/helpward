import type { ChargeRefundResult } from "@/lib/payments";

/*
  WHAT HAPPENS AFTER SOMEBODY APPROVES A REFUND.

  This is the sequence the retest broke open, and it is here rather
  than inside the server action for one reason: it can be run. Every
  one of the four failures found — the wrong charge, the ignored
  bookkeeping error, the false "no money moved", the pending refund
  recorded as done — lived in these fifteen lines, and every test that
  existed asserted on the TEXT of them.

  THE ORDER OF THE OUTCOMES MATTERS, because each needs a different
  sentence and a different next step:

    uncertain      Stripe may have taken it. Never "nothing happened".
                   The request stays open and flagged; nothing further
                   may be sent against that booking.
    refused        Stripe said no. No money moved. Safe to fix and retry.
    sent, pending  Stripe has it and has not finished. The customer
                   does not have the money yet.
    sent, recorded Done.
    sent, NOT recorded
                   The one case that must never read as success: money
                   moved and the record did not, so a second attempt
                   would send it twice.
*/

/*
  SENDING IS OFF UNTIL THE JOURNEY HAS BEEN RUN.

  The decision workflow is correct and recorded; what has not yet
  happened is an end-to-end run against Stripe test mode — partial
  tips, a pending outcome, an interrupted response, two approvals at
  once. Until that has been done, approving records the decision and
  deliberately does NOT send, and the console says so rather than
  leaving a button that looks live.

  Set HELPWARD_REFUND_SEND=on to enable it. An explicit switch rather
  than a default, because the failure it guards against is the one
  that costs a customer or a helper real money.
*/
export function refundSendingEnabled(): boolean {
  return process.env.HELPWARD_REFUND_SEND === "on";
}

export type RefundOutcome =
  | { ok: true; message: string; detail?: string }
  | { ok: false; error: string; conflict?: boolean };

export type SettleCall = (args: {
  status: "succeeded" | "pending" | "failed" | "canceled" | "unknown";
  processorId: string | null;
  detail: string | null;
}) => Promise<{ error: { message: string } | null }>;

/**
 * Map Stripe's refund status onto what we record.
 *
 * Anything we do not recognise is treated as PENDING, not as success:
 * an unknown word from a processor is a reason to keep watching, never
 * a reason to tell a customer their money is back.
 */
export function settlementStatusFor(
  processorStatus: string,
): "succeeded" | "pending" | "failed" | "canceled" {
  switch (processorStatus) {
    case "succeeded": return "succeeded";
    case "failed": return "failed";
    case "canceled": return "canceled";
    case "pending": return "pending";
    default: return "pending";
  }
}

export async function recordRefundOutcome(
  sent: ChargeRefundResult,
  settle: SettleCall,
  context: { refundId: string; absorbHelperShare: boolean },
): Promise<RefundOutcome> {
  /* 1. UNKNOWN. The money may have moved. */
  if (!sent.ok && "uncertain" in sent) {
    const settled = await settle({
      status: "unknown", processorId: null, detail: sent.message,
    });
    return {
      ok: false,
      error: `The processor did not answer, so it is NOT known whether this refund was taken. ${
        settled.error
          ? `It could not even be flagged for reconciliation (${settled.error.message}) — check Stripe for operation ${context.refundId} before anything else is sent.`
          : "The request is flagged for reconciliation and nothing further can be sent against this booking until somebody has checked Stripe."
      }`,
    };
  }

  /* 2. REFUSED. Stripe said no and nothing moved. */
  if (!sent.ok) {
    const settled = await settle({
      status: "failed", processorId: null, detail: sent.message,
    });
    return {
      ok: false,
      error: settled.error
        ? `The processor refused the refund (${sent.message}), and recording that ALSO failed (${settled.error.message}). No money moved; the request still reads as sending and needs fixing by hand.`
        : `Approved, but the processor refused it: ${sent.message}. No money has moved and the request is recorded as failed.`,
    };
  }

  /* 3 and 4. It went. What the processor says it is, is what we write. */
  const status = sent.refund.processorStatus;
  const settleStatus = settlementStatusFor(status);

  const settled = await settle({
    status: settleStatus,
    /* The id is kept whatever the status: it is how anybody finds out
       what really happened. */
    processorId: sent.refund.refundId,
    detail: settleStatus === "failed" || settleStatus === "canceled"
      ? `The processor returned ${status}.`
      : null,
  });

  /* 5. MONEY MOVED AND THE RECORD DID NOT. */
  if (settled.error) {
    return {
      ok: false,
      error: `The refund WAS sent to the processor (${sent.refund.refundId}, ${status}) but recording it failed: ${settled.error.message}. Do not send it again — reconcile this request against Stripe.`,
    };
  }

  const who = context.absorbHelperShare
    ? "The helper keeps their share; Helpward carries this refund."
    : "The helper's share was taken back with the refund.";

  if (settleStatus === "failed" || settleStatus === "canceled") {
    return {
      ok: false,
      error: `The processor returned ${status}. No money reached the customer, and the request is recorded as failed.`,
    };
  }

  return {
    ok: true,
    message: settleStatus === "succeeded"
      ? `Approved and sent — ${(sent.refund.amountCents / 100).toFixed(2)} on the ${sent.refund.leg} charge.`
      : `Approved and sent — the processor returned ${status}.`,
    detail: settleStatus === "succeeded"
      ? who
      : `${who} The customer does not have the money yet; this request stays open until the processor finishes.`,
  };
}
