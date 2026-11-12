import { NextResponse } from "next/server";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";

/*
  THE CUSTOMER'S COPY OF THE SAME FILE.

  Read through their own client, so support_attachments_own (0103)
  decides: an attachment on their own case, on a message that is not an
  internal note. If the row does not come back, the file is not theirs
  and the answer is a flat 404 — the same answer an attachment that
  does not exist gets.
*/

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

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
