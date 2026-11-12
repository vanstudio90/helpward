/*
  THE CATALOGUE'S VOCABULARY.

  PRICING MODELS ARE NOT FREE TEXT. The quote engine supports exactly
  three shapes, and a dropdown that offers a fourth is a promise the
  engine will not keep — the service would price at zero or throw at
  booking time. So the list lives here, beside the note that renaming a
  service or rewriting its blurb must never change how it charges.
*/

export type PricingModel = "time_based" | "flat" | "base_plus_units";

export const MODEL_LABEL: Record<PricingModel, string> = {
  time_based: "Time-based",
  flat: "Flat",
  base_plus_units: "Base + units",
};

export const MODEL_MEANING: Record<PricingModel, string> = {
  time_based: "A base covering some included minutes, then a price per extra block.",
  flat: "One price for the job, whatever it takes.",
  base_plus_units: "A base covering some included items, then a price per extra item.",
};

export type ServiceStatus = "published" | "draft" | "archived";

export const STATUS_LABEL: Record<ServiceStatus, string> = {
  published: "Published",
  draft: "Draft",
  archived: "Archived",
};

export const STATUS_TONE: Record<ServiceStatus, string> = {
  published: "bg-emerald-50 text-emerald-700",
  draft: "bg-amber-50 text-amber-800",
  archived: "bg-slate-100 text-slate-600",
};

/*
  A CHECK HAS THREE HONEST STATES AND ONE DISHONEST ONE.

  "Not checked" is the state almost every check is in almost all of the
  time, and it is the one consoles habitually draw as a green tick. A
  tick here would mean somebody verified that the app catalogue, the
  website directory and the sitemap all agree — so until something
  actually looked, this says so.
*/
export type CheckState = "not_checked" | "passed" | "failed" | "running";

export const CHECK_LABEL: Record<CheckState, string> = {
  not_checked: "Not checked",
  passed: "Passed",
  failed: "Needs attention",
  running: "Checking…",
};

export const CHECK_TONE: Record<CheckState, string> = {
  not_checked: "bg-slate-100 text-slate-600",
  passed: "bg-emerald-50 text-emerald-700",
  failed: "bg-rose-50 text-rose-700",
  running: "bg-sky-50 text-sky-700",
};

/* Where a published change has to land. Publishing that updates one of
   these and not the others is how a service goes live in the app and
   404s on the website. */
export const PUBLICATION_SURFACES = [
  "App catalogue",
  "Website directory",
  "Service page",
  "City pages",
  "Related-service links",
  "Structured data",
  "Sitemap",
  "Edge and CDN caches",
] as const;
