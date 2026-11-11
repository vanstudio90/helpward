import Link from "next/link";
import {
  AlertTriangle, ArrowDownRight, ArrowUpRight, Banknote, CalendarCheck,
  CircleAlert, CreditCard, Gauge, Lock, RotateCcw, ShieldAlert, Send,
  Users, UserCheck, Activity, Radio,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { age, delta, money } from "@/lib/admin-format";
import type { AttentionItem, CoverageRow, Money, Snapshot } from "@/lib/data/admin-overview";

/*
  THE CARDS THE OVERVIEW IS MADE OF.

  Two rules run through all of them, and both exist because a console
  that breaks them costs somebody money:

  EVERY NUMBER IS A LINK. A count nobody can open is trivia. Each one
  here goes to the records behind it.

  NO NUMBER IS INVENTED. Where a figure cannot be known — a prior
  window with nothing in it, an unmeasured subsystem — the card says so
  instead of showing a zero, a dash dressed as data, or a green tick
  nothing checked.
*/

export function KpiCard({
  icon: Icon, label, value, note, change, href,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  note?: string;
  change?: { pct: number; up: boolean } | null;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group bg-white rounded-2xl border border-slate-200 p-4 hover:border-brand-300 hover:shadow-sm transition"
    >
      <div className="flex items-center gap-2.5 mb-2">
        <span className="w-9 h-9 rounded-xl bg-brand-50 grid place-items-center shrink-0">
          <Icon className="w-[18px] h-[18px] text-brand-600" />
        </span>
        <span className="text-[13px] font-medium text-slate-600 leading-tight">{label}</span>
      </div>
      <div className="text-[26px] leading-none font-bold text-slate-900 tabular-nums">{value}</div>
      <div className="mt-2 flex items-center gap-2 min-h-[18px]">
        {change ? (
          <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-1.5 py-0.5 rounded-md ${
            change.up ? "text-emerald-700 bg-emerald-50" : "text-rose-700 bg-rose-50"
          }`}>
            {change.up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            {change.pct}% vs prior
          </span>
        ) : null}
        {note && <span className="text-[11px] text-slate-500">{note}</span>}
      </div>
    </Link>
  );
}

export function Kpis({ snapshot }: { snapshot: Snapshot }) {
  const k = snapshot.kpis;
  const completion = k.completion.ended
    ? Math.round((k.completion.completed / k.completion.ended) * 100)
    : null;
  const priorCompletion = k.completion.prior_ended
    ? Math.round((k.completion.prior_completed / k.completion.prior_ended) * 100)
    : null;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
      <KpiCard
        icon={Send} label="Requests in window" href="/admin/bookings"
        value={k.requests.value.toLocaleString()}
        change={delta(k.requests.value, k.requests.prior)}
      />
      <KpiCard
        icon={CalendarCheck} label="Active bookings" href="/admin/bookings"
        value={k.active_bookings.value.toLocaleString()}
        note={`${k.active_bookings.in_progress} in progress`}
      />
      <KpiCard
        icon={Users} label="Eligible helpers online" href="/admin/helpers"
        value={k.eligible_helpers.value.toLocaleString()}
        /* The gap people ask about: approved is not the same as able to
           take the next job. Both numbers, on the same card. */
        note={`of ${k.eligible_helpers.approved_total} approved · ${k.eligible_helpers.payout_ready} payout-ready`}
      />
      <KpiCard
        icon={Banknote} label="Captured payments" href="/admin/payments"
        value={
          k.captured.length === 0
            ? "—"
            : k.captured.map((c) => money(c.cents, c.currency)).join(" · ")
        }
        note={k.captured.length > 1 ? "kept per currency" : undefined}
        change={
          k.captured.length === 1 && k.captured[0].prior_cents
            ? delta(k.captured[0].cents ?? 0, k.captured[0].prior_cents)
            : null
        }
      />
      <KpiCard
        icon={Gauge} label="Completion rate" href="/admin/bookings"
        value={completion === null ? "—" : `${completion}%`}
        note={
          completion === null
            ? "nothing ended in this window"
            : `${k.completion.completed} of ${k.completion.ended} ended`
        }
        change={
          completion !== null && priorCompletion !== null
            ? delta(completion, priorCompletion)
            : null
        }
      />
    </div>
  );
}

const ATTENTION_ICON: Record<AttentionItem["kind"], LucideIcon> = {
  safety: ShieldAlert,
  unmatched: CircleAlert,
  capture_failed: CreditCard,
  approvals: UserCheck,
  overdue: AlertTriangle,
};

export function NeedsAttention({ items }: { items: AttentionItem[] }) {
  return (
    <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <header className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <h2 className="text-[15px] font-bold text-slate-900">Needs attention</h2>
        <span className="text-[11px] text-slate-400">{items.length} open</span>
      </header>

      {items.length === 0 ? (
        <p className="px-4 py-8 text-[13px] text-slate-500 text-center">
          Nothing is waiting on a person right now.
        </p>
      ) : (
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-slate-400 bg-slate-50/60">
              <th className="text-left font-semibold px-4 py-2">Issue</th>
              <th className="text-left font-semibold px-2 py-2">Severity</th>
              <th className="text-left font-semibold px-2 py-2">Age</th>
              <th className="text-left font-semibold px-2 py-2">Owner</th>
              <th className="text-right font-semibold px-4 py-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {items.slice(0, 6).map((item, i) => {
              const Icon = ATTENTION_ICON[item.kind] ?? CircleAlert;
              const urgent = item.severity === "urgent";
              return (
                <tr key={`${item.kind}-${i}`} className="border-t border-slate-100">
                  <td className="px-4 py-2.5">
                    <div className="flex items-start gap-2.5">
                      <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${urgent ? "text-rose-500" : "text-amber-500"}`} />
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900 leading-tight">{item.title}</div>
                        <div className="text-[12px] text-slate-500 truncate">{item.detail}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-2.5">
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                      urgent ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"
                    }`}>
                      {urgent ? "Urgent" : "Attention"}
                    </span>
                  </td>
                  <td className="px-2 py-2.5 text-slate-600 tabular-nums">{age(item.age_seconds)}</td>
                  <td className="px-2 py-2.5">
                    <span className={`text-[11px] px-2 py-0.5 rounded-full ${
                      item.owner ? "bg-slate-100 text-slate-700" : "bg-slate-50 text-slate-400"
                    }`}>
                      {item.owner ?? "Unassigned"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Link
                      href={item.href}
                      className={`inline-block text-[12px] font-semibold px-3 py-1.5 rounded-lg ${
                        urgent
                          ? "bg-brand-600 text-white hover:bg-brand-700"
                          : "border border-slate-200 text-slate-700 hover:border-brand-300 hover:text-brand-700"
                      }`}
                    >
                      {item.action}
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}

export function MoneyAtAGlance({ rows }: { rows: Money[] }) {
  return (
    <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <header className="px-4 py-3 border-b border-slate-100">
        <h2 className="text-[15px] font-bold text-slate-900">Money at a glance</h2>
      </header>

      {rows.length === 0 ? (
        <p className="px-4 py-6 text-[13px] text-slate-500">No payments in this window.</p>
      ) : (
        rows.map((row) => (
          <div key={row.currency} className="px-4 py-3 border-b border-slate-50 last:border-0">
            {rows.length > 1 && (
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
                {row.currency}
              </div>
            )}
            <dl className="space-y-1.5">
              <MoneyRow icon={CreditCard} label="Captured" href="/admin/payments"
                value={money(row.captured_cents, row.currency)} />
              <MoneyRow icon={Lock} label="Authorized holds" href="/admin/payments"
                value={money(row.authorized_cents, row.currency)} />
              <MoneyRow icon={RotateCcw} label="Refunded" href="/admin/refunds"
                value={money(row.refunded_cents, row.currency)} />
              <MoneyRow icon={Banknote} label="Helper payouts pending" href="/admin/payments"
                value={money(row.payouts_pending_cents, row.currency)} />
            </dl>
          </div>
        ))
      )}

      <p className="px-4 py-2.5 bg-slate-50/70 text-[11px] text-slate-500 flex items-start gap-1.5">
        <CircleAlert className="w-3.5 h-3.5 mt-px shrink-0 text-slate-400" />
        A hold is money reserved on a card, not revenue. Currencies are never added together.
      </p>
    </section>
  );
}

function MoneyRow({ icon: Icon, label, value, href }: {
  icon: LucideIcon; label: string; value: string; href: string;
}) {
  return (
    <Link href={href} className="flex items-center gap-2.5 group">
      <Icon className="w-4 h-4 text-slate-400 shrink-0" />
      <dt className="text-[13px] text-slate-600 group-hover:text-slate-900">{label}</dt>
      <dd className="ml-auto text-[13px] font-bold text-slate-900 tabular-nums">{value}</dd>
    </Link>
  );
}

export function CoverageByService({ rows }: { rows: CoverageRow[] }) {
  return (
    <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <header className="px-4 py-3 border-b border-slate-100">
        <h2 className="text-[15px] font-bold text-slate-900">Coverage by service</h2>
      </header>
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-[11px] uppercase tracking-wide text-slate-400 bg-slate-50/60">
            <th className="text-left font-semibold px-4 py-2">Service</th>
            <th className="text-center font-semibold px-2 py-2">Waiting</th>
            <th className="text-center font-semibold px-4 py-2">Eligible online</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const short = row.waiting > 0 && row.eligible_online === 0;
            return (
              <tr key={row.service_id} className="border-t border-slate-100">
                <td className="px-4 py-2 text-slate-800">{row.title}</td>
                <td className="px-2 py-2 text-center">
                  <span className={`inline-block min-w-7 text-[12px] font-semibold px-2 py-0.5 rounded-md ${
                    row.waiting > 0 ? "bg-amber-50 text-amber-700" : "bg-slate-50 text-slate-400"
                  }`}>
                    {row.waiting}
                  </span>
                </td>
                <td className="px-4 py-2 text-center">
                  <span
                    title={`${row.offering_total} approved helper${row.offering_total === 1 ? "" : "s"} offer this service`}
                    className={`inline-block min-w-7 text-[12px] font-semibold px-2 py-0.5 rounded-md ${
                      short ? "bg-rose-50 text-rose-700"
                        : row.eligible_online > 0 ? "bg-emerald-50 text-emerald-700"
                        : "bg-slate-50 text-slate-400"
                    }`}
                  >
                    {row.eligible_online}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="px-4 py-2.5 bg-slate-50/70 text-[11px] text-slate-500">
        Eligible means dispatchable now — approved, online, off vacation and reporting a
        recent location. Hover a figure for how many approved helpers offer it at all.
      </p>
    </section>
  );
}

export function PlatformSignals({ health }: { health: Snapshot["health"] }) {
  const faults = health.dispatch_refusals_1h.filter((r) => r.configuration_fault);
  const lowSupply = health.dispatch_refusals_1h.find((r) => !r.configuration_fault);

  return (
    <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <header className="px-4 py-3 border-b border-slate-100">
        <h2 className="text-[15px] font-bold text-slate-900">Platform signals</h2>
      </header>
      <dl className="divide-y divide-slate-50">
        <SignalRow
          icon={Radio} label="Dispatch faults (1h)" href="/admin/bookings"
          tone={faults.length ? "bad" : "good"}
          value={faults.length ? `${faults.length} reason${faults.length === 1 ? "" : "s"}` : "None"}
        />
        <SignalRow
          icon={Send} label="Nobody in range (1h)" href="/admin/helpers"
          tone={lowSupply ? "warn" : "good"}
          value={lowSupply ? `${lowSupply.requests} request${lowSupply.requests === 1 ? "" : "s"}` : "None"}
        />
        <SignalRow
          icon={CreditCard} label="Failed captures (24h)" href="/admin/payments"
          tone={health.failed_captures_24h ? "bad" : "good"}
          value={String(health.failed_captures_24h)}
        />
        <SignalRow
          icon={Activity} label="Online, not reporting" href="/admin/helpers"
          tone={health.online_with_stale_location ? "warn" : "good"}
          value={String(health.online_with_stale_location)}
        />
        <SignalRow
          icon={Lock} label="Service-area enforcement" href="/admin/venues"
          tone={health.boundary_enforcement === "enforced" ? "good" : "warn"}
          value={health.boundary_enforcement}
        />
      </dl>
      {/*
        The honest footnote. There is no uptime probe and no webhook
        ledger in this estate, so this card reports what the database
        records and refuses to render a green tick for anything nothing
        measured.
      */}
      <p className="px-4 py-2.5 bg-slate-50/70 text-[11px] text-slate-500">
        Drawn from recorded events only. API uptime and webhook delivery are not
        monitored here, so they are not claimed. Last recorded background-job action:{" "}
        {health.last_recorded_job_action
          ? new Date(health.last_recorded_job_action).toLocaleString()
          : "none recorded"}.
      </p>
    </section>
  );
}

function SignalRow({ icon: Icon, label, value, tone, href }: {
  icon: LucideIcon; label: string; value: string;
  tone: "good" | "warn" | "bad"; href: string;
}) {
  const dot = tone === "good" ? "bg-emerald-500" : tone === "warn" ? "bg-amber-500" : "bg-rose-500";
  return (
    <Link href={href} className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-slate-50">
      <Icon className="w-4 h-4 text-slate-400 shrink-0" />
      <dt className="text-[13px] text-slate-700">{label}</dt>
      <dd className="ml-auto inline-flex items-center gap-1.5 text-[12px] font-semibold text-slate-800">
        <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
        {value}
      </dd>
    </Link>
  );
}

export function RecentActivity({ events }: { events: Snapshot["activity"] }) {
  return (
    <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <header className="px-4 py-3 border-b border-slate-100">
        <h2 className="text-[15px] font-bold text-slate-900">Recent activity</h2>
      </header>
      {events.length === 0 ? (
        <p className="px-4 py-6 text-[13px] text-slate-500">Nothing recorded yet.</p>
      ) : (
        <ul className="divide-y divide-slate-50">
          {events.slice(0, 6).map((event, i) => (
            <li key={i}>
              <Link href={event.href} className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-slate-50">
                <span className="w-7 h-7 rounded-lg bg-slate-50 grid place-items-center shrink-0">
                  {event.kind === "captured" ? <CreditCard className="w-3.5 h-3.5 text-slate-500" />
                    : event.kind === "refunded" ? <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                    : <UserCheck className="w-3.5 h-3.5 text-slate-500" />}
                </span>
                <span className="text-[13px] text-slate-800">{event.label}</span>
                <span className="text-[12px] text-slate-400">{event.detail}</span>
                <span className="ml-auto text-[11px] text-slate-400 tabular-nums">
                  {age((Date.now() - new Date(event.at).getTime()) / 1000)} ago
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
