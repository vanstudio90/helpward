"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  X, MapPin, Lock, Info, Flag, FileText, PencilLine, UploadCloud, ArrowRight,
  ShieldCheck, Users, History, CheckCircle2, XCircle, HelpCircle, AlertTriangle,
} from "lucide-react";
import type { VenueDetail } from "@/lib/data/admin-venues";
import {
  PERMISSION_LABEL, PERMISSION_TONE, PERMISSION_EFFECT, PERMISSION_ENFORCED,
  REVIEW_LABEL, REVIEW_TONE, type VenuePermission,
} from "@/lib/admin-venue-states";

/*
  ONE VENUE'S ANSWER.

  THE RULES BLOCK IS SEVERAL QUESTIONS, NOT ONE. A venue that allows a
  paid stand-in may still refuse to let the customer swap in at the
  front of the queue, and a permission recorded for the general queue
  says nothing about the box office. Collapsing them into "allowed"
  is how a helper gets ejected from a line somebody promised was fine.

  AN OVERDUE CHECK SITS BESIDE THE DECISION, not instead of it. The
  answer we were given in October is still the answer we were given;
  what changed is how much it should be trusted. Hiding it would leave
  an operator with nothing.

  AND THE WORDING BOTH SIDES SEE LIVES HERE. The customer's warning and
  the helper's instruction are stored with the rule, so the website,
  the app and the helper brief cannot drift into saying different
  things about the same venue.
*/

type Tab = "rules" | "evidence" | "history";

