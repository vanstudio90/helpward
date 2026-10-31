/*
  WHAT ACTUALLY DIFFERS BETWEEN ONE CITY PAGE AND ANOTHER.

  The 52 local pages were 96.6% identical once the city name was
  normalised out. They were the same page with a word swapped, which is
  both bad for a reader and exactly the pattern a search engine discounts.

  The honest fix is not more adjectives about a city. It is the handful
  of things that genuinely change the booking, and every line here is
  checkable:

    - The service area, and what sits just outside it. Vancouver covers
      several municipalities; San Diego covers one, and the cities around
      it are separate municipalities we do not serve. That is the
      difference most likely to waste somebody's time.
    - The currency a card is actually charged in.
    - Province versus state, which is the word the forms already use.
    - One practical consequence of the local geography, tied to the real
      pricing model: Helpward prices by time booked, so geography costs
      time rather than a distance fee.

  Nothing invented: no helper counts, no neighbourhood lists dressed up
  as coverage, no local demand claims.
*/

export type CityCopy = {
  /** Precisely what the service area is. */
  coverage: string;
  /** Places people assume are included. Empty where there is no such trap. */
  notCovered: string[];
  currency: "CAD" | "USD";
  /** The word the address form uses here. */
  regionWord: "province" | "state";
  /**
    A true local consequence for a TIME-PRICED job.

    NOT a surcharge. priceService() reads the duration from the
    customer's own intake answer, never from started_at or elapsed time,
    and migration 0054 seals the priced intake at request time. So the
    helper's journey is not billable and booking longer does not pay for
    it — booking longer buys more time ON the task. Geography changes who
    can reach you and when, not what you are charged.
  */
  travelNote: string;
  /**
    The same for a FLAT-PRICED job, where it does not.

    The travel note was being shown on grocery collection, parcel
    delivery and returns — all flat-priced — telling customers to book
    longer for a bridge crossing on services where booking longer is not
    a thing you can do and the price never moves. That is an invented
    surcharge.
  */
  flatNote: string;
  /** The same page, for a service delivered down a phone line. */
  remoteNote: string;
};

export const CITY_COPY: Record<string, CityCopy> = {
  vancouver: {
    coverage:
      "Vancouver and the surrounding Lower Mainland. That is several municipalities rather than "
      + "one, so a request can cross a city boundary — Burnaby, Richmond, Surrey, the North Shore "
      + "— without leaving the service area.",
    notCovered: [],
    currency: "CAD",
    regionWord: "province",
    travelNote:
      "Getting around the Lower Mainland means bridges and tunnels, and a crossing at the wrong hour "
      + "is the difference between a helper accepting your request and leaving it. It does not change "
      + "the price: you pay for the time you book on the task, and the journey to reach you is not "
      + "billable. Book the time the job needs, and expect fewer helpers within reach at rush hour.",
    flatNote:
      "This one is a flat price, so a bridge or a tunnel between the two ends costs you nothing extra. "
      + "What it changes is who is willing to take the job and how long it takes them, which is why an "
      + "accurate collection point, destination and access detail matters more here than distance does.",
    remoteNote:
      "Nobody travels for this one, so where you are in the Lower Mainland makes no difference to "
      + "the booking or the price.",
  },

  "san-diego": {
    coverage:
      "The City of San Diego, within city limits only.",
    notCovered: [
      "Chula Vista",
      "National City",
      "Coronado",
      "La Mesa",
      "El Cajon",
      "Santee",
      "Imperial Beach",
      "Lemon Grove",
      "Poway",
    ],
    currency: "USD",
    regionWord: "state",
    travelNote:
      "San Diego city limits are an awkward shape, and a San Diego mailing address is not always inside "
      + "them — several neighbouring places are their own incorporated cities. Distance does not change "
      + "the price: you pay for the time you book on the task, not for the helper's journey. What it "
      + "changes is how many helpers are close enough to accept.",
    flatNote:
      "This one is a flat price, so distance costs you nothing extra. Where a job has two ends, give "
      + "both accurately: several neighbouring places are their own incorporated cities, and a San "
      + "Diego mailing address is not proof an address is inside the line. A helper decides whether "
      + "they can cover both ends before accepting.",
    remoteNote:
      "Nobody travels for this one, so the city-limits boundary does not apply the way it does to a "
      + "booking at an address.",
  },
};

/** The local facts for a city page, or null for a city with no entry. */
export function cityCopy(slug: string): CityCopy | null {
  return CITY_COPY[slug] ?? null;
}
