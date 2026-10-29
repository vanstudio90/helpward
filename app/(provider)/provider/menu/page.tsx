import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logoutAction } from "@/app/(auth)/auth/actions";
import {
  ChevronRight, HelpCircle, ShieldCheck, Settings, Calendar, MessageCircle,
  Star, GalleryHorizontal, BarChart3, DollarSign, CreditCard, UserCircle,
  MapPin, Sparkles, FileText, Lock, LogOut, CheckCircle2, Clock,
} from "lucide-react";
import { canAcceptWork, type ProviderReadiness } from "@/lib/provider-readiness";

/* Everything that does not fit in five tabs.
 *
 * The phone had no navigation at all below 1024px, so this is not a
 * convenience — it is the only route to Schedule, Reviews, Portfolio,
 * Analytics and the profile on a phone.
 *
 * Grouped by what a helper is trying to DO rather than by how the app is
 * built: the work itself, the money, the account, and help. A flat list of
 * twelve links is a list you read every time instead of recognising.
 */

type Row = { href: string; label: string; icon: typeof Calendar; sub?: string };

export default async function ProviderMenuPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: profile }, { data: pp }, { count: serviceCount }] = await Promise.all([
    supabase.from("profiles").select("full_name, avatar_url").eq("id", user.id).single(),
    supabase.from("provider_profiles").select("*").eq("user_id", user.id).single(),
    supabase.from("provider_services").select("service_id", { count: "exact", head: true })
      .eq("provider_id", user.id),
  ]);

  const readiness: ProviderReadiness = {
    status: pp?.status ?? "pending",
    serviceCount: serviceCount ?? 0,
    transfersActive: !!pp?.stripe_transfers_active,
    hasBio: !!pp?.bio,
    isOnline: !!pp?.is_online,
  };
  const ready = canAcceptWork(readiness);

  const WORK: Row[] = [
    { href: "/provider/schedule", label: "Schedule", icon: Calendar, sub: "When you're available" },
    { href: "/provider/messages", label: "Messages", icon: MessageCircle, sub: "Customers you're working with" },
    { href: "/provider/reviews", label: "Reviews", icon: Star, sub: "What customers said" },
    { href: "/provider/portfolio", label: "Portfolio", icon: GalleryHorizontal, sub: "Photos of work you've done" },
    { href: "/provider/analytics", label: "Analytics", icon: BarChart3, sub: "How you're doing over time" },
  ];
  const MONEY: Row[] = [
    { href: "/provider/earnings", label: "Earnings", icon: DollarSign, sub: "What you've been paid" },
    { href: "/provider/onboard", label: "Payout setup", icon: CreditCard, sub: "Your bank account and Stripe details" },
  ];
  const ACCOUNT: Row[] = [
    { href: "/provider/profile", label: "Profile", icon: UserCircle, sub: "Name, photo, phone, bio" },
    { href: "/provider/profile", label: "Cities you work in", icon: MapPin, sub: "Where offers reach you" },
    { href: "/provider/profile", label: "Services you offer", icon: Sparkles, sub: "What you'll be sent" },
  ];
  const HELP: Row[] = [
    { href: "/help", label: "Help centre", icon: HelpCircle },
    { href: "/safety", label: "Safety", icon: ShieldCheck },
    { href: "/terms", label: "Terms", icon: FileText },
    { href: "/privacy", label: "Privacy", icon: Lock },
  ];

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-5 lg:py-8 max-w-3xl mx-auto pb-28 lg:pb-12">
      {/* Who you are, and whether you can work — the two things worth
          seeing before any link. */}
      <div className="rounded-2xl bg-white border border-slate-100 p-4 sm:p-5">
        <div className="flex items-center gap-3.5">
          {profile?.avatar_url ? (
            <img src={profile.avatar_url} alt="" className="w-14 h-14 rounded-full object-cover" />
          ) : (
            <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xl font-bold">
              {profile?.full_name?.[0] ?? "?"}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="text-lg font-bold text-slate-900 truncate">{profile?.full_name}</div>
            <div className={`mt-0.5 inline-flex items-center gap-1.5 text-xs font-semibold ${
              ready ? "text-emerald-700" : "text-amber-700"
            }`}>
              {ready
                ? <><CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" /> Ready to accept work</>
                : <><Clock className="w-3.5 h-3.5" aria-hidden="true" /> Setup not finished</>}
            </div>
          </div>
        </div>

        {!ready && (
          <Link
            href="/provider/onboard"
            className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-amber-50 border border-amber-100 px-3.5 py-3"
          >
            <span className="text-sm font-semibold text-amber-900">Finish your setup</span>
            <ChevronRight className="w-4 h-4 text-amber-700 shrink-0" aria-hidden="true" />
          </Link>
        )}
      </div>

      {/* The three a helper reaches for mid-job, big enough to hit without
          looking. */}
      <div className="mt-3 grid grid-cols-3 gap-3">
        {[
          { href: "/help", label: "Help", icon: HelpCircle },
          { href: "/safety", label: "Safety", icon: ShieldCheck },
          { href: "/provider/profile", label: "Settings", icon: Settings },
        ].map((t) => {
          const Icon = t.icon;
          return (
            <Link
              key={t.label}
              href={t.href}
              className="flex flex-col items-center justify-center gap-1.5 rounded-2xl bg-white border border-slate-100 py-4 hover:bg-slate-50 transition-colors"
            >
              <Icon className="w-5 h-5 text-slate-500" aria-hidden="true" />
              <span className="text-xs font-semibold text-slate-800">{t.label}</span>
            </Link>
          );
        })}
      </div>

      {[
        { title: "Your work", rows: WORK },
        { title: "Money", rows: MONEY },
        { title: "Account", rows: ACCOUNT },
        { title: "Help & legal", rows: HELP },
      ].map((group) => (
        <section key={group.title} className="mt-6">
          <h2 className="px-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">
            {group.title}
          </h2>
          <div className="mt-2 rounded-2xl bg-white border border-slate-100 overflow-hidden">
            {group.rows.map((r, i) => {
              const Icon = r.icon;
              return (
                <Link
                  key={`${r.href}-${r.label}`}
                  href={r.href}
                  className={`flex items-center gap-3.5 px-4 py-3.5 hover:bg-slate-50 transition-colors ${
                    i > 0 ? "border-t border-slate-100" : ""
                  }`}
                >
                  <Icon className="w-[18px] h-[18px] text-slate-400 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-slate-900">{r.label}</span>
                    {r.sub && <span className="block text-xs text-slate-500 leading-snug">{r.sub}</span>}
                  </span>
                  <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" aria-hidden="true" />
                </Link>
              );
            })}
          </div>
        </section>
      ))}

      <form action={logoutAction} className="mt-6">
        <button className="w-full flex items-center justify-center gap-2 rounded-2xl bg-white border border-slate-200 py-3.5 text-sm font-semibold text-rose-600 hover:bg-rose-50 transition-colors">
          <LogOut className="w-4 h-4" aria-hidden="true" /> Log out
        </button>
      </form>

      <p className="mt-4 text-center text-[11px] text-slate-400">
        Helpward for helpers · <a href="mailto:support@helpward.com" className="underline underline-offset-2">support@helpward.com</a>
      </p>
    </div>
  );
}
