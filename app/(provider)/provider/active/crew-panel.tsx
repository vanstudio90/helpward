"use client";

import { useState, useTransition } from "react";
import { Users, Check, MapPin, Clock, AlertCircle } from "lucide-react";
import { acceptCrewInviteAction, markArrivedAction } from "./crew-actions";

// A crewed job. The lead sees who is coming and who is still missing;
// everyone else sees their own place on it.
//
// Before this, bookings.provider_id was one column: a customer paying for
// four helpers was sent one, and the other three were charged for and
// never dispatched.

export type CrewMember = {
  id: string;
  providerId: string;
  name: string;
  isLead: boolean;
  status: "invited" | "accepted" | "declined" | "arrived" | "released";
  shareCents: number;
  arrivedAt: string | null;
};

const STATUS_LABEL: Record<CrewMember["status"], { text: string; className: string }> = {
  invited:  { text: "Not answered", className: "bg-slate-50 text-slate-500 border-slate-200" },
  accepted: { text: "On the way",   className: "bg-brand-50 text-brand-700 border-brand-200" },
  arrived:  { text: "Arrived",      className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  declined: { text: "Declined",     className: "bg-rose-50 text-rose-700 border-rose-200" },
  released: { text: "Released",     className: "bg-slate-50 text-slate-400 border-slate-200" },
};

export function CrewPanel({
  bookingId, crewSize, members, viewerId, currency,
}: {
  bookingId: string;
  crewSize: number;
  members: CrewMember[];
  viewerId: string;
  currency: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const confirmed = members.filter((m) => m.status === "accepted" || m.status === "arrived");
  const shortfall = Math.max(0, crewSize - confirmed.length);
  const me = members.find((m) => m.providerId === viewerId);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-3">
      <div className="flex items-start gap-2">
        <Users className="w-4 h-4 text-brand-600 mt-0.5 shrink-0" aria-hidden="true" />
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-slate-900">
            {confirmed.length} of {crewSize} helpers confirmed
          </h3>
          <p className="text-xs text-slate-500">
            {shortfall > 0
              ? `The customer paid for ${crewSize}. The job can't start until ${shortfall} more ${shortfall === 1 ? "joins" : "join"}.`
              : "Everyone the customer paid for is on this job."}
          </p>
        </div>
      </div>

      <ul className="space-y-1.5">
        {members
          .filter((m) => m.status !== "declined" || m.providerId === viewerId)
          .map((m) => {
            const tone = STATUS_LABEL[m.status];
            return (
              <li
                key={m.id}
                className="flex items-center gap-2 rounded-lg border border-slate-100 px-2.5 py-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-slate-800 truncate">
                    {m.name}
                    {m.isLead && (
                      <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wide text-brand-700">
                        lead
                      </span>
                    )}
                    {m.providerId === viewerId && (
                      <span className="ml-1.5 text-[10px] text-slate-400">you</span>
                    )}
                  </div>
                  {m.shareCents > 0 && (
                    <div className="text-[11px] text-slate-500 tabular-nums">
                      ${(m.shareCents / 100).toFixed(2)} {currency}
                    </div>
                  )}
                </div>
                <span
                  className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border shrink-0 ${tone.className}`}
                >
                  {tone.text}
                </span>
              </li>
            );
          })}
      </ul>

      {me?.status === "invited" && (
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setError(null);
            start(async () => {
              const r = await acceptCrewInviteAction(bookingId);
              if (r?.error) setError(r.error);
            });
          }}
          className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-semibold disabled:opacity-60"
        >
          <Check className="w-4 h-4" aria-hidden="true" />
          Join this job
          {me.shareCents > 0 && ` — $${(me.shareCents / 100).toFixed(2)}`}
        </button>
      )}

      {me?.status === "accepted" && (
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setError(null);
            start(async () => {
              const r = await markArrivedAction(bookingId);
              if (r?.error) setError(r.error);
            });
          }}
          className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl border border-brand-300 bg-white text-brand-700 text-sm font-semibold disabled:opacity-60"
        >
          <MapPin className="w-4 h-4" aria-hidden="true" /> I&rsquo;ve arrived
        </button>
      )}

      {me?.status === "arrived" && (
        <p className="text-xs text-emerald-700 flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          You&rsquo;re marked as on site. The lead starts the job when everyone is here.
        </p>
      )}

      {error && (
        <p className="text-xs text-rose-700 flex items-start gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 mt-px shrink-0" aria-hidden="true" /> {error}
        </p>
      )}
    </div>
  );
}
