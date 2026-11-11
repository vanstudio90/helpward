/*
  FORMATTING THE CONSOLE SHARES WITH THE BROWSER.

  These live apart from lib/data/admin-overview.ts because that module
  is `server-only` — it holds the database reads — and the detail panel
  is a client component that needs to render the same money and the same
  ages. Importing the reader just to borrow a formatter dragged the
  Supabase server client into the browser bundle and the build said so.

  Nothing here touches data. It is the two decisions the console must
  make identically everywhere: how money is named, and how old
  something is.
*/

/** "CA$1,240" — the currency is always named, never a bare dollar sign. */
export function money(cents: number | null | undefined, currency: string): string {
  const amount = (cents ?? 0) / 100;
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount).replace(/^\$/, currency === "CAD" ? "CA$" : "US$");
}

/** "4m", "2h", "3d" — the age of something that is waiting. */
export function age(seconds: number | null | undefined): string {
  if (seconds == null) return "—";
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

/**
 * The change between this window and the one before it.
 *
 * Null when the prior window has nothing in it: "+100%" against zero is
 * arithmetic, not information, and it is the shape most likely to be
 * screenshotted into a board deck.
 */
export function delta(value: number, prior: number): { pct: number; up: boolean } | null {
  if (!prior) return null;
  const pct = Math.round(((value - prior) / prior) * 100);
  if (pct === 0) return null;
  return { pct: Math.abs(pct), up: pct > 0 };
}
