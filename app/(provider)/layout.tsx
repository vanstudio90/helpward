import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logoutAction } from "@/app/(auth)/auth/actions";
import {
  LayoutDashboard, Inbox, Activity, DollarSign, Calendar, MessageCircle,
  UserCircle, LogOut, Star, GalleryHorizontal,
} from "lucide-react";

const NAV = [
  { href: "/provider/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/provider/inbox", label: "Inbox", icon: Inbox },
  { href: "/provider/active", label: "Active task", icon: Activity },
  { href: "/provider/schedule", label: "Schedule", icon: Calendar },
  { href: "/provider/messages", label: "Messages", icon: MessageCircle },
  { href: "/provider/reviews", label: "Reviews", icon: Star },
  { href: "/provider/portfolio", label: "Portfolio", icon: GalleryHorizontal },
  { href: "/provider/earnings", label: "Earnings", icon: DollarSign },
  { href: "/provider/profile", label: "Profile", icon: UserCircle },
];

export default async function ProviderLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/provider/dashboard");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role")
    .single();

  if (profile?.role !== "provider" && profile?.role !== "admin") {
    redirect("/dashboard");
  }

  const { data: pp } = await supabase
    .from("provider_profiles")
    .select("status, approved_at")
    .single();

  // If they haven't finished onboarding, force them to /provider/onboard
  // (status='pending' AND no approved_at means they haven't submitted KYC yet)

  return (
    <div className="min-h-screen lg:flex bg-slate-50">
      {/* Sidebar */}
      <aside className="hidden lg:flex w-64 shrink-0 flex-col border-r border-slate-200 bg-white">
        <Link href="/" className="flex items-center gap-2 px-6 h-16 border-b border-slate-100">
          <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold">H</div>
          <div>
            <div className="text-base font-bold leading-tight">Helpward</div>
            <div className="text-[10px] text-emerald-600 font-semibold uppercase tracking-wide">For providers</div>
          </div>
        </Link>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              >
                <Icon className="w-5 h-5 text-slate-400" />
                <span className="flex-1">{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="px-3 pb-4 space-y-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-3">
            <div className="text-xs text-slate-500">Logged in as</div>
            <div className="text-sm font-semibold text-slate-900 truncate">{profile?.full_name}</div>
            <form action={logoutAction}>
              <button className="mt-2 w-full inline-flex items-center justify-center gap-2 text-xs font-semibold text-rose-600 border border-slate-200 rounded-lg py-2">
                <LogOut className="w-3.5 h-3.5" /> Log out
              </button>
            </form>
          </div>
          {pp?.status && (
            <div className={`rounded-xl border p-3 text-xs ${
              pp.status === "approved" ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : pp.status === "pending" ? "border-amber-200 bg-amber-50 text-amber-700"
              : "border-rose-200 bg-rose-50 text-rose-700"
            }`}>
              <div className="font-bold capitalize">{pp.status}</div>
              <div className="mt-0.5 leading-snug">
                {pp.status === "pending" && "Complete onboarding to start accepting tasks."}
                {pp.status === "approved" && "You can accept tasks."}
                {pp.status === "suspended" && "Contact support to restore access."}
              </div>
            </div>
          )}
        </div>
      </aside>

      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
