import { NextResponse } from "next/server";
import { getCustomerList, type CustomerListOpts } from "@/lib/data/admin-customers";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";
import { ACCOUNT_LABEL, ATTENTION_LABEL } from "@/lib/admin-customer-states";
import { requireAdmin } from "@/lib/auth/admin";

/*
  THE CUSTOMER EXPORT.

  WHAT IT CARRIES IS WHAT THE SCREEN CARRIES. admin_customer_list
  returns no email and no phone number — masked or otherwise — so a
  spreadsheet downloaded from here cannot leak a contact detail even if
  it is mailed around. Reading somebody's address is a separate act
  through a separate function that records who asked and why; it is not
  something a thousand rows do quietly.

  THE ADMIN CHECK LIVES IN THE DATABASE FUNCTION, so there is one place
  to get it wrong rather than two. The session check at the top of the
  handler is not a second permission: it is there so an anonymous
  caller is turned away without being told which migrations this
  database has, which is what the function's own refusal would say.

  AND THE EXPORT ITSELF IS RECORDED, with the filters that produced it
  and the number of rows that left. An export is a copy of the customer
  base walking out of the building.
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
  const tab = tabParam === "active" || tabParam === "attention" || tabParam === "deletion"
    ? tabParam : "all";

  const filters: CustomerListOpts = {
    tab,
    region: params.get("region"),
    joined: params.get("joined"),
    status: params.get("status"),
    attention: params.get("attention"),
    search: params.get("q"),
    includeReview: params.get("review") === "1",
    limit: MAX_ROWS,
    offset: 0,
  };

  const result = await getCustomerList(filters);
  if (!result.ok) {
    const status = /not an admin|not permitted/i.test(result.error) ? 403
      : /migration/i.test(result.error) ? 501
      : 502;
    return NextResponse.json({ error: result.error }, { status });
  }

  const rows = result.data.rows;

  const header = [
    "Customer ID", "Reference", "Name", "Region", "Bookings", "Active bookings",
    "Account status", "Attention", "Open cases", "Last booking", "Joined",
  ];
  const body = rows.map((r) => [
    r.id, r.ref, r.name, r.region, r.bookings_total, r.bookings_active,
    ACCOUNT_LABEL[r.account_state] ?? r.account_state,
    ATTENTION_LABEL[r.attention] ?? r.attention,
    r.open_cases,
    r.last_booking_at ? r.last_booking_at.slice(0, 10) : "",
    r.created_at.slice(0, 10),
  ]);

  const csv = [header, ...body].map((line) => line.map(csvCell).join(",")).join("\r\n");

  /*
    RECORDED BEFORE IT IS SERVED. The page tells the operator that
    exports are logged, so an export that could not be logged is not
    served — otherwise the promise holds only while the log happens to
    be writable. actor_id is read from the caller's own session; the
    write goes through the service role because audit_log is not
    writable by authenticated users directly.
  */
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { error: auditError } = await createSupabaseServiceClient()
    .from("audit_log")
    .insert({
      actor_id: user?.id ?? null,
      action: "admin.customers_exported",
      target_table: "profiles",
      target_id: null,
      payload: {
        rows: rows.length,
        total_matching: result.data.total,
        truncated: result.data.total > rows.length,
        filters,
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
      "content-disposition": `attachment; filename="helpward-customers-${stamp}.csv"`,
      "cache-control": "no-store",
    },
  });
}
