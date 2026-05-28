import { listMyBookings, getDashboardStats } from "@/lib/data/customer";
import { BarChart3 } from "lucide-react";
import { ClientDateTime } from "@/components/ClientDateTime";

export default async function AnalyticsPage() {
  const [stats, completed] = await Promise.all([
    getDashboardStats(),
    listMyBookings({ status: "completed" }),
  ]);

  return (
    <div className="px-4 lg:px-8 py-5 lg:py-8 max-w-[1500px] mx-auto">
      <h1 className="text-2xl lg:text-3xl font-bold text-slate-900">Analytics</h1>
      <p className="text-sm text-slate-500 mt-1 mb-6">Track your activity, spending, and performance insights.</p>

      {stats.total_bookings === 0 ? (
        <div className="rounded-2xl bg-gradient-to-br from-brand-50 to-violet-50 border border-brand-100 p-8 sm:p-12 text-center">
          <span className="inline-flex w-14 h-14 rounded-2xl bg-white items-center justify-center mb-3">
            <BarChart3 className="w-7 h-7 text-brand-600" />
          </span>
          <h2 className="text-lg font-bold text-slate-900">Not enough data yet</h2>
          <p className="mt-1 text-sm text-slate-600 max-w-sm mx-auto">
            Complete a few bookings and your spending, hours saved, top providers and category breakdowns will appear here.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="Total Bookings" value={String(stats.total_bookings)} />
            <Stat label="Total Spent" value={`$${(stats.total_spent_all_cents / 100).toFixed(2)}`} />
            <Stat label="Completed This Month" value={String(stats.completed_month)} />
            <Stat label="Active Right Now" value={String(stats.in_progress)} />
          </div>

          <div className="mt-6 rounded-2xl bg-white border border-slate-100 p-5">
            <h2 className="text-sm font-bold text-slate-900 mb-3">Recent completed bookings</h2>
            <ul className="space-y-3 text-sm">
              {completed.slice(0, 10).map((b) => (
                <li key={b.id} className="flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900 truncate">{b.service.title}</div>
                    <div className="text-xs text-slate-500"><ClientDateTime iso={b.completed_at} mode="date" /></div>
                  </div>
                  <div className="font-bold text-slate-900">${(b.total_cents / 100).toFixed(2)}</div>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white border border-slate-100 p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-bold text-slate-900">{value}</div>
    </div>
  );
}
