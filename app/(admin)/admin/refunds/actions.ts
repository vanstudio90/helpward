"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { refundBooking } from "@/lib/payments";

/*
  ASKING FOR A REFUND, AND DECIDING ONE.

  THE SPLIT THAT MATTERS: the database decides whether a refund MAY
  happen — who may ask, whether the money is there once refunds in
  flight are counted, who carries the cost, and whether this person is
  allowed to approve it. Stripe is the only thing that makes it happen,
  and refundBooking() re-reads the real remaining balance before it
  sends anything.

  So approval is two steps on purpose. The row moves to `processing`
  first, which is what stops a second approval double-sending while the
  first is at the processor. Only then is the refund sent, and whatever
  comes back — an id or an error — is written to the same row. A
  console that marked a refund "succeeded" the moment somebody clicked
  would be reporting an intention as an outcome.

  WHAT HAPPENS IF THE SEND FAILS AFTER APPROVAL: the row is recorded as
  failed, with the processor's reason, and says so. The approval is not
  silently undone — somebody approved it, and that is part of the
  record.
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

  /*
    THE ONLY PLACE MONEY ACTUALLY MOVES. refundBooking() reverses the
    helper's transfer unless this reason absorbs it, refuses to touch
    the tip unless the refund is against the tip, and reads the real
    remaining balance from Stripe before sending.
  */
  const sent = await refundBooking(decision.booking_id, {
    amountCents: decision.leg === "tip" ? undefined : decision.amount_cents,
    includeTip: decision.leg === "tip",
    absorbHelperShare: decision.absorb_helper_share,
    reason: "requested_by_customer",
    /* Two legitimate refunds of the same size are not one retried
       refund, and Stripe's idempotency cannot tell them apart without
       this. */
    operationId: refundId,
  });

  if (!sent.ok) {
    await supabase.rpc("admin_refund_settle", {
      p_refund: refundId, p_succeeded: false,
      p_processor_id: null, p_failure: sent.message,
    });
    revalidatePath("/admin/refunds");
    return {
      ok: false,
      error: `Approved, but the refund was NOT sent: ${sent.message}. The request is recorded as failed and no money has moved.`,
    };
  }

  const leg = sent.legs[0];
  await supabase.rpc("admin_refund_settle", {
    p_refund: refundId, p_succeeded: true,
    p_processor_id: leg?.refundId ?? null, p_failure: null,
  });
  revalidatePath("/admin/refunds");
  revalidatePath("/admin/payments");
  return {
    ok: true,
    message: "Approved and sent.",
    detail: decision.absorb_helper_share
      ? "The helper keeps their share; Helpward carries this refund."
      : "The helper's share was taken back with the refund.",
  };
}
