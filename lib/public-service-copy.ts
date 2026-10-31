import { CITIES } from "@/lib/marketing";

/*
  PUBLIC MARKETING COPY — SEO PAGES ONLY.

  The database `title`, the service id and the URL slug are the product's
  identity: they appear in the app, in the booking form, in receipts and
  in support email, and nothing here changes them. What this file changes
  is only what a search visitor reads on a public page.

  Two separate jobs live here, and they are separate on purpose:

  1. NAMES. Six services carry an internal-sounding title. "Car Battery
     Jump" is what the catalogue calls it; "car jump-start service" is
     what someone types into Google. The public page can lead with the
     searched phrase and then name the product once, so the person who
     arrives from a search and the person who opens the app are plainly
     looking at the same thing.

  2. CLAIMS. Some catalogue blurbs assert things the very same page
     disclaims a few hundred pixels further down — "Background-checked
     companion" and "Insured cleaner", on pages whose FAQ says in plain
     words that background checks are not running and that Helpward
     carries no platform insurance. A page cannot both make and withdraw
     a claim. The override here is the public fix; the blurb itself still
     reaches the app and is flagged for a catalogue decision.

  Everything is keyed by service id, so a service with no entry renders
  exactly as the catalogue describes it.
*/

export type PublicServiceCopy = {
  /** Directory label, link text and the name in headings. */
  name?: string;
  /** <title>. */
  title?: string;
  /** On-page H1. */
  h1?: string;
  /**
    Opening paragraph. Leads with the need, then names the product once
    so the bridge from search phrase to catalogue title is explicit.
  */
  intro?: string;
  /** Meta description and the `description` in Service structured data. */
  description?: string;
  /**
    Services a customer with THIS need also wants.

    The old block listed whatever shared a category, so Dog Walking
    offered Date Companion, Rent-a-Friend and Wedding Guest — same
    taxonomy branch, nothing to do with a dog. These are chosen by what
    the next task actually is.
  */
  related?: string[];
};

