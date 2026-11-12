import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, getRequestClient } from "@/lib/auth/current-user";
import { logoutAction } from "@/app/(auth)/auth/actions";
import {
  LayoutDashboard, Users, ShieldCheck, Calendar, AlertOctagon,
  CreditCard, Banknote, Sparkles, FileText, LogOut, Inbox, MapPin,
  Shield, LifeBuoy, Bell,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { AdminSearch } from "@/components/admin/AdminSearch";
import { AdminNavLink } from "@/components/admin/AdminNavLink";

/*
  THE CONSOLE SHELL.

  Grouped the way the work divides rather than the way the tables do:
  the queues a person works through, then the people, then money, then
  the catalogue, then the records nobody touches daily. A flat list of
  fourteen links in schema order is a filing cabinet, not a console.

  The environment is named in the top bar on purpose. This console can
  refund money and suspend accounts, and "which database am I in" is
  not a question anybody should have to answer from memory.
*/

const NAV = [
  { section: null, items: [{ href: "/admin", label: "Overview", icon: LayoutDashboard, exact: true }] },
  {
    section: "Operations",
    items: [
      { href: "/admin/bookings", label: "Requests & bookings", icon: Calendar },
      { href: "/admin/helpers", label: "Helpers", icon: ShieldCheck },
      { href: "/admin/users", label: "Customers", icon: Users },
      { href: "/admin/inbox", label: "Inbox & support", icon: Inbox },
      { href: "/admin/disputes", label: "Safety & disputes", icon: AlertOctagon },
    ],
  },
  {
    section: "Money",
    items: [
      { href: "/admin/payments", label: "Payments", icon: CreditCard },
      { href: "/admin/refunds", label: "Refunds", icon: Banknote },
    ],
  },
  {
    section: "Marketplace",
    items: [
      { href: "/admin/services", label: "Services & pricing", icon: Sparkles },
      { href: "/admin/venues", label: "Coverage & venues", icon: MapPin },
      { href: "/admin/reviews", label: "Reviews", icon: LifeBuoy },
    ],
  },
  {
    section: "Records",
    items: [
      { href: "/admin/data-requests", label: "Data requests", icon: Shield },
      { href: "/admin/audit-log", label: "Audit log", icon: FileText },
    ],
  },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  /*
    ONE VERIFIED USER PER REQUEST. getCurrentUser() is memoised for the
    render, so the page below this layout reuses this answer instead of
    asking the auth service a second time.
  */
  const [supabase, user] = await Promise.all([getRequestClient(), getCurrentUser()]);
  if (!user) redirect("/login?next=/admin");

  const role = (user.app_metadata?.role as string | undefined) ?? "customer";
  if (role !== "admin") redirect("/dashboard");

  /*
    Which project this console is pointed at, read from the Supabase URL
    rather than from NODE_ENV — the thing that decides whose money is on
    screen is the database, and a production build pointed at rehearsal
    has fooled people before.
  */
  const supabaseRef = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").match(/https:\/\/([a-z0-9]+)\./)?.[1] ?? "";
  const isProduction = supabaseRef === "xhmgmegraieouudyjjlv";

  /*
    The bell is a real count or it is not there.

    record_dispatch_refusal (0034) notifies every admin when dispatch
    breaks for a configuration reason, and the portfolio and deletion
    flows write here too. Unread is `read_at is null`, scoped to this
    admin — a bell showing somebody else's unread count would be worse
    than no bell.
  */
  /*
    THE NAME AND THE BELL ARE TWO INDEPENDENT READS, so they travel
    together. Asked one after the other they cost two round trips on
    every admin page for no reason: neither answer depends on the other.
  */
  const [{ data: profile }, { count: unread }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .is("read_at", null),
  ]);

  const initials = (profile?.full_name ?? "Admin")
    .split(/\s+/).filter(Boolean).slice(0, 2).map((w: string) => w[0]).join("").toUpperCase();

  return (
    <div className="min-h-screen lg:flex bg-[#f5f4fb]">
      <aside className="hidden lg:flex w-60 shrink-0 flex-col bg-[#171430] text-white">
        <Link href="/" className="flex items-center gap-2.5 px-5 h-16">
          <span className="w-9 h-9 rounded-xl bg-brand-600 grid place-items-center shrink-0">
            <Logo size={20} tone="light" />
          </span>
          <span className="flex items-baseline gap-1.5">
            <span className="text-[15px] font-bold leading-none">Helpward</span>
            <span className="text-[9px] font-bold tracking-widest text-white/50 bg-white/10 rounded px-1.5 py-0.5">
              ADMIN
            </span>
          </span>
        </Link>

        <nav className="flex-1 px-3 py-2 space-y-4 overflow-y-auto">
          {NAV.map((group, i) => (
            <div key={group.section ?? i}>
              {group.section && (
                <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-white/35">
                  {group.section}
                </div>
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <AdminNavLink
                    key={item.href}
                    href={item.href}
                    label={item.label}
                    exact={"exact" in item ? Boolean(item.exact) : false}
                  >
                    <item.icon className="w-[18px] h-[18px]" />
                  </AdminNavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="px-3 pb-4">
          <form action={logoutAction}>
            <button className="w-full inline-flex items-center justify-center gap-2 text-[12px] font-semibold text-white/60 hover:text-white border border-white/10 hover:border-white/20 rounded-xl py-2">
              <LogOut className="w-3.5 h-3.5" /> Log out
            </button>
          </form>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-16 shrink-0 flex items-center gap-3 px-4 sm:px-6 lg:px-8">
          <AdminSearch />
          <span
            className={`hidden sm:inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-full border ${
              isProduction
                ? "bg-white border-slate-200 text-slate-700"
                : "bg-amber-50 border-amber-200 text-amber-800"
            }`}
            title={supabaseRef ? `Supabase project ${supabaseRef}` : "No Supabase project configured"}
          >
            <span className={`w-2 h-2 rounded-full ${isProduction ? "bg-emerald-500" : "bg-amber-500"}`} />
            {isProduction ? "Production" : "Rehearsal"}
          </span>
          <Link
            href="/admin/inbox"
            className="relative w-9 h-9 rounded-full bg-white border border-slate-200 grid place-items-center shrink-0 hover:border-brand-300"
            title={unread ? `${unread} unread notification${unread === 1 ? "" : "s"}` : "No unread notifications"}
          >
            <Bell className="w-[18px] h-[18px] text-slate-600" />
            {Boolean(unread) && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold grid place-items-center">
                {unread! > 9 ? "9+" : unread}
              </span>
            )}
          </Link>
          <span
            className="w-9 h-9 rounded-full bg-brand-600 text-white grid place-items-center text-[12px] font-bold shrink-0"
            title={profile?.full_name ?? undefined}
          >
            {initials}
          </span>
        </header>

        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
