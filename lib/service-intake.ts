// What each service needs to know before a helper can actually do it.
//
// Every service used to share one form: address, when, free-text notes. That
// is fine for "wait in line" and useless for a designated driver, who has no
// destination field, or a mover, who is not told whether there are stairs or
// how many people are needed.
//
// These specs are the contract between three surfaces: the booking form
// collects them, the helper offer shows them, and the booking page keeps
// them. One definition so the three cannot drift.

export type IntakeOption = { value: string; label: string };

export type IntakeField = {
  key: string;
  label: string;
  /** Shown under the label when the ask needs explaining. */
  hint?: string;
  required: boolean;
  type: "text" | "textarea" | "number" | "select" | "duration" | "destination" | "checkboxes";
  placeholder?: string;
  options?: IntakeOption[];
  min?: number;
  max?: number;
  unit?: string;
  maxLength?: number;
};

export type ServiceIntake = {
  /** One line telling the customer why these questions are being asked. */
  intro?: string;
  fields: IntakeField[];
};

const YES_NO = (yes: string, no: string): IntakeOption[] => [
  { value: "yes", label: yes },
  { value: "no", label: no },
];

const DURATION: IntakeField = {
  key: "duration_min",
  label: "How long do you need?",
  required: true,
  type: "duration",
  options: [
    { value: "30", label: "30 minutes" },
    { value: "45", label: "45 minutes" },
    { value: "60", label: "1 hour" },
    { value: "90", label: "1.5 hours" },
    { value: "120", label: "2 hours" },
    { value: "180", label: "3 hours" },
    { value: "240", label: "4 hours" },
    { value: "480", label: "A full day (8 hours)" },
  ],
};

const DESTINATION: IntakeField = {
  key: "destination",
  label: "Where to?",
  hint: "The drop-off address. Your helper needs this before they accept.",
  required: true,
  type: "destination",
  placeholder: "e.g. 1055 Canada Pl, Vancouver, BC",
  maxLength: 300,
};

const ACCESS: IntakeField = {
  key: "access",
  label: "How does your helper get in?",
  hint: "Buzzer, lockbox, gate code, where to park, who to ask for.",
  required: true,
  type: "textarea",
  maxLength: 600,
};

const DRESS_CODE: IntakeField = {
  key: "dress_code",
  label: "Dress code",
  required: true,
  type: "select",
  options: [
    { value: "casual", label: "Casual" },
    { value: "smart-casual", label: "Smart casual" },
    { value: "business", label: "Business" },
    { value: "formal", label: "Formal / black tie" },
  ],
};

const MEETING_POINT: IntakeField = {
  key: "meeting_point",
  label: "Where should you meet?",
  hint: "The venue name or a specific spot — not just the street.",
  required: true,
  type: "text",
  maxLength: 200,
};

const CONTEXT: IntakeField = {
  key: "context",
  label: "What should your helper know?",
  hint: "Names, how you know each other, anything to avoid.",
  required: false,
  type: "textarea",
  maxLength: 1000,
};

/** Companionship services share the same shape. */
function companionship(extra: IntakeField[] = []): ServiceIntake {
  return {
    intro: "So your helper arrives prepared and dressed for it.",
    fields: [DURATION, MEETING_POINT, DRESS_CODE, ...extra, CONTEXT],
  };
}

/** Remote services are delivered by call, so the method matters most. */
function remoteCall(extra: IntakeField[] = []): ServiceIntake {
  return {
    intro: "This one happens by call, so we need to know how to reach you.",
    fields: [
      DURATION,
      {
        key: "contact_method",
        label: "How should your helper reach you?",
        required: true,
        type: "select",
        options: [
          { value: "app-voice", label: "Voice call in the Helpward app" },
          { value: "app-video", label: "Video call in the Helpward app" },
          { value: "phone", label: "My phone number" },
        ],
      },
      ...extra,
      CONTEXT,
    ],
  };
}

