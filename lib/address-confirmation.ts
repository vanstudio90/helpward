// What changed between what the customer typed and what Mapbox resolved,
// and whether that change is one they must look at.
//
// Background: requiring exact/high confidence refused roughly a quarter of
// real addresses in San Diego, where street names routinely carry a
// directional or a numeric variant — "202 C St" resolves to "202 East C
// Street", "1200 Third Ave" to "1200 3rd Avenue". Both come back medium.
//
// Medium is not "probably fine". Mapbox documents that medium confidence
// can involve CORRECTED components, so a matched house number alone does
// not establish the intended street. Medium therefore means "show the
// customer what we matched and make them agree", and the significance of
// each change decides how loudly.

export type ChangeKind =
  | "directional"   // East/West/North/South added, removed or swapped
  | "street"        // a different street name entirely
  | "city"
  | "postcode"
  | "number"        // the house number itself changed
  | "formatting";   // Third -> 3rd, Avenue -> Ave, punctuation, case

export type AddressChange = {
  kind: ChangeKind;
  from: string;
  to: string;
  /** Significant changes are highlighted and block silent acceptance. */
  significant: boolean;
  /** Shown to the customer. */
  note: string;
};

const DIRECTIONS: Record<string, string> = {
  n: "North", north: "North",
  s: "South", south: "South",
  e: "East", east: "East",
  w: "West", west: "West",
  ne: "Northeast", northeast: "Northeast",
  nw: "Northwest", northwest: "Northwest",
  se: "Southeast", southeast: "Southeast",
  sw: "Southwest", southwest: "Southwest",
};

// Ordinal and street-type spellings that mean the same thing. These are
// the changes a customer does NOT need to re-read.
const ORDINALS: Record<string, string> = {
  first: "1st", second: "2nd", third: "3rd", fourth: "4th", fifth: "5th",
  sixth: "6th", seventh: "7th", eighth: "8th", ninth: "9th", tenth: "10th",
  eleventh: "11th", twelfth: "12th",
};

const STREET_TYPES: Record<string, string> = {
  st: "street", str: "street", street: "street",
  ave: "avenue", av: "avenue", avenue: "avenue",
  rd: "road", road: "road",
  blvd: "boulevard", boulevard: "boulevard",
  dr: "drive", drive: "drive",
  ln: "lane", lane: "lane",
  ct: "court", court: "court",
  pl: "place", place: "place",
  pkwy: "parkway", parkway: "parkway",
  hwy: "highway", highway: "highway",
  ter: "terrace", terrace: "terrace",
  cres: "crescent", crescent: "crescent",
  way: "way",
};

