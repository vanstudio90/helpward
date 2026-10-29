import { PageHeader } from "@/components/helper/ui";
import { ArrowLeft, GalleryHorizontal } from "lucide-react";
import Link from "next/link";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";
import { PortfolioGrid, type PortfolioPhoto } from "./portfolio-grid";

export const dynamic = "force-dynamic";

// Helper-facing portfolio admin. Lists every completion photo the helper
// has ever uploaded across all their completed bookings, with a per-photo
// "Feature on profile" toggle. Public-side render is on /helpers/[id].
export default async function HelperPortfolioPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // Pull every completion photo on a completed booking owned by this
  // helper. Service title + completion timestamp come along for the
  // grid's tile copy.
  const { data: rows } = await supabase
    .from("booking_completion_photos")
    .select(`
      id, storage_path, caption, portfolio_caption, is_portfolio, booking_id,
      booking:bookings!booking_completion_photos_booking_id_fkey(
        completed_at, status,
        service:services(title)
      )
    `)
    .eq("uploaded_by_user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(200);

  type Row = {
    id: string; storage_path: string; caption: string | null; portfolio_caption: string | null;
    is_portfolio: boolean; booking_id: string;
    booking: { completed_at: string | null; status: string; service: { title: string } | null } | null;
  };
  const list = ((rows as Row[] | null) ?? []).filter((r) => r.booking?.status === "completed");

  let signed: { path: string; signedUrl: string }[] = [];
  if (list.length > 0) {
    const svc = createSupabaseServiceClient();
    const { data } = await svc.storage
      .from("booking-photos")
      .createSignedUrls(list.map((r) => r.storage_path), 60 * 60);
    signed = (data ?? []).map((s) => ({ path: s.path ?? "", signedUrl: s.signedUrl ?? "" }));
  }
  const urlByPath = new Map(signed.map((s) => [s.path, s.signedUrl] as const));

  const photos: PortfolioPhoto[] = list
    .map((r) => ({
      id: r.id,
      signedUrl: urlByPath.get(r.storage_path) ?? "",
      caption: r.caption,
      portfolioCaption: r.portfolio_caption,
      isPortfolio: r.is_portfolio,
      bookingId: r.booking_id,
      serviceTitle: r.booking?.service?.title ?? "Task",
      completedAt: r.booking?.completed_at ?? new Date().toISOString(),
    }))
    .filter((p) => p.signedUrl);

  return (
    <div className="space-y-5">
      <Link
        href="/helper/earnings"
        className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand-700 mb-4 hover:text-brand-800"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Back
      </Link>

      <PageHeader
        title="Portfolio"
        subtitle="Feature your best completion photos on your public profile. Customers can opt a photo out from their booking, and anything they revoke is never shown."
      />

      <PortfolioGrid initial={photos} />
    </div>
  );
}
