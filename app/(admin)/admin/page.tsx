import { createSupabaseServiceClient } from "@/lib/supabase/server";
import Link from "next/link";
import { Users, Calendar, AlertOctagon, DollarSign, ArrowRight } from "lucide-react";

export default async function AdminOverviewPage() {
  // Service-role client so we can count across all rows (admin context)
  const supabase = createSupabaseServiceClient();

  const [
    { count: totalUsers },
    { count: pendingProviders },
    { count: activeBookings },
    { count: openDisputes },
  ] = await Promise.all([
    supabase.from("profiles").select("*", { count: "exact", head: true }),
    supabase.from("provider_profiles").select("*", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("bookings").select("*", { count: "exact", head: true }).eq("status", "in_progress"),
    supabase.from("disputes").select("*", { count: "exact", head: true }).eq("status", "open"),
  ]);

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-6xl mx-auto">
      <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Admin overview</h1>
      <p className="text-sm text-slate-500 mt-1">Operational snapshot.</p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-6">
        <KPI label="Total users" value={String(totalUsers ?? 0)} icon={<Users className="w-5 h-5 text-brand-600" />} tint="bg-brand-50" href="/admin/users" />
        <KPI label="Providers awaiting approval" value={String(pendingProviders ?? 0)} icon={<AlertOctagon className="w-5 h-5 text-amber-600" />} tint="bg-amber-50" href="/admin/providers" />
        <KPI label="Active bookings" value={String(activeBookings ?? 0)} icon={<Calendar className="w-5 h-5 text-emerald-600" />} tint="bg-emerald-50" href="/admin/bookings" />
        <KPI label="Open disputes" value={String(openDisputes ?? 0)} icon={<DollarSign className="w-5 h-5 text-rose-600" />} tint="bg-rose-50" href="/admin/disputes" />
      </div>

      <p className="mt-8 text-xs text-slate-400 text-center">
        Detailed dashboards land in Phase 6.
      </p>
    </div>
  );
}

function KPI({ label, value, icon, tint, href }: { label: string; value: string; icon: React.ReactNode; tint: string; href: string }) {
  return (
    <Link href={href} className="rounded-2xl bg-white border border-slate-100 p-4 sm:p-5 flex flex-col gap-3 hover:border-slate-200 hover:-translate-y-0.5 transition">
      <div className="flex items-start justify-between">
        <div className="text-xs text-slate-500 leading-tight">{label}</div>
        <span className={`w-9 h-9 ${tint} rounded-xl inline-flex items-center justify-center`}>{icon}</span>
      </div>
      <div className="text-2xl font-bold text-slate-900">{value}</div>
      <div className="text-xs font-semibold text-brand-700 inline-flex items-center gap-1">
        View <ArrowRight className="w-3 h-3" />
      </div>
    </Link>
  );
}
