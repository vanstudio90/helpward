import { createSupabaseServerClient } from "@/lib/supabase/server";

export type RequestRow = {
  id: string;
  service: { id: string; title: string };
  pickup: { formatted: string } | null;
  scheduled_for: string | null;
  estimated_price_cents: number | null;
  status: string;
  created_at: string;
};

export async function listMyRequests() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("requests")
    .select(`
      id, scheduled_for, estimated_price_cents, status, created_at,
      service:services(id, title),
      pickup:addresses!requests_pickup_address_id_fkey(formatted)
    `)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) {
    console.error("listMyRequests:", error.message);
    return [];
  }
  return (data ?? []) as unknown as RequestRow[];
}
