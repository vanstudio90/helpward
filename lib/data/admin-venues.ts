import "server-only";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import type { VenuePermission, ReviewState } from "@/lib/admin-venue-states";

/*
  COVERAGE AND VENUE PERMISSIONS — TYPES FIRST, DATA LATER.

  WIRED. The register reads `venues` — the same rows checkVenue()
  consults on every Wait in Line request — and the coverage tab reads
  the service-area boundaries. Two things are worth stating:

  1. THE RULE IT DESCRIBES IS ALREADY REAL. lib/venue-gate.ts runs on
     every Wait in Line request, from the website and from the app: a
     refused venue is blocked, an unchecked one proceeds with the
     customer told. This screen is a design for MANAGING those records.
     It is not a drawing of an imaginary rule.

  2. OPERATING IN A CITY IS NOT PERMISSION AT A VENUE. Service coverage
     and venue permissions are separate tabs for that reason, and the
     types never mix them: a city can be fully covered while every
     venue in it is unchecked.
*/

export type VenueRow = {
  id: string;                    // VN-0012
  name: string;
  branch: string;
  address: string;
  region: string;
  permission: VenuePermission;
  /** Null when nobody has ever checked. Never rendered as a date. */
  last_checked: string | null;
  reviewer: string | null;
  next_review: string | null;
  review_state: ReviewState;
  open_requests: number;
};

export type VenueDetail = {
  id: string;
  name: string;
  branch: string;
  permission: VenuePermission;
  location: { label: string; lat: number; lng: number; note: string };
  /* The venue answers more than one question, and they are different
     questions. A place that allows a paid stand-in may still refuse to
     let the customer swap in at the front. */
  rules: { label: string; value: VenuePermission | string; kind: "permission" | "text" }[];
  queue_scope: string;
  conditions: string;
  effective_date: string | null;
  next_review: string | null;
  review_state: ReviewState;
  verification: {
    source: string | null;
    checked_by: string | null;
    checked_on: string | null;
    evidence_count: number;
    access_note: string;
  };
  /* The exact wording each side sees, kept here so the website, the app
     and the helper brief cannot drift apart. */
  booking_impact: { customer: string; helper: string };
  related_requests: number;
  history: { at: string; actor: string; summary: string; reason: string | null }[];
  draft_changes: { field: string; from: string; to: string }[];
};

export type CoverageRow = {
  area: string;
  region: string;
  country: "CA" | "US";
  helpers_available: number;
  /*
    WHY NOBODY IS DISPATCHABLE MATTERS MORE THAN THAT NOBODY IS.
    Zero available with three approved is a Saturday night; zero
    available with nobody approved is a market that has not launched.
    The page cannot tell those apart from one number.
  */
  helpers_approved: number;
  services_live: number;
  venues_recorded: number;
  venues_unchecked: number;
};

export type VenuesView = {
  sample: boolean;
  /*
    READING IS WIRED; WRITING IS NOT. Every control that would change
    something is disabled on this flag rather than on `sample`, so the
    page can show real records without its buttons quietly becoming
    live. The working editors are still where changes are made.
  */
  writable: boolean;
  service: string;
  as_of: string;
  /** Set when the register could not be read. Never rendered as "no records". */
  load_error: string | null;
  counts: {
    allowed: number;
    refused: number;
    unchecked: number;
    due_for_review: number;
  };
  rows: VenueRow[];
  total_rows: number;
  coverage: CoverageRow[];
  selected: VenueDetail | null;
};

/* ------------------------------------------------------------------ */
/* THE REAL REGISTER                                                    */
/* ------------------------------------------------------------------ */

type VenueDb = {
  id: string; name: string; address: string | null; city: string | null;
  region: string | null; country: string | null; area_id: string | null;
  substitutes_allowed: string | null; customer_may_replace: string | null;
  full_party_required: string | null; numbers_transferable: string | null;
  early_turn_policy: string | null; notes: string | null;
  confirmed_by: string | null; confirmed_at: string | null; updated_at: string | null;
};

/** How long a confirmed answer is treated as current. Stated, not assumed. */
const REVIEW_AFTER_DAYS = 90;

function permissionOf(v: VenueDb): VenuePermission {
  const answer = v.substitutes_allowed;
  if (answer === "refused") return "refused";
  if (answer === "allowed") return "allowed";
  return "unknown";
}

