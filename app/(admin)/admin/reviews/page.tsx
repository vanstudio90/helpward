import Link from "next/link";
import {
  CheckCircle2, Flag, EyeOff, Scale, Star, Search, Info, FlaskConical, Wrench,
  CloudOff, MessageSquare, Eye,
} from "lucide-react";
import { getReviewsView, type ReviewRow } from "@/lib/data/admin-reviews";
import {
  VISIBILITY_LABEL, VISIBILITY_TONE, REASON_LABEL, REPORT_STATE_LABEL,
} from "@/lib/admin-review-states";
import { ReviewPanel } from "@/components/admin/ReviewPanel";

/*
  REVIEWS MODERATION.

  THE RULE THIS PAGE IS ORGANISED AROUND: a low rating is not a policy
  violation. Two stars is a customer's honest opinion and criticism is
  the point of a review system. So the rating filter sits apart from
  the moderation queue, the banner says it in as many words, and no
  decision reason in the whole design is "low rating".

  WHAT HIDING ACTUALLY DOES, in this product, today: the helper's
  public average is computed from visible reviews and recomputed when
  one changes, so hiding a comment because it contains a phone number
  also removes its two stars from that average. The panel states the
  consequence rather than asking the moderator to go and check a
  policy.

  AND THE ORIGINAL IS NEVER EDITED. Nothing in this design writes to a
  customer's words.

  FOUR EMPTINESSES, KEPT APART: no reviews at all, no reports waiting,
  nothing matching these filters, and a queue that failed to load.
*/

export const dynamic = "force-dynamic";

const TABS = [
  { key: "all", label: "All reviews" },
  { key: "reported", label: "Reported" },
  { key: "published", label: "Published" },
  { key: "hidden", label: "Hidden" },
  { key: "appeals", label: "Appeals" },
] as const;

