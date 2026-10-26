import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ConfirmPaymentClient } from "./client";

export const dynamic = "force-dynamic";

export default async function ConfirmPaymentPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/bookings/${id}/confirm-payment`);

  // RLS already limits this to the viewer's own bookings; the explicit
  // check keeps the failure a 404-ish redirect rather than an empty page.
  const { data: booking } = await supabase
    .from("bookings")
    .select("id, customer_id, service:services(title)")
    .eq("id", id)
    .maybeSingle();
  if (!booking || booking.customer_id !== user.id) redirect("/bookings");

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-xl mx-auto">
      <Link href={`/bookings/${id}`} className="text-xs font-semibold text-slate-500 inline-flex items-center gap-1 mb-4">
        <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" /> Back to booking
      </Link>
      <h1 className="text-2xl font-bold text-slate-900 mb-4">Confirm your payment</h1>
      <ConfirmPaymentClient
        bookingId={id}
        publishableKey={process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? null}
      />
    </div>
  );
}