export const SERVICE_INTAKE: Record<string, ServiceIntake> = {
  // ---------------------------------------------------------------- driving
  "designated-driver": {
    intro: "Your helper drives your car, so they need the route and the vehicle.",
    fields: [
      DESTINATION,
      {
        key: "transmission",
        label: "Transmission",
        hint: "Not every driver can drive a manual — this decides who can accept.",
        required: true,
        type: "select",
        options: [
          { value: "automatic", label: "Automatic" },
          { value: "manual", label: "Manual" },
        ],
      },
      { key: "vehicle", label: "Make and model", required: true, type: "text",
        placeholder: "e.g. 2019 Toyota RAV4", maxLength: 120 },
      { key: "passengers", label: "Passengers travelling", required: true,
        type: "number", min: 1, max: 7, unit: "people" },
      { key: "pickup_detail", label: "Where exactly is the car?",
        hint: "Parkade level, street side, building entrance.",
        required: false, type: "text", maxLength: 200 },
    ],
  },
  "motorcycle-taxi": {
    intro: "A ride on the back of your helper's motorcycle.",
    fields: [
      DESTINATION,
      { key: "helmet", label: "Do you need a helmet provided?", required: true,
        type: "select", options: YES_NO("Yes, please provide one", "No, I have my own") },
      { key: "luggage", label: "Anything you're carrying?", required: false,
        type: "text", placeholder: "e.g. a backpack", maxLength: 120 },
    ],
  },
  "car-battery-jump": {
    intro: "So your helper brings the right leads and finds the car.",
    fields: [
      { key: "vehicle", label: "Make and model", required: true, type: "text",
        placeholder: "e.g. 2015 Honda Civic", maxLength: 120 },
      { key: "battery_location", label: "Where is the battery?", required: true,
        type: "select", options: [
          { value: "engine-bay", label: "Engine bay" },
          { value: "boot", label: "Boot / trunk" },
          { value: "under-seat", label: "Under a seat" },
          { value: "unsure", label: "Not sure" },
        ] },
      { key: "vehicle_location", label: "Where is the car parked?",
        hint: "Parkade level, street, driveway — and whether a second car can pull alongside.",
        required: true, type: "textarea", maxLength: 400 },
    ],
  },

  // ---------------------------------------------------------------- errands
  "errand-runner": {
    intro: "Tell your helper exactly what to do and where.",
    fields: [
      { key: "tasks", label: "What needs doing?", required: true, type: "textarea",
        placeholder: "One task per line", maxLength: 1000 },
      { key: "stops", label: "Where do they need to go?",
        hint: "Shops, offices or addresses, in order.",
        required: true, type: "textarea", maxLength: 600 },
      { key: "spend_cap", label: "Spending limit", required: false,
        type: "number", min: 0, max: 2000, unit: "$" },
    ],
  },
  "grocery-pickup": {
    intro: "Your shopping list and where to buy it.",
    fields: [
      { key: "store", label: "Which store?", required: true, type: "text",
        placeholder: "e.g. Save-On-Foods, Cambie St", maxLength: 200 },
      { key: "list", label: "Shopping list", required: true, type: "textarea",
        placeholder: "One item per line, with quantities", maxLength: 2000 },
      { key: "spend_cap", label: "Spending limit", required: true,
        type: "number", min: 5, max: 1000, unit: "$" },
      { key: "substitutions", label: "If something is out of stock", required: true,
        type: "select", options: [
          { value: "similar", label: "Substitute something similar" },
          { value: "ask", label: "Message me first" },
          { value: "skip", label: "Skip it" },
        ] },
    ],
  },
  "package-delivery": {
    intro: "Where to collect from, and what they're carrying.",
    fields: [
      { key: "pickup_from", label: "Collect from", required: true, type: "destination",
        hint: "The address your helper picks the package up from.",
        placeholder: "e.g. 200 Granville St, Vancouver", maxLength: 300 },
      { key: "size", label: "Package size", required: true, type: "select",
        options: [
          { value: "envelope", label: "Envelope or document" },
          { value: "small", label: "Small — fits in a backpack" },
          { value: "medium", label: "Medium — two hands" },
          { value: "large", label: "Large — awkward to carry alone" },
        ] },
      { key: "weight_kg", label: "Rough weight", required: false,
        type: "number", min: 0, max: 50, unit: "kg" },
      { key: "recipient", label: "Who receives it?", required: false,
        type: "text", placeholder: "Name, or leave with concierge", maxLength: 160 },
    ],
  },
  "package-return": {
    intro: "Returns need the carrier and the label sorted up front.",
    fields: [
      { key: "carrier", label: "Carrier", required: true, type: "select",
        options: [
          { value: "canada-post", label: "Canada Post" },
          { value: "ups", label: "UPS" },
          { value: "fedex", label: "FedEx" },
          { value: "usps", label: "USPS" },
          { value: "purolator", label: "Purolator" },
          { value: "other", label: "Other / not sure" },
        ] },
      { key: "label_status", label: "Return label", required: true, type: "select",
        options: [
          { value: "printed", label: "Printed and attached" },
          { value: "qr", label: "QR code — helper scans at the counter" },
          { value: "none", label: "No label yet" },
        ] },
      { key: "parcel_count", label: "How many parcels?", required: true,
        type: "number", min: 1, max: 10, unit: "parcels" },
      { key: "dropoff_point", label: "Preferred drop-off", required: false,
        type: "text", placeholder: "e.g. the depot on Main St", maxLength: 200 },
    ],
  },

  // -------------------------------------------------------------- home help
  "furniture-assembly": {
    intro: "So your helper brings the right tools and enough time.",
    fields: [
      { key: "items", label: "What needs assembling?", required: true, type: "textarea",
        placeholder: "e.g. 1 IKEA PAX wardrobe, 2 BILLY bookcases", maxLength: 800 },
      { key: "item_count", label: "Number of items", required: true,
        type: "number", min: 1, max: 20, unit: "items" },
      { key: "tools", label: "Tools", required: true, type: "select",
        options: [
          { value: "helper", label: "Helper brings tools" },
          { value: "mine", label: "I have tools here" },
        ] },
      { key: "disposal", label: "Packaging disposal?", required: false, type: "select",
        options: YES_NO("Yes, take it away", "No, leave it") },
    ],
  },
  "tv-mounting": {
    intro: "Wall type and mount decide whether this is a 20-minute job or not.",
    fields: [
      { key: "tv_size", label: "Screen size", required: true,
        type: "number", min: 19, max: 120, unit: "inches" },
      { key: "wall_type", label: "Wall type", required: true, type: "select",
        options: [
          { value: "drywall", label: "Drywall / plasterboard" },
          { value: "brick", label: "Brick" },
          { value: "concrete", label: "Concrete" },
          { value: "plaster", label: "Lath and plaster" },
          { value: "unsure", label: "Not sure" },
        ] },
      { key: "mount", label: "Mount bracket", required: true, type: "select",
        options: [
          { value: "have", label: "I have the bracket" },
          { value: "need", label: "I need one — advise me" },
        ] },
      { key: "cable_management", label: "Hide the cables?", required: false,
        type: "select", options: YES_NO("Yes", "No") },
    ],
  },
  "tech-setup": {
    intro: "Which devices, so your helper knows what they're walking into.",
    fields: [
      { key: "devices", label: "What needs setting up?", required: true,
        type: "checkboxes", options: [
          { value: "wifi", label: "Wi-Fi / router" },
          { value: "tv", label: "Smart TV or streaming" },
          { value: "computer", label: "Computer or laptop" },
          { value: "printer", label: "Printer" },
          { value: "smart-home", label: "Smart home devices" },
          { value: "phone", label: "Phone or tablet" },
        ] },
      { key: "detail", label: "What's the goal?", required: true, type: "textarea",
        placeholder: "e.g. get the new router working and the printer back on Wi-Fi",
        maxLength: 800 },
      { key: "credentials", label: "Do you have the passwords and accounts to hand?",
        required: true, type: "select",
        options: YES_NO("Yes", "No — I may need help recovering them") },
    ],
  },
  "appliance-repair": {
    intro: "A clear fault description decides whether a part is needed.",
    fields: [
      { key: "appliance", label: "Which appliance?", required: true, type: "select",
        options: [
          { value: "washer", label: "Washing machine" },
          { value: "dryer", label: "Dryer" },
          { value: "dishwasher", label: "Dishwasher" },
          { value: "fridge", label: "Fridge or freezer" },
          { value: "oven", label: "Oven or stove" },
          { value: "other", label: "Something else" },
        ] },
      { key: "make_model", label: "Make and model", required: true, type: "text",
        placeholder: "Usually on a sticker inside the door", maxLength: 160 },
      { key: "fault", label: "What's it doing?", required: true, type: "textarea",
        placeholder: "Noises, error codes, when it started", maxLength: 1000 },
      { key: "access_detail", label: "Where is it, and can it be moved?",
        required: false, type: "text", maxLength: 200 },
    ],
  },
  "maid-service": {
    intro: "Size of the place and what matters most to you.",
    fields: [
      { key: "bedrooms", label: "Bedrooms", required: true, type: "number", min: 0, max: 10, unit: "rooms" },
      { key: "bathrooms", label: "Bathrooms", required: true, type: "number", min: 1, max: 10, unit: "rooms" },
      { key: "focus", label: "Focus on", required: true, type: "checkboxes",
        options: [
          { value: "kitchen", label: "Kitchen" },
          { value: "bathrooms", label: "Bathrooms" },
          { value: "floors", label: "Floors" },
          { value: "laundry", label: "Laundry" },
          { value: "windows", label: "Windows" },
          { value: "tidy", label: "General tidy" },
        ] },
      { key: "supplies", label: "Cleaning supplies", required: true, type: "select",
        options: [
          { value: "mine", label: "I have supplies here" },
          { value: "helper", label: "Helper brings supplies" },
        ] },
      { key: "pets", label: "Pets at home?", required: false, type: "text",
        placeholder: "e.g. one friendly dog", maxLength: 120 },
    ],
  },
  "moving-help": {
    intro: "Crew size and stairs are what make a move go right or badly.",
    fields: [
      DESTINATION,
      { key: "crew_size", label: "How many helpers do you need?",
        hint: "Two people for a one-bed; three or four for a house.",
        required: true, type: "number", min: 1, max: 4, unit: "helpers" },
      { key: "inventory", label: "What's being moved?", required: true, type: "textarea",
        placeholder: "Rough list — beds, sofa, 20 boxes, washing machine", maxLength: 1500 },
      { key: "access_from", label: "Access at the pickup", required: true, type: "select",
        options: [
          { value: "ground", label: "Ground floor" },
          { value: "elevator", label: "Lift / elevator" },
          { value: "stairs-1", label: "One flight of stairs" },
          { value: "stairs-2plus", label: "Two or more flights" },
        ] },
      { key: "access_to", label: "Access at the destination", required: true, type: "select",
        options: [
          { value: "ground", label: "Ground floor" },
          { value: "elevator", label: "Lift / elevator" },
          { value: "stairs-1", label: "One flight of stairs" },
          { value: "stairs-2plus", label: "Two or more flights" },
        ] },
      { key: "vehicle", label: "Vehicle", required: true, type: "select",
        hint: "Helpward helpers do not provide trucks.",
        options: [
          { value: "have-van", label: "I have a van or truck booked" },
          { value: "car-loads", label: "Car loads only" },
          { value: "need-advice", label: "I need advice on what to book" },
        ] },
    ],
  },
  "house-check-in": {
    intro: "You won't be there, so access and tasks have to be exact.",
    fields: [
      ACCESS,
      { key: "tasks", label: "What should they do?", required: true, type: "checkboxes",
        options: [
          { value: "mail", label: "Collect mail" },
          { value: "plants", label: "Water plants" },
          { value: "bins", label: "Put bins out or back" },
          { value: "lights", label: "Change lights / blinds" },
          { value: "walkthrough", label: "Walk through and photograph" },
          { value: "post-update", label: "Send me an update" },
        ] },
      { key: "alarm", label: "Alarm", required: true, type: "select",
        options: [
          { value: "none", label: "No alarm" },
          { value: "code-in-notes", label: "Code is in my access notes" },
          { value: "call-me", label: "Call me on arrival" },
        ] },
      { key: "pets", label: "Pets at home?", required: false, type: "text", maxLength: 160 },
    ],
  },

  // -------------------------------------------------------------- lifestyle
  "dog-walking": {
    intro: "So your helper can handle your dog safely.",
    fields: [
      DURATION,
      { key: "dog_count", label: "How many dogs?", required: true,
        type: "number", min: 1, max: 4, unit: "dogs" },
      { key: "dog_size", label: "Size", required: true, type: "select",
        options: [
          { value: "small", label: "Small — under 10kg" },
          { value: "medium", label: "Medium — 10 to 25kg" },
          { value: "large", label: "Large — 25kg or more" },
        ] },
      { key: "leash_location", label: "Where are the lead and harness?",
        required: true, type: "text", maxLength: 200 },
      { key: "behaviour", label: "Anything your helper should know?",
        hint: "Pulling, reactivity to other dogs, recall, medication.",
        required: false, type: "textarea", maxLength: 600 },
      ACCESS,
    ],
  },
  "shopping-companion": companionship([
    { key: "shopping_for", label: "What are you shopping for?", required: true,
      type: "text", maxLength: 200 },
  ]),
  "date-companion": companionship(),
  "event-companion": companionship([
    { key: "event_type", label: "What kind of event?", required: true,
      type: "text", placeholder: "e.g. work Christmas party", maxLength: 160 },
  ]),
  "wedding-guest": companionship([
    { key: "relationship", label: "How do we know each other?",
      hint: "Your helper needs a consistent answer if someone asks.",
      required: true, type: "text", maxLength: 200 },
  ]),
  "family-standin": companionship([
    { key: "role", label: "Which role are they playing?", required: true,
      type: "text", placeholder: "e.g. a cousin", maxLength: 160 },
  ]),
  "rent-a-friend": companionship([
    { key: "activity", label: "What are you doing?", required: true,
      type: "text", maxLength: 200 },
  ]),
  "professional-cuddler": {
    intro: "A platonic, boundaries-first service. Both sides agree the terms up front.",
    fields: [
      DURATION,
      MEETING_POINT,
      { key: "setting", label: "Setting", required: true, type: "select",
        options: [
          { value: "my-place", label: "My home" },
          { value: "public", label: "A public place" },
        ] },
      { key: "boundaries", label: "Your boundaries", required: true, type: "textarea",
        hint: "This is shared with your helper before they accept. Be specific.",
        maxLength: 1000 },
      CONTEXT,
    ],
  },

  // --------------------------------------------------------------- presence
  "elder-assistance": {
    intro: "So your helper can support safely and at the right pace.",
    fields: [
      DURATION,
      { key: "support_with", label: "Help with", required: true, type: "checkboxes",
        options: [
          { value: "company", label: "Company and conversation" },
          { value: "errands", label: "Errands or shopping" },
          { value: "appointment", label: "Getting to an appointment" },
          { value: "meals", label: "Meal preparation" },
          { value: "light-housework", label: "Light housework" },
        ] },
      { key: "mobility", label: "Mobility", required: true, type: "select",
        options: [
          { value: "independent", label: "Fully mobile" },
          { value: "stick", label: "Uses a stick or frame" },
          { value: "wheelchair", label: "Uses a wheelchair" },
          { value: "assistance", label: "Needs steadying" },
        ] },
      { key: "notes", label: "Anything else your helper should know?",
        hint: "Hearing, memory, routines, what to avoid. No medical care is provided.",
        required: false, type: "textarea", maxLength: 1000 },
      ACCESS,
    ],
  },
  "listening-service": remoteCall([
    { key: "topic", label: "What would you like to talk about?",
      hint: "As much or as little as you want to say up front.",
      required: false, type: "textarea", maxLength: 800 },
  ]),
  "sleep-call-companion": remoteCall([
    { key: "wind_down", label: "How should the call end?", required: true,
      type: "select", options: [
        { value: "stay-until-asleep", label: "Stay on until I fall asleep" },
        { value: "fixed", label: "End at the agreed time" },
      ] },
  ]),
  "wait-in-line": {
    intro: "Your helper holds your place, so they need to know what for.",
    fields: [
      { key: "what_for", label: "What are they queuing for?", required: true,
        type: "text", placeholder: "e.g. passport office, concert tickets", maxLength: 200 },
      { key: "expected_wait", label: "Expected wait", required: true, type: "duration",
        options: DURATION.options },
      { key: "handover", label: "How does the handover work?", required: true,
        type: "select", options: [
          { value: "swap", label: "I arrive and take their place" },
          { value: "collect", label: "They collect something for me" },
        ] },
      { key: "documents", label: "Do they need anything from you?",
        hint: "ID, a ticket, a reference number, a form.",
        required: false, type: "text", maxLength: 200 },
    ],
  },

  // --------------------------------------------------------------- business
  "property-inspection": {
    intro: "An inspection produces a report, so the scope has to be agreed first.",
    fields: [
      ACCESS,
      { key: "property_type", label: "Property type", required: true, type: "select",
        options: [
          { value: "apartment", label: "Apartment or condo" },
          { value: "house", label: "House" },
          { value: "commercial", label: "Commercial unit" },
        ] },
      { key: "occupancy", label: "Is it occupied?", required: true, type: "select",
        options: [
          { value: "vacant", label: "Vacant" },
          { value: "tenanted", label: "Tenanted — notice given" },
          { value: "owner", label: "Owner present" },
        ] },
      { key: "scope", label: "What should the report cover?", required: true,
        type: "checkboxes", options: [
          { value: "condition", label: "General condition, room by room" },
          { value: "damage", label: "Damage and wear" },
          { value: "appliances", label: "Appliances working" },
          { value: "safety", label: "Smoke alarms and safety" },
          { value: "meters", label: "Meter readings" },
          { value: "exterior", label: "Exterior and grounds" },
        ] },
      { key: "report_format", label: "Report format", required: true, type: "select",
        options: [
          { value: "photos-notes", label: "Photos with written notes" },
          { value: "checklist", label: "Checklist only" },
        ] },
    ],
  },
};

