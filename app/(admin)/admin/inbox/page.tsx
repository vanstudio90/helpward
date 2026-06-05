import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Inbox, AlertOctagon, Clock, Activity, UserPlus, ShieldOff, Trash2,
  ArrowRight, CheckCircle2, AlertTriangle,
} from "lucide-react";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";
import { AdminInboxRealtimeRefresh } from "./realtime-refresh";

export const dynamic = "force-dynamic";

// Admin operator inbox — single page that surfaces every "needs human
// attention" queue in priority order. Each card shows count + 1-line
// summary + a CTA to the dedicated admin queue page. Designed so an ops
// person can land here every morning and triage the entire backlog in
// 30 seconds instead of clicking through 8 different admin tabs.
//
// Priority order is intentional: paying-customer-blocked > capacity-gap >
// quality-risk > backlog. Counts are rendered fresh every page load.

export default async function AdminInboxPage() {
  const userClient = await createSupabaseServerClient();
  const { data: { user } } = await userClient.auth.getUser();
  if ((user?.app_metadata?.role as string | undefined) !== "admin") redirect("/login");

  const admin = createSupabaseServiceClient();
  const now = new Date();
  const staleMatchingCutoff = new Date(now.getTime() - 30 * 60 * 1000).toISOString();
  const overdueInProgressCutoff = new Date(now.getTime() - 4 * 60 * 60 * 1000).toISOString();
  const unresolved24hCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  // All count queries in parallel — head-only so we pay almost nothing
  // for each. Total page render cost stays light even with eight queues.
  const [
    openDisputes, unresolved24h, staleMatching, overdueInProgress,
    pendingProviders, failedExports, failedDeletions, dueDeletions,
  ] = await Promise.all([
    admin.from("disputes").select("id", { count: "exact", head: true }).in("status", ["open", "investigating"]),
    admin.from("disputes").select("id", { count: "exact", head: true }).in("status", ["open", "investigating"]).lte("created_at", unresolved24hCutoff),
    admin.from("requests").select("id", { count: "exact", head: true }).eq("status", "matching").lte("created_at", staleMatchingCutoff),
    admin.from("bookings").select("id", { count: "exact", head: true }).eq("status", "in_progress").lte("started_at", overdueInProgressCutoff),
    admin.from("provider_profiles").select("user_id", { count: "exact", head: true }).eq("status", "pending"),
    admin.from("data_export_requests").select("id", { count: "exact", head: true }).eq("status", "failed"),
    admin.from("account_deletion_requests").select("id", { count: "exact", head: true }).eq("status", "failed"),
    admin.from("account_deletion_requests").select("id", { count: "exact", head: true }).eq("status", "pending").lte("grace_until", now.toISOString()),
  ]);

  const cards: QueueCard[] = [
    {
      key: "unresolved-24h", priority: 1,
      title: "Disputes unresolved >24h",
      count: unresolved24h.count ?? 0,
      icon: <AlertTriangle className="w-5 h-5" />,
      tone: "rose",
      blurb: "Customers are waiting. Touch each one even if just to acknowledge — silence is the only thing that makes a dispute escalate.",
      href: "/admin/disputes",
    },
    {
      key: "open-disputes", priority: 2,
      title: "Open disputes total",
      count: openDisputes.count ?? 0,
      icon: <AlertOctagon className="w-5 h-5" />,
      tone: "rose",
      blurb: "Includes the >24h slice above + everything in investigating status.",
      href: "/admin/disputes",
    },
    {
      key: "overdue-in-progress", priority: 3,
      title: "Bookings in-progress >4h",
      count: overdueInProgress.count ?? 0,
      icon: <Activity className="w-5 h-5" />,
      tone: "amber",
      blurb: "Helper probably ghosted or forgot to mark complete. complete-stale-in-progress cron auto-resolves nightly; eye on red rows in the meantime.",
      href: "/admin/bookings",
    },
    {
      key: "stale-matching", priority: 4,
      title: "Requests matching >30m",
      count: staleMatching.count ?? 0,
      icon: <Clock className="w-5 h-5" />,
      tone: "amber",
      blurb: "Capacity gap. expire-stale-requests cron auto-expires every 15m; persistent backlog signals you need to recruit helpers for that geo or service.",
      href: "/admin/bookings",
    },
    {
      key: "pending-providers", priority: 5,
      title: "Helper applications pending",
      count: pendingProviders.count ?? 0,
      icon: <UserPlus className="w-5 h-5" />,
      tone: "brand",
      blurb: "ID + background check verdicts to approve or reject. Don't let this queue age — slow approvals are the #1 reason promising helpers churn before their first task.",
      href: "/admin/providers",
    },
    {
      key: "due-deletions", priority: 6,
      title: "Deletion requests past grace",
      count: dueDeletions.count ?? 0,
      icon: <Trash2 className="w-5 h-5" />,
      tone: "rose",
      blurb: "execute-account-deletions cron runs daily at 05:00 UTC — these should auto-clear within 24h. Persistent rows mean the cron is failing.",
      href: "/admin/data-requests",
    },
    {
      key: "failed-exports", priority: 7,
      title: "Data exports failed",
      count: failedExports.count ?? 0,
      icon: <ShieldOff className="w-5 h-5" />,
      tone: "slate",
      blurb: "process-data-exports cron failures. Check failure_reason on each row — usually a storage hiccup; re-running the cron clears most.",
      href: "/admin/data-requests",
    },
    {
      key: "failed-deletions", priority: 8,
      title: "Account deletions failed",
      count: failedDeletions.count ?? 0,
      icon: <ShieldOff className="w-5 h-5" />,
      tone: "slate",
      blurb: "execute-account-deletions cron failures. Usually a Supabase Auth admin API hiccup; manual delete via SQL is the fallback.",
      href: "/admin/data-requests",
    },
  ];

  const total = cards.reduce((s, c) => s + c.count, 0);
  const ordered = cards.sort((a, b) => {
    // Empty cards drop to the bottom regardless of priority — keeps the
    // top-of-screen real estate focused on what actually needs work.
    if ((a.count === 0) !== (b.count === 0)) return a.count === 0 ? 1 : -1;
    return a.priority - b.priority;
  });

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-6xl mx-auto pb-12">
      <AdminInboxRealtimeRefresh />
      <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 inline-flex items-center gap-2">
        <Inbox className="w-6 h-6 text-brand-600" /> Operator inbox
      </h1>
      <p className="text-sm text-slate-500 mt-1 mb-5">
        Everything that needs human attention. Refresh the page for fresh counts; ordered by
        priority then drained-first. {total === 0 && <span className="font-semibold text-emerald-700">All caught up.</span>}
      </p>

      {total === 0 ? (
        <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-8 text-center">
          <span className="inline-flex w-14 h-14 rounded-2xl bg-white items-center justify-center mb-3">
            <CheckCircle2 className="w-7 h-7 text-emerald-600" />
          </span>
          <h2 className="text-lg font-bold text-emerald-900">Inbox zero</h2>
          <p className="mt-1 text-sm text-emerald-800 max-w-md mx-auto">
            No disputes, no stuck bookings, no pending applications, no failed crons. Go get a coffee.
          </p>
        </div>
      ) : (
        <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {ordered.map((c) => <QueueCardView key={c.key} card={c} />)}
        </ul>
      )}
    </div>
  );
}

