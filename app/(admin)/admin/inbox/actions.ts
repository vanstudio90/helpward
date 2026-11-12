"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";
import { sendEmail, isEmailEnabled } from "@/lib/email";

/*
  THE WRITES ON A SUPPORT CASE.

  SENDING IS TWO STEPS ON PURPOSE. admin_support_reply writes the
  message down and hands back what it would take to deliver it; the
  delivery happens here and its outcome is stamped back onto the row.
  So a message can sit in the thread saying "written down — not sent",
  which is the true state of a reply the mail provider refused, and no
  code path can produce a message that merely looks sent.

  Every guard lives in the database functions (0102). This file carries
  the part the database cannot do: talking to Resend, and writing the
  in-app notification that makes the other channel real.
*/

export type ActionResult = { ok: true; message: string } | { ok: false; error: string };

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/*
  The email a customer actually receives. Plain, signed by support, and
  it promises exactly one thing about replying: that the address works.
  Replies land in the support@helpward.com mailbox — not back in this
  console, until inbound mail is pointed at the webhook.
*/
function replyHtml(body: string, ref: string): string {
  const paragraphs = body
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px;line-height:1.55">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;color:#1e1b2e;max-width:560px">
${paragraphs}
<p style="margin:24px 0 0;color:#6b7280;font-size:13px">Helpward Support · reference ${escapeHtml(ref)}<br>
You can reply to this email and it will reach us.</p>
</div>`;
}

export type PendingAttachment = {
  path: string; filename: string; mime: string; size: number;
};

export async function sendReplyAction(
  caseId: string,
  body: string,
  internal: boolean,
  attachments: PendingAttachment[] = [],
): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_support_reply", {
    p_case_id: caseId,
    p_body: body,
    p_internal: internal,
  });
  if (error) return { ok: false, error: error.message };

  const recorded = data as {
    id: string; kind: string; send: boolean;
    channel?: "email" | "in_app"; to?: string | null; subject?: string;
    customer_id?: string | null;
  };

  /*
    The files were uploaded before the message existed. Now it does,
    they become part of it — and if one of these rows fails, the reply
    is still a reply: saying "sent without the file" beats losing the
    message somebody just wrote.
  */
  const attachmentProblems: string[] = [];
  for (const file of attachments) {
    const { error: attachError } = await supabase.rpc("admin_support_attach", {
      p_message_id: recorded.id,
      p_filename: file.filename,
      p_mime: file.mime,
      p_size: file.size,
      p_path: file.path,
    });
    if (attachError) attachmentProblems.push(`${file.filename}: ${attachError.message}`);
  }

  if (!recorded.send) {
    revalidatePath("/admin/inbox");
    return attachmentProblems.length
      ? { ok: false, error: `Note saved, but a file did not attach — ${attachmentProblems.join("; ")}` }
      : { ok: true, message: "Note saved. Staff only — the customer never sees it." };
  }

  const ref = `CS-${caseId.slice(0, 4).toUpperCase()}`;
  const mark = (status: string, providerId: string | null, err: string | null) =>
    supabase.rpc("admin_support_mark_delivery", {
      p_message_id: recorded.id,
      p_status: status,
      p_provider_id: providerId,
      p_error: err,
    });

  if (recorded.channel === "email") {
    if (!isEmailEnabled()) {
      await mark("not_configured", null, "RESEND_API_KEY is not set in this environment.");
      revalidatePath("/admin/inbox");
      return {
        ok: false,
        error: "Written into the thread, but NOT sent: this environment has no mail key.",
      };
    }
    /*
      The bytes are fetched back out of the private bucket here rather
      than trusted from the browser: what gets emailed is exactly what
      was stored under this case.
    */
    const files: { filename: string; content: string; contentType?: string }[] = [];
    if (attachments.length) {
      const storage = createSupabaseServiceClient().storage.from("support-attachments");
      for (const file of attachments) {
        const { data: blob, error: downloadError } = await storage.download(file.path);
        if (downloadError || !blob) {
          attachmentProblems.push(`${file.filename}: ${downloadError?.message ?? "could not be read back"}`);
          continue;
        }
        files.push({
          filename: file.filename,
          content: Buffer.from(await blob.arrayBuffer()).toString("base64"),
          contentType: file.mime,
        });
      }
    }

    const result = await sendEmail({
      to: recorded.to!,
      subject: `${recorded.subject} [${ref}]`,
      html: replyHtml(body, ref),
      replyTo: "support@helpward.com",
      attachments: files.length ? files : undefined,
    });
    if (!result.ok) {
      await mark("failed", null, result.error);
      revalidatePath("/admin/inbox");
      return { ok: false, error: `Written into the thread, but NOT sent: ${result.error}` };
    }
    await mark("sent", result.id ?? null, attachmentProblems.length ? attachmentProblems.join("; ") : null);
    revalidatePath("/admin/inbox");
    return attachmentProblems.length
      ? { ok: false, error: `Sent to ${recorded.to}, but without ${attachmentProblems.length} file(s): ${attachmentProblems.join("; ")}` }
      : {
          ok: true,
          message: files.length
            ? `Sent to ${recorded.to} with ${files.length} file${files.length === 1 ? "" : "s"}.`
            : `Sent to ${recorded.to}.`,
        };
  }

  /*
    IN-APP. The notification carries the words, not just a label — the
    bell renders a title and links to the thread the customer can open
    and answer. A notification with no message in it is not a reply.
  */
  const admin = createSupabaseServiceClient();
  const { error: notifyError } = await admin.from("notifications").insert({
    user_id: recorded.customer_id,
    type: "support_reply",
    payload: {
      case_id: caseId,
      ref,
      subject: recorded.subject,
      preview: body.slice(0, 160),
    },
  });
  if (notifyError) {
    await mark("failed", null, notifyError.message);
    revalidatePath("/admin/inbox");
    return { ok: false, error: `Written into the thread, but NOT delivered: ${notifyError.message}` };
  }
  await mark("sent", null, attachmentProblems.length ? attachmentProblems.join("; ") : null);
  revalidatePath("/admin/inbox");
  return attachmentProblems.length
    ? { ok: false, error: `Sent, but a file did not attach — ${attachmentProblems.join("; ")}` }
    : { ok: true, message: "Sent. It is in their app now." };
}

/*
  SNOOZE, READ STATE AND THE RESPONSE TARGET — the three controls the
  brief asks for that are about the queue rather than the message.
*/
export async function snoozeCaseAction(
  caseId: string,
  until: string | null,
): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_support_snooze", {
    p_case_id: caseId,
    p_until: until,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/inbox");
  return {
    ok: true,
    message: until
      ? "Snoozed. It comes back then — or sooner, the moment they write."
      : "Back in the queue.",
  };
}

export async function markCaseReadAction(caseId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.rpc("admin_support_mark_read", { p_case_id: caseId });
  /* No revalidate: this runs as a conversation is opened, and
     re-rendering the page under the operator to grey out one row is
     not worth the flicker. The next load is correct. */
}

export async function setReplyTargetAction(
  minutes: number | null,
  reason?: string,
): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_set_reply_target", {
    p_minutes: minutes,
    p_reason: reason ?? null,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/inbox");
  return {
    ok: true,
    message: minutes === null
      ? "Target cleared. Nothing is called overdue until one is set again."
      : `Replies are now due ${minutes >= 60 ? `${Math.round(minutes / 60)}h` : `${minutes}m`} after the customer's last message.`,
  };
}

