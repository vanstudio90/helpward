import "server-only";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { intakeFor } from "@/lib/service-intake";
import { ruleFromRow, priceService } from "@/lib/service-pricing";
import { localizeRule, type CountryPrice } from "@/lib/country-price";
import { SERVICE_FEE_CENTS, priceTask } from "@/lib/pricing";
import type { PricingModel, ServiceStatus, CheckState } from "@/lib/admin-service-states";

/*
  THE CATALOGUE VIEW — TYPES FIRST, DATA LATER.

  Same seam as Payments and Refunds: everything comes from
  getCatalogueView(), which returns sample configuration today and says
  so on screen.

  THE SHAPE IS BUILT AROUND FIVE RULES THE BRIEF ASKS FOR, each of
  which is a way a catalogue editor quietly breaks a marketplace:

    1. SAVED QUOTES ARE NOT RECALCULATED. A price change applies to new
       quotes. Existing requests and bookings keep what they were
       quoted, which is why publishing is a review step and not a field
       that writes straight through.

    2. INHERITED IS NOT ZERO. Every money field carries an override and
       the value it would inherit. `override_cents: null` means this
       market follows the shared rule; `override_cents: 0` means this
       market charges nothing. They look identical in a text box and
       mean opposite things, so the type keeps them apart.

    3. DESCRIPTIVE DURATION IS NOT BILLABLE TIME. "Usually about an
       hour" is copy for a customer. `included_minutes` is what the
       engine charges from. They are different fields in different tabs
       and the editor says so.

    4. ONLY THE MODELS THE ENGINE SUPPORTS. PricingModel is a closed
       set, and changing copy cannot change it.

    5. A CHECK THAT NOBODY RAN IS "NOT CHECKED". Publication checks
       start at not_checked and only a real check moves them.
*/

export type Market = "US" | "CA";

export type PriceField = {
  key: string;
  label: string;
  /** What this market actually charges once inheritance is resolved. */
  effective_cents: number;
  /** null = inherits the shared rule. 0 = this market charges nothing. */
  override_cents: number | null;
  /** The shared rule's value, or null where the rule has none. */
  inherited_cents: number | null;
  help: string | null;
};

export type NumberField = {
  key: string;
  label: string;
  value: number;
  unit: "minutes" | "count";
  help: string | null;
};

export type ServiceRow = {
  id: string;
  title: string;
  category: string;
  image_url: string | null;
  model: PricingModel;
  us_base_cents: number | null;
  ca_base_cents: number | null;
  status: ServiceStatus;
  has_draft: boolean;
};

export type QuotePreview = {
  duration_minutes: number;
  helpers: number;
  lines: { label: string; amount_cents: number }[];
  total_cents: number;
  /** Where the number came from. */
  source: string;
  /*
    THE RULE THE FIGURE CAME FROM, beside the figure.

    A total on its own invites the wrong comparison: Maid Service in
    Canada includes 120 minutes and charges CA$22.50 for each further
    30, so a 90-minute preview is the base alone and nothing is
    "missing". Printing the included time, the block size and the
    LOCALISED block price next to the total is what makes the number
    checkable, and it is what distinguishes the real rule from the
    example the design was drawn with.
  */
  rule: {
    included_minutes: number | null;
    extra_block_minutes: number | null;
    extra_block_cents: number | null;
    included_units: number | null;
    per_extra_unit_cents: number | null;
  } | null;
};

export type ServiceDraft = {
  id: string;
  title: string;
  status: ServiceStatus;
  model: PricingModel;
  category: string;
  image_url: string | null;
  /** Copy shown to customers. Never an input to the quote. */
  content: {
    blurb: string;
    arrival_estimate: string;
    inclusions: string[];
    exclusions: string[];
    preparation: string;
  };
  market: Market;
  currency: string;
  price_fields: PriceField[];
  number_fields: NumberField[];
  /** Read-only here: changing it affects every service and both markets. */
  service_fee_cents: number;
  service_fee_scope: { services: number; markets: number };
  quote: QuotePreview;
  /** Honest about whether anything actually validated this draft. */
  validation: { state: CheckState; detail: string };
  intake: { question: string; required: boolean; kind: string; options?: string[] }[];
  availability: { market: Market; bookable: boolean; in_app_launch_scope: boolean; note: string | null }[];
  history: { at: string; actor: string; summary: string; reason: string | null }[];
  draft_changes: { field: string; from: string; to: string }[];
  /*
    THE DRAFT THIS PANEL IS EDITING, where one is open. Publishing and
    discarding both act on an id, not on "the service" — two people
    looking at the same service must not be able to publish each
    other's work by pressing a button that means "whatever is open".
  */
  draft_id: string | null;
  draft_updated_at: string | null;
};