/*
  AN UNCHECKED VENUE HAS NO REVIEW DATE, because there is nothing to
  review. A confirmed one is current for ninety days and overdue after
  that — and the decision stays visible either way.
*/
function reviewOf(v: VenueDb): { state: ReviewState; next: string | null } {
  if (!v.confirmed_at) return { state: "never_checked", next: null };
  const next = new Date(new Date(v.confirmed_at).getTime() + REVIEW_AFTER_DAYS * 86400_000);
  const days = (next.getTime() - Date.now()) / 86400_000;
  return {
    state: days < 0 ? "overdue" : days < 14 ? "due_soon" : "current",
    next: next.toISOString().slice(0, 10),
  };
}

const shortDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-CA", { day: "numeric", month: "short" }) : null;

/** "lower-mainland-bc" reads as a slug; people read "Lower Mainland BC". */
function areaLabel(areaId: string): string {
  return areaId.split("-").map((w) => (w.length <= 2 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1))).join(" ");
}

export async function getVenuesView(opts: {
  tab?: string; region?: string | null; permission?: string | null;
  review?: string | null; search?: string | null; open?: string | null;
} = {}): Promise<VenuesView> {
  const db = createSupabaseServiceClient();

  const [venuesRes, boundariesRes, datasetsRes, helpersRes, servicesRes] = await Promise.all([
    db.from("venues").select("*").order("name"),
    db.from("service_area_boundaries").select("area_id, municipality"),
    db.from("service_area_datasets").select("area_id, source_name"),
    db.from("provider_profiles").select("user_id, status, is_online, vacation_mode, location_updated_at"),
    db.from("services").select("id, countries, active"),
  ]);

  /* A register that could not be read is not an empty register. */
  const loadError = venuesRes.error?.message ?? null;
  const venues = (venuesRes.data ?? []) as VenueDb[];

  const rowsAll: VenueRow[] = venues.map((v) => {
    const review = reviewOf(v);
    return {
      id: `VN-${v.id.slice(0, 4).toUpperCase()}`,
      name: v.name,
      branch: v.city ?? v.region ?? "Main",
      address: v.address ?? "",
      region: v.region ?? v.city ?? v.country ?? "—",
      permission: permissionOf(v),
      /* Never a date where nobody checked. */
      last_checked: shortDate(v.confirmed_at),
      reviewer: v.confirmed_by ?? null,
      next_review: review.next ? shortDate(review.next) : null,
      review_state: review.state,
      open_requests: 0,
    };
  });

  const search = (opts.search ?? "").trim().toLowerCase();
  let rows = rowsAll;
  if (opts.permission && opts.permission !== "All") {
    rows = rows.filter((r) => r.permission === opts.permission!.toLowerCase());
  }
  if (opts.region && !opts.region.startsWith("All")) {
    rows = rows.filter((r) => (r.region ?? "").toLowerCase().includes(opts.region!.toLowerCase()));
  }
  if (opts.review && opts.review !== "All") {
    const want = opts.review.toLowerCase().replace(" ", "_");
    rows = rows.filter((r) => r.review_state === want);
  }
  if (search) {
    rows = rows.filter((r) => `${r.name} ${r.branch} ${r.address}`.toLowerCase().includes(search));
  }

  /*
    COVERAGE IS NOT PERMISSION, and this is where that is visible: an
    area can carry every service and still hold no venue answer at all.
  */
  const munis = new Map<string, Set<string>>();
  for (const b of (boundariesRes.data ?? []) as { area_id: string; municipality: string }[]) {
    if (!munis.has(b.area_id)) munis.set(b.area_id, new Set());
    munis.get(b.area_id)!.add(b.municipality);
  }
  const areaCountry = new Map<string, "CA" | "US">();
  for (const d of (datasetsRes.data ?? []) as { area_id: string; source_name: string }[]) {
    areaCountry.set(d.area_id, /US Census/i.test(d.source_name) ? "US" : "CA");
  }

  const helpers = (helpersRes.data ?? []) as {
    status: string; is_online: boolean | null; vacation_mode: boolean | null; location_updated_at: string | null;
  }[];
  /* "Available" means a helper dispatch could actually reach — approved,
     online, not on holiday, and reporting a location. */
  const available = helpers.filter((h) =>
    h.status === "approved" && h.is_online && !h.vacation_mode && h.location_updated_at).length;
  const approved = helpers.filter((h) => h.status === "approved").length;

  const services = (servicesRes.data ?? []) as { countries: string[] | null; active: boolean }[];
  const liveIn = (country: string) =>
    services.filter((s) => s.active && (s.countries ?? []).includes(country)).length;

  const coverage: CoverageRow[] = Array.from(munis.keys()).sort().map((areaId) => {
    const country = areaCountry.get(areaId) ?? "CA";
    const inArea = rowsAll.filter((r) =>
      (r.region ?? "").toLowerCase().includes(areaLabel(areaId).split(" ")[0].toLowerCase()));
    return {
      area: areaLabel(areaId),
      region: `${munis.get(areaId)!.size} municipalities`,
      country,
      /* Not split by area: a helper's location is a point, and this
         console does not yet map one to an area. The number is the
         marketplace-wide count of helpers dispatch could reach. */
      helpers_available: available,
      helpers_approved: approved,
      services_live: liveIn(country),
      venues_recorded: inArea.length,
      venues_unchecked: inArea.filter((v) => v.permission === "unknown").length,
    };
  });

  const openId = opts.open ?? null;
  const selected = openId ? buildDetail(openId) : null;

  function buildDetail(ref: string): VenueDetail | null {
    const key = ref.replace(/^VN-/i, "").toLowerCase();
    const v = venues.find((x) => x.id.toLowerCase().startsWith(key));
    if (!v) return null;
    const review = reviewOf(v);
    const permission = permissionOf(v);

    const rule = (label: string, value: string | null): {
      label: string; value: VenuePermission | string; kind: "permission" | "text";
    } => ({
      label,
      value: (value === "allowed" || value === "refused" ? value : "unknown") as VenuePermission,
      kind: "permission",
    });

    return {
      id: `VN-${v.id.slice(0, 4).toUpperCase()}`,
      name: v.name,
      branch: v.city ?? v.region ?? "Main",
      permission,
      location: {
        label: [v.city, v.region, v.country].filter(Boolean).join(", ") || "No location recorded",
        lat: 0, lng: 0,
        note: "The rule applies to this branch only. A chain's other branches answer for themselves. No coordinates are recorded for venues yet.",
      },
      rules: [
        rule("Paid stand-in", v.substitutes_allowed),
        rule("Place handover", v.customer_may_replace),
        rule("Whole party required", v.full_party_required),
        rule("Numbers transferable", v.numbers_transferable),
        { label: "Early turn policy", value: v.early_turn_policy ?? "Not recorded", kind: "text" },
        { label: "Notes", value: v.notes ?? "None", kind: "text" },
      ],
      queue_scope: "Not recorded — this register holds one answer per venue, not per queue.",
      conditions: v.notes ?? "None recorded.",
      effective_date: shortDate(v.confirmed_at),
      next_review: review.next ? shortDate(review.next) : null,
      review_state: review.state,
      verification: {
        source: v.confirmed_by ? "Recorded by staff" : null,
        checked_by: v.confirmed_by,
        checked_on: shortDate(v.confirmed_at),
        /* No evidence store exists for venues yet. */
        evidence_count: 0,
        access_note:
          "No evidence is attached: this register records the answer and who recorded it, not the email or photograph behind it.",
      },
      booking_impact: {
        customer: permission === "refused"
          ? "Stand-ins are not permitted at this venue, so this request cannot go ahead."
          : permission === "allowed"
            ? "Stand-ins are permitted here. Entry and availability are not guaranteed."
            : "We have not confirmed this venue's rules. Your helper will check with staff on arrival.",
        helper: permission === "allowed"
          ? "Confirm the queue and handover conditions with venue staff on arrival."
          : "Check with venue staff before taking a place in the queue.",
      },
      related_requests: 0,
      history: v.confirmed_at
        ? [{ at: shortDate(v.confirmed_at)!, actor: v.confirmed_by ?? "Staff",
             summary: `Recorded as ${permission}`, reason: null }]
        : [],
      draft_changes: [],
    };
  }

  const counts = {
    allowed: rowsAll.filter((r) => r.permission === "allowed").length,
    refused: rowsAll.filter((r) => r.permission === "refused").length,
    unchecked: rowsAll.filter((r) => r.permission === "unknown").length,
    due_for_review: rowsAll.filter((r) => r.review_state === "overdue" || r.review_state === "due_soon").length,
  };

  return {
    sample: false,
    writable: false,
    service: "Wait in Line",
    as_of: new Date().toISOString(),
    load_error: loadError,
    counts,
    rows,
    total_rows: rowsAll.length,
    coverage,
    selected,
  };
}