export async function updateCaseAction(
  caseId: string,
  changes: { status?: string; priority?: string; assignee?: string | null },
): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_support_update", {
    p_case_id: caseId,
    p_status: changes.status ?? null,
    p_priority: changes.priority ?? null,
    p_assignee: changes.assignee && changes.assignee !== "" ? changes.assignee : null,
    p_clear_assignee: changes.assignee === "",
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/inbox");
  revalidatePath("/admin");
  const said = changes.status === "resolved" ? "Resolved."
    : changes.status === "open" ? "Reopened — the reply clock restarts from their last message."
    : changes.assignee === "" ? "Unassigned."
    : changes.assignee ? "Assigned."
    : "Updated.";
  return { ok: true, message: said };
}

export async function tagCaseAction(
  caseId: string, tag: string, remove = false,
): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_support_tag", {
    p_case_id: caseId, p_tag: tag, p_remove: remove,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/inbox");
  return { ok: true, message: remove ? "Tag removed." : "Tag added." };
}

export async function createCaseAction(input: {
  customerId: string | null;
  toEmail: string | null;
  subject: string;
  body: string;
  channel: "email" | "in_app";
  bookingId?: string | null;
}): Promise<{ ok: true; message: string; caseId: string } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_support_create", {
    p_customer_id: input.customerId,
    p_to_email: input.toEmail,
    p_subject: input.subject,
    p_body: "",            // the first message is sent below, so it gets a real delivery state
    p_channel: input.channel,
    p_booking_id: input.bookingId ?? null,
  });
  if (error) return { ok: false, error: error.message };

  const caseId = (data as { case_id: string }).case_id;
  if (input.body.trim().length > 0) {
    const sent = await sendReplyAction(caseId, input.body, false);
    revalidatePath("/admin/inbox");
    if (!sent.ok) return { ok: false, error: `Case ${caseId.slice(0, 4).toUpperCase()} created. ${sent.error}` };
    return { ok: true, message: sent.message, caseId };
  }
  revalidatePath("/admin/inbox");
  return { ok: true, message: "Case created.", caseId };
}

export async function openSafetyCaseAction(
  caseId: string, category: string, description: string,
): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_support_open_safety_case", {
    p_case_id: caseId, p_category: category, p_description: description,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/inbox");
  revalidatePath("/admin/disputes");
  return { ok: true, message: "Safety case opened and linked. This conversation is now urgent." };
}
