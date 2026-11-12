import { NextResponse } from "next/server";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/admin";

/*
  OPENING A PIECE OF EVIDENCE.

  The console shows "access is logged" next to this, so the logging is
  not a side effect — it is the first thing that happens.
  admin_dispute_evidence_open writes the access row, the timeline entry
  and the audit entry, and only then returns the path to sign. If that
  write fails, nobody gets the file.
*/

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Not permitted." }, { status: 403 });
  }

  const { id } = await params;
  const reason = new URL(request.url).searchParams.get("reason");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_dispute_evidence_open", {
    p_evidence_id: id,
    p_reason: reason,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const row = data as { storage_path: string | null; filename: string | null; kind: string };
  if (!row.storage_path) {
    return NextResponse.json(
      { error: `This evidence is a ${row.kind}, not a file. Open it from the case.` },
      { status: 400 },
    );
  }

  const { data: signed, error: signError } = await createSupabaseServiceClient()
    .storage.from("dispute-evidence")
    .createSignedUrl(row.storage_path, 60, { download: row.filename ?? undefined });
  if (signError || !signed) {
    return NextResponse.json({ error: signError?.message ?? "Could not sign." }, { status: 502 });
  }
  return NextResponse.redirect(signed.signedUrl);
}
