import { createSupabaseServerClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { DisputeForm } from "./form";

export default async function OpenDisputePage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: booking } = await supabase
    .from("bookings")
    .select("id, customer_id, status, service:services(title)")
    .eq("id", id)
    .single();

  if (!booking) notFound();
  const serviceTitle = (booking as { service: { title: string } | null }).service?.title ?? "this booking";

  return <DisputeForm bookingId={id} serviceTitle={serviceTitle} />;
}