export function VenuePanel({ venue, sample }: { venue: VenueDetail; sample: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const [tab, setTab] = useState<Tab>("rules");

  const close = () => {
    const next = new URLSearchParams(params.toString());
    next.delete("open");
    router.replace(`/admin/venues?${next.toString()}`, { scroll: false });
  };

  return (
    <aside className="bg-white rounded-2xl border border-slate-200 flex flex-col max-h-[calc(100vh-7rem)] overflow-hidden">
      <header className="px-4 pt-3.5 pb-3 border-b border-slate-100">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h2 className="text-[18px] font-bold text-slate-900 leading-tight flex flex-wrap items-center gap-2">
              {venue.name} <span className="text-slate-300">•</span> {venue.branch}
              <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md tabular-nums">
                {venue.id}
              </span>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${PERMISSION_TONE[venue.permission]}`}>
                {PERMISSION_LABEL[venue.permission]}
              </span>
            </h2>
          </div>
          <button onClick={close} aria-label="Close"
            className="w-8 h-8 grid place-items-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-50">
            <X className="w-4 h-4" />
          </button>
        </div>

        <nav className="flex items-center gap-4 mt-3 -mb-3">
          {(["rules", "evidence", "history"] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`text-[13px] font-semibold pb-2.5 border-b-2 capitalize ${
                tab === t ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800"
              }`}>
              {t}
            </button>
          ))}
        </nav>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {tab === "rules" && (
          <>
            {/* WHICH BRANCH THIS IS ABOUT */}
            <div className="grid sm:grid-cols-[1fr_auto] gap-3 items-center border border-slate-200 rounded-xl p-2.5">
              <div className="h-[104px] rounded-lg bg-gradient-to-br from-sky-50 via-slate-50 to-emerald-50 border border-slate-200 grid place-items-center relative overflow-hidden">
                <span className="absolute left-3 top-3 text-[11px] font-semibold text-slate-400">
                  {venue.location.label}
                </span>
                <MapPin className="w-7 h-7 text-brand-600" />
                <span className="absolute bottom-2 right-3 text-[10px] text-slate-400 tabular-nums">
                  {venue.location.lat.toFixed(4)}, {venue.location.lng.toFixed(4)}
                </span>
              </div>
              <div className="sm:w-[190px]">
                <p className="text-[13px] text-slate-800 flex items-start gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
                  {venue.location.label}
                </p>
                <p className="text-[11px] text-slate-500 mt-1">{venue.location.note}</p>
                <button type="button" disabled={sample}
                  className="mt-1.5 inline-flex items-center gap-1 text-[12px] font-semibold text-brand-700 disabled:text-slate-400 disabled:cursor-not-allowed">
                  Review location <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* THE ANSWERS */}
            <dl className="border border-slate-200 rounded-xl divide-y divide-slate-100">
              {venue.rules.map((rule) => (
                <div key={rule.label} className="flex items-center gap-3 px-3 py-2">
                  <dt className="text-[13px] text-slate-600 w-[128px] shrink-0">{rule.label}</dt>
                  <dd className="text-[13px] text-slate-900 min-w-0 flex-1">
                    {rule.kind === "permission"
                      ? <PermissionValue value={rule.value as VenuePermission} />
                      : rule.value}
                  </dd>
                </div>
              ))}
              <div className="flex items-center gap-3 px-3 py-2">
                <dt className="text-[13px] text-slate-600 w-[128px] shrink-0">Effective date</dt>
                <dd className="text-[13px] text-slate-900">{venue.effective_date ?? "—"}</dd>
              </div>
              <div className="flex items-center gap-3 px-3 py-2">
                <dt className="text-[13px] text-slate-600 w-[128px] shrink-0">Next review</dt>
                <dd className="text-[13px] text-slate-900 flex items-center gap-2">
                  {venue.next_review ?? "Not set"}
                  {/* THE STALE CHECK SITS BESIDE THE DECISION, not instead of it. */}
                  {venue.review_state !== "current" && (
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${REVIEW_TONE[venue.review_state]}`}>
                      {REVIEW_LABEL[venue.review_state]}
                    </span>
                  )}
                </dd>
              </div>
            </dl>

            <p className="text-[11px] text-slate-500 flex items-start gap-1.5">
              <Info className="w-3.5 h-3.5 text-slate-400 mt-px shrink-0" />
              Venue access rules change without telling us. {PERMISSION_EFFECT[venue.permission]}
            </p>

            {!PERMISSION_ENFORCED[venue.permission] && (
              <p className="text-[12px] text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 flex items-start gap-1.5">
                <AlertTriangle className="w-4 h-4 mt-px shrink-0" />
                <span>
                  <span className="font-semibold">The booking gate cannot evaluate this yet.</span>{" "}
                  It understands allowed, refused and unchecked. Until conditions are something the
                  server can read, a conditional venue has to route its requests for review rather
                  than pass them as permission.
                </span>
              </p>
            )}

            <div className="grid sm:grid-cols-2 gap-3">
              {/* VERIFICATION */}
              <section className="border border-slate-200 rounded-xl px-3 py-2.5">
                <h3 className="text-[13px] font-semibold text-slate-900 flex items-center gap-1.5 mb-2">
                  <ShieldCheck className="w-4 h-4 text-brand-600" /> Verification
                </h3>
                <dl className="space-y-1">
                  <Row label="Source" value={venue.verification.source ?? "Not recorded"} />
                  <Row label="Checked by" value={venue.verification.checked_by ?? "Nobody yet"} />
                  <Row label="Checked on" value={venue.verification.checked_on ?? "Never"} />
                  <Row label="Evidence"
                    value={`${venue.verification.evidence_count} attachment${venue.verification.evidence_count === 1 ? "" : "s"}`} />
                </dl>
                <button type="button" disabled={sample}
                  onClick={() => setTab("evidence")}
                  className="mt-2 w-full inline-flex items-center justify-center gap-1.5 text-[12px] font-semibold text-slate-700 bg-white border border-slate-200 hover:border-brand-300 px-2.5 py-1.5 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed">
                  <Lock className="w-3.5 h-3.5" /> View evidence
                </button>
                <p className="text-[11px] text-slate-500 mt-1.5">{venue.verification.access_note}</p>
              </section>

              {/* WHAT EACH SIDE IS TOLD */}
              <section className="border border-slate-200 rounded-xl px-3 py-2.5">
                <h3 className="text-[13px] font-semibold text-slate-900 flex items-center gap-1.5 mb-2">
                  <Users className="w-4 h-4 text-brand-600" /> Booking impact
                </h3>
                <p className="text-[12px] text-slate-700">
                  <span className="font-semibold">Customer sees:</span> &ldquo;{venue.booking_impact.customer}&rdquo;
                </p>
                <p className="text-[12px] text-slate-700 mt-1.5">
                  <span className="font-semibold">Helper sees:</span> &ldquo;{venue.booking_impact.helper}&rdquo;
                </p>
                <p className="text-[11px] text-slate-500 mt-1.5">
                  One wording, shared by the website, the app and the helper brief.
                </p>
              </section>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Link href={`/admin/bookings?q=${encodeURIComponent(venue.name)}`}
                className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand-700">
                <FileText className="w-4 h-4" /> Related requests
                <span className="text-[11px] font-bold bg-slate-100 text-slate-700 rounded-full px-1.5">
                  {venue.related_requests}
                </span>
              </Link>
              <span className="text-slate-200">|</span>
              <button type="button" disabled={sample}
                className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-amber-800 disabled:text-slate-400 disabled:cursor-not-allowed">
                <Flag className="w-4 h-4" /> Report policy change
              </button>
            </div>
          </>
        )}

        {tab === "evidence" && (
          <>
            <p className="text-[12px] text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 flex items-start gap-1.5">
              <Lock className="w-3.5 h-3.5 text-slate-400 mt-px shrink-0" />
              Whatever a venue sent us — an email, a photograph of a sign, a note from a call. Held
              privately, opened through a signed link, and every opening recorded. The venue
              contact&apos;s own details are not shown here.
            </p>
            <ul className="space-y-1.5">
              {Array.from({ length: venue.verification.evidence_count }, (_, i) => (
                <li key={i} className="border border-slate-200 rounded-xl px-3 py-2 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold text-slate-800">
                      Email from the duty manager
                    </span>
                    <span className="block text-[11px] text-slate-500">
                      {venue.verification.checked_by ?? "Staff"} · {venue.verification.checked_on ?? "—"}
                    </span>
                  </span>
                  <button type="button" disabled={sample}
                    className="text-[12px] font-semibold text-brand-700 disabled:text-slate-400 disabled:cursor-not-allowed shrink-0">
                    Open
                  </button>
                </li>
              ))}
              {venue.verification.evidence_count === 0 && (
                <li className="text-[13px] text-slate-500">
                  Nothing attached. A permission with no evidence is somebody&apos;s memory of a
                  phone call.
                </li>
              )}
            </ul>
          </>
        )}

        {tab === "history" && (
          <ol className="space-y-2.5">
            {venue.history.map((h, i) => (
              <li key={i} className="flex gap-2.5">
                <History className="w-3.5 h-3.5 text-slate-300 mt-1 shrink-0" />
                <div className="min-w-0">
                  <p className="text-[13px] text-slate-900">{h.summary}</p>
                  <p className="text-[11px] text-slate-500">
                    {h.actor} · {h.at}{h.reason ? ` · ${h.reason}` : ""}
                  </p>
                </div>
              </li>
            ))}
            <li className="text-[11px] text-slate-500 pt-1">
              Previous decisions are kept. A venue that changed its mind is a different fact from a
              venue nobody ever asked.
            </li>
          </ol>
        )}
      </div>

      <footer className="border-t border-slate-100 px-4 py-3 space-y-2 bg-slate-50/60">
        <p className="text-[11px] text-slate-600">
          Changes are recorded, and open requests at this venue are flagged for operations to look
          at. Nothing is silently cancelled and no money moves on its own.
        </p>
        <div className="flex items-center gap-2">
          <button type="button" disabled={sample}
            className="inline-flex items-center gap-1.5 bg-white border border-slate-200 text-[13px] font-semibold text-slate-700 px-3 py-2 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed">
            <PencilLine className="w-4 h-4" /> Edit draft
          </button>
          <button type="button" disabled={sample}
            className="ml-auto inline-flex items-center gap-1.5 bg-brand-600 text-white text-[13px] font-semibold px-3.5 py-2 rounded-xl disabled:bg-slate-200 disabled:text-slate-500 disabled:cursor-not-allowed">
            <UploadCloud className="w-4 h-4" /> Review &amp; publish
          </button>
        </div>
      </footer>
    </aside>
  );
}

function PermissionValue({ value }: { value: VenuePermission }) {
  const Icon = value === "allowed" ? CheckCircle2
    : value === "refused" ? XCircle
    : value === "conditional" ? AlertTriangle
    : HelpCircle;
  const tone = value === "allowed" ? "text-emerald-600"
    : value === "refused" ? "text-rose-600"
    : value === "conditional" ? "text-amber-600"
    : "text-slate-400";
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon className={`w-4 h-4 ${tone}`} />
      {PERMISSION_LABEL[value]}
    </span>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2 text-[13px]">
      <dt className="text-slate-500 w-[84px] shrink-0">{label}</dt>
      <dd className="text-slate-800 min-w-0 truncate">{value}</dd>
    </div>
  );
}