export type PublicationCheck = {
  key: string;
  label: string;
  state: CheckState;
  detail: string;
};

export type CatalogueView = {
  sample: boolean;
  /*
    READING IS WIRED; WRITING IS NOT. Every control that would change
    something is disabled on this flag rather than on `sample`, so the
    page can show real records without its buttons quietly becoming
    live. The working editors are still where changes are made.
  */
  writable: boolean;
  /*
    WRITING IS ENABLED ONE CONTROL AT A TIME.

    `writable` stays false for everything that has no server behind it.
    These three are true because each has a database function that
    checks the admin claim, validates the result, writes its own audit
    event and refuses with a code the screen can explain. Turning a
    button on before all four exist is how a console grows a control
    that half-works.
  */
  can: {
    save_draft: boolean;
    publish: boolean;
    discard: boolean;
  };
  as_of: string;
  counts: {
    launch_services: number;
    archived: number;
    draft_changes: number;
    validation_issues: number | null;   // null = nothing has validated yet
  };
  rows: ServiceRow[];
  archived_preview: { id: string; title: string; image_url: string | null }[];
  checks: PublicationCheck[];
  selected: ServiceDraft | null;
};

/* ------------------------------------------------------------------ */
/* THE REAL CATALOGUE                                                   */
/* ------------------------------------------------------------------ */

type ServiceRowDb = {
  id: string; title: string; blurb: string | null; tagline: string | null;
  eta_label: string | null; image_url: string | null; active: boolean;
  category_id: string | null; countries: string[] | null; base_price_cents: number;
};
type RuleRow = Record<string, unknown> & { service_id: string };
type DraftRowDb = {
  id: string; service_id: string; market: string;
  changes: Record<string, unknown>; based_on: Record<string, unknown>;
  updated_at: string; note: string | null;
};
type CountryRow = {
  service_id: string; country: string; base_price_cents: number | null;
  extra_block_cents: number | null; per_extra_unit_cents: number | null;
  per_extra_crew_cents: number | null;
};

/** Which of the three shapes the engine will charge this service by. */
function modelOf(rule: RuleRow | undefined): PricingModel {
  if (!rule) return "flat";
  if (rule.unit_field) return "base_plus_units";
  if (rule.included_minutes != null && rule.extra_block_cents != null) return "time_based";
  return "flat";
}

/*
  A MARKET PRICE IS AN OVERRIDE OR IT IS INHERITED, and the difference
  is a null column rather than a blank box. This keeps the two apart all
  the way to the screen, so "this market follows the rule" and "this
  market charges nothing" never collapse into each other.
*/
function priceField(
  key: string, label: string, help: string | null,
  override: number | null | undefined, inherited: number | null,
): PriceField {
  const overrideCents = override ?? null;
  return {
    key, label, help,
    override_cents: overrideCents,
    inherited_cents: inherited,
    effective_cents: overrideCents ?? inherited ?? 0,
  };
}

/*
  WHAT A DRAFTED FIELD IS CALLED, AND HOW ITS VALUE READS.

  "base_price_cents: 6000 → 9000" is a diff; "Base price: CA$60.00 →
  CA$90.00" is a decision somebody can take. Money is printed as money
  and an unset value says so rather than showing an empty string, which
  reads as zero.
*/
const FIELD_LABEL: Record<string, string> = {
  title: "Title",
  blurb: "Description",
  tagline: "Preparation note",
  eta_label: "Arrival estimate",
  image_url: "Photo",
  active: "Listed",
  shared_base_cents: "Shared base price",
  shared_block_cents: "Shared block price",
  base_price_cents: "Base price",
  extra_block_cents: "Price per block",
  per_extra_unit_cents: "Price per extra item",
  per_extra_crew_cents: "Additional helper",
  included_minutes: "Included time",
  extra_block_minutes: "Block size",
  included_units: "Included items",
};

const MONEY_FIELDS = new Set([
  "shared_base_cents", "shared_block_cents", "base_price_cents",
  "extra_block_cents", "per_extra_unit_cents", "per_extra_crew_cents",
]);

