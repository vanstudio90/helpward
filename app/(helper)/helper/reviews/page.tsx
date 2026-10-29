import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Star } from "lucide-react";
import { ClientDateTime } from "@/components/ClientDateTime";
import { one } from "@/lib/supabase/relation";
import { PageHeader, Card, EmptyState, Action } from "@/components/helper/ui";

export default async function HelperReviewsPage() {
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
    <div className="space-y-5">
      <PageHeader title="Reviews" subtitle="What your customers have said." />

      <Card className="p-5">
        <div className="flex items-baseline gap-3 flex-wrap">
          <div className="text-[40px] leading-none font-extrabold text-slate-900 tabular-nums">{pp?.rating_avg ?? "—"}</div>
          <div className="flex items-center gap-0.5">
            {[1, 2, 3, 4, 5].map((i) => (
              <Star key={i} className={`w-[18px] h-[18px] ${pp?.rating_avg && pp.rating_avg >= i ? "fill-amber-400 text-amber-400" : "text-slate-300"}`} />
            ))}
          </div>
          <div className="text-[15px] text-slate-500">{pp?.rating_count ?? 0} reviews · {pp?.tasks_completed ?? 0} tasks done</div>
        </div>
        <ul className="mt-4 space-y-2 text-[14px]">
          {[5, 4, 3, 2, 1].map((star) => {
            const pct = total > 0 ? Math.round(((buckets[star] ?? 0) / total) * 100) : 0;
            return (
              <li key={star} className="flex items-center gap-2.5">
                <span className="w-3 text-slate-500 tabular-nums">{star}</span>
                <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" aria-hidden="true" />
                <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-amber-400 rounded-full" style={{ width: `${pct}%` }} />
                </div>
                <span className="w-8 text-right text-slate-500 tabular-nums">{buckets[star] ?? 0}</span>
              </li>
            );
          })}
        </ul>
      </Card>

      {total === 0 ? (
        <EmptyState
          icon={Star}
          title="No reviews yet"
          body="Once you complete a task, the customer can rate you and their words land here."
        >
          <Action href="/helper/inbox">View offers</Action>
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {(reviews ?? []).map((r, i) => {
            const c = one(r.customer);
            return (
              <li key={i} className="bg-white rounded-card border border-slate-100 shadow-soft p-4">
                <div className="flex items-center gap-3 mb-2">
                  {c?.avatar_url ? (
                    <img src={c.avatar_url} className="w-11 h-11 rounded-full object-cover" alt="" />
                  ) : (
                    <div className="w-11 h-11 rounded-full bg-brand-50 flex items-center justify-center text-brand-700 font-extrabold">
                      {c?.full_name?.[0] ?? "?"}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-[16px] font-bold text-slate-900 truncate">{c?.full_name ?? "Anonymous"}</div>
                    <div className="text-[13px] text-slate-500"><ClientDateTime iso={r.created_at} mode="date" /></div>
                  </div>
                  <div className="flex items-center gap-0.5">
                    {Array.from({ length: r.rating }).map((_, j) => (
                      <Star key={j} className="w-4 h-4 fill-amber-400 text-amber-400" aria-hidden="true" />
                    ))}
                  </div>
                </div>
                {r.comment && <p className="text-[15px] text-slate-700 leading-relaxed">{r.comment}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
