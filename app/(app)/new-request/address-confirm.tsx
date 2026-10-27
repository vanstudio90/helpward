"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin, AlertTriangle, Check } from "lucide-react";
import { cn } from "@/lib/cn";

// Shown when the geocoder matched an address well enough to use but not
// well enough to assume. The customer sees exactly what we resolved,
// what changed, and where the pin landed — then agrees to it explicitly.
//
// The token on each candidate is what the server signed. Pressing
// "Confirm address" posts that token back; the server re-geocodes and
// checks the token against what IT resolved, so this component cannot
// grant a verified address by itself.

export type ConfirmCandidate = {
  formatted: string;
  lng: number;
  lat: number;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  /** ISO alpha-2. The quote's currency follows the place, not the customer. */
  country: string;
  confidence: "exact" | "high" | "medium" | "low" | null;
  token: string;
};

export type AddressChangeNote = {
  kind: string;
  from: string;
  to: string;
  significant: boolean;
  note: string;
};

/**
 * Emphasise the parts of the resolved address that were not in what the
 * customer typed — the added "East" being the case that matters.
 */
function Highlighted({ formatted, emphasise }: { formatted: string; emphasise: string[] }) {
  if (emphasise.length === 0) return <>{formatted}</>;
  const pattern = new RegExp(
    `\\b(${emphasise.map((e) => e.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`,
    "gi",
  );
  const parts = formatted.split(pattern);
  return (
    <>
      {parts.map((part, i) =>
        emphasise.some((e) => e.toLowerCase() === part.toLowerCase()) ? (
          <mark
            key={i}
            className="bg-amber-200 text-amber-950 rounded px-0.5 font-semibold"
          >
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

function StaticMap({ lng, lat, label }: { lng: number; lat: number; label: string }) {
  // A plain coordinate readout rather than a tile image: the artifact CSP
  // and the app's own token handling make an embedded map request
  // unnecessary here, and the pin's job is to let the customer sanity-check
  // the location, which the coordinates and the city do.
  return (
    <div className="shrink-0 w-20 h-20 rounded-xl bg-brand-50 border border-brand-100 flex flex-col items-center justify-center text-center">
      <MapPin className="w-5 h-5 text-brand-600" aria-hidden="true" />
      <div className="text-[9px] text-brand-800 font-mono leading-tight mt-1 px-1">
        {lat.toFixed(4)}
        <br />
        {lng.toFixed(4)}
      </div>
      <span className="sr-only">Map pin for {label}</span>
    </div>
  );
}

export function AddressConfirm({
  mode,
  typed,
  candidates,
  changes,
  message,
  onConfirm,
  onEdit,
}: {
  mode: "needs_confirmation" | "needs_selection";
  typed: string;
  candidates: ConfirmCandidate[];
  changes: AddressChangeNote[];
  message?: string | null;
  /** Receives the token, the formatted address and its country. */
  onConfirm: (token: string, formatted: string, country: string) => void;
  onEdit: () => void;
}) {
  // Deliberately no preselection when there is a choice to make: a
  // preselected radio is a default the customer can accept without reading.
  const [chosen, setChosen] = useState<string | null>(
    mode === "needs_confirmation" ? candidates[0]?.token ?? null : null,
  );

  const panel = useRef<HTMLElement | null>(null);

  // Bring it into view and announce it.
  //
  // The submit button sits at the BOTTOM of a long form and this panel
  // appears near the top, so a customer who pressed Submit was left
  // looking at an unchanged button while the thing that needed their
  // attention sat off-screen above them. It read as the form doing
  // nothing.
  useEffect(() => {
    panel.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    // Focus the heading rather than a control: a screen reader should
    // hear what is being asked before it hears the first option, and
    // moving focus onto a radio would preselect by implication.
    const heading = panel.current?.querySelector<HTMLElement>("[data-confirm-heading]");
    heading?.focus({ preventScroll: true });
  }, []);

  const significant = changes.filter((c) => c.significant);
  const emphasise = significant
    .filter((c) => c.kind === "directional" && c.to !== "(none)")
    .map((c) => c.to);

  const multiple = mode === "needs_selection" || candidates.length > 1;

  return (
    <section
      ref={panel}
      role="alert"
      aria-live="assertive"
      className="mt-4 rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 shadow-sm"
      aria-labelledby="addr-confirm-heading"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" aria-hidden="true" />
        <div className="min-w-0">
          <h3
            id="addr-confirm-heading"
            data-confirm-heading
            tabIndex={-1}
            className="text-sm font-bold text-amber-950 outline-none"
          >
            One more step: {multiple ? "which address did you mean?" : "confirm your address"}
          </h3>
          <p className="text-xs text-amber-900/90 mt-0.5">
            {message ??
              (multiple
                ? "More than one address matches what you typed. Choose the right one."
                : "We matched what you typed to the address below. Confirm it before we send a helper.")}
          </p>
          <p className="text-[11px] text-amber-900/70 mt-1">
            You typed: <span className="font-mono">{typed}</span>
          </p>
        </div>
      </div>

      {significant.length > 0 && (
        <ul className="mt-3 space-y-1">
          {significant.map((c, i) => (
            <li key={i} className="text-xs text-amber-950 flex items-start gap-1.5">
              <span aria-hidden="true" className="mt-[3px] w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
              {c.note}
            </li>
          ))}
        </ul>
      )}

      <ul className="mt-3 space-y-2">
        {candidates.map((c) => {
          const selected = chosen === c.token;
          return (
            <li key={c.token}>
              <label
                className={cn(
                  "flex items-start gap-3 rounded-xl border bg-white p-3 cursor-pointer transition",
                  selected ? "border-brand-500 ring-2 ring-brand-200" : "border-slate-200 hover:border-slate-300",
                )}
              >
                {multiple && (
                  <input
                    type="radio"
                    name="address_candidate"
                    className="mt-1 w-4 h-4 accent-brand-600 shrink-0"
                    checked={selected}
                    onChange={() => setChosen(c.token)}
                  />
                )}
                <StaticMap lng={c.lng} lat={c.lat} label={c.formatted} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-slate-900 leading-snug">
                    <Highlighted formatted={c.formatted} emphasise={emphasise} />
                  </span>
                  {c.postalCode && (
                    <span className="block text-[11px] text-slate-500 mt-0.5">
                      {c.city}
                      {c.region ? `, ${c.region}` : ""} {c.postalCode}
                    </span>
                  )}
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={!chosen}
          onClick={() => {
            const c = candidates.find((x) => x.token === chosen);
            if (c) onConfirm(c.token, c.formatted, c.country);
          }}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-brand-600 text-white text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Check className="w-4 h-4" aria-hidden="true" /> Confirm address
        </button>
        <button
          type="button"
          onClick={onEdit}
          className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Edit address
        </button>
        {multiple && !chosen && (
          <span className="text-[11px] text-amber-900">Pick one to continue.</span>
        )}
      </div>
    </section>
  );
}