function describe(field: string, value: unknown): string {
  if (value === null || value === undefined) return "not set";
  if (MONEY_FIELDS.has(field) && typeof value === "number") {
    return `${(value / 100).toFixed(2)}`;
  }
  if (field === "included_minutes" || field === "extra_block_minutes") return `${value} min`;
  if (typeof value === "boolean") return value ? "yes" : "no";
  const text = String(value);
  return text.length > 60 ? `${text.slice(0, 57)}…` : text;
}

export async function getCatalogueView(opts: {
  tab?: string; category?: string | null; market?: string | null;
  status?: string | null; search?: string | null; open?: string | null;
} = {}): Promise<CatalogueView> {
  const db = createSupabaseServiceClient();

  const [services, rules, countryPrices, categories, scopeHistory, draftsRes] = await Promise.all([
    db.from("services")
      .select("id, title, blurb, tagline, eta_label, image_url, active, category_id, countries, base_price_cents")
      .order("title"),
    db.from("service_pricing").select("*"),
    db.from("service_country_pricing")
      .select("service_id, country, base_price_cents, extra_block_cents, per_extra_unit_cents, per_extra_crew_cents"),
    db.from("service_categories").select("id, label"),
    /* The one piece of change history this product keeps: what was taken
       out of the launch scope, when, and the reason given. */
    db.from("service_scope_restore").select("service_id, was_active, changed_at, reason"),
    /* Staged changes nobody has published. Never used to quote. */
    db.from("service_drafts")
      .select("id, service_id, market, changes, based_on, updated_at, note")
      .eq("status", "open"),
  ]);
  const drafts = (draftsRes.data ?? []) as DraftRowDb[];
  const draftBy = new Map<string, DraftRowDb>();
  for (const d of drafts) draftBy.set(`${d.service_id}:${d.market}`, d);
  const servicesWithDraft = new Set(drafts.map((d) => d.service_id));

  if (services.error) {
    /* A failed read is not an empty catalogue. The page has a branch for
       this; what it must never do is draw zero services. */
    throw new Error(`The catalogue could not be read: ${services.error.message}`);
  }

  const all = (services.data ?? []) as ServiceRowDb[];
  const ruleBy = new Map<string, RuleRow>();
  for (const r of (rules.data ?? []) as RuleRow[]) ruleBy.set(r.service_id, r);
  const countryRows = (countryPrices.data ?? []) as CountryRow[];
  const countryBy = new Map<string, CountryRow>();
  for (const r of countryRows) countryBy.set(`${r.service_id}:${r.country}`, r);
  const categoryLabel = new Map<string, string>();
  for (const c of (categories.data ?? []) as { id: string; label: string }[]) categoryLabel.set(c.id, c.label);

  const base = (id: string, country: "US" | "CA", fallback: number) =>
    countryBy.get(`${id}:${country}`)?.base_price_cents ?? fallback;

  const search = (opts.search ?? "").trim().toLowerCase();
  const tab = opts.tab ?? "launch";
  const visible = (tab === "drafts" || tab === "history" ? [] : all).filter((s) => {
    if (tab === "archived" ? s.active : !s.active) return false;
    if (opts.category && opts.category !== "All" && categoryLabel.get(s.category_id ?? "") !== opts.category) return false;
    if (search && !(`${s.title} ${s.id}`.toLowerCase().includes(search))) return false;
    return true;
  });

  const rows: ServiceRow[] = visible.map((s) => ({
    id: s.id,
    title: s.title,
    category: categoryLabel.get(s.category_id ?? "") ?? s.category_id ?? "—",
    image_url: s.image_url,
    model: modelOf(ruleBy.get(s.id)),
    /* Null where a market has no price of its own AND no shared base to
       fall back on — the list shows that as a warning, not as free. */
    us_base_cents: base(s.id, "US", s.base_price_cents),
    ca_base_cents: base(s.id, "CA", s.base_price_cents),
    status: s.active ? "published" : "archived",
    has_draft: servicesWithDraft.has(s.id),
  }));

  /*
    A REAL VALIDATION, not a reassuring zero: a live service that has no
    price recorded for a market it is sold in is a booking that will be
    quoted from a fallback nobody chose.
  */
  const validationIssues = all.filter((s) => {
    if (!s.active) return false;
    const markets = (s.countries ?? []) as string[];
    return markets.some((m) => (m === "US" || m === "CA") && !countryBy.has(`${s.id}:${m}`));
  }).length;

  const archived = all.filter((s) => !s.active);

  const selectedId = opts.open ?? null;
  const selected = selectedId ? buildDraft(selectedId) : null;

  function buildDraft(id: string): ServiceDraft | null {
    const s = all.find((x) => x.id === id);
    if (!s) return null;
    const ruleRow = ruleBy.get(id);
    const rule = ruleFromRow(ruleRow);
    const market = (opts.market === "US" || opts.market === "CA" ? opts.market : "CA") as Market;
    const currency = market === "CA" ? "CAD" : "USD";
    const countryRow = countryBy.get(`${id}:${market}`);
    const openDraft = draftBy.get(`${id}:${market}`) ?? null;

    const priceFields: PriceField[] = [
      priceField("base", "Base price",
        "What the job costs before extra blocks, helpers and the service fee.",
        countryRow?.base_price_cents, s.base_price_cents),
    ];
    if (ruleRow?.extra_block_cents != null || countryRow?.extra_block_cents != null) {
      priceFields.push(priceField("per_block", "Price per block",
        "Charged for each extra block beyond the included time.",
        countryRow?.extra_block_cents, (ruleRow?.extra_block_cents as number | null) ?? null));
    }
    if (ruleRow?.per_extra_crew_cents != null || countryRow?.per_extra_crew_cents != null) {
      priceFields.push(priceField("per_helper", "Additional helper",
        "Charged per helper beyond the first.",
        countryRow?.per_extra_crew_cents, (ruleRow?.per_extra_crew_cents as number | null) ?? null));
    }
    if (ruleRow?.per_extra_unit_cents != null || countryRow?.per_extra_unit_cents != null) {
      priceFields.push(priceField("per_unit", "Price per extra item",
        "Charged for each item beyond the included count.",
        countryRow?.per_extra_unit_cents, (ruleRow?.per_extra_unit_cents as number | null) ?? null));
    }

    const numberFields: NumberField[] = [];
    if (ruleRow?.included_minutes != null) {
      numberFields.push({
        key: "included_minutes", label: "Included time",
        value: ruleRow.included_minutes as number, unit: "minutes",
        help: "BILLABLE. The engine charges extra blocks beyond this — it is not the arrival estimate.",
      });
    }
    if (ruleRow?.extra_block_minutes != null) {
      numberFields.push({
        key: "extra_block_minutes", label: "Extra block",
        value: ruleRow.extra_block_minutes as number, unit: "minutes",
        help: "The size of one chargeable block. Blocks are started, not prorated.",
      });
    }
    if (ruleRow?.included_units != null && ruleRow?.unit_field) {
      numberFields.push({
        key: "included_units", label: "Included items",
        value: ruleRow.included_units as number, unit: "count", help: null,
      });
    }

    /*
      THE PREVIEW IS THE REAL ENGINE. priceService() is the same
      function that quotes a customer, so a number here that is wrong is
      a number that is wrong at booking too — which is the entire point
      of previewing before publishing.
    */
    const baseCents = countryRow?.base_price_cents ?? s.base_price_cents;
    /*
      THE WHOLE RULE IS LOCALISED, NOT JUST THE BASE.

      This read the Canadian base price and then priced the extra time
      from the rule's single value, so Errand Runner previewed at
      CA$40.00 + 2 x CA$8.75 when Canada charges CA$10.00 a block — the
      base localised, the block forgotten. That is the precise bug
      localizeRule() was written for, and the preview has to go through
      it for the same reason every other surface does.
    */
    const localRule = localizeRule(
      rule,
      countryRows.filter((c) => c.service_id === id) as CountryPrice[],
      market,
    );
    const durationKey = localRule?.durationField ?? "duration_min";
    const crewKey = localRule?.crewField ?? null;
    const previewValues: Record<string, string> = { [durationKey]: "90" };
    if (crewKey) previewValues[crewKey] = "1";
    const priced = priceService(baseCents, localRule, previewValues);
    const withFee = priceTask(priced.subtotalCents);

    const intake = intakeFor(id);
    const markets = (s.countries ?? []) as string[];

    return {
      id: s.id,
      title: s.title,
      status: (s.active ? "published" : "archived") as ServiceStatus,
      model: modelOf(ruleRow),
      category: categoryLabel.get(s.category_id ?? "") ?? s.category_id ?? "—",
      image_url: s.image_url,
      content: {
        blurb: s.blurb ?? "",
        arrival_estimate: s.eta_label ?? "",
        inclusions: [],
        exclusions: [],
        preparation: s.tagline ?? "",
      },
      market,
      currency,
      price_fields: priceFields,
      number_fields: numberFields,
      service_fee_cents: SERVICE_FEE_CENTS,
      service_fee_scope: {
        services: all.filter((x) => x.active).length,
        markets: 2,
      },
      quote: {
        duration_minutes: 90,
        helpers: 1,
        lines: [
          ...priced.lines.map((l) => ({ label: l.label, amount_cents: l.cents })),
          { label: "Service fee", amount_cents: SERVICE_FEE_CENTS },
        ],
        total_cents: withFee.totalCents,
        source: "Priced by the booking quote engine (priceService), the same function that quotes a customer.",
        /* Localised, like the figure — not the shared rule's numbers. */
        rule: ruleRow
          ? {
              included_minutes: (ruleRow.included_minutes as number | null) ?? null,
              extra_block_minutes: (ruleRow.extra_block_minutes as number | null) ?? null,
              extra_block_cents: localRule?.extraBlockCents ?? null,
              included_units: (ruleRow.included_units as number | null) ?? null,
              per_extra_unit_cents: localRule?.perExtraUnitCents ?? null,
            }
          : null,
      },
      /* A check that actually ran, rather than a tick nobody earned. */
      validation: countryRow
        ? {
            state: "passed" as CheckState,
            detail: `${market} has its own base price. Both markets are checked when the draft is reviewed; boundary durations, helper counts and required answers are not checked here.`,
          }
        : {
            state: "failed" as CheckState,
            detail: `${market} has no price of its own. Bookings in that market fall back to the shared base of ${(s.base_price_cents / 100).toFixed(2)}, which nobody chose for ${market}.`,
          },
      intake: (intake?.fields ?? []).map((f) => ({
        question: f.label,
        required: Boolean(f.required),
        kind: String(f.type),
        options: f.options?.map((o) => o.label),
      })),
      availability: (["CA", "US"] as Market[]).map((m) => ({
        market: m,
        bookable: s.active && markets.includes(m),
        in_app_launch_scope: s.active && markets.includes(m),
        note: s.active
          ? "This console has one flag, not two: a live service is both bookable and in the app's catalogue. Separating them needs a column that does not exist yet."
          : "Archived — not bookable anywhere, and not in the app's catalogue.",
      })),
      history: ((scopeHistory.data ?? []) as {
        service_id: string; was_active: boolean; changed_at: string; reason: string | null;
      }[])
        .filter((h) => h.service_id === id)
        .sort((a, b) => (a.changed_at < b.changed_at ? 1 : -1))
        .map((h) => ({
          at: new Date(h.changed_at).toISOString().slice(0, 10),
          actor: "Staff",
          summary: h.was_active ? "Was live before this change" : "Was already archived",
          reason: h.reason,
        })),
      /* No drafts table, so nothing is ever pending publication. */
      draft_id: openDraft?.id ?? null,
      draft_updated_at: openDraft?.updated_at ?? null,
      /*
        WHAT WOULD CHANGE IF THIS WERE PUBLISHED. The "from" is the
        value the draft was built on, which is what the publish check
        compares against — not today's value, or the list would agree
        with itself while the publish refused.
      */
      draft_changes: Object.entries(openDraft?.changes ?? {}).map(([field, to]) => ({
        field: FIELD_LABEL[field] ?? field,
        from: describe(field, (openDraft?.based_on ?? {})[field]),
        to: describe(field, to),
      })),
    };
  }

  return {
    sample: false,
    writable: false,
    can: { save_draft: true, publish: true, discard: true },
    as_of: new Date().toISOString(),
    counts: {
      launch_services: all.filter((s) => s.active).length,
      archived: archived.length,
      /* No drafts table exists, so nothing can be waiting to publish. */
      draft_changes: drafts.length,
      validation_issues: validationIssues,
    },
    rows,
    archived_preview: archived.slice(0, 4).map((s) => ({
      id: s.id, title: s.title, image_url: s.image_url,
    })),
    checks: [
      { key: "app_scope", label: "App launch scope", state: "not_checked",
        detail: "Would compare the catalogue against the services submitted with the current iOS build. Nothing here does that yet." },
      { key: "public_catalogue", label: "Public catalogue", state: "not_checked",
        detail: "Would compare the website directory, service pages, city pages and sitemap against this list." },
      { key: "archived_content", label: "Archived content", state: "not_checked",
        detail: "Would confirm archived services still hold their photos, intake and pricing for restoring." },
    ],
    selected,
  };
}
