import { NextResponse } from "next/server";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/admin";

/*
  HANDING A STAFF MEMBER A FILE BACK.

  A signed URL that lives for a minute, minted only after the admin
  claim has been checked and the row read through the caller's own
  client — so RLS, not this handler, decides whether the attachment
  exists for them.
*/

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Not permitted." }, { status: 403 });
  }

  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: row } = await supabase
    .from("support_attachments")
    .select("storage_path, filename")
    .eq("id", id)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: "No such attachment." }, { status: 404 });

  const { data, error } = await createSupabaseServiceClient()
    .storage.from("support-attachments")
    .createSignedUrl(row.storage_path, 60, { download: row.filename });
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Could not sign." }, { status: 502 });
  }
  return NextResponse.redirect(data.signedUrl);
}
