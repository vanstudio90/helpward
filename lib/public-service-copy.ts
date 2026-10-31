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
  name: string;
  /** <title>. */
  title: string;
  /** On-page H1. */
  h1: string;
  /**
    Opening paragraph. Leads with the need, then names the product once
    so the bridge from search phrase to catalogue title is explicit.
  */
  intro: string;
  /** Meta description and the `description` in Service structured data. */
  description?: string;
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
  },

  "house-check-in": {
    name: "Home Check-In While You're Away",
    title: "Home Check-In While You're Away — House Visits | Helpward",
    h1: "Home check-in while you're away",
    intro:
      "Someone calls at your house while you are travelling: checks the locks, waters the plants, "
      + "brings in the mail and sends you a photo report. On Helpward this is the House Check-In "
      + "service — book a single visit, or one for each week you are gone.",
  },

  "wait-in-line": {
    name: "Hire Someone to Wait in Line",
    title: "Hire Someone to Wait in Line — Queue Holding | Helpward",
    h1: "Hire someone to wait in line",
    intro:
      "Spend someone else's hours in the queue instead of your own. On Helpward this is the "
      + "Wait in Line service: a helper holds a place in an eligible queue for as long as you "
      + "book, then hands it over where the venue allows it. You are paying for their time.",
  },

  "property-inspection": {
    name: "Property Photo & Condition Visit",
    title: "Property Photo & Condition Visit — Dated Report | Helpward",
    h1: "Property photo and condition visit",
    intro:
      "A visit to a property, photographs, and a written note of what was visible on the day. "
      + "On Helpward this is the Property Inspection service. It is a record of a visit — not a "
      + "technical, pre-purchase or code inspection, and the helper is not a licensed inspector.",
  },
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
