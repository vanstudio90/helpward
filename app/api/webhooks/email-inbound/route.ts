import { NextResponse, type NextRequest } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

/*
  INBOUND EMAIL → A SUPPORT THREAD.

  Mail sent to support@helpward.com lands in a Google mailbox. This is
  the door into the console: point an inbound route (Resend inbound, a
  Google Apps Script forwarder, anything that can POST JSON) at it and
  replies stop living in one person's inbox.

  IT IS SHUT UNTIL IT IS CONFIGURED. With no SUPPORT_INBOUND_SECRET
  this returns 503 and writes nothing, because an open endpoint that
  creates support cases is a way to fill the console with anything.

  THREADING IS BY REFERENCE FIRST. Outbound subjects carry [CS-XXXX];
  a reply that keeps it rejoins its own thread. Without one, an open
  case from the same address within a week is the next best guess, and
  failing that it is a new conversation — which is the right default:
  a stranger's first email is not a continuation of anything.
*/

export const dynamic = "force-dynamic";

type Inbound = {
  from?: string; to?: string | string[]; subject?: string;
  text?: string; html?: string;
  data?: { from?: string; to?: string | string[]; subject?: string; text?: string; html?: string };
};

function addressOf(value: string | undefined): string | null {
  if (!value) return null;
  const match = value.match(/<([^>]+)>/);
  const raw = (match ? match[1] : value).trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw) ? raw : null;
}

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
    .trim();
}

export async function POST(request: NextRequest) {
  const secret = process.env.SUPPORT_INBOUND_SECRET;
  if (!secret) {
    return NextResponse.json(
      { ok: false, reason: "inbound_not_configured" },
      { status: 503 },
    );
  }

  const raw = await request.text();

  /*
    Either an HMAC of the body, or the shared secret itself for senders
    that cannot sign (a Gmail forwarder script, say). Both are compared
    in constant time; the plain form is accepted because the realistic
    alternative is this never being wired up at all.
  */
  const signature = request.headers.get("x-helpward-signature");
  const bearer = request.headers.get("x-helpward-inbound-secret");
  const expected = createHmac("sha256", secret).update(raw).digest("hex");

  const matches = (a: string | null, b: string) => {
    if (!a) return false;
    const left = Buffer.from(a);
    const right = Buffer.from(b);
    return left.length === right.length && timingSafeEqual(left, right);
  };

  if (!matches(signature, expected) && !matches(bearer, secret)) {
    return NextResponse.json({ ok: false, reason: "bad_signature" }, { status: 401 });
  }

  let payload: Inbound;
  try {
    payload = JSON.parse(raw) as Inbound;
  } catch {
    return NextResponse.json({ ok: false, reason: "bad_body" }, { status: 400 });
  }

  const source = payload.data ?? payload;
  const from = addressOf(source.from);
  const to = addressOf(Array.isArray(source.to) ? source.to[0] : source.to);
  const subject = (source.subject ?? "").trim().slice(0, 200) || "(no subject)";
  const body = (source.text?.trim() || (source.html ? stripHtml(source.html) : "")).slice(0, 20000);

  if (!from) return NextResponse.json({ ok: false, reason: "no_sender" }, { status: 400 });
  if (!body) return NextResponse.json({ ok: false, reason: "empty_message" }, { status: 400 });

  const admin = createSupabaseServiceClient();

  // Who wrote in, if we know them. An unknown sender still gets a case.
  const { data: users } = await admin.auth.admin.listUsers({ perPage: 200 });
  const account = users?.users.find((u) => (u.email ?? "").toLowerCase() === from) ?? null;

  let caseId: string | null = null;

  const refMatch = subject.match(/\[CS-([0-9a-fA-F]{4})\]/);
  if (refMatch) {
    const { data: byRef } = await admin
      .from("support_cases")
      .select("id")
      .ilike("id", `${refMatch[1].toLowerCase()}%`)
      .limit(1);
    caseId = byRef?.[0]?.id ?? null;
  }

  if (!caseId) {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: open } = await admin
      .from("support_cases")
      .select("id")
      .eq("contact_email", from)
      .neq("status", "resolved")
      .gte("last_message_at", weekAgo)
      .order("last_message_at", { ascending: false })
      .limit(1);
    caseId = open?.[0]?.id ?? null;
  }

  if (!caseId) {
    const { data: created, error } = await admin
      .from("support_cases")
      .insert({
        subject,
        channel: "email",
        customer_id: account?.id ?? null,
        contact_email: from,
        status: "open",
      })
      .select("id")
      .single();
    if (error) {
      return NextResponse.json({ ok: false, reason: error.message }, { status: 500 });
    }
    caseId = created.id;
  }

  /*
    The insert is what starts the clock — the trigger on this table sets
    due_at and reopens a resolved case. Nothing here has to remember to.
  */
  const { error: messageError } = await admin.from("support_messages").insert({
    case_id: caseId,
    kind: "inbound",
    channel: "email",
    body,
    from_address: from,
    to_address: to,
    author_id: account?.id ?? null,
    delivery_status: "delivered",
  });
  if (messageError) {
    return NextResponse.json({ ok: false, reason: messageError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, case_id: caseId });
}
