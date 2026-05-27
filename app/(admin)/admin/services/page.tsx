import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { toggleServiceActiveAction } from "./actions";

export default async function AdminServicesPage() {
  const supabase = createSupabaseServiceClient();
  const { data } = await supabase
    .from("services")
    .select("id, title, blurb, base_price_cents, eta_label, active, category_id, image_url")
    .order("category_id")
    .order("title");

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-6xl mx-auto">
      <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Service catalog</h1>
      <p className="text-sm text-slate-500 mt-1 mb-5">{data?.length ?? 0} services across the platform</p>

      <ul className="rounded-2xl bg-white border border-slate-100 divide-y divide-slate-100 overflow-hidden">
        {(data ?? []).map((s) => (
          <li key={s.id} className="p-4 flex items-start gap-3">
            {s.image_url ? (
              <img src={s.image_url} alt="" className="w-14 h-14 rounded-lg object-cover shrink-0" />
            ) : (
              <div className="w-14 h-14 rounded-lg bg-slate-100 shrink-0" />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-900 truncate">{s.title}</span>
                <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                  {s.category_id}
                </span>
                {!s.active && (
                  <span className="text-[10px] font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full">
                    Disabled
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-500 line-clamp-2 mt-0.5">{s.blurb}</div>
              <div className="text-xs text-slate-700 mt-1">
                ${(s.base_price_cents / 100).toFixed(2)} · {s.eta_label}
              </div>
            </div>
            <form action={async () => {
              "use server";
              await toggleServiceActiveAction(s.id, !s.active);
            }}>
              <button className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                s.active ? "border border-slate-200 text-slate-700" : "bg-emerald-600 text-white"
              }`}>
                {s.active ? "Disable" : "Enable"}
              </button>
            </form>
          </li>
        ))}
      </ul>

      <p className="mt-6 text-xs text-slate-400 text-center">
        Add/edit forms ship in Phase 6.2 — for now you can toggle visibility.
      </p>
    </div>
  );
}
