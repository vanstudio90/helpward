import Link from "next/link";
import {
  Sparkles, User, FileText, Wrench, Calendar, GalleryHorizontal, Link2,
  ArrowRight,
} from "lucide-react";
import { HAS_DISAMBIGUATOR_SUFFIX } from "@/lib/slug";

// Helper-side equivalent of the customer NextStepsWidget. Walks a priority-
// ordered checklist of "your public profile is missing X" / "the matching
// engine can't find you because Y" gaps and renders the top 3.
//
// Won't render at all when there's nothing actionable — fully set-up
// helpers shouldn't see this card as noise on every dashboard hit.

export type HelperNextStepsInput = {
  hasAvatar: boolean;
  hasBio: boolean;
  serviceCount: number;
  weeklyRuleCount: number;
  completionPhotoCount: number;
  featuredPortfolioCount: number;
  slug: string | null;
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

function pickSteps(input: HelperNextStepsInput): Step[] {
  const steps: Step[] = [];

  // No services picked — the matching engine can't route any request to a
  // helper with zero provider_services rows, so this is the highest-impact
  // gap and goes top of the list.
  if (input.serviceCount === 0) {
    steps.push({
      key: "services",
      icon: <Wrench className="w-5 h-5 text-brand-600" />,
      tint: "bg-brand-50",
      title: "Pick the services you offer",
      body: "The matching engine routes tasks to helpers based on which services they've signed up for. Without picking any, you won't get offers.",
      cta: "Choose services",
      href: "/provider/profile",
    });
  }

  // No avatar — customers visibly skip helpers without photos, so this is
  // the single biggest trust win after services.
  if (!input.hasAvatar) {
    steps.push({
      key: "avatar",
      icon: <User className="w-5 h-5 text-emerald-600" />,
      tint: "bg-emerald-50",
      title: "Add a profile photo",
      body: "Customers click on helpers with real photos at roughly 3× the rate of placeholder avatars.",
      cta: "Upload a photo",
      href: "/provider/profile",
    });
  }

  // No bio — second trust signal. We separate this from avatar because the
  // fix lives in the same form but the impact is independent.
  if (!input.hasBio) {
    steps.push({
      key: "bio",
      icon: <FileText className="w-5 h-5 text-violet-600" />,
      tint: "bg-violet-50",
      title: "Write a short bio",
      body: "Two or three sentences about who you are and what you're great at. Shows on every booking offer.",
      cta: "Add a bio",
      href: "/provider/profile",
    });
  }

  // No schedule — the public profile's Available-now badge falls back to
  // "no-schedule" without any rules, which reads as "not really active".
  if (input.weeklyRuleCount === 0) {
    steps.push({
      key: "schedule",
      icon: <Calendar className="w-5 h-5 text-amber-600" />,
      tint: "bg-amber-50",
      title: "Set your weekly hours",
      body: "Customers see an 'Available now' badge on your profile when you're inside your scheduled hours.",
      cta: "Open schedule",
      href: "/provider/schedule",
    });
  }

  // Portfolio — only relevant once they have completion photos to actually
  // feature; nudging a brand-new helper to "feature photos" makes no sense.
  if (input.completionPhotoCount > 0 && input.featuredPortfolioCount === 0) {
    steps.push({
      key: "portfolio",
      icon: <GalleryHorizontal className="w-5 h-5 text-orange-600" />,
      tint: "bg-orange-50",
      title: "Feature your best work",
      body: `You have ${input.completionPhotoCount} completion photo${input.completionPhotoCount === 1 ? "" : "s"} ready to publish to your public profile.`,
      cta: "Open portfolio",
      href: "/provider/portfolio",
    });
  }

  // Slug still has the auto-generated -xxxx hex suffix from backfill —
  // helpers who customize get cleaner shareable URLs.
  if (input.slug && HAS_DISAMBIGUATOR_SUFFIX.test(input.slug)) {
    steps.push({
      key: "slug",
      icon: <Link2 className="w-5 h-5 text-rose-600" />,
      tint: "bg-rose-50",
      title: "Customize your profile URL",
      body: `Your current URL is /providers/${input.slug}. Pick something memorable customers can actually remember.`,
      cta: "Edit URL",
      href: "/provider/profile",
    });
  }

  return steps.slice(0, 3);
}

export function HelperNextStepsWidget(input: HelperNextStepsInput) {
  const steps = pickSteps(input);
  if (steps.length === 0) return null;

  return (
    <section className="mt-6 rounded-2xl bg-white border border-slate-100 p-4 sm:p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-bold text-slate-900 inline-flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-brand-600" /> Build your bookings
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