export const PUBLIC_SERVICE_COPY: Record<string, PublicServiceCopy> = {
  "car-battery-jump": {
    name: "Car Jump-Start Service",
    title: "Car Jump-Start Service — Mobile Battery Boost | Helpward",
    h1: "Car jump-start service",
    intro:
      "A flat battery, someone there with cables and a portable jump pack, and no tow truck. "
      + "On Helpward this is booked as the Car Battery Jump service: tell us where the car is "
      + "and a nearby helper comes out to start it.",
    related: ["designated-driver", "errand-runner"],
  },

  "maid-service": {
    name: "House Cleaning & Maid Service",
    title: "House Cleaning & Maid Service — Book a Local Cleaner | Helpward",
    h1: "House cleaning and maid service",
    intro:
      "Dusting, vacuuming, kitchens, bathrooms and laundry, done by a cleaner you can book "
      + "again next week. On Helpward this is the Maid Service: choose the rooms and the hours, "
      + "and see the price before anything goes to a helper.",
    // "Insured cleaner" removed — Helpward carries no platform insurance,
    // which this page's own FAQ states.
    description:
      "A cleaner for dusting, vacuuming, kitchens, bathrooms and laundry — and the same cleaner "
      + "can be re-booked weekly.",
    related: ["house-check-in", "moving-help", "furniture-assembly"],
  },

  "elder-assistance": {
    name: "Senior Companionship & Everyday Help",
    title: "Senior Companionship & Everyday Help at Home | Helpward",
    h1: "Senior companionship and everyday help",
    intro:
      "Company, and a hand with the ordinary things — grocery trips, doctor visits, conversation, "
      + "light housekeeping. On Helpward this is the Elder Assistance service, booked by the hour "
      + "for a parent or grandparent, or for yourself.",
    // "Background-checked" removed — automated background checks are not
    // running, which this page's own FAQ states.
    description:
      "A companion for seniors — grocery trips, doctor visits, conversation and light "
      + "housekeeping, booked by the hour.",
    related: ["errand-runner", "grocery-pickup", "listening-service"],
  },

  "house-check-in": {
    name: "Home Check-In While You're Away",
    title: "Home Check-In While You're Away — House Visits | Helpward",
    h1: "Home check-in while you're away",
    intro:
      "Someone calls at your house while you are travelling: checks the locks, waters the plants, "
      + "brings in the mail and sends you a photo report. On Helpward this is the House Check-In "
      + "service — book a single visit, or one for each week you are gone.",
    related: ["dog-walking", "property-inspection", "maid-service"],
  },

  "wait-in-line": {
    name: "Hire Someone to Wait in Line",
    title: "Hire Someone to Wait in Line — Queue Holding | Helpward",
    h1: "Hire someone to wait in line",
    intro:
      "Spend someone else's hours in the queue instead of your own. On Helpward this is the "
      + "Wait in Line service: a helper holds a place in an eligible queue for as long as you "
      + "book, then hands it over where the venue allows it. You are paying for their time.",
    related: ["errand-runner", "event-companion"],
  },

  "property-inspection": {
    name: "Property Photo & Condition Visit",
    title: "Property Photo & Condition Visit — Dated Report | Helpward",
    h1: "Property photo and condition visit",
    intro:
      "A visit to a property, photographs, and a written note of what was visible on the day. "
      + "On Helpward this is the Property Inspection service. It is a record of a visit — not a "
      + "technical, pre-purchase or code inspection, and the helper is not a licensed inspector.",
    related: ["house-check-in", "maid-service"],
  },
  "designated-driver": { related: ["car-battery-jump", "event-companion"] },
  "dog-walking": { related: ["house-check-in", "errand-runner"] },
  "moving-help": { related: ["furniture-assembly", "maid-service", "package-delivery"] },
  "furniture-assembly": { related: ["moving-help", "tv-mounting", "tech-setup"] },
  "errand-runner": { related: ["grocery-pickup", "package-delivery", "package-return", "wait-in-line"] },
  "grocery-pickup": { related: ["errand-runner", "package-delivery"] },
  "package-delivery": { related: ["package-return", "errand-runner", "grocery-pickup"] },
  "package-return": { related: ["package-delivery", "errand-runner"] },
  "appliance-repair": { related: ["tech-setup", "house-check-in"] },
  "tv-mounting": { related: ["tech-setup", "furniture-assembly", "moving-help"] },
  "tech-setup": { related: ["tv-mounting", "appliance-repair", "furniture-assembly"] },
  "listening-service": { related: ["sleep-call-companion", "rent-a-friend"] },
  "sleep-call-companion": { related: ["listening-service", "rent-a-friend"] },
  "rent-a-friend": { related: ["event-companion", "shopping-companion", "listening-service"] },
  "date-companion": { related: ["event-companion", "rent-a-friend", "shopping-companion"] },
  "event-companion": { related: ["date-companion", "wedding-guest", "rent-a-friend"] },
  "shopping-companion": { related: ["errand-runner", "rent-a-friend", "elder-assistance"] },
  "wedding-guest": { related: ["event-companion", "family-standin", "date-companion"] },
  "family-standin": { related: ["wedding-guest", "event-companion"] },
  "motorcycle-taxi": { related: ["designated-driver", "car-battery-jump"] },
};

/** The public-facing name. Falls back to the catalogue title. */
export function publicServiceName(id: string, dbTitle: string): string {
  return PUBLIC_SERVICE_COPY[id]?.name ?? dbTitle;
}

/** The description for meta tags and structured data. */
export function publicServiceDescription(id: string, dbBlurb: string | null): string {
  return PUBLIC_SERVICE_COPY[id]?.description ?? dbBlurb ?? "";
}

/*
  WHAT EVERY BOOKING INCLUDES.

  The old list shipped the same six bullets to all 26 services and two of
  them contradicted each other: "charged when they mark it complete" sat
  directly above "held until you confirm the task is complete". Those are
  two different payment models. One is true — the card is authorised when
  a helper accepts and captured when the job is marked complete — so the
  list now says that once.

  It also promised "Real-time GPS tracking" on services delivered entirely
  by phone call, where there is no journey to track. `delivered_by_call`
  in the database decides which list a page gets, so this stays true when
  a service changes.
*/
export function includedPoints(opts: {
  cityName?: string;
  deliveredByCall: boolean;
}): string[] {
  const { cityName, deliveredByCall } = opts;

  if (deliveredByCall) {
    return [
      "Approved helper matched to your request",
      "Delivered by phone call — nothing to travel to, nothing to track",
      "In-app messaging before and after the call",
      "Card authorised when a helper accepts, charged once the call is complete",
      "24-hour dispute window with human support review",
      "24/7 customer support — call, chat, or email",
    ];
  }

  return [
    cityName ? `Approved local helper in ${cityName}` : "Approved local helper in your city",
    "Live helper location and in-app messaging while the job is on",
    "Card authorised when a helper accepts, charged once the job is marked complete",
    "24-hour dispute window with human support review",
    "24/7 customer support — call, chat, or email",
  ];
}

