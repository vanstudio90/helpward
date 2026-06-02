import Link from "next/link";
import { Sparkles, Star, MapPin, Heart, ArrowRight } from "lucide-react";

// Next-steps widget — shows on the customer dashboard above the main grid,
// surfacing the 1-3 highest-priority actions for the current account state.
// Priority order picks for first-time users who haven't booked anything,
// then nudges for converting one-time customers into repeat ones (rate the
// last booking, save addresses, save favorite helpers).
//
// Doesn't render at all when the user has no actionable next-steps — a
// returning customer who's rated everything and set up their saved data
// shouldn't see this card as noise.

export type DashboardNextStepsInput = {
  hasCompletedBooking: boolean;
  unratedCount: number;
  oldestUnratedBookingId: string | null;
  savedAddressCount: number;
  favoriteHelperCount: number;
};

type Step = {
  key: string;
  icon: React.ReactNode;
  title: string;
  body: string;
  cta: string;
  href: string;
  tint: string;
};

function pickSteps(input: DashboardNextStepsInput): Step[] {
  const steps: Step[] = [];

  // Unrated bookings — highest priority because the helper is waiting.
  if (input.unratedCount > 0 && input.oldestUnratedBookingId) {
    steps.push({
      key: "rate",
      icon: <Star className="w-5 h-5 text-amber-500 fill-amber-400" />,
      tint: "bg-amber-50",
      title: input.unratedCount === 1
        ? "Rate your last task"
        : `Rate ${input.unratedCount} completed tasks`,
      body: "Your rating helps your helper get more bookings and shapes who other customers see.",
      cta: "Rate now",
      href: `/bookings/${input.oldestUnratedBookingId}/rate`,
    });
  }

  // First-time user nudge — make the first request the most prominent thing
  // on the page when there's no booking history at all.
  if (!input.hasCompletedBooking && input.unratedCount === 0) {
    steps.push({
      key: "first-request",
      icon: <Sparkles className="w-5 h-5 text-brand-600" />,
      tint: "bg-brand-50",
      title: "Make your first request",
      body: "Pick a service, drop your address, and a verified helper picks it up in minutes.",
      cta: "Start a request",
      href: "/new-request",
    });
  }

  // Saved-address nudge — only when there's also no completed booking yet,
  // OR completed but they typed everything manually. Keep this lower-priority
  // than rating because it's a paper cut, not a relationship moment.
  if (input.savedAddressCount === 0) {
    steps.push({
      key: "save-address",
      icon: <MapPin className="w-5 h-5 text-emerald-600" />,
      tint: "bg-emerald-50",
      title: "Save your addresses",
      body: "Save your home, work, or favorite stops for one-tap fill on every new request.",
      cta: "Add an address",
      href: "/settings",
    });
  }

  // Favorite-helper nudge — only relevant after at least one completed
  // booking so the customer has someone they actually have an opinion on.
  if (input.hasCompletedBooking && input.favoriteHelperCount === 0) {
    steps.push({
      key: "favorite-helper",
      icon: <Heart className="w-5 h-5 text-rose-500 fill-rose-500" />,
      tint: "bg-rose-50",
      title: "Save a helper you liked",
      body: "Tap the heart on a helper's profile to route future requests to them first.",
      cta: "Browse past bookings",
      href: "/bookings",
    });
  }

  return steps.slice(0, 3);
}

export function NextStepsWidget(input: DashboardNextStepsInput) {
  const steps = pickSteps(input);
  if (steps.length === 0) return null;

  return (
    <section className="mb-5 rounded-2xl bg-white border border-slate-100 p-4 sm:p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-bold text-slate-900 inline-flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-brand-600" /> Next steps
        </h2>
        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
          {steps.length} {steps.length === 1 ? "thing" : "things"} to do
        </span>
      </div>
      <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {steps.map((s) => (
          <li key={s.key}>
            <Link
              href={s.href}
              className="block rounded-xl border border-slate-100 hover:border-slate-200 hover:shadow-sm transition p-3 h-full"
            >
              <div className="flex items-start gap-3 mb-2">
                <span className={`w-9 h-9 rounded-lg ${s.tint} inline-flex items-center justify-center shrink-0`}>
                  {s.icon}
                </span>
                <div className="text-sm font-bold text-slate-900 leading-tight pt-0.5">{s.title}</div>
              </div>
              <p className="text-[11px] text-slate-500 leading-snug mb-2">{s.body}</p>
              <div className="inline-flex items-center gap-1 text-xs font-bold text-brand-700">
                {s.cta} <ArrowRight className="w-3 h-3" />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
