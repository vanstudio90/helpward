"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { refundCharge } from "@/lib/payments";
import { recordRefundOutcome, refundSendingEnabled } from "@/lib/refund-approval";

/*
  ASKING FOR A REFUND, AND DECIDING ONE.

  THE SPLIT THAT MATTERS: the database decides whether a refund MAY
  happen — who may ask, whether the money is there once refunds in
  flight are counted, who carries the cost, and whether this person is
  allowed to approve it. Stripe is the only thing that makes it happen.

  Approval is two steps on purpose. The row moves to `processing`
  first, which is what stops a second approval double-sending while the
  first is at the processor. Only then is the refund sent, and whatever
  comes back is written to the same row.

  THREE THINGS THIS FILE GOT WRONG, and what each one now does:

  * IT SENT THE WRONG MONEY. An approved CA$5 TIP refund was handed to
    refundBooking() as `{ amountCents: undefined, includeTip: true }`,
    which means "everything left on the service charge, plus the whole
    tip". It now calls refundCharge(), which takes one named leg and
    one exact amount and cannot express that request.

  * IT IGNORED THE BOOKKEEPING. The settlement call's own error was
    never read, so a refund whose record failed to save still reported
    "Approved and sent". Every settlement response is now checked, and
    a failure to record is reported as what it is: money that moved and
    a record that did not.

  * IT CALLED AN UNKNOWN OUTCOME A FAILURE. "The refund was NOT sent
    and no money has moved" was printed for a case where Stripe may
    well have taken it. An uncertain outcome is now its own state: the
    request stays open, flagged for reconciliation, and nothing further
    may be sent against that booking until somebody has checked.
*/

export type RefundResult =
  | { ok: true; message: string; detail?: string; refundId?: string }
  | { ok: false; error: string; conflict?: boolean };

function fail(error: { message?: string; code?: string } | null): RefundResult {
  const message = (error?.message ?? "The refund could not be recorded.")
    .replace(/^[^:]*:\s*/, "").trim();
  switch (error?.code) {
    case "42501": return { ok: false, error: "You are not permitted to decide refunds." };
    case "HW080": return { ok: false, error: message, conflict: true };
    case "HW130": case "HW131": case "HW132": case "HW133":
    case "HW134": case "HW136": case "HW137":
      return { ok: false, error: message };
    case "HW135": return { ok: false, error: "That refund request no longer exists. Reload the queue." };
    default: return { ok: false, error: error?.message ?? "The refund could not be recorded." };
  }
}

export async function requestRefundAction(input: {
  bookingId: string;
  leg: "service" | "tip";
  amountCents: number;
  reason: string;
  note?: string | null;
}): Promise<RefundResult> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_refund_request", {
    p_booking: input.bookingId,
    p_leg: input.leg,
    p_amount_cents: input.amountCents,
    p_reason: input.reason,
    p_note: input.note ?? null,
  });
  if (error) return fail(error);
  const result = data as { refund_id: string; note: string };
  revalidatePath("/admin/refunds");
  return {
    ok: true,
    refundId: result.refund_id,
    message: "Requested. Nothing has been sent yet.",
    /* Who carries the cost is decided by the reason, and it is said
       here rather than discovered on somebody's payout statement. */
    detail: result.note,
  };
}

export async function decideRefundAction(
  refundId: string,
  expectedUpdatedAt: string | null,
  approve: boolean,
  reason: string,
): Promise<RefundResult> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_refund_decide", {
    p_refund: refundId,
    p_expected: expectedUpdatedAt,
    p_approve: approve,
    p_reason: reason,
  });
  if (error) return fail(error);

  const decision = data as {
    approved: boolean; amount_cents: number; leg: string;
    booking_id: string; absorb_helper_share: boolean; note: string;
  };

  if (!decision.approved) {
    revalidatePath("/admin/refunds");
    return { ok: true, message: "Declined.", detail: decision.note };
  }

  if (!refundSendingEnabled()) {
    /* Approved and left at the door on purpose. The row stays
       `processing`, which is exactly what it is. */
    revalidatePath("/admin/refunds");
    return {
      ok: true,
      message: "Approved — and NOT sent.",
      detail: "Sending is switched off until the end-to-end run against Stripe test mode has been done. The decision is recorded and the request is waiting; no money has moved.",
    };
  }

  /*
    THE ONLY PLACE MONEY ACTUALLY MOVES. One named charge, the exact
    amount that was approved, and the refund request's own id as the
    idempotency key — so a retry of this approval can never become a
    second refund.
  */
  const sent = await refundCharge({
    bookingId: decision.booking_id,
    leg: decision.leg === "tip" ? "tip" : "service",
    amountCents: decision.amount_cents,
    absorbHelperShare: decision.absorb_helper_share,
    operationId: refundId,
  });

  /* Every settlement response is checked. See lib/refund-approval.ts
     for why each outcome gets its own sentence. */
  const outcome = await recordRefundOutcome(
    sent,
    async ({ status, processorId, detail }) => {
      const { error: settleError } = await supabase.rpc("admin_refund_settle", {
        p_refund: refundId, p_status: status,
        p_processor_id: processorId, p_detail: detail,
      });
      return { error: settleError ? { message: settleError.message } : null };
    },
    { refundId, absorbHelperShare: decision.absorb_helper_share },
  );

  revalidatePath("/admin/refunds");
  revalidatePath("/admin/payments");
  return outcome;
}

/*
  SENDING A REFUND THAT WAS ALREADY APPROVED.

  Turning the switch on does not reach back and send the rows that
  were approved while it was off — they sit in `processing` with no
  processor id, which is exactly what they are. Re-approving them is
  not possible (and should not be: the decision was already taken by
  somebody, and that record stands), so there has to be a deliberate
  way to send one.

  This is that way. It sends an already-approved request and records
  what comes back, through the same path as approval — one named leg,
  the exact approved amount, the request's own id as the idempotency
  key — so a row sent this way cannot become a second refund of one
  sent any other way.
*/
export async function sendApprovedRefundAction(refundId: string): Promise<RefundResult> {
  if (!refundSendingEnabled()) {
    return {
      ok: false,
      error: "Sending is switched off. This request stays approved and unsent until it is enabled.",
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_refund_ready_to_send", { p_refund: refundId });
  if (error) return fail(error);

  const ready = data as {
    booking_id: string; leg: string; amount_cents: number; absorb_helper_share: boolean;
  };

  const sent = await refundCharge({
    bookingId: ready.booking_id,
    leg: ready.leg === "tip" ? "tip" : "service",
    amountCents: ready.amount_cents,
    absorbHelperShare: ready.absorb_helper_share,
    operationId: refundId,
  });

  const outcome = await recordRefundOutcome(
    sent,
    async ({ status, processorId, detail }) => {
      const { error: settleError } = await supabase.rpc("admin_refund_settle", {
        p_refund: refundId, p_status: status,
        p_processor_id: processorId, p_detail: detail,
      });
      return { error: settleError ? { message: settleError.message } : null };
    },
    { refundId, absorbHelperShare: ready.absorb_helper_share },
  );

  revalidatePath("/admin/refunds");
  revalidatePath("/admin/payments");
  return outcome;
}
