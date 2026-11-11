import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/*
  ONE BOX, EVERY RECORD.

  What an operator actually types: a booking reference off a support
  email ("BK-2C89C5"), a customer's name, a helper's email, a Stripe
  payment intent from a chargeback notice. So all four are searched and
  the results say which kind each hit is.

  READ AS THE CALLER. RLS gives an admin everything, and using the
  service key here would mean a non-admin who reached this route read
  the marketplace. The admin check below is belt; RLS is braces.

  REFERENCES ARE PREFIXES, NOT IDS. The console prints the first six
  characters of a uuid as the human reference, so that is what people
  paste back. `id::text like 'prefix%'` is the lookup that matches what
  they are reading off the screen.
*/

export const dynamic = "force-dynamic";

type Hit = {
  kind: "booking" | "request" | "customer" | "helper" | "payment";
  title: string;
  detail: string;
  href: string;
};

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== "admin") {
    return NextResponse.json({ error: "Not permitted." }, { status: 403 });
  }

  const raw = (new URL(request.url).searchParams.get("q") ?? "").trim();
  if (raw.length < 2) return NextResponse.json({ hits: [] });

  // "BK-2C89C5" and "2c89c5" are the same lookup.
  const bare = raw.replace(/^(BK|RQ)-/i, "").toLowerCase();
  const hits: Hit[] = [];

  const [bookings, requests, people, payments] = await Promise.all([
    supabase
      .from("bookings")
      .select("id, status, currency, total_cents, service_id, created_at")
      .ilike("id", `${bare}%`)
      .limit(5),
    supabase
      .from("requests")
      .select("id, status, service_id, pickup_city, created_at")
      .ilike("id", `${bare}%`)
      .limit(5),
    supabase
      .from("profiles")
      .select("id, full_name, role")
      .ilike("full_name", `%${raw}%`)
      .limit(6),
    supabase
      .from("bookings")
      .select("id, stripe_payment_intent_id, payment_status, currency, total_cents")
      .ilike("stripe_payment_intent_id", `%${raw}%`)
      .limit(4),
  ]);

  for (const b of bookings.data ?? []) {
    hits.push({
      kind: "booking",
      title: `BK-${b.id.slice(0, 6).toUpperCase()}`,
      detail: `${b.service_id} · ${b.status}`,
      href: "/admin/bookings",
    });
  }
  for (const r of requests.data ?? []) {
    hits.push({
      kind: "request",
      title: `RQ-${r.id.slice(0, 6).toUpperCase()}`,
      detail: `${r.service_id} · ${r.status}${r.pickup_city ? ` · ${r.pickup_city}` : ""}`,
      href: "/admin/bookings",
    });
  }
  for (const p of people.data ?? []) {
    const helper = p.role === "helper" || p.role === "provider";
    hits.push({
      kind: helper ? "helper" : "customer",
      title: p.full_name ?? "(no name)",
      detail: helper ? "Helper" : "Customer",
      href: helper ? "/admin/helpers" : "/admin/users",
    });
  }
  for (const p of payments.data ?? []) {
    if (!p.stripe_payment_intent_id) continue;
    hits.push({
      kind: "payment",
      title: p.stripe_payment_intent_id,
      detail: `${p.payment_status} · BK-${p.id.slice(0, 6).toUpperCase()}`,
      href: "/admin/payments",
    });
  }

  return NextResponse.json({ hits: hits.slice(0, 12) }, {
    headers: { "cache-control": "no-store" },
  });
}
