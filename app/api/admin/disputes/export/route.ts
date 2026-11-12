import { NextResponse } from "next/server";
import { getCaseQueue, type CaseQueueOpts } from "@/lib/data/admin-disputes";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";
import { CASE_STATUS_LABEL, CASE_PRIORITY_LABEL, KIND_LABEL } from "@/lib/admin-case-states";
import { requireAdmin } from "@/lib/auth/admin";

/*
  EXPORTING THE QUEUE.

  WHAT IT CARRIES IS DELIBERATELY NOT THE CASE. No report text, no
  finding, no party names, no evidence — a safety report is somebody's
  account of being made uncomfortable, and that does not belong in a
  spreadsheet that gets mailed around. What leaves is the management
  view: reference, type, priority, status, owner, age, review time.

  And the export is recorded before the file is produced, because the
  page says it is.
*/

export const dynamic = "force-dynamic";

const MAX_ROWS = 1000;

function csvCell(value: string | number | null): string {
  if (value === null) return "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export async function GET(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Not permitted." }, { status: 403 });
  }

  const params = new URL(request.url).searchParams;
  const tabParam = params.get("tab");
  const tab = tabParam === "safety" || tabParam === "service" || tabParam === "resolved"
    ? tabParam : "all";

  const filters: CaseQueueOpts = {
    tab,
    region: params.get("region"),
    owner: params.get("owner"),
    priority: params.get("priority"),
    status: params.get("status"),
    search: params.get("q"),
    includeReview: params.get("review") === "1",
    limit: MAX_ROWS,
    offset: 0,
  };

  const result = await getCaseQueue(filters);
  if (!result.ok) {
    const status = /not an admin|not permitted/i.test(result.error) ? 403
      : /migration/i.test(result.error) ? 501 : 502;
    return NextResponse.json({ error: result.error }, { status });
  }

  const header = [
    "Reference", "Type", "Category", "Priority", "Status", "Owner",
    "Open steps", "Evidence items", "Opened", "Next review", "Review overdue",
    "Stripe chargeback",
  ];
  const body = result.data.rows.map((r) => [
    r.ref,
    KIND_LABEL[r.kind] ?? r.kind,
    r.category,
    CASE_PRIORITY_LABEL[r.priority] ?? r.priority,
    CASE_STATUS_LABEL[r.status] ?? r.status,
    r.owner_name ?? "Unassigned",
    r.open_tasks,
    r.evidence_count,
    r.created_at.slice(0, 10),
    r.next_review_at ? r.next_review_at.slice(0, 16).replace("T", " ") : "",
    r.review_overdue ? "yes" : "",
    r.stripe_dispute_id ?? "",
  ]);

  const csv = [header, ...body].map((line) => line.map(csvCell).join(",")).join("\r\n");

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { error: auditError } = await createSupabaseServiceClient().from("audit_log").insert({
    actor_id: user?.id ?? null,
    action: "dispute.exported",
    target_table: "disputes",
    target_id: null,
    payload: {
      rows: result.data.rows.length,
      total_matching: result.data.total,
      truncated: result.data.total > result.data.rows.length,
      filters,
      fields: header,
    },
  });
  if (auditError) {
    return NextResponse.json(
      { error: `The export was not recorded, so it was not produced: ${auditError.message}` },
      { status: 500 },
    );
  }

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="helpward-cases-${stamp}.csv"`,
      "cache-control": "no-store",
    },
  });
}
