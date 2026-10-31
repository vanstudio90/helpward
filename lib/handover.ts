// How the helper and the customer actually meet, and what happens at each
// end of the job.
//
// This used to be a row in a design and nothing else: the booking form never
// asked, the server never stored it, and the helper never saw it. Where a
// service needed something like it — a dog's leash location, a venue
// handover — it was improvised as a free-text intake answer, which meant
// every service invented its own shape and none of them could be read back
// reliably.
//
// ONE SHARED COMPONENT, SERVICE-SPECIFIC WORDING. A delivery and a dog walk
// are both "who meets whom and what happens then", but asking a dog owner
// about a "recipient" is nonsense. Groups below carry the wording; the
// STRUCTURE and the KEYS are shared, so the app, the website and the helper
// view all read the same fields.
//
// WHAT IS SHAREABLE AND WHAT IS NOT. A broadcast offer reaches every
// candidate helper, including all the ones who decline. A candidate needs
// enough to judge the job — stairs, parking, which handover method — and
// nothing that identifies a person or opens a door. Fields are classified
// here, and the classification is ENFORCED ON THE SERVER: shareable answers
// live on the request, private ones live in `request_private_details`,
// which RLS opens only to the assigned helper. Hiding text in the interface
// is not enough; we know, because that is what the intake does today and a
// candidate can still read the drop-off address straight out of the row.

export const HANDOVER_VERSION = 1;

export type HandoverOption = { value: string; label: string };

export type HandoverField = {
  /** Stable, and part of the stored shape. Never rename one. */
  key: string;
  label: string;
  hint?: string;
  type: "text" | "textarea" | "select";
  options?: HandoverOption[];
  placeholder?: string;
  maxLength?: number;
  required?: boolean;
  /**
   * PRIVATE fields never go out with an offer.
   *
   * A meeting point, a recipient's name, an entry procedure: each of these
   * identifies a person or lets someone in. Shareable fields are the ones a
   * candidate needs to price the work — stairs, parking, handover method.
   */
  private?: boolean;
};

/** A stop is one end of the job. Most services have one; a delivery has two. */
export type HandoverSection = {
  /** Stable key in the stored object: "collection", "delivery", "session". */
  key: string;
  title: string;
  fields: HandoverField[];
};

export type HandoverSpec = {
  /** What the customer sees as the heading for the whole block. */
  label: string;
  /** One line on why it is being asked. */
  intro: string;
  sections: HandoverSection[];
};

// ---------------------------------------------------------------- options

const IF_UNAVAILABLE: HandoverOption[] = [
  { value: "contact_customer", label: "Call or message me" },
  { value: "leave_with_neighbour", label: "Leave with a neighbour" },
  { value: "return_to_collection", label: "Bring it back to me" },
];

const PARKING: HandoverOption[] = [
  { value: "driveway", label: "Driveway or private space" },
  { value: "street", label: "Street parking" },
  { value: "paid_nearby", label: "Paid parking nearby" },
  { value: "difficult", label: "Parking is difficult here" },
];

const ACCESS_LEVEL: HandoverOption[] = [
  { value: "ground", label: "Ground floor" },
  { value: "elevator", label: "Lift / elevator" },
  { value: "stairs-1", label: "One flight of stairs" },
  { value: "stairs-2plus", label: "Two or more flights" },
];

// ----------------------------------------------------------------- groups

const ERRANDS: HandoverSpec = {
  label: "Collection & delivery instructions",
  intro: "How your helper collects it, and what happens at the other end.",
  sections: [
    {
      key: "collection",
      title: "Collecting",
      fields: [
        {
          key: "method",
          label: "How does your helper collect it?",
          type: "select",
          required: true,
          options: [
            { value: "meet_customer", label: "Meet me" },
            { value: "collect_from_counter", label: "Collect from a counter or desk" },
            { value: "collect_from_person", label: "Collect from someone else" },
            { value: "outside", label: "It'll be left outside for them" },
          ],
        },
        {
          key: "meeting_point",
          label: "Where exactly?",
          hint: "The door, desk or spot they should go to.",
          type: "text",
          maxLength: 200,
          placeholder: "e.g. main entrance, ask at the counter",
          private: true,
        },
        {
          key: "instructions",
          label: "Anything they should say or show?",
          type: "textarea",
          maxLength: 600,
          placeholder: "e.g. ask for the prepaid collection under my name",
          private: true,
        },
      ],
    },
    {
      key: "delivery",
      title: "Delivering",
      fields: [
        {
          key: "method",
          label: "How should they hand it over?",
          type: "select",
          required: true,
          options: [
            { value: "meet_recipient", label: "Hand to the person" },
            { value: "leave_with_concierge", label: "Leave with reception or concierge" },
            { value: "leave_at_door", label: "Leave at the door" },
          ],
        },
        {
          key: "recipient",
          label: "Who receives it?",
          type: "text",
          maxLength: 160,
          placeholder: "A name, or the desk to leave it at",
          private: true,
        },
        {
          key: "instructions",
          label: "Delivery instructions",
          type: "textarea",
          maxLength: 600,
          placeholder: "e.g. meet at reception, buzz flat 4",
          private: true,
        },
        {
          key: "if_unavailable",
          label: "If nobody is there",
          hint: "Waiting at a door nobody answers is where these go wrong.",
          type: "select",
          required: true,
          options: IF_UNAVAILABLE,
        },
      ],
    },
  ],
};