function words(s: string): string[] {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[.,#]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** Collapse spelling variants so only real differences survive. */
function canonicalWord(w: string): string {
  if (ORDINALS[w]) return ORDINALS[w];
  if (STREET_TYPES[w]) return STREET_TYPES[w];
  return w;
}

// State and province abbreviations against the words a geocoder spells
// them out as. Without these, "San Diego, CA" vs "San Diego, California"
// reads as an unmatched word and every single address looks changed.
const REGION_ALIASES: Record<string, string[]> = {
  ca: ["california"], california: ["ca"],
  bc: ["british", "columbia"], columbia: ["bc"],
  wa: ["washington"], or: ["oregon"], nv: ["nevada"], az: ["arizona"],
  ny: ["new", "york"], il: ["illinois"], tx: ["texas"], fl: ["florida"],
  on: ["ontario"], qc: ["quebec"], ab: ["alberta"],
  usa: ["united", "states"], us: ["united", "states"],
};

/** Every spelling that should count as "this word is present". */
function acceptableForms(w: string): string[] {
  const forms = new Set<string>([w, canonicalWord(w)]);
  for (const alias of REGION_ALIASES[w] ?? []) forms.add(alias);
  return [...forms];
}

function directionsIn(tokens: string[]): string[] {
  return tokens.filter((t) => t in DIRECTIONS).map((t) => DIRECTIONS[t]);
}

function houseNumber(tokens: string[]): string | null {
  // The first purely numeric (or numeric-with-letter) token, which is how
  // North American street addresses start.
  for (const t of tokens) {
    if (/^\d+[a-z]?$/.test(t)) return t;
    break;
  }
  return null;
}

export type ResolutionReview = {
  changes: AddressChange[];
  /** Any significant change means the customer must actively agree. */
  needsConfirmation: boolean;
  /**
   * The customer omitted a directional and Mapbox supplied one. "C Street"
   * exists as both East and West in San Diego, so accepting Mapbox's pick
   * silently is how a helper ends up on the wrong side of the city.
   */
  directionAdded: string | null;
};

/**
 * Compare what the customer typed with what the geocoder returned.
 *
 * This explains WHAT changed. It does not decide whether confirmation is
 * required — that is the caller's job, because Mapbox's own `medium`
 * confidence requires confirmation even when nothing visibly changed
 * (medium can mean a component was corrected in a way the formatted string
 * does not reveal).
 *
 * Deliberately conservative: anything not recognised as a pure spelling or
 * abbreviation variant counts as significant, because the cost of a missed
 * difference is a helper at the wrong building.
 */
export function reviewResolution(typed: string, resolved: string): ResolutionReview {
  const t = words(typed);
  const r = words(resolved);

  const changes: AddressChange[] = [];

  // --- house number -------------------------------------------------------
  const tNum = houseNumber(t);
  const rNum = houseNumber(r);
  if (tNum && rNum && tNum !== rNum) {
    changes.push({
      kind: "number", from: tNum, to: rNum, significant: true,
      note: `House number changed from ${tNum} to ${rNum}`,
    });
  }

  // --- directionals -------------------------------------------------------
  const tDir = directionsIn(t);
  const rDir = directionsIn(r);
  let directionAdded: string | null = null;

  if (tDir.length === 0 && rDir.length > 0) {
    directionAdded = rDir[0];
    changes.push({
      kind: "directional", from: "(none)", to: rDir[0], significant: true,
      note: `We added "${rDir[0]}" — check this is the right side of the street`,
    });
  } else if (tDir.length > 0 && rDir.length === 0) {
    changes.push({
      kind: "directional", from: tDir[0], to: "(none)", significant: true,
      note: `We dropped "${tDir[0]}"`,
    });
  } else if (tDir.length > 0 && rDir.length > 0 && tDir[0] !== rDir[0]) {
    changes.push({
      kind: "directional", from: tDir[0], to: rDir[0], significant: true,
      note: `Direction changed from ${tDir[0]} to ${rDir[0]}`,
    });
  }

  // --- everything else, compared after collapsing spelling variants -------
  const canon = (xs: string[]) =>
    xs.filter((w) => !(w in DIRECTIONS) && !/^\d+[a-z]?$/.test(w)).map(canonicalWord);

  const tc = canon(t);
  const rc = canon(r);

  // Words the customer typed that survive canonicalisation but are absent
  // from the result — a real difference in the street or place name.
  // A word counts as present if ANY of its accepted spellings appears, so
  // "CA" is satisfied by "California".
  const missing = tc.filter((w) => !acceptableForms(w).some((f) => rc.includes(f) || r.includes(f)));
  if (missing.length > 0) {
    changes.push({
      kind: "street", from: missing.join(" "), to: rc.join(" "), significant: true,
      note: `We couldn't match "${missing.join(" ")}"`,
    });
  }

  // Pure spelling normalisation, recorded but not significant.
  for (const w of t) {
    const c = canonicalWord(w);
    if (c !== w && r.includes(c)) {
      changes.push({
        kind: "formatting", from: w, to: c, significant: false,
        note: `"${w}" written as "${c}"`,
      });
    }
  }

  return {
    changes,
    needsConfirmation: changes.some((c) => c.significant),
    directionAdded,
  };
}

/**
 * Do several candidates differ only by direction?
 *
 * "202 C St" matching both East and West C Street is the case where we must
 * make the customer pick rather than ranking for them.
 */
export function differOnlyByDirection(formatted: string[]): boolean {
  if (formatted.length < 2) return false;
  const stripped = formatted.map((f) =>
    words(f).filter((w) => !(w in DIRECTIONS)).map(canonicalWord).join(" "),
  );
  return stripped.every((s) => s === stripped[0]);
}

/** Short label for a candidate in a selection list. */
export function candidateLabel(formatted: string): string {
  return formatted.replace(/,\s*(United States|Canada)$/i, "");
}
