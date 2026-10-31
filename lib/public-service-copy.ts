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
    related: ["designated-driver", "errand-runner"],
  },

  "errand-runner": {
    /*
      The catalogue blurb opens "Anything, anywhere" and offers to "pay
      by the hour or by task". There is no by-task price — service_pricing
      makes this time-booked — and "anywhere" is not a scope.
    */
    description:
      "Drop-offs, collections, post office and counter queues, and shopping within a spending "
      + "limit you set. Booked by the time you need, within the areas we cover.",
    related: ["grocery-pickup", "package-delivery", "package-return", "wait-in-line"],
  },

  "furniture-assembly": {
    /*
      The blurb says "Tools included". The booking form asks whether
      tools are needed, which means it is a question, not an inclusion.
      One rule, and it is the one the product actually implements.
    */
    description:
      "Flat-pack furniture built for you — beds, desks, dressers, shelves. The booking form "
      + "asks what the items are and whether tools are needed.",
    related: ["moving-help"],
  },

  "moving-help": {
    /*
      The blurb promises "Two strong helpers". service_pricing includes
      ONE and charges $100 for each additional helper, so the promise and
      the price disagreed on every page, card and schema description.
      The price engine is right; the sentence was wrong.
    */
    description:
      "Labour-only help with loading, unloading and carrying. One helper is included and you "
      + "can add more; the vehicle is yours to arrange.",
    related: ["furniture-assembly", "maid-service", "package-delivery"],
  },

  "package-delivery": {
    description:
      "One parcel collected and delivered across the areas we cover — documents, a key, a gift. "
      + "You give the collection point, the destination and who receives it.",
    related: ["package-return", "errand-runner", "grocery-pickup"],
  },

  "package-return": {
    /*
      The blurb named UPS, FedEx, USPS and Amazon — USPS does not operate
      in Vancouver — and promised "tracking sent to your phone", which
      nothing sends. The proof is a receipt the customer asks the helper
      for.
    */
    description:
      "Prepared returns collected and taken to the drop-off point you choose. You start the "
      + "return and supply the label or accepted QR code; the retailer decides the refund.",
    related: ["package-delivery", "errand-runner"],
  },

  "maid-service": {
    name: "House Cleaning & Maid Service",
    // "Insured cleaner" removed — Helpward carries no platform insurance,
    // which this page's own FAQ states.
    description:
      "A cleaner for dusting, vacuuming, kitchens, bathrooms and laundry — and the same cleaner "
      + "can be re-booked weekly.",
    related: ["house-check-in", "moving-help", "furniture-assembly"],
  },

  "elder-assistance": {
    name: "Senior Companionship & Everyday Help",
    // "Background-checked" removed — automated background checks are not
    // running, which this page's own FAQ states.
    description:
      "A companion for seniors — grocery trips, doctor visits, conversation and light "
      + "housekeeping, booked by the hour.",
    related: ["errand-runner", "grocery-pickup", "listening-service"],
  },

  "house-check-in": {
    name: "Home Check-In While You're Away",
    related: ["dog-walking", "property-inspection", "maid-service"],
  },

  "wait-in-line": {
    name: "Hire Someone to Wait in Line",
    related: ["errand-runner", "event-companion"],
  },

  "property-inspection": {
    name: "Property Photo & Condition Visit",
    related: ["house-check-in", "maid-service"],
  },
  "designated-driver": { related: ["car-battery-jump", "event-companion"] },
  "dog-walking": { related: ["house-check-in", "errand-runner"] },
  "grocery-pickup": { related: ["errand-runner", "package-delivery"] },
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
  WHERE WE OPERATE — one sentence, used on every service page.

  This has now been wrong twice in opposite directions. It began as "the
  two California areas cover city limits only" (there is one California
  area). I replaced that with "Both areas cover city limits only", which
  is accurate for San Diego and wrong for Vancouver: /cities correctly
  explains that coverage there spans several Lower Mainland
  municipalities, so every main page contradicted the coverage page.

  Written once, here, and it points at /cities rather than trying to
  summarise a multi-municipality area in a clause.
*/
export function coverageNote(): string {
  return "Available in the City of San Diego and supported municipalities across "
    + "Vancouver's Lower Mainland. Check your service address before requesting.";
}

/*
  WHAT DECIDES THE PRICE, per service, written from the pricing rule.

  Every page carried the same sentence: "Final pricing depends on
  distance, time, and any tip you add." Distance does not enter the
  price. `bookings.distance_cents` exists, defaults to zero, and nothing
  ever sets it.

  EVERY MONEY AMOUNT IS PER COUNTRY, not just the base. service_country_pricing
  overrides base_price_cents, extra_block_cents, per_extra_unit_cents and
  per_extra_crew_cents, and price_service_cents coalesces each one
  individually, so a page that localises the base and leaves the block at
  the catalogue value quotes a Canadian a US block price. Only the
  included time, the block length and the included quantities are shared.

  The caller supplies `amount`, which decides how a figure reads: both
  countries on a static page that cannot know who is looking, one on a
  city page that can.
*/

