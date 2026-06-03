// Server-side email sender via Resend's REST API.
//
// Posture when RESEND_API_KEY is unset:
//   * isEmailEnabled() → false
//   * sendEmail() returns { ok: true, skipped: true } without making a
//     request, so cron handlers can call it unconditionally during the
//     pre-key window and just log the skip.
// Same pattern as lib/geocode.ts MAPBOX_TOKEN — ship the wiring, light
// up the integration when the key lands without another deploy.
//
// We don't pull in the `resend` npm package — REST + fetch is two dozen
// lines and saves a dep + bundle-size cost for the cron-only surface.

import "server-only";

const ENDPOINT = "https://api.resend.com/emails";

export function isEmailEnabled(): boolean {
  return typeof process.env.RESEND_API_KEY === "string" && process.env.RESEND_API_KEY.length > 0;
}

// Brand-default From address. Override per call if a different sub-team
// makes more sense (e.g. dispute-resolution emails from safety@).
const DEFAULT_FROM = process.env.HELPWARD_EMAIL_FROM ?? "Helpward <hello@helpward.com>";

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;        // plain-text fallback; auto-derived from html if absent
  from?: string;
  replyTo?: string;
};

export type SendEmailResult =
  | { ok: true; id?: string; skipped?: boolean }
  | { ok: false; error: string };

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  if (!isEmailEnabled()) {
    return { ok: true, skipped: true };
  }
  if (!input.to || !input.subject || !input.html) {
    return { ok: false, error: "to + subject + html required" };
  }

  const body: Record<string, unknown> = {
    from: input.from ?? DEFAULT_FROM,
    to: [input.to],
    subject: input.subject,
    html: input.html,
    text: input.text ?? stripHtml(input.html),
  };
  if (input.replyTo) body.reply_to = input.replyTo;

  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(12_000),
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "network error" };
  }

  if (!res.ok) {
    let detail = "";
    try { detail = (await res.text()).slice(0, 300); } catch {}
    return { ok: false, error: `Resend ${res.status}: ${detail}` };
  }

  let id: string | undefined;
  try {
    const j = await res.json() as { id?: string };
    id = j.id;
  } catch {}
  return { ok: true, id };
}

// Strip HTML tags for the plain-text fallback. Not a sanitizer — just a
// rough fallback so recipients who block HTML still see the message.
function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
