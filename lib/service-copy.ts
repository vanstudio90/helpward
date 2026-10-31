/*
 * Editorial content that is actually about the service.
 *
 * Measured before writing this: two DIFFERENT service pages were 78%
 * identical word-for-word, and the same service in two cities 87%. The
 * templates carried generic "What's included" and "Why Helpward" blocks, so
 * 78 public pages said nearly the same thing. Nothing on the Dog Walking
 * page told you to say where the lead is kept; nothing on the TV Mounting
 * page asked what the wall is made of.
 *
 * Each entry answers the questions a person actually has before booking
 * THAT service, and — more useful than any feature list — states what the
 * booking does NOT cover. Most bad bookings come from an assumption nobody
 * contradicted: that a jump start includes a new battery, that moving help
 * arrives with a truck, that a photo condition report is a building survey.
 *
 * ACCURACY RULES, because this copy is a promise:
 *   - Never assert a timeframe, guarantee or check the platform does not
 *     perform. Matching depends on a helper accepting; nothing here may
 *     imply otherwise.
 *   - Prices are never written here. They are rendered from the live
 *     country rate, because a number typed into copy is a number that
 *     goes stale the first time the rate card moves.
 *   - Boundaries are stated plainly rather than hedged. "This is not a
 *     licensed home inspection" is more use than "may not include".
 */

export type ServiceCopy = {
  /**
   * The page title, led by the problem rather than the product name.
   *
   * "Designated Driver" is what we call it. "Hire someone to drive me and
   * my car home" is what the person types. The title has to be the second
   * one or the page never reaches them — and a title that reads like a
   * catalogue entry also tells a human nothing about whether to click.
   */
  title: string;
  /** The h1. States the outcome, not the service name. */
  headline: string;
  /** What to put in the request, in this service's own terms. */
  brief: string;
  /**
   * Three to five real situations, in the words someone would use about
   * their own evening. Someone recognises their problem long before they
   * recognise a service category.
   */
  situations: string[];
  /** What the booking actually covers. */
  includes: string[];
  /** What it does not cover. The half that prevents a wasted booking. */
  excludes: string[];
  faqs: { q: string; a: string }[];
  /**
   * Services a reader might actually have meant instead.
   *
   * Several of these overlap enough to compete with each other — three
   * kinds of company, three ways to move a parcel, two kinds of property
   * visit. Saying plainly which is which gives each page a clearer subject
   * AND sends the reader to the one that fits, instead of letting them
   * book the wrong thing and find out on the day.
   */
  chooseBetween?: { slug: string; label: string; when: string }[];
};

/** Shared, true of every booking — stated once rather than per service. */
export const UNIVERSAL_FAQS: { q: string; a: string }[] = [
  {
    q: "Does submitting a request guarantee someone will come?",
    a: "No. Your request is offered to nearby helpers who offer that service, and one of them has to accept it. "
      + "Until that happens there is no booking. The request page shows its current status, so check there rather "
      + "than treating submission as a confirmed arrival.",
  },
  {
    q: "When is my card charged?",
    a: "Your card is authorised when a helper accepts — that places a hold, it does not take the money — and charged "
      + "when the task is marked complete. Your bank may ask you to confirm the authorisation before the booking can start.",
  },
  {
    q: "What does the total include?",
    a: "The service price for what you have asked for, plus a flat Helpward service fee. Both are shown before you submit. "
      + "Tips are optional, go entirely to your helper, and are never taken automatically.",
  },
];