/*
  Where we operate, written from the city list rather than from memory.

  The hardcoded line said "The two California areas cover city limits
  only" on all 26 service pages. There is one California area. Vancouver
  is in British Columbia.
*/
export function coverageNote(): string {
  return CITIES.length === 1
    ? "Coverage is city limits only."
    : `${CITIES.length === 2 ? "Both" : "All"} areas cover city limits only.`;
}

/*
  WHAT DECIDES THE PRICE, per service, written from the pricing rule.

  Every page carried the same sentence: "Final pricing depends on
  distance, time, and any tip you add." Distance does not enter the
  price. `bookings.distance_cents` exists, defaults to zero, and no code
  path in the app, the API or any migration ever sets it — so a customer
  reading that sentence was being told their fare moves with a number
  that is always nought.

  Time only enters it where the service has a pricing rule, and seven of
  the twenty-six do not: those are a flat price for the visit. Rather
  than find a phrasing vague enough to be true of all of them, this
  builds the explanation from the rule itself, so it cannot drift from
  what price_service_cents() actually charges.
*/
export function pricingExplanation(opts: {
  baseCents: number;
  serviceFeeCents: number;
  rule: {
    includedMinutes: number | null;
    extraBlockMinutes: number | null;
    extraBlockCents: number | null;
    unitField: string | null;
    includedUnits: number;
    perExtraUnitCents: number | null;
    crewField: string | null;
    includedCrew: number;
    perExtraCrewCents: number | null;
  } | null;
}): { lead: string; points: string[] } {
  const { baseCents, serviceFeeCents, rule } = opts;
  const money = (c: number) =>
    c % 100 === 0 ? `$${(c / 100).toFixed(0)}` : `$${(c / 100).toFixed(2)}`;
  const mins = (m: number) => {
    if (m < 60) return `${m} minutes`;
    const h = m / 60;
    return `${Number.isInteger(h) ? h : h.toFixed(1)} hour${h === 1 ? "" : "s"}`;
  };

  const points: string[] = [];

  if (rule?.includedMinutes != null && rule.extraBlockMinutes && rule.extraBlockCents != null) {
    points.push(
      `${money(baseCents)} covers the first ${mins(rule.includedMinutes)}.`,
    );
    points.push(
      `Longer than that is ${money(rule.extraBlockCents)} per extra `
      + `${mins(rule.extraBlockMinutes)}. Blocks are started, not metered: `
      + `a job that runs ${rule.extraBlockMinutes + 1} minutes over is charged two blocks, `
      + `because a helper's time is booked rather than clocked.`,
    );
  } else {
    points.push(`${money(baseCents)} is the price for the visit, however long it takes.`);
  }

  if (rule?.unitField && rule.perExtraUnitCents != null) {
    const unit = rule.unitField.replace(/_count$/, "").replace(/_/g, " ");
    points.push(
      `${rule.includedUnits} ${unit}${rule.includedUnits === 1 ? "" : "s"} included; `
      + `${money(rule.perExtraUnitCents)} for each one after that.`,
    );
  }

  if (rule?.crewField && rule.perExtraCrewCents != null) {
    points.push(
      `${rule.includedCrew} helper${rule.includedCrew === 1 ? "" : "s"} included; `
      + `${money(rule.perExtraCrewCents)} for each extra helper you ask for.`,
    );
  }

  points.push(`A flat ${money(serviceFeeCents)} service fee is added once, whatever the job.`);
  points.push(
    "Distance does not change the price, and there is no surge pricing or "
    + "peak-hour markup. A tip is optional and entirely yours to set.",
  );
  points.push(
    "You see the whole figure on the review screen before the request reaches "
    + "a helper. Your card is authorised when one accepts and charged once the "
    + "job is marked complete.",
  );

  return {
    lead: rule?.includedMinutes != null
      ? "This service is priced by time booked."
      : "This service is a flat price.",
    points,
  };
}
