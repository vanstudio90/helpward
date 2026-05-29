import Link from "next/link";
import { redirect } from "next/navigation";
import { Star, EyeOff, Eye, AlertCircle, MessageSquare } from "lucide-react";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";
import { ClientDateTime } from "@/components/ClientDateTime";
import { ReviewVisibilityButton } from "./visibility-button";

type Filter = "all" | "visible" | "hidden" | "low";

const TONE: Record<string, string> = {
  visible: "bg-emerald-50 text-emerald-700",
  hidden: "bg-rose-50 text-rose-700",
};

export default async function AdminReviewsPage({
  searchParams,
}: { searchParams: Promise<{ filter?: Filter }> }) {
  // Defense-in-depth: proxy already gates /admin/*, but a direct render path
  // could otherwise leak the service-role-bound query.
  const userClient = await createSupabaseServerClient();
  const { data: { user } } = await userClient.auth.getUser();
  if ((user?.app_metadata?.role as string | undefined) !== "admin") redirect("/login");

  const { filter = "all" } = await searchParams;
  const supabase = createSupabaseServiceClient();

  let q = supabase
    .from("reviews")
    .select(`
      id, rating, comment, customer_visible, created_at,
      booking_id, customer_id, provider_id,
      customer:profiles!reviews_customer_id_fkey(full_name, avatar_url),
      provider:provider_profiles!reviews_provider_id_fkey(
        user_id,
        profile:profiles!provider_profiles_user_id_fkey(full_name, avatar_url)
      )
    `)
    .order("created_at", { ascending: false })
    .limit(200);

  if (filter === "visible") q = q.eq("customer_visible", true);
  if (filter === "hidden") q = q.eq("customer_visible", false);
  if (filter === "low") q = q.lte("rating", 2);

  const { data: rows } = await q;

  const counts = await Promise.all([
    supabase.from("reviews").select("*", { count: "exact", head: true }),
    supabase.from("reviews").select("*", { count: "exact", head: true }).eq("customer_visible", true),
    supabase.from("reviews").select("*", { count: "exact", head: true }).eq("customer_visible", false),
    supabase.from("reviews").select("*", { count: "exact", head: true }).lte("rating", 2),
  ]);
  const [all, vis, hid, low] = counts.map((c) => c.count ?? 0);

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-6xl mx-auto">
      <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 inline-flex items-center gap-2">
        <MessageSquare className="w-6 h-6 text-brand-600" /> Reviews moderation
      </h1>
      <p className="text-sm text-slate-500 mt-1 mb-5">
        Hide reviews that violate policy. Hidden reviews are kept in the database for the provider&apos;s internal
        rating average and any associated dispute, but disappear from the public provider page.
      </p>

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2 mb-5">
        <Tab href="/admin/reviews?filter=all" active={filter === "all"} label="All" count={all} />
        <Tab href="/admin/reviews?filter=visible" active={filter === "visible"} label="Visible" count={vis} />
        <Tab href="/admin/reviews?filter=hidden" active={filter === "hidden"} label="Hidden" count={hid} />
        <Tab href="/admin/reviews?filter=low" active={filter === "low"} label="Low-star (≤2)" count={low} />
      </div>

      {(rows?.length ?? 0) === 0 ? (
        <div className="rounded-2xl bg-white border border-slate-100 p-12 text-center">
          <p className="text-sm text-slate-500">No reviews match this filter.</p>
        </div>
      ) : (
        <ul className="rounded-2xl bg-white border border-slate-100 divide-y divide-slate-100 overflow-hidden">
          {(rows ?? []).map((r) => {
            const customer = (r as { customer: { full_name: string; avatar_url: string | null } | null }).customer;
            const providerProfile = (r as { provider: { profile: { full_name: string; avatar_url: string | null } | null } | null }).provider?.profile;
            const lowStar = r.rating <= 2;
            return (
              <li key={r.id} className="p-4">
                <div className="flex items-start gap-3">
                  {customer?.avatar_url ? (
                    <img src={customer.avatar_url} alt="" className="w-9 h-9 rounded-full" />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 font-bold text-xs">
                      {customer?.full_name?.[0] ?? "?"}
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-slate-900">{customer?.full_name ?? "Anonymous"}</span>
                      <span className="inline-flex items-center gap-0.5 text-amber-500">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star key={i} className={`w-3 h-3 ${i < r.rating ? "fill-amber-400 text-amber-400" : "text-slate-200"}`} />
                        ))}
                      </span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${TONE[r.customer_visible ? "visible" : "hidden"]}`}>
                        {r.customer_visible ? "VISIBLE" : "HIDDEN"}
                      </span>
                      {lowStar && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700">
                          <AlertCircle className="w-2.5 h-2.5" /> LOW
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      Reviewed{" "}
                      <Link
                        href={`/providers/${(r as { provider_id: string }).provider_id}`}
                        className="font-semibold text-brand-700 hover:underline"
                      >
                        {providerProfile?.full_name ?? "unknown helper"}
                      </Link>{" "}
                      · booking #{(r as { booking_id: string }).booking_id.slice(0, 8)} ·{" "}
                      <ClientDateTime iso={r.created_at} />
                    </div>
                    {r.comment && (
                      <p className="mt-2 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed bg-slate-50 rounded-lg p-3">
                        {r.comment}
                      </p>
                    )}
                  </div>

                  <div className="shrink-0">
                    <ReviewVisibilityButton reviewId={r.id} currentlyVisible={r.customer_visible} />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-4 text-[11px] text-slate-400">
        Every hide/restore is logged to <Link href="/admin/audit-log?action=review.hide" className="text-brand-700 hover:underline">audit-log</Link> with your admin ID and timestamp.
      </p>
    </div>
  );
}

function Tab({ href, active, label, count }: { href: string; active: boolean; label: string; count: number }) {
  return (
    <Link
      href={href}
      className={`px-3 py-1.5 rounded-full text-xs font-semibold inline-flex items-center gap-1.5 ${
        active ? "bg-slate-900 text-white" : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
      }`}
    >
      {label}
      <span className={`text-[10px] font-bold rounded-full px-1.5 ${active ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"}`}>
        {count}
      </span>
    </Link>
  );
}