/** The spec for a service, or null when it needs nothing beyond the basics. */
export function intakeFor(serviceId: string): ServiceIntake | null {
  return SERVICE_INTAKE[serviceId] ?? null;
}

export type IntakeValues = Record<string, string | string[]>;

export type IntakeValidation = { ok: true; values: IntakeValues } | { ok: false; error: string };

/**
 * Validate submitted intake against the spec. Server-side: the form can be
 * bypassed, and a helper accepting a job with half the details missing is
 * exactly the failure this is meant to prevent.
 */
export function validateIntake(serviceId: string, raw: IntakeValues): IntakeValidation {
  const spec = intakeFor(serviceId);
  if (!spec) return { ok: true, values: {} };

  const values: IntakeValues = {};
  for (const field of spec.fields) {
    const v = raw[field.key];
    const empty = v == null || (Array.isArray(v) ? v.length === 0 : String(v).trim() === "");

    if (empty) {
      if (field.required) return { ok: false, error: `${field.label} is required.` };
      continue;
    }

    if (field.type === "checkboxes") {
      const picked = (Array.isArray(v) ? v : [v]).map(String);
      const allowed = new Set((field.options ?? []).map((o) => o.value));
      if (picked.some((p) => !allowed.has(p))) {
        return { ok: false, error: `${field.label} has an unexpected value.` };
      }
      values[field.key] = picked;
      continue;
    }

    const str = String(Array.isArray(v) ? v[0] : v).trim();

    if (field.type === "select" || field.type === "duration") {
      const allowed = new Set((field.options ?? []).map((o) => o.value));
      if (!allowed.has(str)) return { ok: false, error: `Choose a valid ${field.label.toLowerCase()}.` };
    }

    if (field.type === "number") {
      const n = Number(str);
      if (!Number.isFinite(n)) return { ok: false, error: `${field.label} must be a number.` };
      if (field.min != null && n < field.min) return { ok: false, error: `${field.label} must be at least ${field.min}.` };
      if (field.max != null && n > field.max) return { ok: false, error: `${field.label} must be ${field.max} or less.` };
    }

    const cap = field.maxLength ?? 500;
    if (str.length > cap) return { ok: false, error: `${field.label} is too long (max ${cap}).` };

    values[field.key] = str;
  }
  return { ok: true, values };
}

/** Readable label for a stored value, for the helper offer and booking page. */
export function describeIntake(
  serviceId: string, values: IntakeValues | null | undefined,
): Array<{ label: string; value: string }> {
  const spec = intakeFor(serviceId);
  if (!spec || !values) return [];
  const out: Array<{ label: string; value: string }> = [];
  for (const field of spec.fields) {
    const v = values[field.key];
    if (v == null || (Array.isArray(v) && v.length === 0) || String(v).trim() === "") continue;

    let text: string;
    if (field.type === "checkboxes") {
      const picked = Array.isArray(v) ? v : [String(v)];
      text = picked
        .map((p) => field.options?.find((o) => o.value === p)?.label ?? p)
        .join(", ");
    } else if (field.type === "select") {
      text = field.options?.find((o) => o.value === String(v))?.label ?? String(v);
    } else if (field.type === "duration") {
      text = field.options?.find((o) => o.value === String(v))?.label ?? `${v} minutes`;
    } else if (field.type === "number" && field.unit) {
      text = `${v} ${field.unit}`;
    } else {
      text = String(v);
    }
    out.push({ label: field.label, value: text });
  }
  return out;
}
