import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  ArrowLeft, ArrowRight, Briefcase, MapPin, Calendar, Mail, ChevronRight,
} from "lucide-react";
import { MarketingShell } from "@/components/MarketingShell";
import { JOBS, getJob, type JobPosting } from "@/lib/careers";

export const dynamic = "force-static";

export async function generateStaticParams() {
  return JOBS.map((j) => ({ slug: j.slug }));
}

export async function generateMetadata({
  params,
}: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const job = getJob(slug);
  if (!job) return { title: "Role not found — Helpward Careers" };
  const title = `${job.title} — Helpward Careers`;
  return {
    title,
    description: job.summary,
    alternates: { canonical: `https://helpward.com/careers/${job.slug}` },
    openGraph: { title, description: job.summary, type: "article" },
    twitter: { card: "summary_large_image", title, description: job.summary },
  };
}

// JobPosting JSON-LD — eligible for Google Jobs rich result. Salary range is
// honest, dates are accurate, location is the first city in the list (Google
// expects a single primary location; remote-OK is signalled via jobLocationType).
function jobPostingLd(job: JobPosting) {
  const primary = job.locations[0];
  return {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: job.title,
    description: job.summary + "\n\n" + job.about,
    identifier: { "@type": "PropertyValue", name: "Helpward", value: job.slug },
    datePosted: job.postedAt,
    validThrough: job.validThrough,
    employmentType: job.employmentType,
    hiringOrganization: { "@id": "https://helpward.com/#organization" },
    jobLocation: primary.remote ? undefined : {
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        addressLocality: primary.city,
        addressRegion: primary.region,
        addressCountry: primary.country,
      },
    },
    jobLocationType: job.remoteOk || primary.remote ? "TELECOMMUTE" : undefined,
    applicantLocationRequirements: job.remoteOk ? {
      "@type": "Country",
      name: primary.country === "CA" ? "Canada" : "United States",
    } : undefined,
    baseSalary: {
      "@type": "MonetaryAmount",
      currency: job.salaryCurrency,
      value: {
        "@type": "QuantitativeValue",
        minValue: job.salaryMin,
        maxValue: job.salaryMax,
        unitText: "YEAR",
      },
    },
    directApply: false, // we use email, not a form
  };
}

function breadcrumbLd(job: JobPosting) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://helpward.com" },
      { "@type": "ListItem", position: 2, name: "Careers", item: "https://helpward.com/careers" },
      { "@type": "ListItem", position: 3, name: job.title, item: `https://helpward.com/careers/${job.slug}` },
    ],
  };
}

