import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/admin";

/*
  UPLOADING A FILE TO ATTACH TO A REPLY.

  The browser never touches the bucket. It posts the file here, this
  route checks the admin claim and puts the object in a PRIVATE bucket
  under the case it belongs to; nothing in storage is reachable with a
  browser token, by policy (0103). The row that makes it part of a
  message is written later, when the message exists — so a file that
  was picked and never sent is an orphan object and not a phantom
  attachment in somebody's thread.
*/

export const dynamic = "force-dynamic";

const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(request: Request) {
  let adminId: string;
  try {
    adminId = await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Not permitted." }, { status: 403 });
  }

  const form = await request.formData();
  const file = form.get("file");
  const caseId = String(form.get("case_id") ?? "");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file was sent." }, { status: 400 });
  }
  if (!/^[0-9a-f-]{36}$/i.test(caseId)) {
    return NextResponse.json({ error: "No case was named." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `That file is ${(file.size / 1024 / 1024).toFixed(1)}MB. The limit is 10MB.` },
      { status: 413 },
    );
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "That file is empty." }, { status: 400 });
  }

  // The stored name is ours; the original is kept as a column, so a
  // filename cannot reach into the bucket's paths.
  const safe = file.name.replace(/[^\w.\- ]+/g, "_").slice(-100) || "attachment";
  const path = `${caseId}/${crypto.randomUUID()}-${safe}`;

  const admin = createSupabaseServiceClient();
  const { error } = await admin.storage
    .from("support-attachments")
    .upload(path, await file.arrayBuffer(), {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });

  return NextResponse.json({
    path,
    filename: file.name.slice(0, 200),
    mime: file.type || "application/octet-stream",
    size: file.size,
    uploaded_by: adminId,
  });
}