const DOG_WALKING: HandoverSpec = {
  label: "Leash & handover",
  intro: "How your walker collects your dog, and how they bring them back.",
  sections: [
    {
      key: "collection",
      title: "Collecting your dog",
      fields: [
        {
          key: "method",
          label: "Who meets the walker?",
          type: "select",
          required: true,
          options: [
            { value: "meet_customer", label: "Me" },
            { value: "someone_home", label: "Someone else will be home" },
            { value: "key_access", label: "Nobody home — they let themselves in" },
          ],
        },
        {
          key: "meeting_point",
          label: "Where should they go?",
          type: "text",
          maxLength: 200,
          placeholder: "e.g. the side gate",
          private: true,
        },
        {
          key: "leash_location",
          label: "Where is the leash?",
          type: "text",
          maxLength: 200,
          placeholder: "e.g. hook by the front door",
          private: true,
        },
      ],
    },
    {
      key: "delivery",
      title: "Bringing them back",
      fields: [
        {
          key: "instructions",
          label: "Return instructions",
          type: "textarea",
          maxLength: 600,
          placeholder: "e.g. towel by the door, fresh water, latch the gate",
          private: true,
        },
      ],
    },
  ],
};

const VEHICLE: HandoverSpec = {
  label: "Meeting & vehicle access",
  intro: "Where to meet you, and how they get to the vehicle.",
  sections: [
    {
      key: "collection",
      title: "Meeting you",
      fields: [
        {
          key: "meeting_point",
          label: "Where should they meet you?",
          type: "text",
          required: true,
          maxLength: 200,
          placeholder: "e.g. hotel entrance, level 2 of the car park",
          private: true,
        },
        {
          key: "parking_level",
          label: "Parking level or bay",
          hint: "Helps them find you in a car park.",
          type: "text",
          maxLength: 120,
          placeholder: "e.g. Level 1, bay 12",
        },
        {
          key: "vehicle_identification",
          label: "How will they recognise the vehicle?",
          type: "text",
          maxLength: 160,
          placeholder: "e.g. silver estate, plate ending 4JK",
          private: true,
        },
        {
          key: "method",
          label: "Getting into the vehicle",
          type: "select",
          required: true,
          options: [
            { value: "keys_in_person", label: "I'll hand over the keys" },
            { value: "car_unlocked", label: "It'll be unlocked and ready" },
            { value: "keys_elsewhere", label: "The keys are somewhere else" },
          ],
        },
        {
          key: "instructions",
          label: "Anything else they need to know?",
          type: "textarea",
          maxLength: 600,
          private: true,
        },
      ],
    },
  ],
};

const HOME_VISIT: HandoverSpec = {
  label: "Arrival & access instructions",
  intro: "How your helper gets in, and who meets them.",
  sections: [
    {
      key: "collection",
      title: "Arriving",
      fields: [
        {
          key: "method",
          label: "Who meets your helper?",
          type: "select",
          required: true,
          options: [
            { value: "meet_customer", label: "Me" },
            { value: "someone_home", label: "Someone else will be home" },
            { value: "nobody_home", label: "Nobody will be home" },
          ],
        },
        {
          key: "meeting_point",
          label: "Which entrance?",
          type: "text",
          maxLength: 200,
          placeholder: "e.g. front door, side gate, flat 4 buzzer",
          private: true,
        },
        {
          key: "parking",
          label: "Parking",
          type: "select",
          options: PARKING,
        },
        {
          key: "instructions",
          label: "Access instructions",
          hint: "Keep codes and keys out of this — there's a private box for those below.",
          type: "textarea",
          maxLength: 600,
          placeholder: "e.g. buzz flat 4 and I'll come down",
          private: true,
        },
      ],
    },
  ],
};

