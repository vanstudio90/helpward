import { ArrowLeft, GalleryHorizontal } from "lucide-react";
import Link from "next/link";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";
import { PortfolioGrid, type PortfolioPhoto } from "./portfolio-grid";

export const dynamic = "force-dynamic";

// Helper-facing portfolio admin. Lists every completion photo the helper
// has ever uploaded across all their completed bookings, with a per-photo
// "Feature on profile" toggle. Public-side render is on /providers/[id].
export default async function ProviderPortfolioPage() {
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
    <div className="px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-5xl mx-auto pb-12">
      <Link
        href="/provider/earnings"
        className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 mb-4 hover:text-brand-800"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Back
      </Link>

      <div className="flex items-center gap-3 mb-1">
        <GalleryHorizontal className="w-6 h-6 text-amber-600" />
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Portfolio</h1>
      </div>
      <p className="text-sm text-slate-500 mb-6 max-w-2xl">
        Feature your best completion photos on your public profile so prospective customers can see real work.
        Customers can opt-out individual photos from their booking page — we don&apos;t feature anything they
        revoke.
      </p>

      <PortfolioGrid initial={photos} />
    </div>
  );
}
