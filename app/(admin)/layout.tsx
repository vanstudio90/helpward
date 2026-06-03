import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logoutAction } from "@/app/(auth)/auth/actions";
import {
  LayoutDashboard, Users, ShieldCheck, Calendar, AlertOctagon,
  CreditCard, RefreshCw, Sparkles, FileText, LogOut, MessageSquare, Shield,
  Inbox,
} from "lucide-react";

const NAV = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/inbox", label: "Inbox", icon: Inbox },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/providers", label: "Provider queue", icon: ShieldCheck },
  { href: "/admin/bookings", label: "Bookings", icon: Calendar },
  { href: "/admin/disputes", label: "Disputes", icon: AlertOctagon },
  { href: "/admin/reviews", label: "Reviews", icon: MessageSquare },
  { href: "/admin/payments", label: "Payments", icon: CreditCard },
  { href: "/admin/refunds", label: "Refunds", icon: RefreshCw },
  { href: "/admin/services", label: "Service catalog", icon: Sparkles },
  { href: "/admin/data-requests", label: "Data requests", icon: Shield },
  { href: "/admin/audit-log", label: "Audit log", icon: FileText },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin");

  const role = (user.app_metadata?.role as string | undefined) ?? "customer";
  if (role !== "admin") redirect("/dashboard");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .single();

  return (
    <div className="min-h-screen lg:flex bg-slate-50">
      <aside className="hidden lg:flex w-64 shrink-0 flex-col border-r border-slate-200 bg-slate-900 text-white">
        <Link href="/" className="flex items-center gap-2 px-6 h-16 border-b border-white/10">
          <div className="w-8 h-8 rounded-lg bg-rose-500 text-white flex items-center justify-center font-bold">H</div>
          <div>
            <div className="text-base font-bold leading-tight">Helpward</div>
            <div className="text-[10px] text-rose-400 font-semibold uppercase tracking-wide">Admin</div>
          </div>
        </Link>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-300 hover:bg-white/5 hover:text-white"
              >
                <Icon className="w-5 h-5 text-slate-400" />
                <span className="flex-1">{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="px-3 pb-4">
          <div className="rounded-2xl bg-white/5 border border-white/10 p-3">
            <div className="text-xs text-slate-400">Logged in as</div>
            <div className="text-sm font-semibold text-white truncate">{profile?.full_name}</div>
            <form action={logoutAction}>
              <button className="mt-2 w-full inline-flex items-center justify-center gap-2 text-xs font-semibold text-rose-300 border border-white/10 rounded-lg py-2">
                <LogOut className="w-3.5 h-3.5" /> Log out
              </button>
            </form>
          </div>
        </div>
      </aside>

      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
