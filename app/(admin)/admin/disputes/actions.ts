"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";
import { sendEmail, isEmailEnabled } from "@/lib/email";

/*
  THE DECISIONS A REVIEWER TAKES.

  EVERY CHANGE CARRIES THE TOKEN IT WAS WORKING FROM. The panel holds
  the case's updated_at; each of these passes it back, and the database
  refuses the write if somebody else has touched the case since. The
  refusal comes back as HW080 with who and when, so the operator
  reloads rather than quietly overwriting a colleague's finding.

  RESOLVING MOVES NOTHING. The resolve function writes an outcome, a
  reason and a timeline entry. Refunds and account restrictions are
  separate actions on separate screens, and this file does not reach
  them.
*/

export type CaseResult =
  | { ok: true; message: string; updatedAt?: string }
  | { ok: false; error: string; conflict?: boolean };

function fail(error: { message?: string; code?: string } | null): CaseResult {
  const message = error?.message ?? "Failed.";
  /* A clash is not an error the operator caused, and it needs a
     different answer: reload, do not retype. */
  return { ok: false, error: message, conflict: error?.code === "HW080" };
}

export async function updateCaseAction(
  id: string,
  expectedUpdatedAt: string,
  changes: {
    owner?: string | null;
    priority?: string;
    status?: string;
    nextReview?: string | null;
  },
): Promise<CaseResult> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_dispute_update", {
    p_id: id,
    p_expected: expectedUpdatedAt,
    p_owner: changes.owner && changes.owner !== "" ? changes.owner : null,
    p_clear_owner: changes.owner === "",
    p_priority: changes.priority ?? null,
    p_status: changes.status ?? null,
    p_next_review: changes.nextReview && changes.nextReview !== "" ? changes.nextReview : null,
    p_clear_review: changes.nextReview === "",
  });
  if (error) return fail(error);
  revalidatePath("/admin/disputes");
  return { ok: true, message: "Saved.", updatedAt: data as string };
}

export async function addCaseNoteAction(id: string, body: string): Promise<CaseResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_dispute_note", { p_id: id, p_body: body });
  if (error) return fail(error);
  revalidatePath("/admin/disputes");
  return { ok: true, message: "Note saved. Staff only." };
}

export async function addCaseTaskAction(
  id: string, label: string, owner?: string | null,
): Promise<CaseResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_dispute_task_add", {
    p_id: id, p_label: label, p_owner: owner && owner !== "" ? owner : null,
  });
  if (error) return fail(error);
  revalidatePath("/admin/disputes");
  return { ok: true, message: "Step added." };
}

/* Ticking a step records a step. It does not message anybody — the
   brief is explicit about that and so is the database function. */
export async function setCaseTaskAction(taskId: string, done: boolean): Promise<CaseResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_dispute_task_set", {
    p_task_id: taskId, p_done: done,
  });
  if (error) return fail(error);
  revalidatePath("/admin/disputes");
  return { ok: true, message: done ? "Step done." : "Step reopened." };
}

export async function resolveCaseAction(
  id: string,
  expectedUpdatedAt: string,
  outcome: string,
  reason: string,
  notify: { customer: boolean; helper: boolean },
  acceptOpenTasks: boolean,
): Promise<CaseResult> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_dispute_resolve", {
    p_id: id,
    p_expected: expectedUpdatedAt,
    p_outcome: outcome,
    p_reason: reason,
    p_notify: notify,
    p_accept_open_tasks: acceptOpenTasks,
  });
  if (error) return fail(error);

  /*
    NOTIFYING IS ITS OWN STEP, and it is honest about what it did. The
    finding is recorded either way; if a notification cannot be sent,
    the case does not un-resolve, and the message says which part
    failed.
  */
  const problems: string[] = [];
  if (notify.customer || notify.helper) {
    const { data: detail } = await supabase.rpc("admin_dispute_detail", { p_id: id });
    const parties = (detail as { parties?: { customer?: { id: string } | null; helper?: { id: string } | null } })?.parties;
    const admin = createSupabaseServiceClient();
    const targets = [
      notify.customer ? parties?.customer?.id : null,
      notify.helper ? parties?.helper?.id : null,
    ].filter(Boolean) as string[];

    for (const userId of targets) {
      const { error: notifyError } = await admin.from("notifications").insert({
        user_id: userId,
        type: "dispute_resolved",
        payload: { dispute_id: id, outcome },
      });
      if (notifyError) problems.push(notifyError.message);
    }
  }

  revalidatePath("/admin/disputes");
  revalidatePath("/admin");
  return problems.length
    ? {
        ok: false,
        error: `The finding is recorded, but a notification did not send: ${problems.join("; ")}`,
      }
    : {
        ok: true,
        message: "Resolved. No money moved and no account changed — those are separate actions.",
        updatedAt: data as string,
      };
}

export async function reopenCaseAction(
  id: string, expectedUpdatedAt: string, reason: string,
): Promise<CaseResult> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_dispute_reopen", {
    p_id: id, p_expected: expectedUpdatedAt, p_reason: reason,
  });
  if (error) return fail(error);
  revalidatePath("/admin/disputes");
  return {
    ok: true,
    message: "Reopened. The previous finding is kept on the case.",
    updatedAt: data as string,
  };
}