export const SERVICE_COPY: Record<string, ServiceCopy> = {
  // ---------------------------------------------------------- transport
  "designated-driver": {
    title: "Hire a Designated Driver for Your Own Car",
    headline: "Get yourself and your car home after a night out",
    brief:
      "This is a driver for the car you already have, not a ride in someone else's. Give the pickup point, the "
      + "destination, and the make, model and transmission of your car — a helper who can only drive an automatic "
      + "cannot take a manual. Say how they will get the keys and whether there is anything about the car they "
      + "should know before setting off.",
    includes: [
      "One driver, driving your vehicle on the route you agree",
      "The route quoted before you submit, not a running meter",
      "Any passengers the vehicle legally seats, at no extra charge",
    ],
    excludes: [
      "A vehicle — this is a driver only, and the car must be roadworthy, insured and legal to drive",
      "Driving a vehicle the helper is not licensed or insured to operate",
      "Parking, tolls and fuel, unless you agree them separately in advance",
    ],
    situations: [
      "You drove to dinner or a celebration and have been drinking",
      "You want the car at home tonight rather than collecting it tomorrow",
      "You are too tired to drive safely and would rather not risk it",
      "You need someone to move your car for you on an agreed trip",
    ],
    faqs: [
      { q: "Is this a driver for my own car?",
        a: "Yes. A helper comes to you and drives your vehicle. If you want to be driven in someone else's car, this "
          + "is not that service." },
      { q: "What vehicle details should I provide?",
        a: "Make, model, and whether it is automatic or manual. Add anything unusual — a stiff clutch, a temperamental "
          + "handbrake, a roof box that changes the height — so the person accepting knows what they are agreeing to." },
      { q: "How is this different from a taxi?",
        a: "A taxi takes you in the driver's car and leaves with it. This leaves you and your car at the destination "
          + "together, which is the point if you need the car there tomorrow morning." },
    ],
    chooseBetween: [
      { slug: "car-battery-jump", label: "Car Battery Jump", when: "Your car won't start at all — that's a dead battery, not a driver" },
      { slug: "errand-runner", label: "Errand Runner", when: "You need the car taken somewhere but you're not travelling in it" },
    ],
  },

  "motorcycle-taxi": {
    title: "Motorcycle Taxi Service",
    headline: "A ride across the city on the back of a motorcycle",
    brief:
      "A ride on the back of a licensed rider's motorcycle, for one passenger. Say where you are going, whether you "
      + "need a helmet provided, and what you are carrying — a rucksack is usually fine, a suitcase is not. Availability "
      + "depends on riders being online in your area, which is narrower than for car-based services.",
    includes: [
      "One passenger, one journey, on the rider's own motorcycle",
      "A helmet provided if you ask for one in the request",
      "Space for what a rider can reasonably carry on their back",
    ],
    excludes: [
      "Luggage, large bags, or anything that cannot be worn or held safely",
      "More than one passenger per booking",
      "Any journey a rider judges unsafe for the weather or road conditions",
    ],
    situations: [
      "You're travelling alone with nothing more than a backpack",
      "You want a shorter trip across town than a car would take",
      "You're happy on a bike and the weather suits it",
    ],
    faqs: [
      { q: "Where is the service available?",
        a: "Only where a licensed rider is online and within range. That is a smaller area in practice than for car "
          + "services, so enter the exact pickup address to see whether a ride can be matched." },
      { q: "What passenger equipment is required?",
        a: "A helmet, which the rider can provide if you request one. Wear closed shoes, full-length clothing and nothing "
          + "that could catch." },
      { q: "What details do I need before booking?",
        a: "The pickup point, the destination, whether you need a helmet, and anything you are carrying. A rider may "
          + "decline if what you bring cannot be carried safely." },
    ],
    chooseBetween: [
      { slug: "designated-driver", label: "Designated Driver", when: "You have your own car and need someone to drive it" },
    ],
  },

  "car-battery-jump": {
    title: "Car Jump-Start Service & Battery Boost Help",
    headline: "Your car won't start and you need someone with leads",
    brief:
      "Someone comes to your vehicle with leads and attempts a jump start. Give the make, model and exact location, "
      + "including the level and bay if it is in a car park, and say whether the vehicle is accessible to another car "
      + "pulling alongside. A booster pack cannot reach a car wedged between two others.",
    includes: [
      "A call-out to your vehicle with jump leads or a booster pack",
      "A safe, competent attempt to start one accessible passenger vehicle",
      "Time on site to check the vehicle starts and runs",
    ],
    excludes: [
      "A replacement battery, which is a different job needing a part",
      "Towing, recovery, or work on a vehicle that is unsafe to approach",
      "Any promise that the car will start — a failed battery may not take a charge",
    ],
    situations: [
      "You turn the key and get a click, or nothing at all",
      "You left the lights on and came back to a flat battery",
      "You're in an underground car park and roadside assistance can't reach you",
      "You need the car running long enough to get it to a garage",
    ],
    faqs: [
      { q: "What vehicle information is needed?",
        a: "Make, model and year, and precisely where it is parked. If it is underground, say which level and bay — "
          + "finding the car is often the slowest part." },
      { q: "Can you help in a parking garage?",
        a: "Usually, if another vehicle can pull alongside or a booster pack can reach. Say it is underground when you "
          + "book so the helper brings the right equipment and knows about height limits." },
      { q: "What if a jump-start does not solve the problem?",
        a: "Then the battery or something charging it has failed, and you need a replacement or a diagnosis. You have "
          + "paid for the call-out and the attempt, which is what the booking buys. The helper can tell you what they saw." },
    ],
    chooseBetween: [
      { slug: "designated-driver", label: "Designated Driver", when: "The car runs fine — you just shouldn't be the one driving it" },
    ],
  },

  // -------------------------------------------------------------- home
  "furniture-assembly": {
    title: "Furniture Assembly & Flat-Pack Building Help",
    headline: "It arrived in boxes and it's still in boxes",
    brief:
      "Send the product link or model name, how many items there are, and whether anything needs fixing to a wall. "
      + "A link tells a helper more than a description ever will: it shows the instructions, the part count and the "
      + "realistic build time. Say which floor it is on and whether there is a lift.",
    includes: [
      "Assembly of the items you list, from their own instructions and parts",
      "Ordinary hand tools the helper brings",
      "Packaging gathered up and stacked where you ask",
    ],
    excludes: [
      "The furniture itself, and any missing or damaged parts from the box",
      "Wall fixings into brick, tile or concrete unless agreed first — those need specific anchors",
      "Electrical work, plumbing, or modifying the item beyond its instructions",
    ],
    situations: [
      "A flat-pack wardrobe has been leaning against the wall for three weeks",
      "You've moved in and there's a room's worth of furniture to build",
      "The instructions want two people and you're one",
      "Something needs fixing to a wall and you'd rather it were done properly",
    ],
    faqs: [
      { q: "Can I book IKEA furniture assembly?",
        a: "Yes, and a product link helps more than the name — it shows the helper the instructions and the part count "
          + "before they accept." },
      { q: "What product details should I share?",
        a: "The link or model, how many items, and whether anything must be fixed to a wall. Add the floor and whether "
          + "there is a lift if the boxes are still in the hall." },
      { q: "Are tools or parts included?",
        a: "Ordinary hand tools, yes. Parts, no — the item's own fixings come in the box, and anything missing has to "
          + "come from the retailer. Wall anchors for brick or tile should be agreed before the booking." },
    ],
    chooseBetween: [
      { slug: "moving-help", label: "Moving Help", when: "The furniture is built and needs carrying" },
      { slug: "tv-mounting", label: "TV Mounting", when: "It's a television going on a wall" },
    ],
  },

  "tv-mounting": {
    title: "TV Wall-Mounting & Installation Help",
    headline: "Your television, on the wall, safely",
    brief:
      "The wall decides this job. Say what it is made of — drywall, plaster, brick, concrete — and whether you already "
      + "have a bracket, plus the screen size and weight. Mounting above a fireplace, onto tile, or where cables must "
      + "disappear inside the wall is a different job and should be agreed before you book.",
    includes: [
      "Mounting one television on a wall that can take it, using your bracket",
      "Finding and fixing into suitable studs or using appropriate anchors",
      "Tidying the visible cable run on the surface",
    ],
    excludes: [
      "The bracket, which you supply or agree to have bought for you",
      "Running cables inside the wall, or any electrical work",
      "A guarantee the wall is suitable — a helper who finds it is not will stop and say so",
    ],
    situations: [
      "A new television is leaning against the wall it should be on",
      "You've bought a bracket and would rather not drill into the wrong thing",
      "You're not certain the wall will take the weight",
      "You want the cables tidied rather than hanging down",
    ],
    faqs: [
      { q: "Do I need my own wall bracket?",
        a: "Yes, and it must fit your screen's VESA pattern and weight. Check the TV's manual rather than its screen "
          + "size alone — two 55-inch sets can need different brackets." },
      { q: "What wall information is needed?",
        a: "What it is made of, and anything behind it you know about. Drywall with studs is routine; brick, concrete, "
          + "tile and hollow plasterboard without studs each need different fixings and should be agreed first." },
      { q: "Does the booking include cable concealment?",
        a: "Only on the surface — a tidy run, trunking if you supply it. Cables inside the wall means cutting into it, "
          + "which is a separate job and often needs an electrician." },
    ],
    chooseBetween: [
      { slug: "tech-setup", label: "Tech Setup", when: "It's mounted — you need it set up and connected" },
      { slug: "furniture-assembly", label: "Furniture Assembly", when: "It's a unit or stand that needs building" },
    ],
  },

  "moving-help": {
    title: "Moving Labour & Loading Help — Hire Helpers",
    headline: "You've got the van. You need the arms.",
    brief:
      "This is labour, not a van. Say how many helpers you need, for how long, what floor each end is on, whether "
      + "there is a lift, and the heaviest single item. A piano, a safe or an American fridge is worth naming "
      + "specifically — two people who expected boxes may not be able to move it.",
    includes: [
      "The helpers you book, for the time you book them",
      "Lifting, carrying, loading and unloading within what they can safely handle",
      "Stairs and long carries, where you have said so in advance",
    ],
    excludes: [
      "A truck, van or any vehicle — arrange that separately",
      "Boxes, tape, blankets and packing materials",
      "Anything needing specialist lifting equipment or a licensed removals operator",
    ],
    situations: [
      "You've hired a van and need two people to load it",
      "A sofa has to come down three flights and you can't do it alone",
      "Everything is boxed and you just need it carried",
      "A full removals firm quoted far more than the job is worth",
    ],
    faqs: [
      { q: "Is a moving truck included?",
        a: "No. This is labour only. Book or hire the vehicle yourself and the helpers load it." },
      { q: "How many helpers should I request?",
        a: "Two is the usual minimum for furniture, because most of it cannot be lifted alone. A one-bedroom flat with "
          + "lift access is often two people; stairs, or anything over about 50 kg, means more." },
      { q: "What should I disclose about stairs and heavy items?",
        a: "All of it, before booking. Floor numbers at both ends, whether lifts exist and fit, and the heaviest item by "
          + "name. Helpers price and plan from that; discovering it on the day is how a job runs out of time." },
    ],
    chooseBetween: [
      { slug: "furniture-assembly", label: "Furniture Assembly", when: "It needs building rather than carrying" },
      { slug: "package-delivery", label: "Package Delivery", when: "It's one item, not a van's worth" },
    ],
  },

  "house-check-in": {
    title: "Home Check-In Visits While You're Away",
    headline: "Someone looks in while you're away",
    brief:
      "A short visit while you are away — not an overnight stay. Give the access method, a checklist of what to look "
      + "at, and how you want to hear back. Say whether anything is alive: plants need watering, and a cat needs more "
      + "than a glance through the door.",
    includes: [
      "One visit of the agreed length, to the checklist you set",
      "A message back confirming what was found",
      "Simple tasks you list — post gathered, a tap run, plants watered",
    ],
    excludes: [
      "Staying overnight, or any continuous presence in the property",
      "Security monitoring, or any response to an alarm or intruder",
      "Pet care beyond what you specify — an animal needing feeding is a different booking",
    ],
    situations: [
      "You're away for a fortnight and the plants won't last",
      "Post is piling up visibly and you'd rather it didn't",
      "There was a cold snap and you want the pipes checked",
      "Your insurer expects the property looked at periodically",
    ],
    faqs: [
      { q: "Is this an overnight house-sitting service?",
        a: "No. It is a visit of an agreed length. Nobody stays, and the property is empty again when they leave." },
      { q: "Can I provide a visit checklist?",
        a: "Yes, and you should. Doors and windows, taps, the boiler, plants, post — a list makes the visit useful and "
          + "gives the helper something definite to report against." },
      { q: "How should I share entry instructions?",
        a: "In the request's access fields, not in a public note. Include the key's location, alarm steps and anything "
          + "about neighbours or a dog next door." },
    ],
    chooseBetween: [
      { slug: "property-inspection", label: "Property Inspection", when: "You need photographs and a written condition report" },
    ],
  },

  "maid-service": {
    title: "House Cleaning & Maid Services",
    headline: "Your home cleaned, to the list you set",
    brief:
      "Describe the home and the tasks, not just the number of bedrooms. Floor area, how many bathrooms, the current "
      + "condition and anything you want prioritised all change how long it takes. Ovens, fridges and inside windows "
      + "are each a job of their own — list them if you want them done.",
    includes: [
      "Cleaning by the hours you book, to the task list you set",
      "Ordinary cleaning of kitchens, bathrooms, floors and surfaces",
      "Standard supplies, where the booking says they are provided",
    ],
    excludes: [
      "Anything not on your list — assume it will not be done unless named",
      "Oven interiors, fridges and laundry unless you ask for them specifically",
      "Hoarding, biohazard, post-construction or move-out deep cleaning without a scoped quote",
    ],
    situations: [
      "Guests arrive on Friday and the house isn't ready",
      "You've been working late and the kitchen has got away from you",
      "You want the same clean every fortnight without arranging it each time",
      "There are jobs — the oven, the windows — you never get round to",
    ],
    faqs: [
      { q: "What cleaning tasks should I list?",
        a: "Everything you want done, in priority order. A cleaner with three hours and a list will finish the top of it; "
          + "a cleaner with no list will guess, and will guess differently from you." },
      { q: "Who provides cleaning supplies?",
        a: "The booking says. Where supplies are included they are ordinary products; if you need something specific for "
          + "a surface, or you have allergies, say so and leave it out for them." },
      { q: "How do recurring cleaning requests work?",
        a: "Book each visit, or set up a repeating booking. The same helper is offered it first where they are available, "
          + "but nobody is guaranteed — each occurrence still has to be accepted." },
    ],
    chooseBetween: [
      { slug: "house-check-in", label: "House Check-In", when: "You're away and need a visit rather than a clean" },
    ],
  },

  "appliance-repair": {
    title: "Appliance Diagnosis & Repair Help",
    headline: "Something has stopped working and you need to know why",
    brief:
      "You are booking a diagnosis, not a repair. Give the appliance make, model and age, and describe the symptom "
      + "precisely — what it does, when it started, what noise it makes. The visit establishes what is wrong and what "
      + "fixing it would cost; the repair itself is agreed afterwards.",
    includes: [
      "A visit to one appliance and an assessment of the fault",
      "A written explanation of what is wrong and what a repair would involve",
      "Safe making-safe of anything immediately dangerous",
    ],
    excludes: [
      "The repair itself, and any parts — both are quoted after the diagnosis",
      "Gas, sealed refrigeration and fixed electrical work, which need a qualified trade",
      "Any guarantee the appliance is economic to repair — sometimes it is not",
    ],
    situations: [
      "The washing machine won't drain and you don't know whether it's worth fixing",
      "The fridge is running warm and you need an answer before the food goes",
      "An appliance is making a noise it has never made before",
      "You want a written quote before committing to a repair",
    ],
    faqs: [
      { q: "What appliance information is needed?",
        a: "Make, model number, roughly how old, and the symptom in detail. The model number is usually on a plate inside "
          + "the door or behind the appliance, and it decides whether parts still exist." },
      { q: "Are parts included in the quote?",
        a: "No. The visit covers the diagnosis. Parts and the repair labour are quoted once the fault is known, and you "
          + "decide then whether to go ahead." },
      { q: "Does the booking cover diagnosis or repair?",
        a: "Diagnosis. Some faults are fixed within the visit; most are not, because the part is not in the van. You will "
          + "be told what is wrong and what it would take either way." },
    ],
    chooseBetween: [
      { slug: "tech-setup", label: "Tech Setup", when: "It's a computer, router or TV rather than a household appliance" },
    ],
  },

  // ---------------------------------------------------------- errands
  "grocery-pickup": {
    title: "Grocery Pickup & Shopping Help",
    headline: "Your order is ready and you can't get to the shop",
    brief:
      "This collects an order you have already placed and paid for. Give the store, the branch, the order or collection "
      + "reference and the name it is under. If you want someone to choose the items themselves, that is a shopping "
      + "errand instead — a different booking with a different price.",
    includes: [
      "Collecting one prepaid, packed order from the store you name",
      "Bringing it to your address",
      "Checking the order against your reference at the counter",
    ],
    excludes: [
      "The cost of the groceries, which you have already paid the store",
      "Choosing items, substituting them, or shopping from a list",
      "Collecting an order that is not ready or not in your name",
    ],
    situations: [
      "You placed and paid for a click-and-collect order but can't fetch it",
      "You're stuck at work and the collection window closes before you finish",
      "You have no car today and the shop is too far to carry bags from",
      "You're unwell and would rather not go out",
    ],
    faqs: [
      { q: "Is this order pickup or grocery shopping?",
        a: "Pickup. The order must already be placed, paid for and packed. If you want someone to walk the aisles and "
          + "choose, book an errand instead." },
      { q: "Are groceries included in the service price?",
        a: "No. You pay the store when you place the order. The Helpward price covers collecting and bringing it to you." },
      { q: "How do I provide substitutions or delivery instructions?",
        a: "Substitutions are the store's decision, not the helper's — set them when you order. Put entry and drop-off "
          + "instructions in the request so your helper knows where to leave the bags." },
    ],
    chooseBetween: [
      { slug: "errand-runner", label: "Errand Runner", when: "Nobody has shopped it yet — you need someone to choose the items" },
      { slug: "package-delivery", label: "Package Delivery", when: "It's a parcel rather than a grocery order" },
    ],
  },

  "package-delivery": {
    title: "Local Package Delivery & Courier Service",
    headline: "Something needs to get across town today",
    brief:
      "Give both addresses, who to hand it to at the far end, and what is inside. Size and weight matter: this is one "
      + "parcel that fits in an ordinary car, carried by one person. Say whether anyone has to be present to receive it, "
      + "because waiting at a door nobody answers is where these go wrong.",
    includes: [
      "One collection and one drop-off at the addresses you give",
      "A parcel one person can carry and an ordinary car can hold",
      "Handing over to the person or place you specify",
    ],
    excludes: [
      "Anything prohibited, hazardous, perishable or requiring special handling",
      "Insurance against loss or damage beyond the booking's own value",
      "Multiple addresses or a route of stops — quote those separately",
    ],
    situations: [
      "Documents have to reach someone this afternoon, not next week",
      "You've left keys, a charger or a bag somewhere and need them brought over",
      "A gift needs to arrive today and the post won't manage it",
      "A courier quoted you a price that makes no sense for a ten-minute drive",
    ],
    faqs: [
      { q: "What package details should I provide?",
        a: "Rough size and weight, what it is, and whether it is fragile. Also who must receive it — a named person, a "
          + "concierge, or a safe place if nobody answers." },
      { q: "Where can a package be collected and delivered?",
        a: "Between two addresses inside the service area. Both ends must be reachable; a locker or depot needs a code or "
          + "reference supplied in the request." },
      { q: "What items are not accepted?",
        a: "Anything hazardous, illegal, alive, or needing temperature control, plus anything a single person cannot "
          + "safely carry. If you are unsure, describe it before booking." },
    ],
    chooseBetween: [
      { slug: "package-return", label: "Package Return", when: "It's going back to a retailer with a return label" },
      { slug: "errand-runner", label: "Errand Runner", when: "There's more to it than one pickup and one drop-off" },
    ],
  },

  "package-return": {
    title: "Package Return Pickup & Drop-Off Help",
    headline: "Online returns you haven't managed to post back",
    brief:
      "Returns need a label before anyone can take them. Say which carrier, how many parcels, and whether they are "
      + "already sealed and labelled. If you only have a QR code, say that too — some drop-off points print there and "
      + "some do not, and it changes where your helper can go.",
    includes: [
      "Taking your labelled parcels to one carrier's drop-off point",
      "Obtaining proof of drop-off and sending it to you",
      "Up to the number of parcels your booking covers",
    ],
    excludes: [
      "Packing the item, or supplying boxes and tape",
      "Printing labels, unless the drop-off point does it from a code",
      "The refund itself, which the retailer issues on their own timetable",
    ],
    situations: [
      "The return window is closing and you still haven't got to the drop-off",
      "You have several parcels going back to the same carrier",
      "The nearest drop-off point is nowhere near your commute",
      "You have the label printed and simply need someone to take it",
    ],
    faqs: [
      { q: "Do I need to prepare a return label?",
        a: "Yes — a printed label on a sealed parcel, or a QR code the drop-off point can scan. Say which you have, "
          + "because it decides where the parcel can go." },
      { q: "Which drop-off instructions should I provide?",
        a: "The carrier, and a preferred branch if you have one. Name it if a specific shop has already accepted part of "
          + "the return." },
      { q: "Who issues the refund for the returned item?",
        a: "The retailer, once they receive and process it. Helpward's part ends with the proof of drop-off, which is "
          + "the evidence you need if the refund is slow." },
    ],
    chooseBetween: [
      { slug: "package-delivery", label: "Package Delivery", when: "It's going to a person or address, not back to a shop" },
      { slug: "errand-runner", label: "Errand Runner", when: "It needs packing or buying first" },
    ],
  },

  "errand-runner": {
    title: "Hire an Errand Runner for Everyday Tasks",
    headline: "The jobs you keep meaning to do and never get to",
    brief:
      "Say what the errand is, where it goes, and whether anything has to be bought. A list of stops in order is more "
      + "useful than a general description — your helper can plan the route and tell you if it does not fit the time "
      + "you have booked.",
    includes: [
      "The errand you describe, for the time you book",
      "Stops along a route you agree in advance",
      "Collecting, dropping off and queueing as part of the task",
    ],
    excludes: [
      "The cost of anything purchased, which is agreed and reimbursed separately",
      "Errands needing your ID, signature or legal authority",
      "Anything that will not fit in the time booked — extend it before, not during",
    ],
    situations: [
      "Dry cleaning has been sitting in the boot of your car for a fortnight",
      "You need a shop done from a list, not a prepaid order collected",
      "Something has to be posted, returned or collected during working hours",
      "You need someone to wait at your flat for a delivery or an engineer",
    ],
    faqs: [
      { q: "What errands can I request?",
        a: "Ordinary ones: dry cleaning, a pharmacy counter, posting something, returning a borrowed item, waiting for a "
          + "delivery. If an errand needs you personally — signing for a prescription, proving your identity — it cannot be done for you." },
      { q: "How are purchase costs handled?",
        a: "Agreed before the purchase, with a receipt. The service price covers the helper's time, never the goods." },
      { q: "When should I choose a delivery or grocery service instead?",
        a: "If it is one parcel going from A to B, book a delivery. If it is a prepaid order waiting at a counter, book a "
          + "pickup. Errands are for the jobs that do not fit a single shape." },
    ],
    chooseBetween: [
      { slug: "grocery-pickup", label: "Grocery Pickup", when: "Your order is already placed and paid for" },
      { slug: "package-delivery", label: "Package Delivery", when: "It's one parcel going from A to B" },
      { slug: "wait-in-line", label: "Wait in Line", when: "The whole job is waiting in a queue" },
    ],
  },

  "wait-in-line": {
    title: "Pay Someone to Wait in Line",
    headline: "Someone holds your place while you do something else",
    brief:
      "Your helper waits in an eligible queue and hands the place to you where the venue allows it. Name the venue and "
      + "the exact entrance, say whether you have checked that a stand-in is permitted, and agree what should happen if "
      + "the turn comes before you arrive.",
    includes: [
      "A helper waiting in the queue you name, for the time you book",
      "Updates while they wait, and notice when the line is moving",
      "The handover, where the venue permits it",
    ],
    excludes: [
      "Admission, a table, stock or a ticket — none of these can be promised",
      "Queue-jumping, invented party members or bypassing purchase limits",
      "Any queue where the venue does not allow a stand-in",
    ],
    situations: [
      "A restaurant takes no bookings and the queue starts before you finish work",
      "A product launch means being outside hours before opening",
      "You want the table but not the two hours standing up",
      "A counter has a long wait and you can be there for the handover",
    ],
    faqs: [
      { q: "Can someone wait in any queue for me?",
        a: "Only where the venue permits it. Some require everyone present, some issue numbers to a named person, and some "
          + "prohibit stand-ins outright. If the venue refuses, you are not charged for the wait." },
      { q: "How do I arrange the handover?",
        a: "Agree it when you book: who arrives, how long you need to get there, and what to do if the turn comes early. "
          + "Your helper follows the venue's rules at the counter." },
      { q: "Does booking guarantee entry or a ticket?",
        a: "No. You are buying someone's time in a line. Items sell out and venues close — the waiting was still done, and "
          + "that is what the booking covers." },
    ],
    chooseBetween: [
      { slug: "errand-runner", label: "Errand Runner", when: "There's a task at the end of it, not a handover" },
    ],
  },

  // -------------------------------------------------------- lifestyle
  "dog-walking": {
    title: "Book a Dog Walker for Your Dog",
    headline: "Your dog gets out while you can't take them",
    brief:
      "Say how long, how many dogs, and how each one behaves on a lead. Where the lead and harness are kept, how to get "
      + "in, and how the dog reacts to other dogs or strangers matter more than the breed. If your dog pulls, say so — "
      + "it changes who should accept the walk.",
    includes: [
      "A walk of the length you book, for the dogs you list",
      "Collection and return to your address, with entry as you instruct",
      "A message when the walk is done",
    ],
    excludes: [
      "Veterinary care, medication, training or grooming",
      "Off-lead exercise unless you explicitly ask for it and it is legal there",
      "Dogs the helper has not agreed to handle — reactive, in season, or recovering from surgery",
    ],
    situations: [
      "You're in the office and your dog has been in since breakfast",
      "A long day means nobody is home for nine hours",
      "You've hurt your back and can't manage the walk",
      "You want a regular midday walk without arranging it every week",
    ],
    faqs: [
      { q: "How long can I book a walk for?",
        a: "From a short walk upward, in set lengths you choose when booking. Longer care — a full day, or a dog alone for "
          + "hours — is a different kind of booking, not a very long walk." },
      { q: "Can I book for more than one dog?",
        a: "Yes. Say how many and how they behave together; the price reflects the number, and the walker needs to agree "
          + "they can handle the group on their own." },
      { q: "What handling and access information should I provide?",
        a: "Where the lead and harness are, how to get in and lock up, your dog's recall and lead manners, and anything "
          + "that sets them off. Put entry details in the access fields, not in the public notes." },
    ],
    chooseBetween: [
      { slug: "house-check-in", label: "House Check-In", when: "Your pet needs looking in on rather than walking" },
    ],
  },

  "listening-service": {
    title: "Talk to a Listener — Human Listening Service",
    headline: "Someone whose job is to listen",
    brief:
      "An audio call with someone whose job is to listen. Say roughly how long you want and whether there is something "
      + "specific on your mind — you do not have to, and 'I would rather just talk' is a complete brief. There is no "
      + "video and nothing is recorded.",
    includes: [
      "An audio call of the length you book, with one person",
      "Their attention for that time, on whatever you want to talk about",
      "A definite start and end, agreed beforehand",
    ],
    excludes: [
      "Therapy, counselling, diagnosis or any clinical treatment",
      "Crisis or emergency support — contact emergency services for that",
      "Video, recording, or any transcript of what is said",
    ],
    situations: [
      "You want to say something out loud without it becoming a conversation about advice",
      "There's nobody you want to burden with this particular thing",
      "You want to be heard rather than fixed",
      "It's late and everyone you'd normally call is asleep",
    ],
    faqs: [
      { q: "Is this therapy or counselling?",
        a: "No. It is a conversation with someone who will listen and not interrupt. It is not treatment, the person is not "
          + "a clinician, and nothing said is a diagnosis." },
      { q: "How does the audio session work?",
        a: "You connect through the booking at the agreed time and talk for the length you booked. Audio only." },
      { q: "Can I choose a session length and conversation preferences?",
        a: "Yes to both. Pick the length when you book, and say in advance if there are things you would rather not discuss "
          + "or if you simply want to be heard rather than advised." },
    ],
    chooseBetween: [
      { slug: "sleep-call-companion", label: "Sleep Call Companion", when: "You want quiet company while you fall asleep, not a conversation" },
      { slug: "rent-a-friend", label: "Rent-a-Friend", when: "You'd rather do something together in person" },
    ],
  },

  "sleep-call-companion": {
    title: "Sleep Call Companion — Quiet Bedtime Audio Calls",
    headline: "Quiet company on the phone while you fall asleep",
    brief:
      "A quiet audio call while you fall asleep, with a scheduled end. Say how long you want it to run and what helps — "
      + "quiet conversation, reading aloud, or near-silence with someone there. Falling asleep does not extend the call; "
      + "it ends when booked.",
    includes: [
      "One person on an audio call for the length you book",
      "Quiet conversation or company, as you prefer",
      "A fixed end time agreed before the call starts",
    ],
    excludes: [
      "Overnight monitoring, or anyone watching over you while you sleep",
      "Any medical, clinical or sleep-treatment claim",
      "Video, recording, or a group call",
    ],
    situations: [
      "The flat is too quiet and you've been awake for hours",
      "You sleep better knowing somebody is there",
      "You're in a new place and it doesn't feel like home yet",
      "You want someone to read aloud until you drift off",
    ],
    faqs: [
      { q: "What happens during a sleep companion call?",
        a: "You connect at the agreed time and the companion talks quietly, reads, or simply stays on the line while you "
          + "settle. The call ends when the booked time is up, whether or not you are asleep." },
      { q: "Is video involved?",
        a: "No. Audio only, and nothing is recorded." },
      { q: "How do session length and boundaries work?",
        a: "You choose the length when booking and it ends there. Say beforehand what you want — talking, reading, or quiet "
          + "— and either person can end the call at any point." },
    ],
    chooseBetween: [
      { slug: "listening-service", label: "Listening Service", when: "You want to talk rather than be talked gently towards sleep" },
    ],
  },

  "elder-assistance": {
    title: "Senior Companionship & Everyday Assistance",
    headline: "Company and practical help for an older parent or relative",
    brief:
      "Practical, non-clinical company and help: a visit, a conversation, a hand with errands or an appointment. Say who "
      + "the visit is for, what help is wanted, and whether they know it is arranged. If personal or medical care is "
      + "needed, that is a regulated service and not this one.",
    includes: [
      "Company and conversation for the time you book",
      "Practical help: light tidying, shopping, paperwork, getting to an appointment",
      "A note back to you about how the visit went, where agreed",
    ],
    excludes: [
      "Personal care, bathing, dressing, lifting or transfers",
      "Medication of any kind, including reminders you want relied upon",
      "Nursing, clinical assessment or anything a regulated care service provides",
    ],
    situations: [
      "Your mother lives alone and goes days without speaking to anyone",
      "A parent needs someone at an appointment with them",
      "Forms, shopping or paperwork have become harder than they were",
      "You live too far away to drop in as often as you'd like",
    ],
    faqs: [
      { q: "What kind of help can I request?",
        a: "Company, conversation, and practical tasks — a shop, a form, a walk, getting to an appointment and back. The "
          + "useful test: if a friend could do it, it fits; if it needs training, it does not." },
      { q: "Can I arrange a visit for a family member?",
        a: "Yes, and tell them it is arranged. Someone opening the door to a stranger they were not expecting is a bad "
          + "visit however good the helper." },
      { q: "Is this nursing or personal medical care?",
        a: "No, and it must not be used as a substitute. No personal care, no lifting, no medication. Those need a "
          + "regulated provider with the right qualifications and insurance." },
    ],
    chooseBetween: [
      { slug: "rent-a-friend", label: "Rent-a-Friend", when: "It's social company, not help with practical tasks" },
      { slug: "house-check-in", label: "House Check-In", when: "You want a property checked rather than a person visited" },
    ],
  },

  "rent-a-friend": {
    title: "Rent a Friend for Platonic Company",
    headline: "Someone to do something with, rather than alone",
    brief:
      "Platonic company for an activity — a meal, an exhibition, a walk, something you would rather not do alone. Say "
      + "what the activity is, how long, and where you will meet. Agree in advance who pays for tickets, food or travel.",
    includes: [
      "One person's company for the time you book",
      "The activity you describe, in a public setting",
      "An agreed meeting point and finish time",
    ],
    excludes: [
      "Anything romantic or sexual — this is explicitly platonic",
      "Tickets, meals, admission and travel, which are agreed separately",
      "Any ongoing relationship or contact outside the booking",
    ],
    situations: [
      "You're new to the city and haven't met anyone yet",
      "There's an exhibition or a walk you'd rather not do by yourself",
      "You want to try a restaurant and eating alone puts you off",
      "You'd like company for an afternoon with no agenda beyond that",
    ],
    faqs: [
      { q: "What can we do together?",
        a: "Ordinary things in public: eat, walk, visit something, go to an event. Say what you have in mind when you book "
          + "so the person accepting knows what they are agreeing to." },
      { q: "Is the service platonic?",
        a: "Yes, entirely and without exception. Any request otherwise will be declined and reported." },
      { q: "Are meals, tickets or other activity costs included?",
        a: "No. The booking covers the person's time. Agree beforehand who pays for what, including their admission if the "
          + "activity has a cost." },
    ],
    chooseBetween: [
      { slug: "date-companion", label: "Date Companion", when: "It's an occasion with a dress code and a plus-one" },
      { slug: "event-companion", label: "Event Companion", when: "It's an organised event — a gala, a work party, a function" },
      { slug: "shopping-companion", label: "Shopping Companion", when: "You want a second opinion while you shop" },
    ],
  },

  "date-companion": {
    title: "Platonic Date & Dinner Companions",
    headline: "A plus-one for an evening you'd rather not attend alone",
    brief:
      "Platonic company for an occasion where arriving alone is the problem — a wedding, a work dinner, an event. Say "
      + "what the occasion is, how long, what the dress code is, and what you would like the person to know. Agree costs "
      + "and boundaries before you book.",
    includes: [
      "One companion for the occasion and time you book",
      "Dressing appropriately for a dress code you state",
      "Ordinary social conversation and company",
    ],
    excludes: [
      "Anything romantic or sexual — this is explicitly platonic",
      "Meals, drinks, admission and travel unless agreed in advance",
      "Pretending to a relationship that would mislead anyone materially",
    ],
    situations: [
      "A work dinner where arriving alone is the awkward part",
      "A wedding where you'd rather not be the one without anybody",
      "A restaurant you've wanted to try but not on your own",
      "An occasion where company makes the evening easier",
    ],
    faqs: [
      { q: "Is this a romantic or sexual service?",
        a: "No. It is platonic company for an occasion, and nothing else. Requests suggesting otherwise are declined." },
      { q: "What occasion details should I share?",
        a: "What the event is, where, how long, the dress code, and who else will be there. If you want your companion to "
          + "know a few names in advance, send them." },
      { q: "Who pays for meals or admission?",
        a: "Agree it before booking. The service price is the person's time; if the evening costs money, say who is "
          + "covering it and cap it." },
    ],
    chooseBetween: [
      { slug: "event-companion", label: "Event Companion", when: "It's a function or gala rather than dinner" },
      { slug: "wedding-guest", label: "Wedding Guest", when: "You need guests on your side of a wedding" },
      { slug: "rent-a-friend", label: "Rent-a-Friend", when: "It's casual — coffee, a walk, no dress code" },
    ],
  },

  "event-companion": {
    title: "Hire a Platonic Plus-One for an Event",
    headline: "Company at an event you'd rather not walk into alone",
    brief:
      "Company at an event — a conference, a gallery, a party, a function you would rather not attend alone. Give the "
      + "event, the schedule, the dress code and where you will meet. Say if there is briefing time you want paid for, "
      + "such as learning names beforehand.",
    includes: [
      "One companion for the hours you book",
      "Briefing or preparation time where you book it explicitly",
      "Appropriate dress for a code you state",
    ],
    excludes: [
      "Tickets and admission, yours or theirs, unless agreed",
      "Working the event — this is not bar, security, registration or clinical staffing",
      "Any representation that would mislead materially",
    ],
    situations: [
      "A gala or awards night where you know almost nobody",
      "A networking evening that's easier with someone beside you",
      "A work party where you'd rather not stand alone with a drink",
      "A private view or function you'd otherwise skip",
    ],
    faqs: [
      { q: "What event details are needed?",
        a: "What it is, where, the start and end, the dress code, and the meeting point. Add anything that would make the "
          + "evening easier — who you want to avoid, what you would rather not discuss." },
      { q: "Can I specify a dress code?",
        a: "Yes, and be specific. 'Smart casual' means different things; 'jacket, no tie' does not." },
      { q: "How is this different from hiring a wedding guest?",
        a: "A wedding guest attends as part of your party, often with a role and other guests to meet. This is company at "
          + "an event, usually one person, with no part to play." },
    ],
    chooseBetween: [
      { slug: "date-companion", label: "Date Companion", when: "It's dinner or a social evening rather than an organised event" },
      { slug: "wedding-guest", label: "Wedding Guest", when: "It's a wedding and you need people on your side" },
    ],
  },

  "family-standin": {
    title: "Family Stand-In & Event Role Services",
    headline: "A briefed performer for an agreed role at an occasion",
    brief:
      "A specialist acting engagement where someone attends an occasion in an agreed role. Describe the occasion, the "
      + "role, how long, and exactly what is and is not to be said. Preparation time counts and is paid. Nothing here "
      + "extends to signing anything or claiming an identity for official purposes.",
    includes: [
      "One performer for the hours you book, preparation included",
      "An agreed role within boundaries you both set beforehand",
      "Appropriate dress and briefing for the occasion",
    ],
    excludes: [
      "Signing legal, medical or financial documents in any name",
      "Obtaining rights, access or benefits under a false identity",
      "Any deception with legal or financial consequences for anyone",
    ],
    situations: [
      "An occasion where a relative cannot attend and their absence would be difficult",
      "A family role that needs playing convincingly and respectfully",
      "A scripted part agreed in advance, with clear limits on all sides",
    ],
    faqs: [
      { q: "What role can I request for an occasion?",
        a: "A social one, at a social occasion, with a script you agree in advance. Say what the person should know, what "
          + "they should say, and what is out of bounds." },
      { q: "What information should we agree in advance?",
        a: "The occasion, the role, who else is present, what may be said, and what must not. Also the finish time — these "
          + "engagements end at a moment, not when the party does." },
      { q: "What kinds of representation are outside the service?",
        a: "Anything official. No signing documents, no dealing with authorities, no obtaining anything in a name that is "
          + "not the performer's. That is not acting; it is fraud, and no booking covers it." },
    ],
    chooseBetween: [
      { slug: "wedding-guest", label: "Wedding Guest", when: "You need ordinary guests rather than a specific role" },
      { slug: "event-companion", label: "Event Companion", when: "Nobody needs to play a part — you just want company" },
    ],
  },

  "wedding-guest": {
    title: "Hire Wedding Guests for Your Celebration",
    headline: "Guests on your side, for the hours you need them",
    brief:
      "One or more people attending a wedding as part of your party. Say how many, for which hours, the dress code, and "
      + "what they should know — names, the couple, how you know them. Include any rehearsal or briefing time you want "
      + "paid for.",
    includes: [
      "The number of guests you book, for the hours you book them",
      "Appropriate dress for a code you state",
      "Ordinary guest behaviour: conversation, photographs, sitting where they are put",
    ],
    excludes: [
      "Event planning, coordination or staffing of any kind",
      "Speeches, performances or a scripted family role without a separate agreement",
      "Meals and admission unless the host provides or you budget them",
    ],
    situations: [
      "Your side of the aisle looks thin and you'd rather it didn't",
      "Family can't travel and the numbers don't balance",
      "You want a few friendly faces for the ceremony and the photographs",
    ],
    faqs: [
      { q: "What details should I provide about the wedding?",
        a: "Date, venue, the hours you need them, the dress code, and a short briefing — the couple's names, how you know "
          + "them, who they are likely to be seated with." },
      { q: "Can I request more than one guest?",
        a: "Yes. The price is per guest per hour, so four guests for three hours is twelve guest-hours, not one booking." },
      { q: "Does this include planning or event staffing?",
        a: "No. They attend as guests. If you need someone running the day, directing suppliers or working the room, that is "
          + "event staffing and a different service." },
    ],
    chooseBetween: [
      { slug: "event-companion", label: "Event Companion", when: "You want one companion rather than several guests" },
      { slug: "family-standin", label: "Family Stand-in", when: "Somebody needs to play a specific family role" },
    ],
  },

  "shopping-companion": {
    title: "Book a Shopping Companion",
    headline: "A second opinion, and a hand with the bags",
    brief:
      "Someone to come shopping with you — a second opinion, help carrying, or company for a trip you would rather not "
      + "do alone. Say what you are shopping for, roughly where, and how long. Professional styling is a different skill "
      + "and a different booking.",
    includes: [
      "One companion for the time you book",
      "A second opinion, help carrying, and company through the trip",
      "Meeting where and when you agree",
    ],
    excludes: [
      "Your purchases, and their travel or refreshments unless agreed",
      "Professional styling, colour analysis or wardrobe consultancy",
      "Carrying beyond what one person can reasonably manage",
    ],
    situations: [
      "You're buying something important and want an honest view",
      "There's more to carry than you can manage alone",
      "You've got an occasion coming and don't trust your own judgement",
      "Shopping is a chore alone and easier with someone along",
    ],
    faqs: [
      { q: "What kind of shopping help is included?",
        a: "Company, a second opinion, and a hand with bags. The friend-who-is-free kind of help, for a trip that is easier "
          + "with someone along." },
      { q: "Can I request style advice?",
        a: "You can ask what they think, and most people will tell you. What you are not booking is a trained stylist — "
          + "that is a specialist service at a specialist rate." },
      { q: "Are purchases and travel included?",
        a: "No. The booking covers their time. Agree in advance if you are covering their fare or a coffee." },
    ],
    chooseBetween: [
      { slug: "rent-a-friend", label: "Rent-a-Friend", when: "It's company for an activity rather than shopping" },
      { slug: "errand-runner", label: "Errand Runner", when: "You want the shopping done for you, not with you" },
    ],
  },

  // --------------------------------------------------------- business
  "tech-setup": {
    title: "Home Tech Setup — Wi-Fi, Printers & Devices",
    headline: "You bought it. Now someone makes it work.",
    brief:
      "List the devices and what you want working — a printer that will not connect, a new router, a phone to move "
      + "everything onto. Say what you have already tried. Never put passwords in the request; set them up together on "
      + "the day, or have them ready privately.",
    includes: [
      "Setting up and connecting the consumer devices you list",
      "Getting them talking to your network and to each other",
      "Showing you how it works before they leave",
    ],
    excludes: [
      "Hardware, licences, subscriptions or replacement parts",
      "Repairing broken devices, data recovery, or virus removal",
      "Business networks, servers and anything needing a commercial IT contract",
    ],
    situations: [
      "The new printer refuses to see the Wi-Fi",
      "You've switched broadband and nothing in the house reconnected",
      "There's a new phone or laptop and everything needs moving across",
      "You'd rather someone set it up properly than spend an evening guessing",
    ],
    faqs: [
      { q: "Which devices can I request help with?",
        a: "Ordinary consumer ones: computers, printers, routers, phones, tablets, televisions, smart speakers. List what "
          + "you have and what it should do." },
      { q: "Should I share my passwords in the request?",
        a: "No. Never put a password in a booking note. Have them to hand on the day, or set new ones together — a helper "
          + "should never need you to send one in advance." },
      { q: "What if the problem needs a repair specialist?",
        a: "Then the helper will tell you rather than take it apart. Setup and repair are different jobs with different "
          + "skills, and this booking is the first." },
    ],
    chooseBetween: [
      { slug: "appliance-repair", label: "Appliance Repair", when: "It's a washing machine or fridge, not a device" },
      { slug: "tv-mounting", label: "TV Mounting", when: "The television needs putting on the wall" },
    ],
  },

  "property-inspection": {
    title: "Property Condition Checks & Photo Reports",
    headline: "Photographs and a written note of how a property looks today",
    brief:
      "A visual condition visit with photographs and a written report — not a technical survey. Give the address, the "
      + "size, how to get in, and what you want looked at. Anyone buying a property needs a qualified inspector, which "
      + "is a different profession.",
    includes: [
      "A visit to the property and a walk through the areas you specify",
      "Photographs and a written condition note on what was visible",
      "A record of anything obviously wrong or in need of attention",
    ],
    excludes: [
      "Any licensed, technical or pre-purchase inspection",
      "Structural, electrical, plumbing, mould, pest or code assessment",
      "Opening up, testing, or inspecting anything that is not visible",
    ],
    situations: [
      "You let a property out and want a record between tenancies",
      "You own somewhere in another city and haven't seen it in months",
      "A tenant has reported something and you want it documented",
      "You need dated photographs of a property's current condition",
    ],
    faqs: [
      { q: "What does the report include?",
        a: "What was visible on the day: photographs of the areas you asked about and a written note of their condition. "
          + "It is a record, not a verdict." },
      { q: "How do I provide property access?",
        a: "Through the request's access fields — key location, codes, who else may be there. If an agent or tenant must "
          + "let them in, give the contact and arrange it first." },
      { q: "Is this a licensed home-buying or specialist inspection?",
        a: "No. If you are buying, or need an opinion on structure, wiring, damp or pests, engage a qualified inspector. "
          + "This booking does not substitute for one and should not be relied on as if it did." },
    ],
    chooseBetween: [
      { slug: "house-check-in", label: "House Check-In", when: "You want a short visit while away, not a written report" },
      { slug: "maid-service", label: "Maid Service", when: "The property needs cleaning rather than recording" },
    ],
  },
};

