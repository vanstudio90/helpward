import { NextResponse } from "next/server";
import { createSupabaseServiceClient, createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/admin";

/*
  PUTTING A FILE ON A CASE.

  The browser never touches the bucket: it posts here, this route
  checks the admin claim, stores the object privately under the case,
  and then records it through admin_dispute_evidence_add — which also
  writes the timeline entry. A file in storage with no evidence row is
  an orphan; an evidence row is what makes it part of the case.
*/

export const dynamic = "force-dynamic";

const MAX_BYTES = 25 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Not permitted." }, { status: 403 });
  }

  const form = await request.formData();
  const file = form.get("file");
  const caseId = String(form.get("case_id") ?? "");
  const description = String(form.get("description") ?? "").slice(0, 1000);

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file was sent." }, { status: 400 });
  }
  if (!/^[0-9a-f-]{36}$/i.test(caseId)) {
    return NextResponse.json({ error: "No case was named." }, { status: 400 });
  }
  if (file.size === 0) return NextResponse.json({ error: "That file is empty." }, { status: 400 });
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `That file is ${(file.size / 1024 / 1024).toFixed(1)}MB. The limit is 25MB.` },
      { status: 413 },
    );
  }

  const safe = file.name.replace(/[^\w.\- ]+/g, "_").slice(-100) || "evidence";
  const path = `${caseId}/${crypto.randomUUID()}-${safe}`;

  const { error: uploadError } = await createSupabaseServiceClient()
    .storage.from("dispute-evidence")
    .upload(path, await file.arrayBuffer(), {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 502 });

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_dispute_evidence_add", {
    p_id: caseId,
    p_kind: "file",
    p_filename: file.name.slice(0, 200),
    p_mime: file.type || "application/octet-stream",
    p_size: file.size,
    p_path: path,
    p_reference: null,
    p_description: description || null,
  });
  if (error) {
    // Do not leave a file nobody can see or account for.
    await createSupabaseServiceClient().storage.from("dispute-evidence").remove([path]);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ id: data, filename: file.name, size: file.size });
}