export default async function JobPostingPage({
  params,
}: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const job = getJob(slug);
  if (!job) notFound();

  const otherJobs = JOBS.filter((j) => j.slug !== job.slug).slice(0, 4);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jobPostingLd(job)) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd(job)) }} />

      <MarketingShell title={job.title} subtitle={job.summary}>
        <nav aria-label="Breadcrumb" className="not-prose text-xs text-slate-500 mb-6 -mt-2">
          <ol className="flex items-center gap-1.5 flex-wrap">
            <li><Link href="/" className="hover:text-slate-900">Home</Link></li>
            <ChevronRight className="w-3 h-3 text-slate-300" />
            <li><Link href="/careers" className="hover:text-slate-900">Careers</Link></li>
            <ChevronRight className="w-3 h-3 text-slate-300" />
            <li className="text-slate-900 font-semibold truncate max-w-[40ch]">{job.title}</li>
          </ol>
        </nav>

        {/* Hero meta */}
        <div className="not-prose mb-8 grid sm:grid-cols-2 gap-3">
          <Meta icon={<Briefcase className="w-4 h-4 text-brand-600" />} label="Team" value={job.team} />
          <Meta
            icon={<MapPin className="w-4 h-4 text-emerald-600" />}
            label="Location"
            value={
              job.locations.map((l) => l.remote ? "Remote" : `${l.city}, ${l.region}`).join(" · ") +
              (job.remoteOk && !job.locations.some((l) => l.remote) ? " (or remote)" : "")
            }
          />
          <Meta
            icon={<Calendar className="w-4 h-4 text-amber-600" />}
            label="Posted"
            value={new Date(job.postedAt).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}
          />
          <Meta
            icon={<Briefcase className="w-4 h-4 text-violet-600" />}
            label="Salary range"
            value={`$${(job.salaryMin / 1000).toFixed(0)}k–$${(job.salaryMax / 1000).toFixed(0)}k ${job.salaryCurrency} / year`}
          />
        </div>

        {/* Apply CTA up top */}
        <ApplyCTA email={job.applyEmail} title={job.title} />

        <h2>About the role</h2>
        <p>{job.about}</p>

        <h2>What you&apos;ll do</h2>
        <ul>
          {job.responsibilities.map((r) => <li key={r}>{r}</li>)}
        </ul>

        <h2>What we&apos;re looking for</h2>
        <ul>
          {job.requirements.map((r) => <li key={r}>{r}</li>)}
        </ul>

        {job.niceToHaves && job.niceToHaves.length > 0 && (
          <>
            <h2>Nice to have</h2>
            <ul>
              {job.niceToHaves.map((r) => <li key={r}>{r}</li>)}
            </ul>
          </>
        )}

        <h2>How to apply</h2>
        <p>
          Email <a href={`mailto:${job.applyEmail}?subject=${encodeURIComponent(job.title + " — application")}`} className="font-semibold">{job.applyEmail}</a>{" "}
          with a short note and your CV or LinkedIn. Reference the role title in the subject line. We respond to
          every applicant within 7 business days. The process is 3–4 conversations and a paid trial project.
        </p>

        {/* Apply CTA at the bottom */}
        <ApplyCTA email={job.applyEmail} title={job.title} />

        {/* Back + related */}
        <div className="not-prose mt-10">
          <Link href="/careers" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:text-brand-800">
            <ArrowLeft className="w-4 h-4" /> All open roles
          </Link>
        </div>

        {otherJobs.length > 0 && (
          <div className="not-prose mt-8">
            <div className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">Other open roles</div>
            <ul className="grid sm:grid-cols-2 gap-3">
              {otherJobs.map((j) => (
                <li key={j.slug}>
                  <Link
                    href={`/careers/${j.slug}`}
                    className="block h-full rounded-2xl border border-slate-100 bg-white p-4 hover:border-brand-300 transition"
                  >
                    <div className="text-[10px] font-bold uppercase tracking-widest text-brand-700 mb-1">{j.team}</div>
                    <div className="text-sm font-bold text-slate-900">{j.title}</div>
                    <div className="text-xs text-slate-500 mt-1 line-clamp-2">{j.summary}</div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </MarketingShell>
    </>
  );
}

function Meta({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white border border-slate-100 p-3">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-slate-500 mb-1">
        {icon} {label}
      </div>
      <div className="text-sm font-bold text-slate-900">{value}</div>
    </div>
  );
}

function ApplyCTA({ email, title }: { email: string; title: string }) {
  const mailto = `mailto:${email}?subject=${encodeURIComponent(title + " — application")}`;
  return (
    <div className="not-prose my-6 rounded-2xl bg-gradient-to-br from-brand-600 to-violet-700 text-white p-5 flex items-center justify-between gap-3 flex-wrap">
      <div className="min-w-0">
        <div className="text-sm font-bold">Ready to apply?</div>
        <div className="text-xs text-white/85 mt-0.5">Email a short note + CV. We respond within 7 business days.</div>
      </div>
      <a href={mailto} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white text-slate-900 text-sm font-bold hover:bg-slate-100 shrink-0">
        <Mail className="w-4 h-4" /> Apply now <ArrowRight className="w-4 h-4" />
      </a>
    </div>
  );
}
