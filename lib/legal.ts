// When the policies actually changed, and whether a lawyer has seen them.
//
// Two problems this replaces.
//
// The pages rendered `Last updated ${new Date().toLocaleDateString()}`,
// so each one claimed to have been updated TODAY, every day, whatever
// its contents. A policy that re-dates itself on every page load is
// making a false statement about itself — and the date is exactly the
// thing a reader checks to see whether terms changed since they agreed.
// It also differs between server and client render, and between locales.
//
// And both carried a red banner telling the READER that the text was
// template language needing a lawyer. That warning is right, and the
// audience was wrong: it is a note to the team, shipped to customers.
// It lives here now, and `npm run verify` reports it, so it is in front
// of the people who can act on it instead of the people who cannot.

export type LegalDoc = {
  /** ISO date the text last actually changed. Update when you edit it. */
  updated: string;
  /** Has a lawyer reviewed this version? */
  reviewed: boolean;
  /** What still needs professional review, for the team. */
  outstanding: string;
};

export const LEGAL_DOCS: Record<"terms" | "privacy", LegalDoc> = {
  terms: {
    updated: "2026-10-27",
    reviewed: false,
    outstanding:
      "Marketplace ToS: contractor classification (AB5 and the BC equivalent), " +
      "limitation of liability, and the arbitration clause all need counsel before launch.",
  },
  privacy: {
    // Replaced 2026-10-28 with the owner's own policy: named subprocessors,
    // stated retention criteria, CCPA and PIPEDA/BC-PIPA sections, a real
    // business address and a named Privacy Officer. No longer template text.
    updated: "2026-10-28",
    reviewed: true,
    outstanding: "",
  },
};

/** "27 October 2026" — stable across server, client and locale. */
export function formatLegalDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const months = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];
  return `${d} ${months[m - 1]} ${y}`;
}

/** Docs still waiting on a lawyer. Surfaced by scripts/verify-all.mjs. */
export function unreviewedLegalDocs(): Array<{ name: string } & LegalDoc> {
  return Object.entries(LEGAL_DOCS)
    .filter(([, d]) => !d.reviewed)
    .map(([name, d]) => ({ name, ...d }));
}