export type CountryAmount = { us: number; ca: number };

export type PricingFacts = {
  base: CountryAmount;
  serviceFeeCents: number;
  /** Per-country money for the rule, where the rule has that component. */
  block?: CountryAmount | null;
  unit?: CountryAmount | null;
  crew?: CountryAmount | null;
  rule: {
    includedMinutes: number | null;
    extraBlockMinutes: number | null;
    unitField: string | null;
    includedUnits: number;
    includedCrew: number;
  } | null;
  /** Renders one money amount — both figures, or just this country's. */
  amount: (a: CountryAmount) => string;
};

export function pricingExplanation(facts: PricingFacts): { lead: string; points: string[] } {
  const { base, serviceFeeCents, block, unit, crew, rule, amount } = facts;
  const mins = (m: number) => {
    if (m < 60) return `${m} minutes`;
    const h = m / 60;
    // "the first 1 hour" reads as a bug; "the first hour" is English.
    if (h === 1) return "hour";
    const words: Record<number, string> = { 2: "two hours", 3: "three hours", 4: "four hours" };
    return words[h] ?? `${Number.isInteger(h) ? h : h.toFixed(1)} hours`;
  };
  const fee = amount({ us: serviceFeeCents, ca: serviceFeeCents });
  const points: string[] = [];

  if (rule?.includedMinutes != null && rule.extraBlockMinutes && block) {
    points.push(`${amount(base)} covers the first ${mins(rule.includedMinutes)}.`);
    points.push(
      `Longer than that is ${amount(block)} per extra ${mins(rule.extraBlockMinutes)}. `
      + `Blocks are started, not metered: a job that runs ${rule.extraBlockMinutes + 1} minutes over `
      + `is charged two blocks, because a helper's time is booked rather than clocked.`,
    );
  } else {
    points.push(`${amount(base)} is the price for the visit, however long it takes.`);
  }

  if (rule?.unitField && unit) {
    const word = rule.unitField.replace(/_count$/, "").replace(/_/g, " ");
    points.push(
      `${rule.includedUnits} ${word}${rule.includedUnits === 1 ? "" : "s"} included; `
      + `${amount(unit)} for each one after that.`,
    );
  }

  if (crew) {
    points.push(
      `${rule?.includedCrew ?? 1} helper${(rule?.includedCrew ?? 1) === 1 ? "" : "s"} included; `
      + `${amount(crew)} for each extra helper you ask for.`,
    );
  }

  points.push(`A flat ${fee} service fee is added once, whatever the job.`);
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

/*
  WHY THE NEXT LINK IS USEFUL.

  A related-services block that prints six names and six prices tells a
  reader nothing about why any of them is here. These are one line each,
  phrased as the question the TARGET service answers, so the link earns
  its place: "Need your home checked while you are away? → Home Check-In".

  Keyed by the service being linked TO, so one line serves every page
  that points at it.
*/
export const RELATED_PROMPT: Record<string, string> = {
  "designated-driver": "Had a drink, with your own car to get home?",
  "car-battery-jump": "Dead battery instead?",
  "motorcycle-taxi": "Just need to get across town?",
  "dog-walking": "Dog needs a walk while you are out?",
  "maid-service": "Want the place cleaned afterwards?",
  "moving-help": "Need hands for the lifting?",
  "furniture-assembly": "Need furniture assembled after the move?",
  "tv-mounting": "Television still to go on the wall?",
  "tech-setup": "Devices that will not talk to each other?",
  "appliance-repair": "Something stopped working and you do not know why?",
  "errand-runner": "Need someone to choose and buy the items?",
  "grocery-pickup": "Order already placed and paid for?",
  "package-delivery": "One parcel to get across town?",
  "package-return": "Returns waiting by the door?",
  "house-check-in": "Need your home checked while you are away?",
  "property-inspection": "Want photographs and a note on the condition?",
  "wait-in-line": "A queue you would rather not stand in?",
  "elder-assistance": "Someone who could use company and a hand?",
  "listening-service": "Want somebody to talk to?",
  "sleep-call-companion": "Quiet company while you fall asleep?",
  "rent-a-friend": "Want company for something ordinary?",
  "date-companion": "Need a plus-one for dinner?",
  "event-companion": "Need a plus-one for the evening?",
  "shopping-companion": "Want company at the shops?",
  "wedding-guest": "Seats to fill at your own wedding?",
  "family-standin": "A briefed role to fill at your event?",
};

/** The reason a link is worth following, or null if nobody wrote one. */
export function relatedPrompt(id: string): string | null {
  return RELATED_PROMPT[id] ?? null;
}
