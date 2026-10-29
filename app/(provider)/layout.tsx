import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logoutAction } from "@/app/(auth)/auth/actions";
import {
  LayoutDashboard, Inbox, Activity, DollarSign, Calendar, MessageCircle,
  UserCircle, LogOut, Star, GalleryHorizontal, BarChart3,
} from "lucide-react";
import { ProviderTopBar } from "@/components/provider/ProviderTopBar";
import { ProviderTabBar } from "@/components/provider/ProviderTabBar";
import { ProviderSideNav } from "@/components/provider/ProviderSideNav";


export default async function ProviderLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/provider/dashboard");

  // Filtered by id, and the error is read.
  //
  // Without the filter this was an infinite redirect: profiles_read
  // (migration 0002) exposes every helper row to any authenticated user,
  // so .single() matched 1 + <provider count> rows, returned PGRST116, and
  // left `profile` null. A null profile fails the role check below, sending
  // the helper to /dashboard, whose own role gate sends them straight back.
  // The helper could sign in and never reach a single page.
  //
  // Fetched together. The provider_profiles read does not depend on the
  // profiles result — only the DECISIONS below depend on it — so awaiting
  // them in sequence added a round trip to every single provider page
  // load, this layout being on all of them.
  const [
    { data: profile, error: profileError },
    { data: pp },
  ] = await Promise.all([
    supabase.from("profiles").select("full_name, role").eq("id", user.id).single(),
    supabase.from("provider_profiles").select("status, approved_at").eq("user_id", user.id).maybeSingle(),
  ]);

  // A lookup that FAILED is not the same as a user who is not a provider.
  // Treating the two alike is what turned a transient error into a loop.
  if (profileError) {
    throw new Error(`Could not load your profile: ${profileError.message}`);
  }
  if (profile?.role !== "provider" && profile?.role !== "admin") {
    redirect("/dashboard");
  }

  // Offers waiting, for the tab badge. A count is the whole point of a
  // badge, so a failure must show nothing rather than a zero that looks
  // like an answer.
  const { count: offerCount } = await supabase
    .from("match_attempts")
    .select("request_id", { count: "exact", head: true })
    .eq("provider_id", user.id)
    .is("responded_at", null);

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
            <div className="text-[10px] text-emerald-600 font-semibold uppercase tracking-wide">For helpers</div>
          </div>
        </Link>
        <ProviderSideNav offerCount={offerCount ?? 0} />
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
                {/* Not "complete onboarding": approval is a decision a
                    person at Helpward makes, and a helper who has done
                    everything on their side was still told to go and
                    finish something. */}
                {pp.status === "pending" && "Your application is with us for review. Finish anything outstanding on the onboarding page in the meantime."}
                {pp.status === "approved" && "You can accept tasks."}
                {pp.status === "suspended" && "Contact support to restore access."}
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* On a phone there was no navigation at all: the sidebar above is
          `hidden lg:flex`, so a helper who landed on Active task from a
          notification could reach none of the other nine sections. A top
          bar says where you are, a tab bar gets you to the five things you
          do repeatedly, and Menu holds the rest. */}
      <div className="flex-1 min-w-0 flex flex-col">
        <ProviderTopBar name={profile?.full_name ?? null} />
        <main className="flex-1 min-w-0 pb-20 lg:pb-0">{children}</main>
      </div>

      <ProviderTabBar offerCount={offerCount ?? 0} />
    </div>
  );
}
