import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Star } from "lucide-react";
import { ClientDateTime } from "@/components/ClientDateTime";

export default async function ProviderReviewsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: reviews }, { data: pp }] = await Promise.all([
    supabase
      .from("reviews")
      .select("rating, comment, created_at, customer:profiles!reviews_customer_id_fkey(full_name, avatar_url)")
      .eq("provider_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("provider_profiles")
      .select("rating_avg, rating_count, tasks_completed")
      .eq("user_id", user.id)
      .single(),
  ]);

  const buckets: Record<number, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  (reviews ?? []).forEach((r) => { buckets[r.rating] = (buckets[r.rating] ?? 0) + 1; });
  const total = reviews?.length ?? 0;

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-3xl mx-auto pb-12">
      <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">My reviews</h1>
      <p className="text-sm text-slate-500 mt-1 mb-6">What your customers have said.</p>

      <div className="rounded-2xl bg-white border border-slate-100 p-5 mb-5">
        <div className="flex items-baseline gap-3">
          <div className="text-4xl font-bold text-slate-900">{pp?.rating_avg ?? "—"}</div>
          <div className="flex items-center gap-0.5">
            {[1, 2, 3, 4, 5].map((i) => (
              <Star key={i} className={`w-4 h-4 ${pp?.rating_avg && pp.rating_avg >= i ? "fill-amber-400 text-amber-400" : "text-slate-300"}`} />
            ))}
          </div>
          <div className="text-sm text-slate-500">{pp?.rating_count ?? 0} reviews · {pp?.tasks_completed ?? 0} tasks done</div>
        </div>
        <ul className="mt-4 space-y-1.5 text-xs">
          {[5, 4, 3, 2, 1].map((star) => {
            const pct = total > 0 ? Math.round(((buckets[star] ?? 0) / total) * 100) : 0;
            return (
              <li key={star} className="flex items-center gap-2">
                <span className="w-3 text-slate-500">{star}</span>
                <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-amber-400" style={{ width: `${pct}%` }} />
                </div>
                <span className="w-10 text-right text-slate-500">{buckets[star] ?? 0}</span>
              </li>
            );
          })}
        </ul>
      </div>

      {total === 0 ? (
        <div className="rounded-2xl bg-white border border-slate-100 p-8 text-center">
          <p className="text-sm text-slate-500">No reviews yet. Complete a few tasks and customers can rate you.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {(reviews ?? []).map((r, i) => {
            const c = (r as { customer: { full_name: string; avatar_url: string | null } | null }).customer;
            return (
              <li key={i} className="rounded-2xl bg-white border border-slate-100 p-4">
                <div className="flex items-center gap-3 mb-2">
                  {c?.avatar_url ? (
                    <img src={c.avatar_url} className="w-9 h-9 rounded-full" alt="" />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 font-bold">
                      {c?.full_name?.[0] ?? "?"}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold text-slate-900 truncate">{c?.full_name ?? "Anonymous"}</div>
                    <div className="text-[11px] text-slate-500"><ClientDateTime iso={r.created_at} mode="date" /></div>
                  </div>
                  <div className="flex items-center gap-0.5">
                    {Array.from({ length: r.rating }).map((_, j) => (
                      <Star key={j} className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                    ))}
                  </div>
                </div>
                {r.comment && <p className="text-sm text-slate-700 leading-relaxed">{r.comment}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
