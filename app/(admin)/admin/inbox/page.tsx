import { getCurrentUser } from "@/lib/auth/current-user";
import Link from "next/link";
import {
  Mail, MessageSquare, Clock, AlertTriangle, Users, Inbox as InboxIcon,
  AlertOctagon, ArrowRight, Info, CheckCircle2, BellOff, Paperclip, Reply,
} from "lucide-react";
import {
  getInbox, getCaseDetail, getOperationalAlerts, type InboxRow,
} from "@/lib/data/admin-inbox";
import { getAdmins } from "@/lib/data/admin-helpers";
import {
  STATUS_LABEL, STATUS_TONE, PRIORITY_DOT, SEVERITY_TONE, REPLY_TARGET_HOURS,
} from "@/lib/admin-inbox-states";
import { age } from "@/lib/admin-format";
import { InboxControls } from "@/components/admin/InboxControls";
import { CaseThread } from "@/components/admin/CaseThread";
import { CaseSidebar } from "@/components/admin/CaseSidebar";
import { NewCaseDialog } from "@/components/admin/NewCaseDialog";
import { ReplyTargetStrip } from "@/components/admin/ReplyTargetStrip";
import { AdminInboxRealtimeRefresh } from "./realtime-refresh";

/*
  INBOX & SUPPORT.

  The page this replaces was eight count cards pointing at eight other
  pages. It could tell you four disputes were open; it could not hold a
  conversation, because there was nowhere for one to live. Now the
  conversations are the page and the counts are the second tab — which
  is the right way round, because a count is something you read and a
  conversation is something you answer.

  THE FOUR COUNTERS ARE NOT A TOTAL AND DO NOT PARTITION. An overdue
  case is usually also unassigned. They are four questions a shift
  starts with, each answered over every unresolved case rather than
  over the filtered list, so clicking a chip never moves them.

  WHAT THE CLOCK MEANS IS STATED EVERYWHERE IT APPEARS: four hours from
  the customer's last message, written by a trigger, cleared by a
  reply. It is a target we chose and say out loud, not an SLA anybody
  signed.
*/

export const dynamic = "force-dynamic";

const PAGE_SIZE = 8;