/** Copy for a service, or null where none has been written. */
export function serviceCopy(serviceId: string): ServiceCopy | null {
  return SERVICE_COPY[serviceId] ?? null;
}

/* ---------------------------------------------------------------------
 * What is genuinely different about booking in one city rather than the
 * other.
 *
 * Adding the same per-service copy to both city pages made them MORE
 * alike, not less: measured at 92% identical afterwards, against 87%
 * before. That is the right content in the wrong place — a reader on the
 * Vancouver page still learned nothing they could not get from the San
 * Diego one.
 *
 * The honest differentiator is not reworded prose, it is facts that only
 * apply here: which municipalities the area actually contains, where the
 * boundary catches people out, and what that means for a booking. San
 * Diego is ONE city and the county around it is not covered; the Lower
 * Mainland is fifteen separate municipalities and a helper crossing
 * between them is crossing a real line.
 * ------------------------------------------------------------------- */

export type CityLocal = {
  /** Two or three sentences about booking here specifically. */
  intro: string;
  /** Where the boundary actually bites, in the words people use. */
  boundary: string;
  /** Places inside the area that people name when they book. */
  places: string[];
  /** What "outside the area" most often turns out to mean here. */
  commonlyOutside: string[];
};

export const CITY_LOCAL: Record<string, CityLocal> = {
  "san-diego": {
    intro:
      "Helpward covers the City of San Diego itself. That is a smaller area than people usually mean by "
      + "“San Diego”, which in conversation often stretches to the whole county — and the county is "
      + "roughly the size of Connecticut. The address you enter is checked against the city boundary, not "
      + "against the postal town, so a Chula Vista or El Cajon address is refused even though the post comes "
      + "addressed to San Diego.",
    boundary:
      "The city line is not where most people expect it. It runs around several places that share the San Diego "
      + "postal address and are separate cities in their own right, and it wraps around Coronado and National "
      + "City rather than through them.",
    places: [
      "Downtown and East Village", "North Park and South Park", "Hillcrest and Bankers Hill",
      "Pacific Beach and Mission Beach", "La Jolla", "Ocean Beach and Point Loma",
      "Clairemont and Kearny Mesa", "Mira Mesa and Scripps Ranch", "Rancho Bernardo",
      "Otay Mesa and San Ysidro", "Normal Heights and Kensington", "Mission Valley",
    ],
    commonlyOutside: [
      "Chula Vista, National City and Imperial Beach — separate cities to the south",
      "La Mesa, El Cajon, Santee and Lemon Grove — separate cities inland",
      "Coronado, which is its own city across the bay",
      "Poway, Del Mar, Solana Beach and Encinitas to the north",
    ],
  },

  vancouver: {
    intro:
      "Helpward covers fifteen municipalities across the Lower Mainland, not only the City of Vancouver. That "
      + "matters more here than in most places, because the region is a mosaic of separate cities rather than "
      + "one spreading outward — somewhere twenty minutes from downtown is usually a different municipality "
      + "with its own council, bylaws and parking rules.",
    boundary:
      "Two names cover two municipalities each. North Vancouver is both a City and a District, and Langley is "
      + "both a City and a Township — in each pair the larger one is several times the size of the smaller. "
      + "Helpward covers both halves of both, so either address works.",
    places: [
      "Vancouver", "Burnaby", "Richmond", "New Westminster", "Surrey", "Delta", "White Rock",
      "Coquitlam", "Port Coquitlam", "Port Moody", "Pitt Meadows", "Maple Ridge",
      // Plain names. The City/District and City/Township pairs are
      // explained in `boundary` above; repeating them here would make the
      // list read like four places instead of two names, and stops it
      // matching the service area it is supposed to mirror.
      "North Vancouver", "West Vancouver", "Langley",
    ],
    commonlyOutside: [
      "Abbotsford, Mission and Chilliwack — east, beyond the covered area",
      "Squamish and Whistler — north along the Sea to Sky",
      "The North Shore beyond West Vancouver, including Lions Bay",
      "Bowen Island and anywhere reached only by ferry",
    ],
  },
};

export function cityLocal(citySlug: string): CityLocal | null {
  return CITY_LOCAL[citySlug] ?? null;
}
