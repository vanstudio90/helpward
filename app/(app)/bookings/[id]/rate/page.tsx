import { createSupabaseServerClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import { RateForm } from "./form";
import { one } from "@/lib/supabase/relation";

export default async function RateBookingPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: booking } = await supabase
    .from("bookings")
    .select(`
      id, status, customer_id, completed_at,
      service:services(title),
      provider:provider_profiles!bookings_provider_id_fkey(
        profile:profiles!provider_profiles_user_id_fkey(full_name, avatar_url)
      )
    `)
    .eq("id", id)
    .single();

  if (!booking || booking.customer_id !== user.id) notFound();

  const existing = await supabase
    .from("reviews")
    .select("id")
    .eq("booking_id", id)
    .maybeSingle();

  if (existing.data) redirect("/bookings");

  return <RateForm
    bookingId={id}
    serviceTitle={one(booking.service)?.title ?? "service"}
    providerName={one(one(booking.provider)?.profile)?.full_name ?? "your helper"}
    providerAvatar={one(one(booking.provider)?.profile)?.avatar_url ?? null}
    bookingStatus={booking.status}
  />;
}