export async function escalateCaseAction(
  id: string, expectedUpdatedAt: string, to: string, reason: string,
): Promise<CaseResult> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_dispute_escalate", {
    p_id: id, p_expected: expectedUpdatedAt, p_to: to, p_reason: reason,
  });
  if (error) return fail(error);
  revalidatePath("/admin/disputes");
  return {
    ok: true,
    message: "Escalated, and they have been notified. It stays unacknowledged until they pick it up.",
    updatedAt: data as string,
  };
}

export async function acknowledgeEscalationAction(id: string): Promise<CaseResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_dispute_ack_escalation", { p_id: id });
  if (error) return fail(error);
  revalidatePath("/admin/disputes");
  return { ok: true, message: "Acknowledged. The case is yours." };
}

export async function createCaseAction(input: {
  kind: "safety" | "service";
  category: string;
  description: string;
  source: string;
  priority: string;
  bookingId?: string | null;
  customerId?: string | null;
  helperId?: string | null;
  reportedByName?: string | null;
  nextReview?: string | null;
  stripeDisputeId?: string | null;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_dispute_create", {
    p_kind: input.kind,
    p_category: input.category,
    p_description: input.description,
    p_source: input.source,
    p_priority: input.priority,
    p_booking: input.bookingId ?? null,
    p_customer: input.customerId ?? null,
    p_helper: input.helperId ?? null,
    p_reported_by_name: input.reportedByName ?? null,
    p_next_review: input.nextReview ?? null,
    p_stripe_dispute_id: input.stripeDisputeId ?? null,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/disputes");
  return { ok: true, id: data as string };
}

export async function findDuplicatesAction(input: {
  bookingId?: string | null; customerId?: string | null; helperId?: string | null;
}): Promise<{ id: string; ref: string; title: string; status: string; created_at: string }[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("admin_dispute_duplicates", {
    p_booking: input.bookingId ?? null,
    p_customer: input.customerId ?? null,
    p_helper: input.helperId ?? null,
  });
  return (data ?? []) as { id: string; ref: string; title: string; status: string; created_at: string }[];
}

/*
  CONTACTING A PARTY goes through the support inbox — the same threads,
  the same delivery states — rather than a second messaging path that
  nobody can audit. Which means it also gets the same honesty: an email
  that Resend refused says so, and the case records that we tried.
*/
export async function contactPartyAction(
  id: string,
  party: "customer" | "helper",
  subject: string,
  body: string,
  channel: "email" | "in_app",
): Promise<CaseResult> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_dispute_contact", {
    p_id: id, p_party: party, p_subject: subject, p_body: body, p_channel: channel,
  });
  if (error) return fail(error);

  const result = data as {
    case_id: string;
    message: { id: string; send: boolean; channel: string; to: string | null; subject: string; customer_id: string | null };
  };
  const recorded = result.message;
  const ref = `CS-${result.case_id.slice(0, 4).toUpperCase()}`;

  const mark = (status: string, providerId: string | null, err: string | null) =>
    supabase.rpc("admin_support_mark_delivery", {
      p_message_id: recorded.id, p_status: status, p_provider_id: providerId, p_error: err,
    });

  if (recorded.channel === "email") {
    if (!isEmailEnabled()) {
      await mark("not_configured", null, "RESEND_API_KEY is not set in this environment.");
      revalidatePath("/admin/disputes");
      return { ok: false, error: "Recorded on the case, but NOT sent: this environment has no mail key." };
    }
    const sent = await sendEmail({
      to: recorded.to!,
      subject: `${recorded.subject} [${ref}]`,
      html: `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;color:#1e1b2e;max-width:560px">${
        body.split(/\n{2,}/).map((p) =>
          `<p style="margin:0 0 14px;line-height:1.55">${
            p.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>")
          }</p>`).join("")
      }<p style="margin:24px 0 0;color:#6b7280;font-size:13px">Helpward Support · reference ${ref}<br>You can reply to this email and it will reach us.</p></div>`,
      replyTo: "support@helpward.com",
    });
    if (!sent.ok) {
      await mark("failed", null, sent.error);
      revalidatePath("/admin/disputes");
      return { ok: false, error: `Recorded on the case, but NOT sent: ${sent.error}` };
    }
    await mark("sent", sent.id ?? null, null);
    revalidatePath("/admin/disputes");
    return { ok: true, message: `Emailed the ${party}. The thread is in the inbox as ${ref}.` };
  }

  const admin = createSupabaseServiceClient();
  const { error: notifyError } = await admin.from("notifications").insert({
    user_id: recorded.customer_id,
    type: "support_reply",
    payload: { case_id: result.case_id, ref, subject: recorded.subject, preview: body.slice(0, 160) },
  });
  if (notifyError) {
    await mark("failed", null, notifyError.message);
    revalidatePath("/admin/disputes");
    return { ok: false, error: `Recorded on the case, but NOT delivered: ${notifyError.message}` };
  }
  await mark("sent", null, null);
  revalidatePath("/admin/disputes");
  return { ok: true, message: `Message sent to the ${party} in their app. The thread is ${ref}.` };
}