const MOVING: HandoverSpec = {
  label: "Access at each location",
  intro: "Stairs, parking and who receives the items, at both ends.",
  sections: [
    {
      key: "collection",
      title: "At the pickup",
      fields: [
        { key: "access", label: "Access", type: "select", required: true, options: ACCESS_LEVEL },
        { key: "parking", label: "Parking", type: "select", options: PARKING },
        {
          key: "meeting_point",
          label: "Which entrance?",
          type: "text",
          maxLength: 200,
          private: true,
        },
        {
          key: "instructions",
          label: "Loading instructions",
          type: "textarea",
          maxLength: 600,
          private: true,
        },
      ],
    },
    {
      key: "delivery",
      title: "At the destination",
      fields: [
        { key: "access", label: "Access", type: "select", required: true, options: ACCESS_LEVEL },
        { key: "parking", label: "Parking", type: "select", options: PARKING },
        {
          key: "recipient",
          label: "Who receives the items?",
          type: "text",
          maxLength: 160,
          placeholder: "A name, or 'me'",
          private: true,
        },
        {
          key: "instructions",
          label: "Unloading instructions",
          type: "textarea",
          maxLength: 600,
          private: true,
        },
      ],
    },
  ],
};

const QUEUE: HandoverSpec = {
  label: "Handover plan",
  intro: "Where you take over, and when you expect to arrive.",
  sections: [
    {
      key: "collection",
      title: "The handover",
      fields: [
        {
          key: "meeting_point",
          label: "Where will you meet them?",
          type: "text",
          required: true,
          maxLength: 200,
          placeholder: "e.g. at their place in the queue, by the awning",
          private: true,
        },
        {
          key: "method",
          label: "Who takes over?",
          type: "select",
          required: true,
          options: [
            { value: "meet_customer", label: "Me" },
            { value: "someone_else", label: "Someone else" },
          ],
        },
        {
          key: "expected_arrival",
          label: "When do you expect to arrive?",
          hint: "Place-holding depends on the venue allowing it.",
          type: "text",
          maxLength: 120,
          placeholder: "e.g. 15 minutes before they reach the front",
        },
        {
          key: "instructions",
          label: "Anything else?",
          type: "textarea",
          maxLength: 600,
          private: true,
        },
      ],
    },
  ],
};

const COMPANIONSHIP: HandoverSpec = {
  label: "Meeting instructions",
  intro: "A public place to meet, and how you'll recognise each other.",
  sections: [
    {
      key: "collection",
      title: "Meeting",
      fields: [
        {
          key: "meeting_point",
          label: "Where will you meet?",
          hint: "A public place, for both of you.",
          type: "text",
          required: true,
          maxLength: 200,
          placeholder: "e.g. outside the station's main entrance",
          private: true,
        },
        {
          key: "instructions",
          label: "How will you recognise each other?",
          type: "textarea",
          maxLength: 600,
          placeholder: "e.g. I'll have a green coat and a tote bag",
          private: true,
        },
      ],
    },
  ],
};

const REMOTE: HandoverSpec = {
  label: "Session preferences",
  intro: "How you'd like the call to go. There's nothing to hand over.",
  sections: [
    {
      key: "session",
      title: "Your call",
      fields: [
        {
          key: "method",
          label: "How should they start?",
          type: "select",
          required: true,
          options: [
            { value: "call_me", label: "Call me at the booked time" },
            { value: "message_first", label: "Message me first" },
          ],
        },
        {
          key: "instructions",
          label: "Anything they should know?",
          type: "textarea",
          maxLength: 600,
          private: true,
        },
      ],
    },
  ],
};

// --------------------------------------------------------- service → group

const BY_SERVICE: Record<string, HandoverSpec> = {
  // Collection & delivery
  "errand-runner": ERRANDS,
  "package-delivery": ERRANDS,
  "package-return": ERRANDS,
  "grocery-pickup": ERRANDS,

  "dog-walking": DOG_WALKING,

  // A vehicle, a meeting point and a way in.
  "designated-driver": VEHICLE,
  "car-battery-jump": VEHICLE,
  "motorcycle-taxi": VEHICLE,

  // Someone comes to your home and does something there.
  "maid-service": HOME_VISIT,
  "furniture-assembly": HOME_VISIT,
  "appliance-repair": HOME_VISIT,
  "tv-mounting": HOME_VISIT,
  "tech-setup": HOME_VISIT,
  "property-inspection": HOME_VISIT,
  "house-check-in": HOME_VISIT,

  "moving-help": MOVING,
  "wait-in-line": QUEUE,

  // In person, and the meeting itself is the service.
  "date-companion": COMPANIONSHIP,
  "event-companion": COMPANIONSHIP,
  "family-standin": COMPANIONSHIP,
  "wedding-guest": COMPANIONSHIP,
  "rent-a-friend": COMPANIONSHIP,
  "shopping-companion": COMPANIONSHIP,
  "elder-assistance": COMPANIONSHIP,
  "professional-cuddler": COMPANIONSHIP,

  // Delivered as a call: no physical handover exists to describe.
  "listening-service": REMOTE,
  "sleep-call-companion": REMOTE,
};

