import Link from "next/link";
import type { Metadata } from "next";
import { MapPin, Briefcase, Users, ArrowRight, Mail } from "lucide-react";
import { MarketingShell } from "@/components/MarketingShell";
import { JOBS } from "@/lib/careers";

const TITLE = "Careers at Helpward";
const INTRO =
  "Helpward is building the Human Infrastructure Network — verified humans for real-world tasks across the U.S. and Canada. If that sounds like the company you want to help build, here are the open roles.";

export const metadata: Metadata = {
  title: `${TITLE} — Helpward`,
  description: INTRO,
  alternates: { canonical: "https://helpward.com/careers" },
  openGraph: { title: TITLE, description: INTRO, url: "https://helpward.com/careers", type: "website" },
  twitter: { card: "summary_large_image", title: TITLE, description: INTRO },
};

// CollectionPage + ItemList JSON-LD links each role to the hub so Google
// understands the cluster. Each role's own JobPosting schema lives on
// /careers/[slug] for Google Jobs rich-result eligibility.
const HUB_LD = {
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  "@id": "https://helpward.com/careers#hub",
  name: TITLE,
  description: INTRO,
  url: "https://helpward.com/careers",
  isPartOf: { "@id": "https://helpward.com/#website" },
  about: { "@id": "https://helpward.com/#organization" },
  mainEntity: {
    "@type": "ItemList",
    itemListElement: JOBS.map((j, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: j.title,
      url: `https://helpward.com/careers/${j.slug}`,
    })),
  },
};

export default function Careers() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(HUB_LD) }} />

      <MarketingShell title={TITLE} subtitle={INTRO}>
        <h2>How we work</h2>
        <ul>
          <li><strong>Small team, large surface.</strong> Every hire owns a feature area or a metric. We don&apos;t carve roles into pieces too small to feel.</li>
          <li><strong>Operational transparency.</strong> The quarterly transparency report, the safety microsite, and the public help centre are all real. We don&apos;t hide bad numbers and we won&apos;t expect you to.</li>
          <li><strong>Real compensation.</strong> Salary ranges are published on every role. We negotiate inside the range based on level and experience, not on whether you ask.</li>
          <li><strong>Vancouver-anchored, North-America-distributed.</strong> Most roles are Vancouver-or-remote-in-Canada; community roles are in their cities.</li>
        </ul>

        <h2>Open roles</h2>
        <p>{JOBS.length} open positions across operations, trust &amp; safety, engineering, design, and community.</p>

        <div className="not-prose my-6 space-y-3">
          {JOBS.map((job) => (
            <Link
              key={job.slug}
              href={`/careers/${job.slug}`}
              className="group block rounded-2xl border border-slate-100 bg-white p-5 hover:border-brand-300 hover:shadow transition"
            >
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-brand-700 mb-2">
                    <Briefcase className="w-3 h-3" /> {job.team}
                    <span className="text-slate-300">·</span>
                    <span className="text-slate-600">{job.employmentType === "FULL_TIME" ? "Full-time" : job.employmentType === "PART_TIME" ? "Part-time" : "Contract"}</span>
                  </div>
                  <h3 className="text-base sm:text-lg font-bold text-slate-900 group-hover:text-brand-700 transition-colors">
                    {job.title}
                  </h3>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">{job.summary}</p>
                  <div className="mt-3 flex items-center gap-3 text-[11px] text-slate-500 flex-wrap">
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      {job.locations.map((l) => l.remote ? "Remote" : `${l.city}, ${l.region}`).join(" · ")}
                      {job.remoteOk && " (or remote)"}
                    </span>
                    <span className="text-slate-300">·</span>
                    <span className="font-semibold text-slate-700">
                      ${(job.salaryMin / 1000).toFixed(0)}k–${(job.salaryMax / 1000).toFixed(0)}k {job.salaryCurrency}
                    </span>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400 mt-1 group-hover:text-brand-600 group-hover:translate-x-0.5 transition" />
              </div>
            </Link>
          ))}
        </div>

        <h2>Don&apos;t see your role?</h2>
        <p>
          If your background doesn&apos;t fit one of the open roles but you&apos;d be a great fit for Helpward,
          write us. Some of the best hires we&apos;ll make this year aren&apos;t on this page yet.
        </p>
        <p>
          <a href="mailto:careers@helpward.com" className="inline-flex items-center gap-1 font-semibold">
            <Mail className="w-4 h-4" /> careers@helpward.com
          </a>
        </p>

        <h2>How to apply</h2>
        <p>
          Email the address on the role&apos;s page with a short note and your CV or LinkedIn. We respond to every
          applicant within 7 business days. Initial screens are 30 minutes; full process is 3–4 conversations and
          a paid trial project.
        </p>

        <div className="not-prose mt-8 rounded-2xl bg-brand-50 border border-brand-100 p-5 flex items-start gap-3">
          <Users className="w-5 h-5 text-brand-600 shrink-0" />
          <div>
            <div className="text-sm font-bold text-slate-900">Read about Helpward before applying</div>
            <p className="text-xs text-slate-600 mt-1 leading-relaxed">
              The <Link href="/about" className="font-semibold text-brand-700 hover:underline">/about</Link>{" "}
              page explains why Helpward exists; the{" "}
              <Link href="/safety" className="font-semibold text-brand-700 hover:underline">safety microsite</Link>{" "}
              documents the operational craft; the{" "}
              <Link href="/blog" className="font-semibold text-brand-700 hover:underline">blog</Link>{" "}
              has our latest thinking. The strongest applicants reference these.
            </p>
          </div>
        </div>
      </MarketingShell>
    </>
  );
}
