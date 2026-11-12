import "server-only";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { refundCharge } from "@/lib/payments";
import { refundSendingEnabled } from "@/lib/refund-approval";

/*
  GIVING BACK MONEY THAT WAS ALREADY TAKEN, WHEN A BOOKING IS CANCELLED.

  Normally cancelling releases a hold and nothing is ever charged. Two
  cases do not work that way:

    * the job was completed between the customer pressing cancel and
      the hold being released — a race that used to end with the
      customer charged in full for a cancelled booking, and NOTHING
      recorded it. Stripe's own error said "This booking has already
      been charged; refund it instead" and the code discarded it;

    * the booking had already been captured when they cancelled.

  In both, the customer is owed money back. This raises a refund
  request through the same workflow an operator would use, so it
  inherits every protection built there: the reason decides who
  carries it, the amount is checked against what is left, the request
  is recorded whether or not it can be sent yet.

  WHY service_issue: the work was not delivered, so the helper's share
  goes back with the refund. The cancellation fee is not part of this
  amount — it was kept deliberately and stays kept.

  SENDING STILL RESPECTS THE SWITCH. With sending off the request is
  created and waits for a person, and the customer is told it is on
  its way rather than that it has arrived.
*/
export async function refundCapturedRemainder(
  bookingId: string,
  amountCents: number,
): Promise<{ ok: boolean; note?: string }> {
  if (amountCents <= 0) return { ok: true };

  const admin = createSupabaseServiceClient();
  const { data, error } = await admin.rpc("admin_refund_request", {
    p_booking: bookingId,
    p_leg: "service",
    p_amount_cents: amountCents,
    p_reason: "service_issue",
    p_note: "Raised automatically when the customer cancelled a booking that had already been charged.",
  });

  if (error) {
    /*
      The money is taken and we could not even record that it is owed.
      This must be loud: it is the one state where a customer is out of
      pocket and nothing in the system knows.
    */
    console.error("CANCELLED BOOKING OWES A REFUND AND IT COULD NOT BE RECORDED", {
      bookingId, amountCents, error,
    });
    return {
      ok: false,
      note: "You have been charged for this booking and we could not start the refund automatically. Our team has been alerted and will return it.",
    };
  }

  const refundId = (data as { refund_id: string }).refund_id;

  if (!refundSendingEnabled()) {
    return {
      ok: true,
      note: "You were already charged for this booking. A refund of the balance has been raised and will be returned to your card.",
    };
  }

  /*
    Sending is on, so it goes now — through the same decision trail:
    approved by the system with the cancellation as its reason, then
    sent, then whatever the processor says is recorded on the request.
  */
  const { data: decided, error: decideError } = await admin.rpc("admin_refund_decide", {
    p_refund: refundId,
    p_expected: null,
    p_approve: true,
    p_reason: "The customer cancelled a booking that had already been charged.",
  });
  if (decideError) {
    console.error("automatic cancellation refund not approved", { bookingId, decideError });
    return { ok: true, note: "A refund of the balance has been raised and is awaiting review." };
  }

  const decision = decided as { absorb_helper_share: boolean };
  const sent = await refundCharge({
    bookingId, leg: "service", amountCents,
    absorbHelperShare: decision.absorb_helper_share,
    operationId: refundId,
  });

  if (!sent.ok) {
    await admin.rpc("admin_refund_settle", {
      p_refund: refundId,
      p_status: "uncertain" in sent ? "unknown" : "failed",
      p_processor_id: null,
      p_detail: sent.message,
    });
    return {
      ok: false,
      note: "You were already charged for this booking. The refund did not go through on the first attempt and our team is completing it.",
    };
  }

  await admin.rpc("admin_refund_settle", {
    p_refund: refundId,
    p_status: sent.refund.processorStatus === "succeeded" ? "succeeded" : "pending",
    p_processor_id: sent.refund.refundId,
    p_detail: null,
  });

  return {
    ok: true,
    note: sent.refund.processorStatus === "succeeded"
      ? "The balance has been refunded to your card."
      : "The balance is being refunded to your card and should appear within a few days.",
  };
}