export default async function AdminReviewsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const tab = (TABS.find((t) => t.key === params.tab)?.key ?? "reported") as string;

  const view = await getReviewsView({
    tab,
    rating: params.rating ?? null,
    service: params.service ?? null,
    region: params.region ?? null,
    owner: params.owner ?? null,
    search: params.q ?? null,
    open: params.open ?? null,
  });

  const openId = params.open ?? view.selected?.id ?? null;
  const detail = openId && openId === view.selected?.id ? view.selected : null;
  const filtered = Boolean(params.q || params.rating || params.service || params.region || params.owner);
  const noReviewsAtAll = view.total_reviews === 0 && !view.load_error;
  const noneInQueue = !noReviewsAtAll && view.rows.length === 0 && !filtered && !view.load_error;
  const noMatches = !noReviewsAtAll && view.rows.length === 0 && filtered && !view.load_error;

  const query = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (value) next.set(key, value);
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    return `/admin/reviews?${next.toString()}`;
  };

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 pb-12 max-w-[1700px] mx-auto">
      <div className={detail ? "grid xl:grid-cols-[1fr_620px] gap-4 items-start" : ""}>
        <div className="min-w-0 space-y-4">
          <header>
            <h1 className="text-[28px] leading-tight font-bold text-slate-900 flex flex-wrap items-center gap-2.5">
              Reviews moderation
            </h1>
            <p className="text-[14px] text-slate-500 mt-0.5">
              Protect authentic feedback. Apply policy consistently.
            </p>
          </header>

          {/*
            THE WORDS ARE THE CUSTOMER'S. This console decides whether
            to show them; it has no path that edits them, and this says
            so where a moderator starts rather than in a code comment.
          */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5 flex items-start gap-2.5">
            <Info className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
            <p className="text-[12px] text-slate-700">
              <span className="font-semibold">Hiding a review does not change the helper&apos;s score.</span>{" "}
              The wording and the rating are separate decisions: a customer whose words we will not
              publish still had the experience they scored. Excluding a score is its own act, with
              its own reason, and it is recorded as such. Nothing here edits what somebody wrote.
            </p>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
            <Count icon={CheckCircle2} tone="emerald" label="Published" value={view.counts.published}
              href={query({ tab: "published" })} />
            <Count icon={Flag} tone="rose" label="Reported" value={view.counts.reported}
              href={query({ tab: "reported" })} />
            <Count icon={EyeOff} tone="slate" label="Hidden" value={view.counts.hidden}
              href={query({ tab: "hidden" })} />
            <Count icon={Scale} tone="violet" label="Appeals" value={view.counts.appeals}
              href={query({ tab: "appeals" })} />
          </div>

          <nav className="flex flex-wrap items-center gap-5 border-b border-slate-200">
            {TABS.map((t) => (
              <Link key={t.key} href={query({ tab: t.key === "reported" ? null : t.key, open: null })}
                className={`text-[13px] font-semibold pb-2.5 border-b-2 whitespace-nowrap ${
                  tab === t.key ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800"
                }`}>
                {t.label}
              </Link>
            ))}
            <Link href="/admin/reviews/classic"
              className="ml-auto mb-2 inline-flex items-center gap-1.5 text-[12px] font-semibold text-slate-600 bg-white border border-slate-200 px-3 py-1.5 rounded-lg hover:border-brand-300 hover:text-brand-700">
              <Wrench className="w-3.5 h-3.5" /> Open the working page
            </Link>
          </nav>

          {/*
            THE RATING FILTER IS A READING AID, NOT A QUEUE. It sits
            above the moderation filters and apart from them, because
            "show me the one-star reviews" is a reasonable thing to ask
            and "moderate the one-star reviews" is not.
          */}
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[13px] font-semibold text-slate-700">Rating</span>
            <select className="appearance-none bg-white border border-slate-200 rounded-xl px-3 py-2 text-[13px] font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-200">
              {["All ratings", "5 stars", "4 stars", "3 stars", "2 stars", "1 star"].map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
            <span className="ml-auto text-[12px] text-slate-500">
              Review &amp; test activity excluded.
            </span>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input placeholder="Search review, booking or helper…"
                className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-brand-200" />
            </div>
            <Select label="Service" options={["All", "Moving Help", "Maid Service", "Package Delivery"]} />
            <Select label="Region" options={["All", "Vancouver", "San Diego"]} />
            <Select label="Owner" options={["Anyone", "Mine", "Unassigned"]} />
          </div>

          <div className="bg-brand-50/60 border border-brand-100 rounded-xl px-3.5 py-2.5 flex items-start gap-2.5">
            <Info className="w-4 h-4 text-brand-600 mt-0.5 shrink-0" />
            <p className="text-[12px] text-slate-700">
              <span className="font-semibold">A low rating alone is not a policy violation.</span>{" "}
              Filter by stars to read the feedback; moderate only on a policy reason. No decision in
              this console accepts &ldquo;low rating&rdquo; as grounds.
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            {view.load_error ? (
              <div className="px-5 py-8 flex items-start gap-3">
                <CloudOff className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-[14px] font-semibold text-slate-900">
                    The moderation queue could not be loaded
                  </p>
                  <p className="text-[13px] text-slate-600 mt-0.5">{view.load_error}</p>
                  <p className="text-[13px] text-slate-600 mt-1">
                    This is a failed query, not an empty queue. Reviews are unaffected.
                  </p>
                </div>
              </div>
            ) : noReviewsAtAll ? (
              <Empty icon={MessageSquare} title="No reviews yet"
                body={view.empty_reason ?? "Nobody has reviewed a completed booking. Reports will appear here once there is something to report."} />
            ) : noneInQueue ? (
              <Empty icon={Flag} title="No reports awaiting review"
                body={`${view.total_reviews} reviews are published and none has been reported. Nothing needs a moderator today.`}
                action={{ label: "View published reviews", href: query({ tab: "published" }) }} />
            ) : noMatches ? (
              <Empty icon={Search} title="No matching results"
                body="No review matches these filters. The queue itself is not empty."
                action={{ label: "Clear filters", href: "/admin/reviews" }} />
            ) : (
              <>
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-wide text-slate-400 bg-slate-50/60">
                      <th className="text-left font-semibold px-4 py-2">Review</th>
                      <th className="text-left font-semibold px-2 py-2">Rating</th>
                      <th className="text-left font-semibold px-2 py-2">Report reason</th>
                      <th className="text-left font-semibold px-2 py-2">Visibility</th>
                      <th className="text-left font-semibold px-2 py-2">Owner</th>
                      <th className="text-right font-semibold px-4 py-2">Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.rows.map((row) => (
                      <Row key={row.id} row={row} href={query({ open: row.id })} selected={openId === row.id} />
                    ))}
                  </tbody>
                </table>
                <p className="px-4 py-2.5 text-[12px] text-slate-500 border-t border-slate-100">
                  Showing 1–{view.rows.length} of {view.total_rows} reported records, out of{" "}
                  {view.total_reviews} reviews in total.
                </p>
              </>
            )}
          </div>

          {view.tasks.length > 0 && (
            <section className="bg-white rounded-2xl border border-slate-200 px-4 py-3">
              <h2 className="text-[14px] font-bold text-slate-900 mb-2">Tasks</h2>
              <ul className="divide-y divide-slate-100">
                {view.tasks.map((task) => (
                  <li key={task.key} className="flex items-center gap-2.5 py-2">
                    {task.key === "appeal"
                      ? <Scale className="w-4 h-4 text-violet-500 shrink-0" />
                      : <Flag className="w-4 h-4 text-rose-500 shrink-0" />}
                    <span className="text-[13px] text-slate-700 flex-1">{task.label}</span>
                    <Link href={task.href} className="text-[12px] font-semibold text-brand-700 shrink-0">
                      {task.action}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="bg-white rounded-2xl border border-slate-200 px-4 py-3 flex items-start gap-2.5">
            <Info className="w-4 h-4 text-brand-500 mt-0.5 shrink-0" />
            <p className="text-[12px] text-slate-600">
              <span className="font-semibold text-slate-800">Hiding a review also removes its rating from the helper&apos;s public average.</span>{" "}
              That is what this product does today: the average is built from visible reviews and
              recalculated whenever one changes. The row itself is kept in full, and there is no
              separate internal average that includes hidden ones — so a decision about words is
              also a decision about stars. Original feedback is never edited, and every decision
              records who made it, why, under which policy, and what the visibility was before.
            </p>
          </div>
        </div>

        {detail && <ReviewPanel can={view.can} detail={detail} sample={false} />}
      </div>
    </div>
  );
}

function Count({ icon: Icon, label, value, tone, href }: {
  icon: typeof Flag; label: string; value: number;
  tone: "emerald" | "rose" | "slate" | "violet"; href: string;
}) {
  const tones = {
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-600",
    rose: "bg-rose-50 border-rose-200 text-rose-600",
    slate: "bg-white border-slate-200 text-slate-500",
    violet: "bg-violet-50 border-violet-200 text-violet-600",
  }[tone];
  return (
    <Link href={href} className={`rounded-2xl border px-3.5 py-3 min-w-0 hover:shadow-sm transition ${tones}`}>
      <span className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-700 min-w-0">
        <Icon className="w-4 h-4 shrink-0" />
        <span className="truncate">{label}</span>
      </span>
      <span className="block text-[22px] font-bold text-slate-900 leading-none tabular-nums whitespace-nowrap mt-1.5">
        {value}
      </span>
    </Link>
  );
}

function Empty({ icon: Icon, title, body, action }: {
  icon: typeof Flag; title: string; body: string;
  action?: { label: string; href: string };
}) {
  return (
    <div className="px-6 py-14 text-center">
      <span className="w-14 h-14 rounded-2xl bg-violet-50 grid place-items-center mx-auto">
        <Icon className="w-6 h-6 text-violet-400" />
      </span>
      <p className="text-[18px] font-bold text-slate-900 mt-3">{title}</p>
      <p className="text-[13px] text-slate-500 mt-1 max-w-sm mx-auto">{body}</p>
      {action && (
        <Link href={action.href}
          className="inline-block mt-4 text-[13px] font-semibold text-white bg-brand-600 hover:bg-brand-700 px-4 py-2 rounded-xl">
          {action.label}
        </Link>
      )}
    </div>
  );
}

function Select({ label, options }: { label: string; options: string[] }) {
  return (
    <label className="text-[11px] font-semibold text-slate-500">
      {label}
      <select className="mt-1 block appearance-none bg-white border border-slate-200 rounded-xl px-3 py-2 text-[13px] font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-200">
        {options.map((o) => <option key={o}>{o}</option>)}
      </select>
    </label>
  );
}

function Row({ row, href, selected }: { row: ReviewRow; href: string; selected: boolean }) {
  return (
    <tr className={`border-t border-slate-100 ${selected ? "bg-brand-50/60" : "hover:bg-slate-50"}`}>
      <td className="px-4 py-2.5">
        <Link href={href} className="block">
          <span className="font-semibold text-slate-900 tabular-nums">{row.id}</span>
          <span className="text-slate-300"> • </span>
          <span className="text-slate-700">{row.service}</span>
          <span className="block text-[11px] text-slate-400 tabular-nums">{row.booking_ref}</span>
        </Link>
      </td>
      <td className="px-2 py-2.5">
        <Link href={href} className="inline-flex items-center gap-0.5" aria-label={`${row.rating} out of 5`}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Star key={n} className={`w-3.5 h-3.5 ${n <= row.rating ? "fill-amber-400 text-amber-400" : "text-slate-200"}`} />
          ))}
        </Link>
      </td>
      <td className="px-2 py-2.5 text-slate-700">
        <Link href={href}>
          {row.report_reason
            ? REASON_LABEL[row.report_reason]
            : row.report_state === "appealed"
              ? "Awaiting appeal review"
              : <span className="text-slate-400">Not reported</span>}
        </Link>
      </td>
      <td className="px-2 py-2.5">
        <Link href={href}>
          <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${VISIBILITY_TONE[row.visibility]}`}>
            {row.visibility === "hidden" ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            {VISIBILITY_LABEL[row.visibility]}
          </span>
        </Link>
      </td>
      <td className="px-2 py-2.5 text-slate-700">
        <Link href={href}>
          {row.owner ?? <span className="text-slate-400">{REPORT_STATE_LABEL.unassigned}</span>}
        </Link>
      </td>
      <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">
        <Link href={href}>{row.updated_at}</Link>
      </td>
    </tr>
  );
}
