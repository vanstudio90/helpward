import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { Shield } from "lucide-react";
import { ClientDateTime } from "@/components/ClientDateTime";

export default async function AdminUsersPage({
  searchParams,
}: { searchParams: Promise<{ role?: string; country?: string; q?: string }> }) {
  const params = await searchParams;
  const supabase = createSupabaseServiceClient();
  let q = supabase
    .from("profiles")
    .select("id, role, full_name, phone, country, default_currency, created_at, avatar_url")
    .order("created_at", { ascending: false })
    .limit(100);

  if (params.role) q = q.eq("role", params.role);
  if (params.country) q = q.eq("country", params.country);
  if (params.q) q = q.ilike("full_name", `%${params.q}%`);

  const { data: rows } = await q;

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-6xl mx-auto">
      <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Users</h1>
      <p className="text-sm text-slate-500 mt-1 mb-5">{rows?.length ?? 0} most recent</p>

      <form className="flex flex-wrap items-center gap-2 mb-4 text-sm" action="">
        <input
          name="q"
          defaultValue={params.q ?? ""}
          placeholder="Search name…"
          className="flex-1 min-w-[200px] px-3 py-2 rounded-xl bg-white border border-slate-200"
        />
        <select name="role" defaultValue={params.role ?? ""} className="px-3 py-2 rounded-xl bg-white border border-slate-200">
          <option value="">All roles</option>
          <option value="customer">Customer</option>
          <option value="provider">Provider</option>
          <option value="admin">Admin</option>
        </select>
        <select name="country" defaultValue={params.country ?? ""} className="px-3 py-2 rounded-xl bg-white border border-slate-200">
          <option value="">All countries</option>
          <option value="US">US</option>
          <option value="CA">CA</option>
        </select>
        <button type="submit" className="px-4 py-2 rounded-xl bg-slate-900 text-white font-semibold">Filter</button>
      </form>

      <div className="rounded-2xl bg-white border border-slate-100 overflow-hidden">
        <div className="hidden md:grid grid-cols-[1.4fr_0.6fr_0.5fr_0.7fr_1fr] gap-3 px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 border-b border-slate-100 bg-slate-50">
          <span>Name</span><span>Role</span><span>Country</span><span>Currency</span><span>Joined</span>
        </div>
        <ul className="divide-y divide-slate-100">
          {(rows ?? []).map((r) => (
            <li key={r.id} className="md:grid md:grid-cols-[1.4fr_0.6fr_0.5fr_0.7fr_1fr] gap-3 px-4 py-3 items-center text-sm flex flex-wrap">
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                {r.avatar_url ? (
                  <img src={r.avatar_url} className="w-8 h-8 rounded-full" alt="" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 font-bold text-xs">
                    {r.full_name?.[0] ?? "?"}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="font-semibold truncate">{r.full_name || "—"}</div>
                  <div className="text-[10px] text-slate-400 truncate font-mono">{r.id}</div>
                </div>
              </div>
              <span className={
                r.role === "admin" ? "inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full w-fit"
                : r.role === "provider" ? "inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full w-fit"
                : "inline-flex items-center gap-1 text-[11px] font-semibold text-brand-700 bg-brand-50 px-2 py-0.5 rounded-full w-fit"
              }>
                {r.role === "admin" && <Shield className="w-3 h-3" />}
                {r.role}
              </span>
              <span className="text-slate-700">{r.country}</span>
              <span className="text-slate-700">{r.default_currency}</span>
              <span className="text-slate-500 text-xs"><ClientDateTime iso={r.created_at} mode="date" /></span>
            </li>
          ))}
          {(rows?.length ?? 0) === 0 && (
            <li className="py-12 text-center text-sm text-slate-500">
              No users match those filters.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
