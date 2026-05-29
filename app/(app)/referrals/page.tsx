import Link from "next/link";
import {
  Gift, Users, Coins, CheckCircle2, Clock, Sparkles, ArrowRight,
} from "lucide-react";
import {
  ensureMyReferralCode, getMyReferralData, DEFAULT_REWARD_CENTS,
} from "@/lib/data/referrals";
import { ClientDateTime } from "@/components/ClientDateTime";
import { ShareCard } from "./share-card";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Refer a friend — Helpward",
  description: "Give $10, get $10. Share your Helpward code and earn credit when friends complete their first booking.",
};

export default async function ReferralsPage() {
  // First-visit: mint a code if the user doesn't have one. Idempotent.
  await ensureMyReferralCode();

  const data = await getMyReferralData();
  if (!data || !data.code) {
    return (
      <div className="px-4 py-12 max-w-2xl mx-auto text-center text-sm text-slate-500">
        Couldn&apos;t load referral data — try refreshing.
      </div>
    );
  }

  const rewardLabel = `$${(DEFAULT_REWARD_CENTS / 100).toFixed(0)}`;
  const { stats, attributions } = data;

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-3xl mx-auto pb-12">
      {/* Hero */}
      <div className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-brand-600 via-violet-600 to-rose-500 text-white p-6 sm:p-8 mb-6">
        <Sparkles className="absolute top-4 right-4 w-6 h-6 text-white/30" />
        <div className="inline-flex items-center gap-1.5 bg-white/15 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-widest mb-3">
          <Gift className="w-3 h-3" /> Refer a friend
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold leading-tight">
          Give {rewardLabel}, get {rewardLabel}.
        </h1>
        <p className="mt-2 text-sm sm:text-base text-white/90 max-w-md leading-relaxed">
          Share your code. When your friend completes their first booking on Helpward, you both get{" "}
          {rewardLabel} in credit toward your next task.
        </p>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <Stat
          icon={<Users className="w-4 h-4" />}
          tone="bg-brand-50 text-brand-700"
          value={String(stats.totalShared)}
          label="Signed up"
        />
        <Stat
          icon={<CheckCircle2 className="w-4 h-4" />}
          tone="bg-emerald-50 text-emerald-700"
          value={String(stats.qualified)}
          label="Qualified"
        />
        <Stat
          icon={<Coins className="w-4 h-4" />}
          tone="bg-amber-50 text-amber-700"
          value={`$${(stats.earnedCents / 100).toFixed(0)}`}
          label="Lifetime earned"
        />
        <Stat
          icon={<Gift className="w-4 h-4" />}
          tone="bg-rose-50 text-rose-700"
          value={`$${(stats.balanceCents / 100).toFixed(0)}`}
          label="Spendable balance"
        />
      </div>

      <ShareCard
        code={data.code}
        initialMessage={data.customMessage}
        rewardCents={DEFAULT_REWARD_CENTS}
      />

      {/* How it works */}
      <section className="mt-6 rounded-2xl bg-white border border-slate-100 p-5 sm:p-6">
        <h2 className="text-base font-bold text-slate-900 mb-4">How it works</h2>
        <ol className="space-y-3 text-sm text-slate-700">
          <Step n={1} title="Share your code or link" sub="Send it via text, email, or any channel you'd like." />
          <Step n={2} title="They sign up with your code" sub={`Your friend gets ${rewardLabel} off their first booking the moment they sign up.`} />
          <Step n={3} title="They complete their first task" sub={`You earn ${rewardLabel} in credit. Spend it on your next Helpward booking.`} />
        </ol>
        <p className="mt-4 text-[11px] text-slate-500 leading-relaxed">
          Credit applies automatically at checkout once payment processing is live. Read the{" "}
          <Link href="/help/referring-friends" className="text-brand-700 font-semibold hover:underline">referral guide</Link>{" "}
          for the program rules.
        </p>
      </section>

      {/* Recent referrals */}
      <section className="mt-6 rounded-2xl bg-white border border-slate-100 p-5 sm:p-6">
        <h2 className="text-base font-bold text-slate-900 mb-4">Your referrals</h2>
        {attributions.length === 0 ? (
          <div className="text-center py-8">
            <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-700">No referrals yet</p>
            <p className="text-xs text-slate-500 mt-1">
              Share your code above and check back here.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {attributions.map((a) => (
              <li key={a.id} className="py-3 flex items-center gap-3">
                {a.referee_avatar ? (
                  <img src={a.referee_avatar} alt="" className="w-9 h-9 rounded-full" />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 font-bold text-xs">
                    {(a.referee_name ?? "?").slice(0, 1)}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-slate-900 truncate">
                    {a.referee_name ?? "Anonymous user"}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Signed up <ClientDateTime iso={a.referee_signed_up_at} mode="date" />
                    {a.qualified_at && <> · Qualified <ClientDateTime iso={a.qualified_at} mode="date" /></>}
                  </div>
                </div>
                <StatusPill status={a.status} reward={a.referrer_credit_cents} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="mt-6 text-[11px] text-slate-400 text-center">
        Self-referrals, multi-account abuse, and other forms of gaming the program void all credit.{" "}
        <Link href="/help/referring-friends" className="text-brand-700 hover:underline font-semibold">
          See the full rules
        </Link>.
      </p>
    </div>
  );
}

function Stat({ icon, tone, value, label }: {
  icon: React.ReactNode; tone: string; value: string; label: string;
}) {
  return (
    <div className="rounded-2xl bg-white border border-slate-100 p-3">
      <span className={`inline-flex w-7 h-7 rounded-lg ${tone} items-center justify-center mb-2`}>
        {icon}
      </span>
      <div className="text-lg sm:text-xl font-bold text-slate-900 leading-tight">{value}</div>
      <div className="text-[11px] text-slate-500 mt-0.5">{label}</div>
    </div>
  );
}

function Step({ n, title, sub }: { n: number; title: string; sub: string }) {
  return (
    <li className="flex items-start gap-3">
      <span className="w-6 h-6 rounded-full bg-brand-600 text-white text-xs font-bold inline-flex items-center justify-center shrink-0 mt-0.5">
        {n}
      </span>
      <div className="min-w-0">
        <div className="font-bold text-slate-900">{title}</div>
        <div className="text-xs text-slate-500 mt-0.5">{sub}</div>
      </div>
    </li>
  );
}

function StatusPill({ status, reward }: { status: string; reward: number }) {
  const map: Record<string, { label: string; tone: string; icon: React.ReactNode }> = {
    pending: { label: "Pending", tone: "bg-amber-50 text-amber-700", icon: <Clock className="w-3 h-3" /> },
    qualified: { label: `Earned $${(reward / 100).toFixed(0)}`, tone: "bg-emerald-50 text-emerald-700", icon: <CheckCircle2 className="w-3 h-3" /> },
    credited: { label: "Credited", tone: "bg-emerald-50 text-emerald-700", icon: <CheckCircle2 className="w-3 h-3" /> },
    expired: { label: "Expired", tone: "bg-slate-100 text-slate-500", icon: null },
    fraudulent: { label: "Flagged", tone: "bg-rose-50 text-rose-700", icon: null },
  };
  const cfg = map[status] ?? map.pending;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-bold ${cfg.tone}`}>
      {cfg.icon} {cfg.label}
    </span>
  );
}