type QueueTone = "rose" | "amber" | "brand" | "slate";

type QueueCard = {
  key: string;
  priority: number;
  title: string;
  count: number;
  icon: React.ReactNode;
  tone: QueueTone;
  blurb: string;
  href: string;
};

const TONE_BG: Record<QueueTone, string> = {
  rose: "bg-rose-50",
  amber: "bg-amber-50",
  brand: "bg-brand-50",
  slate: "bg-slate-50",
};
const TONE_TEXT: Record<QueueTone, string> = {
  rose: "text-rose-700",
  amber: "text-amber-700",
  brand: "text-brand-700",
  slate: "text-slate-700",
};
const TONE_BORDER_ACTIVE: Record<QueueTone, string> = {
  rose: "border-rose-200 ring-2 ring-rose-100",
  amber: "border-amber-200 ring-2 ring-amber-100",
  brand: "border-brand-200 ring-2 ring-brand-100",
  slate: "border-slate-200 ring-2 ring-slate-100",
};

function QueueCardView({ card }: { card: QueueCard }) {
  const drained = card.count === 0;
  return (
    <li>
      <Link
        href={card.href}
        className={`block h-full rounded-2xl border bg-white p-4 transition hover:shadow-sm ${
          drained ? "border-slate-100 opacity-60" : TONE_BORDER_ACTIVE[card.tone]
        }`}
      >
        <div className="flex items-start gap-3 mb-2">
          <span className={`w-9 h-9 rounded-lg ${TONE_BG[card.tone]} ${TONE_TEXT[card.tone]} inline-flex items-center justify-center shrink-0`}>
            {card.icon}
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{card.title}</div>
            <div className={`text-2xl font-bold tabular-nums ${drained ? "text-slate-400" : TONE_TEXT[card.tone]}`}>
              {card.count}
            </div>
          </div>
        </div>
        <p className="text-[11px] text-slate-600 leading-snug mb-2">{card.blurb}</p>
        <div className="inline-flex items-center gap-1 text-xs font-bold text-brand-700">
          Open queue <ArrowRight className="w-3 h-3" />
        </div>
      </Link>
    </li>
  );
}
