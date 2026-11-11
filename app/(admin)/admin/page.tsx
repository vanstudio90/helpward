import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import {
  getLiveOperations, getOverviewSnapshot, WINDOWS, type WindowKey,
} from "@/lib/data/admin-overview";
import {
  Kpis, NeedsAttention, MoneyAtAGlance, CoverageByService,
  PlatformSignals, RecentActivity,
} from "@/components/admin/OverviewPanels";
import { BookingsInMotion } from "@/components/admin/BookingsInMotion";
import { LiveOperations } from "@/components/admin/LiveOperations";
import { OverviewControls } from "@/components/admin/OverviewControls";

/*
  THE OPERATIONS OVERVIEW.

  What this page replaced: thirty days of charts — bookings, signups and
  disputes as lines. A fine quarterly read and no use at all on a Tuesday
  morning, when the question is never "how was the month" but "what is
  broken, who owns it, and where is everybody".

  So the order of the page is the order of the morning. What needs a
  person, first and at the top. Then the jobs moving through the system,
  then where every helper physically is, then the money, then the things
  that quietly rot — coverage, dispatch faults, stale locations.

  Every figure comes from two database functions that each return one
  document, so the cards cannot disagree with each other or with the
  map. Nothing here is computed from a second query taken a moment
  later.
*/

export const dynamic = "force-dynamic";

export default async function AdminOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ window?: string; region?: string; review?: string }>;
}) {
  const params = await searchParams;
  const windowKey: WindowKey = (params.window === "7d" || params.window === "30d")
    ? params.window
    : "today";
  const includeReview = params.review === "1";
  const region = params.region || null;

  const [snapshot, live] = await Promise.all([
    getOverviewSnapshot({ window: windowKey, includeReview, region }),
    getLiveOperations({ includeReview }),
  ]);

  /*
    A FAILED READ IS NOT AN EMPTY MARKETPLACE.

    If the snapshot cannot be taken there is nothing honest to render in
    its place, so the page says what went wrong and offers the one
    action that helps. It does not draw zeroes: a zero on this page is
    something somebody acts on.
  */
  if (!snapshot.ok) {
    return (
      <div className="px-6 py-10 max-w-3xl mx-auto">
        <div className="bg-white rounded-2xl border border-amber-200 p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
            <div>
              <h1 className="text-lg font-bold text-slate-900">The overview could not be loaded</h1>
              <p className="text-[14px] text-slate-600 mt-1">{snapshot.error}</p>
              <p className="text-[13px] text-slate-500 mt-3">
                Nothing is shown rather than zeroes, because a zero here reads as a quiet
                marketplace instead of a broken query.
              </p>
              <Link
                href="/admin"
                className="inline-block mt-4 bg-brand-600 hover:bg-brand-700 text-white text-[13px] font-semibold px-4 py-2 rounded-xl"
              >
                Try again
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const data = snapshot.data;

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 pb-12 max-w-[1600px] mx-auto">
      <header className="flex flex-wrap items-start justify-between gap-4 mb-5">
        <div>
          <h1 className="text-[28px] leading-tight font-bold text-slate-900">
            Marketplace overview
          </h1>
          <p className="text-[14px] text-slate-500 mt-0.5">
            Know what needs attention. Keep every job moving.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <OverviewControls
            regions={data.regions}
            asOf={data.as_of}
            stale={!live.ok}
          />
          <p className="text-[11px] text-slate-400">
            {WINDOWS[windowKey].label}
            {region ? ` · ${region}` : " · all regions"}
            {includeReview ? " · review activity included" : " · review & test activity excluded"}
          </p>
        </div>
      </header>

      <div className="space-y-4">
        <Kpis snapshot={data} />

        <div className="grid lg:grid-cols-[1.35fr_1fr] gap-4 items-start">
          <NeedsAttention items={data.needs_attention} />
          <LiveOperations
            initial={live.ok ? live.data : null}
            includeReview={includeReview}
            error={live.ok ? undefined : live.error}
          />
        </div>

        <div className="grid lg:grid-cols-[1.35fr_1fr] gap-4 items-start">
          <BookingsInMotion queues={data.bookings_in_motion} />
          <MoneyAtAGlance rows={data.money} />
        </div>

        <div className="grid lg:grid-cols-3 gap-4 items-start">
          <CoverageByService rows={data.coverage} />
          <PlatformSignals health={data.health} />
          <RecentActivity events={data.activity} />
        </div>
      </div>
    </div>
  );
}