export function handoverFor(serviceId: string): HandoverSpec | null {
  return BY_SERVICE[serviceId] ?? null;
}

// ------------------------------------------------------------- the payload

export type HandoverSectionValues = Record<string, string>;
export type HandoverValues = {
  version: number;
  [section: string]: number | HandoverSectionValues;
};

export type HandoverSplit = {
  /** Goes on the request, and out with offers. */
  shared: HandoverValues;
  /** Goes in `request_private_details`, and only to the assigned helper. */
  restricted: HandoverValues;
};

export type HandoverValidation =
  | { ok: true; split: HandoverSplit }
  | { ok: false; error: string };

/**
 * Validate a submitted handover block and split it by who may see it.
 *
 * Unknown sections and unknown keys are DROPPED rather than rejected, the
 * same way validateIntake treats the intake: a client that sends an extra
 * field should not be able to write it, and an older client that omits one
 * should not be refused. A missing REQUIRED answer is an error, because
 * that one the customer has to fix.
 */
export function validateHandover(
  serviceId: string,
  raw: unknown,
): HandoverValidation {
  const spec = handoverFor(serviceId);
  if (!spec) return { ok: true, split: emptySplit() };
  if (raw == null) return { ok: true, split: emptySplit() };
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "Handover details are not in the expected shape." };
  }

  const input = raw as Record<string, unknown>;
  const shared: HandoverValues = { version: HANDOVER_VERSION };
  const restricted: HandoverValues = { version: HANDOVER_VERSION };

  for (const section of spec.sections) {
    const submitted = input[section.key];
    const values =
      submitted && typeof submitted === "object" && !Array.isArray(submitted)
        ? (submitted as Record<string, unknown>)
        : {};

    const sharedSection: HandoverSectionValues = {};
    const restrictedSection: HandoverSectionValues = {};

    for (const field of section.fields) {
      const value = values[field.key];
      const text = value == null ? "" : String(value).trim();

      if (!text) {
        if (field.required) {
          return {
            ok: false,
            error: `${section.title}: ${field.label} is needed before we can send this.`,
          };
        }
        continue;
      }
      if (field.maxLength && text.length > field.maxLength) {
        return { ok: false, error: `${field.label} is too long.` };
      }
      if (field.type === "select") {
        const allowed = (field.options ?? []).some((o) => o.value === text);
        if (!allowed) {
          return { ok: false, error: `${field.label} has an answer we don't recognise.` };
        }
      }

      if (field.private) restrictedSection[field.key] = text;
      else sharedSection[field.key] = text;
    }

    if (Object.keys(sharedSection).length) shared[section.key] = sharedSection;
    if (Object.keys(restrictedSection).length) restricted[section.key] = restrictedSection;
  }

  return { ok: true, split: { shared, restricted } };
}

function emptySplit(): HandoverSplit {
  return {
    shared: { version: HANDOVER_VERSION },
    restricted: { version: HANDOVER_VERSION },
  };
}

/** True when nothing but the version number is in there. */
export function isHandoverEmpty(values: unknown): boolean {
  if (!values || typeof values !== "object") return true;
  return Object.keys(values as object).filter((k) => k !== "version").length === 0;
}

/**
 * Readable lines for a saved handover block.
 *
 * `shared` and `restricted` are merged by the CALLER, which is what decides
 * who sees what — this only formats. A viewer with no restricted half gets
 * the shareable lines and nothing invented in place of the rest.
 */
export function describeHandover(
  serviceId: string,
  shared: unknown,
  restricted?: unknown,
): Array<{ section: string; label: string; value: string }> {
  const spec = handoverFor(serviceId);
  if (!spec) return [];
  const out: Array<{ section: string; label: string; value: string }> = [];

  const read = (source: unknown, sectionKey: string, fieldKey: string): string => {
    if (!source || typeof source !== "object") return "";
    const section = (source as Record<string, unknown>)[sectionKey];
    if (!section || typeof section !== "object") return "";
    const value = (section as Record<string, unknown>)[fieldKey];
    return value == null ? "" : String(value);
  };

  for (const section of spec.sections) {
    for (const field of section.fields) {
      const raw = field.private
        ? read(restricted, section.key, field.key)
        : read(shared, section.key, field.key);
      if (!raw) continue;
      const text =
        field.type === "select"
          ? (field.options ?? []).find((o) => o.value === raw)?.label ?? raw
          : raw;
      out.push({ section: section.title, label: field.label, value: text });
    }
  }
  return out;
}