export default async function AdminInboxPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const tab = params.tab === "alerts" ? "alerts" : "conversations";
  const page = Math.max(1, Number(params.page) || 1);
  const status = (["open", "waiting", "resolved", "snoozed", "all"].includes(params.status ?? "")
    ? params.status : "open") as "open" | "waiting" | "resolved" | "snoozed" | "all";
  const sort = (["oldest", "newest", "due"].includes(params.sort ?? "")
    ? params.sort : "oldest") as "oldest" | "newest" | "due";
  const includeReview = params.review === "1";

  /* The conversation is keyed off ?open=; it does not wait for the list. */
  const [list, alerts, admins, detail] = await Promise.all([
    getInbox({
      status,
      owner: params.owner || null,
      priority: params.priority || null,
      channel: params.channel || null,
      search: params.q || null,
      sort,
      includeReview,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
    getOperationalAlerts(includeReview),
    getAdmins(),
    params.open ? getCaseDetail(params.open) : Promise.resolve(null),
  ]);


  /* Presence needs to know who this is, so the other person's screen can
     name them rather than announcing "somebody". */
  /* The layout already verified this user for this request; this is
     the memoised answer, not a second call to the auth service. */
  const user = await getCurrentUser();
  const me = {
    id: user?.id ?? "unknown",
    name: admins.find((a) => a.id === user?.id)?.name ?? "A colleague",
  };

  if (!list.ok) {
    return (
      <div className="px-6 py-10 max-w-3xl mx-auto">
        <div className="bg-white rounded-2xl border border-amber-200 p-6 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
          <div>
            <h1 className="text-lg font-bold text-slate-900">The inbox could not be loaded</h1>
            <p className="text-[14px] text-slate-600 mt-1">{list.error}</p>
          </div>
        </div>
      </div>
    );
  }

  const data = list.data;
  const alertList = alerts.ok ? alerts.data : [];
  const alertCount = alertList.length;

  const query = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (value) next.set(key, value);
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    return `/admin/inbox?${next.toString()}`;
  };

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 pb-12 max-w-[1700px] mx-auto">
      <header className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-[28px] leading-tight font-bold text-slate-900">Inbox &amp; support</h1>
          <p className="text-[14px] text-slate-500 mt-0.5">
            Conversations and operational issues, together.
          </p>
        </div>
        <NewCaseDialog />
      </header>

      {/*
        THE FOUR COUNTERS, over every unresolved case rather than the
        filtered list. Two of them are about a clock, so when no reply
        target is configured they are replaced by counts that are true
        without one — rather than two cards reading zero for a reason
        nobody can see.
      */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mt-4">
        <Counter icon={InboxIcon} label="Unassigned" value={data.counts.unassigned}
          href={query({ owner: "unassigned", tab: null, page: null })} tone="brand" />
        {data.reply_target_minutes !== null ? (
          <>
            <Counter icon={Clock} label="Due soon" value={data.counts.due_soon}
              href={query({ sort: "due", tab: null, page: null })} tone="amber"
              note="Within the next hour" />
            <Counter icon={AlertTriangle} label="Overdue" value={data.counts.overdue}
              href={query({ sort: "due", tab: null, page: null })} tone="rose" />
          </>
        ) : (
          <>
            <Counter icon={Reply} label="Awaiting reply" value={data.counts.awaiting_reply}
              href={query({ status: null, tab: null, page: null })} tone="amber"
              note="No target configured" />
            <Counter icon={BellOff} label="Snoozed" value={data.counts.snoozed}
              href={query({ status: "snoozed", tab: null, page: null })} tone="rose" />
          </>
        )}
        <Counter icon={Users} label="Waiting on customer" value={data.counts.waiting_on_customer}
          href={query({ status: "waiting", tab: null, page: null })} tone="emerald" />
      </div>

      <div className="mt-2.5">
        <ReplyTargetStrip minutes={data.reply_target_minutes} />
      </div>

      <div className="flex flex-wrap items-center gap-5 mt-4 border-b border-slate-200">
        <Link href={query({ tab: null })}
          className={`text-[13px] font-semibold pb-2.5 border-b-2 inline-flex items-center ${
            tab === "conversations" ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800"
          }`}>
          Conversations
          {data.counts.unread > 0 && (
            <span className="ml-1.5 text-[11px] font-bold bg-brand-600 text-white rounded-full px-1.5">
              {data.counts.unread}
            </span>
          )}
        </Link>
        <Link href={query({ tab: "alerts" })}
          className={`text-[13px] font-semibold pb-2.5 border-b-2 inline-flex items-center gap-1.5 ${
            tab === "alerts" ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800"
          }`}>
          Operational alerts
          {alertCount > 0 && (
            <span className="text-[11px] font-bold bg-slate-200 text-slate-700 rounded-full px-1.5">
              {alertCount}
            </span>
          )}
        </Link>
        <span className="ml-auto text-[12px] text-slate-500 pb-2.5 flex items-center gap-2">
          <AdminInboxRealtimeRefresh />
          <span className="text-slate-300">·</span>
          {includeReview
            ? "Review & test activity included."
            : "Review & test activity excluded."}{" "}
          <Link href={query({ review: includeReview ? null : "1" })} className="font-semibold text-brand-700">
            {includeReview ? "Exclude" : "Include"}
          </Link>
        </span>
      </div>

      {tab === "alerts" ? (
        <OperationalAlerts alerts={alertList} failed={alerts.ok ? null : alerts.error} />
      ) : (
        <div className="grid xl:grid-cols-[340px_1fr] 2xl:grid-cols-[340px_1fr_330px] gap-4 items-start mt-4">
          {/* THE LIST */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <InboxControls counts={{
              mine: data.counts.mine,
              unassigned: data.counts.unassigned,
              urgent: data.counts.urgent,
            }} />

            {data.rows.length === 0 ? (
              <p className="px-4 py-10 text-center text-[13px] text-slate-500">
                {data.counts.open_total === 0
                  ? "No conversations yet. Anything written to support@helpward.com arrives in that mailbox; it appears here once inbound mail is pointed at the webhook."
                  : "Nothing matches these filters."}
              </p>
            ) : (
              <ul className="divide-y divide-slate-100 max-h-[calc(100vh-20rem)] overflow-y-auto">
                {data.rows.map((row) => (
                  <Row key={row.id} row={row}
                    href={query({ open: row.id })}
                    selected={params.open === row.id} />
                ))}
              </ul>
            )}

            <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-t border-slate-100">
              <span className="text-[11px] text-slate-500">
                {data.total === 0 ? "Nothing to show"
                  : `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, data.total)} of ${data.total}`}
              </span>
              <div className="flex items-center gap-1">
                {page > 1 && (
                  <Link href={query({ page: String(page - 1) })}
                    className="text-[12px] font-semibold text-slate-600 hover:text-brand-700 px-2 py-1">
                    Previous
                  </Link>
                )}
                {page * PAGE_SIZE < data.total && (
                  <Link href={query({ page: String(page + 1) })}
                    className="text-[12px] font-semibold text-slate-600 hover:text-brand-700 px-2 py-1">
                    Next
                  </Link>
                )}
              </div>
            </div>
          </div>

          {/* THE CONVERSATION */}
          {detail?.ok && detail.data ? (
            <CaseThread detail={detail.data} admins={admins} me={me} />
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 px-6 py-16 text-center">
              <Mail className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-[14px] font-semibold text-slate-700 mt-3">
                {detail && !detail.ok ? "That conversation could not be opened" : "Pick a conversation"}
              </p>
              <p className="text-[13px] text-slate-500 mt-1 max-w-sm mx-auto">
                {detail && !detail.ok
                  ? detail.error
                  : `Replies are due ${REPLY_TARGET_HOURS} hours after the customer's last message. The list is ordered oldest first, so the top one is usually the right one.`}
              </p>
            </div>
          )}

          {/* THE RECORD */}
          {detail?.ok && detail.data && (
            <div className="hidden 2xl:block">
              <CaseSidebar detail={detail.data} admins={admins} />
            </div>
          )}
        </div>
      )}

      {tab === "conversations" && (
        <div className="bg-white rounded-2xl border border-slate-200 px-4 py-3 flex items-start gap-2.5 mt-4">
          <Info className="w-4 h-4 text-brand-500 mt-0.5 shrink-0" />
          <p className="text-[12px] text-slate-600">
            <span className="font-semibold text-slate-800">
              Outbound email is live; inbound is not connected yet.
            </span>{" "}
            Replies sent from here go through Resend from support@helpward.com and each one
            carries what actually happened to it. Customer replies land in the
            support@helpward.com mailbox and will appear in these threads once inbound mail is
            pointed at <code className="text-[11px] bg-slate-100 px-1 py-0.5 rounded">/api/webhooks/email-inbound</code>.
            In-app conversations are two-way already.
          </p>
        </div>
      )}
    </div>
  );
}

function OperationalAlerts({
  alerts, failed,
}: {
  alerts: { key: string; severity: "critical" | "warning" | "info"; title: string; detail: string; href: string; count: number }[];
  failed: string | null;
}) {
  if (failed) {
    return (
      <div className="bg-white rounded-2xl border border-amber-200 p-5 mt-4 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
        <p className="text-[14px] text-slate-600">{failed}</p>
      </div>
    );
  }

  if (alerts.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 px-6 py-14 text-center mt-4">
        <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
        <p className="text-[14px] font-semibold text-slate-700 mt-3">Nothing is wrong right now</p>
        <p className="text-[13px] text-slate-500 mt-1">
          Every check came back with zero rows. An alert only appears when something is
          actually in it.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-2.5">
      {alerts.map((a) => {
        const tone = SEVERITY_TONE[a.severity];
        return (
          <Link key={a.key} href={a.href}
            className={`block rounded-2xl border px-4 py-3 hover:shadow-sm transition ${tone.card}`}>
            <div className="flex items-start gap-3">
              <span className="text-[26px] font-bold text-slate-900 tabular-nums leading-none mt-0.5 min-w-[2ch]">
                {a.count}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-bold text-slate-900 flex items-center gap-2">
                  {a.title}
                  <span className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${tone.chip}`}>
                    {tone.label}
                  </span>
                </p>
                <p className="text-[13px] text-slate-600 mt-0.5">{a.detail}</p>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-400 mt-1 shrink-0" />
            </div>
          </Link>
        );
      })}
      <p className="text-[11px] text-slate-500 flex items-center gap-1.5 pt-1">
        <AlertOctagon className="w-3.5 h-3.5" />
        Each number is a count of rows that exist right now. Nothing here is predicted, scored
        or averaged, and a check with nothing in it is not shown.
      </p>
    </div>
  );
}

function Counter({ icon: Icon, label, value, href, tone, note }: {
  icon: typeof Clock; label: string; value: number; href: string;
  tone: "brand" | "amber" | "rose" | "emerald"; note?: string;
}) {
  const tones = {
    brand: "bg-brand-50 border-brand-200 text-brand-700",
    amber: "bg-amber-50 border-amber-200 text-amber-700",
    rose: "bg-rose-50 border-rose-200 text-rose-700",
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-700",
  }[tone];
  return (
    <Link href={href} className={`rounded-2xl border px-4 py-3 hover:shadow-sm transition flex items-center gap-3 ${tones}`}>
      <span className="w-10 h-10 rounded-xl bg-white/70 grid place-items-center shrink-0">
        <Icon className="w-5 h-5" />
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold text-slate-700">{label}</span>
        <span className="block text-[24px] font-bold text-slate-900 leading-tight tabular-nums">{value}</span>
        {note && <span className="block text-[11px] text-slate-500">{note}</span>}
      </span>
    </Link>
  );
}

function Row({ row, href, selected }: { row: InboxRow; href: string; selected: boolean }) {
  const overdue = row.due_at ? new Date(row.due_at).getTime() < Date.now() : false;
  const snoozed = row.snoozed_until ? new Date(row.snoozed_until).getTime() > Date.now() : false;
  return (
    <li className={selected ? "bg-brand-50/70" : row.unread ? "bg-white hover:bg-slate-50" : "hover:bg-slate-50"}>
      <Link href={href} className="block px-3 py-2.5">
        <div className="flex items-start gap-2">
          <span className={`w-8 h-8 rounded-lg grid place-items-center shrink-0 ${
            row.unread ? "bg-brand-50 text-brand-700" : "bg-slate-100 text-slate-500"
          }`}>
            {row.channel === "email" ? <Mail className="w-4 h-4" /> : <MessageSquare className="w-4 h-4" />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${PRIORITY_DOT[row.priority]}`} />
              <span className={`text-[13px] truncate ${
                row.unread ? "font-bold text-slate-900" : "font-semibold text-slate-700"
              }`}>
                {row.customer_name}
              </span>
              <span className={`ml-auto text-[11px] shrink-0 tabular-nums ${overdue ? "text-rose-600 font-semibold" : "text-slate-400"}`}>
                {age(row.age_seconds)}
              </span>
            </div>
            <p className={`text-[13px] truncate ${row.unread ? "font-semibold text-slate-900" : "text-slate-800"}`}>
              {row.subject}
            </p>
            <p className="text-[12px] text-slate-500 truncate">
              {row.last_kind === "outbound" && <span className="text-slate-400">You: </span>}
              {row.snippet || "No messages yet"}
            </p>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              {/* The channel is a word, not only an icon: "is this an
                  email or something they can see in the app" changes
                  how a reply is written. */}
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600">
                {row.channel === "email" ? "Email" : "In-app"}
              </span>
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${STATUS_TONE[row.status]}`}>
                {STATUS_LABEL[row.status]}
              </span>
              {overdue && !snoozed && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-rose-50 text-rose-700">
                  Overdue
                </span>
              )}
              {snoozed && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 inline-flex items-center gap-1">
                  <BellOff className="w-2.5 h-2.5" /> Snoozed
                </span>
              )}
              {row.attachment_count > 0 && (
                <span className="text-[10px] text-slate-400 inline-flex items-center gap-0.5">
                  <Paperclip className="w-2.5 h-2.5" /> {row.attachment_count}
                </span>
              )}
              {!row.assignee_id ? (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">
                  Unassigned
                </span>
              ) : (
                <span className="text-[10px] text-slate-400 truncate">{row.assignee_name}</span>
              )}
            </div>
          </div>
        </div>
      </Link>
    </li>
  );
}
