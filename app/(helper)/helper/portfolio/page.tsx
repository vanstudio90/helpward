import { PageHeader } from "@/components/ui/kit";
import { ArrowLeft, GalleryHorizontal } from "lucide-react";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listPortfolioPhotos } from "@/lib/portfolio";
import { PortfolioGrid } from "./portfolio-grid";

export const dynamic = "force-dynamic";

// Helper-facing portfolio admin. Lists every completion photo the helper
// has ever uploaded across all their completed bookings, with a per-photo
// "Feature on profile" toggle. Public-side render is on /helpers/[id].
export default async function HelperPortfolioPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  /*
    One reader, two surfaces. This page used to build the query, filter
    out unfinished bookings and sign the URLs itself; the native app
    needs exactly the same list, so that work moved to lib/portfolio.ts
    rather than being written a second time against the same policies.
  */
  const photos = await listPortfolioPhotos(supabase, user.id);

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
