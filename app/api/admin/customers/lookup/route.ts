import { NextResponse } from "next/server";
import { getCustomerList } from "@/lib/data/admin-customers";
import { requireAdmin } from "@/lib/auth/admin";

/*
  THE CUSTOMER PICKER BEHIND "NEW EMAIL".

  It reads admin_customer_list, which means this box inherits the same
  two properties as the customers page: it matches on the real email
  and phone number, and it returns neither. The composer gets a name,
  a reference and an id — enough to address a message, not enough to
  read somebody's details off a dropdown.
*/

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Not permitted." }, { status: 403 });
  }

  const q = (new URL(request.url).searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ rows: [] });

  const result = await getCustomerList({ search: q, limit: 6, includeReview: true });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });

  return NextResponse.json({
    rows: result.data.rows.map((r) => ({
      id: r.id, name: r.name, ref: r.ref, region: r.region,
    })),
  }, { headers: { "cache-control": "no-store" } });
}
