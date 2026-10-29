import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logoutAction } from "@/app/(auth)/auth/actions";
import {
  HelpCircle, ShieldCheck, Settings, Calendar, MessageCircle,
  Star, GalleryHorizontal, BarChart3, DollarSign, CreditCard, UserCircle,
  MapPin, Sparkles, FileText, Lock, LogOut, CheckCircle2, Clock,
  ListChecks, ChevronRight,
} from "lucide-react";
import {
  PageHeader, SectionLabel, Card, CircleChip, RowGroup, Row, TextAction,
} from "@/components/helper/ui";
import { canAcceptWork, type HelperReadiness } from "@/lib/provider-readiness";

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

export default async function HelperMenuPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: profile }, { data: pp }, { count: serviceCount }] = await Promise.all([
    supabase.from("profiles").select("full_name, avatar_url").eq("id", user.id).single(),
    supabase.from("provider_profiles").select("*").eq("user_id", user.id).single(),
    supabase.from("provider_services").select("service_id", { count: "exact", head: true })
      .eq("provider_id", user.id),
  ]);

  const readiness: HelperReadiness = {
    status: pp?.status ?? "pending",
    serviceCount: serviceCount ?? 0,
    transfersActive: !!pp?.stripe_transfers_active,
    hasBio: !!pp?.bio,
    isOnline: !!pp?.is_online,
  };
  const ready = canAcceptWork(readiness);

  const WORK: Row[] = [
    { href: "/helper/profile", label: "My services", icon: ListChecks, sub: "What you offer" },
    { href: "/helper/schedule", label: "Availability", icon: Calendar, sub: "When you can work" },
    { href: "/helper/messages", label: "Messages", icon: MessageCircle, sub: "Your customer conversations" },
    { href: "/helper/reviews", label: "Reviews", icon: Star },
    { href: "/helper/portfolio", label: "Portfolio", icon: GalleryHorizontal },
    { href: "/helper/analytics", label: "Insights", icon: BarChart3, sub: "Your work over time" },
  ];
  const MONEY: Row[] = [
    { href: "/helper/earnings", label: "Earnings", icon: DollarSign, sub: "What you've been paid" },
    { href: "/helper/onboard", label: "Payout setup", icon: CreditCard, sub: "Your bank account and Stripe details" },
  ];
  const ACCOUNT: Row[] = [
    { href: "/helper/profile", label: "Profile", icon: UserCircle, sub: "Name, photo, phone, bio" },
    { href: "/helper/profile", label: "Cities you work in", icon: MapPin, sub: "Where offers reach you" },
    { href: "/helper/profile", label: "Services you offer", icon: Sparkles, sub: "What you'll be sent" },
  ];
  const HELP: Row[] = [
    { href: "/help", label: "Help centre", icon: HelpCircle },
    { href: "/safety", label: "Safety", icon: ShieldCheck },
    { href: "/terms", label: "Terms", icon: FileText },
    { href: "/privacy", label: "Privacy", icon: Lock },
  ];

  return (
    <div className="space-y-5">
      <PageHeader title="Menu" />

      {/* Who you are and whether you can be sent work — the two things
          people open this screen to check. */}
      <Card className="p-4 flex items-center gap-4">
        <span className="w-16 h-16 rounded-full bg-brand-50 text-brand-700 flex items-center justify-center text-[20px] font-extrabold shrink-0">
          {initials(profile?.full_name)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[20px] font-extrabold text-slate-900 truncate leading-tight">
            {profile?.full_name ?? "Your profile"}
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[15px] font-bold">
            {ready ? (
              <>
                <CheckCircle2 className="w-[18px] h-[18px] text-emerald-600 shrink-0" aria-hidden="true" />
                <span className="text-emerald-700">Ready to accept work</span>
              </>
            ) : (
              <>
                <Clock className="w-[18px] h-[18px] text-amber-600 shrink-0" aria-hidden="true" />
                <span className="text-amber-700">Setup unfinished</span>
              </>
            )}
          </div>
        </div>
        <span className="shrink-0"><TextAction href="/helper/profile">Edit profile</TextAction></span>
      </Card>

      {/* Three things people reach for often enough to deserve a tap of
          their own rather than a line in a list. */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { href: "/help", label: "Help", icon: HelpCircle },
          { href: "/safety", label: "Safety", icon: ShieldCheck },
          { href: "/helper/profile", label: "Settings", icon: Settings },
        ].map((t) => (
          <Link
            key={t.label}
            href={t.href}
            className="bg-white rounded-card border border-slate-100 shadow-soft py-5 flex flex-col items-center gap-2.5"
          >
            <CircleChip icon={t.icon} />
            <span className="text-[16px] font-extrabold text-slate-900">{t.label}</span>
          </Link>
        ))}
      </div>

      <section>
        <SectionLabel>Your work</SectionLabel>
        <RowGroup>
          {WORK.map((r) => <Row key={r.label} href={r.href} icon={r.icon} title={r.label} sub={r.sub} />)}
        </RowGroup>
      </section>

      <section>
        <SectionLabel>Money</SectionLabel>
        <RowGroup>
          {MONEY.map((r) => <Row key={r.label} href={r.href} icon={r.icon} title={r.label} sub={r.sub} />)}
        </RowGroup>
      </section>

      <section>
        <SectionLabel>Account</SectionLabel>
        <RowGroup>
          {ACCOUNT.map((r) => <Row key={r.label} href={r.href} icon={r.icon} title={r.label} sub={r.sub} />)}
        </RowGroup>
      </section>

      <section>
        <SectionLabel>Help &amp; legal</SectionLabel>
        <RowGroup>
          {HELP.map((r) => <Row key={r.label} href={r.href} icon={r.icon} title={r.label} sub={r.sub} />)}
        </RowGroup>
      </section>

      <form action={logoutAction}>
        <button
          type="submit"
          className="w-full flex items-center gap-3.5 p-4 min-h-[68px] bg-white rounded-card border border-slate-100 shadow-soft text-left"
        >
          <LogOut className="w-[21px] h-[21px] text-slate-400 shrink-0 ml-2.5" aria-hidden="true" />
          <span className="flex-1 text-[16px] font-bold text-slate-500">Sign out</span>
          <ChevronRight className="w-5 h-5 text-slate-300 shrink-0" aria-hidden="true" />
        </button>
      </form>
    </div>
  );
}

/** First letters of the first and last word — "Rodolf Bugaci" -> "RB". */
function initials(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return ((parts[0]![0] ?? "") + (parts.length > 1 ? parts[parts.length - 1]![0] : "")).toUpperCase();
}
