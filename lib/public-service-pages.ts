/*
  PER-SERVICE PAGE COPY.

  Every service page used to carry the same four questions with the
  service name slotted in: what is it, what does it cost, how fast can a
  helper arrive, are helpers verified. Four questions no one searches,
  answered identically twenty-six times — and on the two services
  delivered by phone call, one of them asked about an arrival that never
  happens.

  These are the questions people actually have before booking, answered
  from what the product does: the questions the booking form asks, the
  arithmetic in service_pricing, and the platform rules that hold for
  everything (card authorised on acceptance, charged at completion, 24-hour
  dispute window, every helper approved by a person, no automated
  background checks, no platform insurance).

  WHERE AN ANSWER WOULD HAVE BEEN A GUESS, IT SAYS WHAT THE FORM COLLECTS
  INSTEAD OF PROMISING AN OUTCOME. "Tell us on the form and the helper
  sees it before accepting" is true and useful. "A helmet will be
  provided" is neither, because nothing in the system guarantees it.

  Title, H1 and the opening paragraph are written as one unit: the title
  carries the phrase someone searched, the H1 repeats the need, and the
  paragraph names the catalogue product once so a search visitor and an
  app user can see they are looking at the same thing.
*/

export type ServicePageCopy = {
  title: string;
  h1: string;
  intro: string;
  faqs: { q: string; a: string }[];
};

export const SERVICE_PAGE_COPY: Record<string, ServicePageCopy> = {
  "designated-driver": {
    title: "Designated Driver — Get You & Your Car Home | Helpward",
    h1: "Hire a designated driver to drive your car home",
    intro:
      "A taxi brings its own car, which leaves yours where you left it. This is the other way "
      + "round: a driver comes to you and drives your own car, with you in it, to wherever you "
      + "are going. On Helpward it is the Designated Driver service.",
    faqs: [
      {
        q: "Will the driver drive my own car?",
        a: "Yes — that is the whole point of it. You travel as a passenger in your own vehicle, "
          + "and the car ends up wherever you do. If you want a car supplied for you, that is a taxi, "
          + "not this.",
      },
      {
        q: "Can I book after drinking?",
        a: "Yes. Getting home without driving yourself is the most common reason people book it. "
          + "You are the passenger; nothing about the booking asks you to drive.",
      },
      {
        q: "Can I request a driver for a manual car?",
        a: "The booking form asks whether your car is automatic or manual, so a helper knows which "
          + "they are accepting before they accept it. Say manual if it is manual — the request then "
          + "only suits a driver who can drive one.",
      },
      {
        q: "How is the trip price calculated?",
        a: "By time booked, not by distance. The base price covers a set stretch of driving time and "
          + "longer trips add whole blocks on top. Distance does not enter the figure at all, and the "
          + "full total is on screen before the request goes anywhere.",
      },
      {
        q: "Can I schedule a pickup?",
        a: "Yes. A request can be for now or for a time you choose, which is the sensible way to book "
          + "an evening out before the evening starts.",
      },
      {
        q: "What vehicle details do you need?",
        a: "Transmission, make and model, how many passengers are travelling, and exactly where the car "
          + "is — a parkade level is not a street address. Every one of those is a question on the form, "
          + "and the helper reads your answers before deciding to accept.",
      },
    ],
  },

  "car-battery-jump": {
    title: "Car Jump-Start Service — Dead Battery Help | Helpward",
    h1: "Request a car jump-start for a dead battery",
    intro:
      "A flat battery, someone there with cables and a portable jump pack, and no tow truck. "
      + "On Helpward this is booked as the Car Battery Jump service: say where the car is and a "
      + "nearby helper comes out to try to start it.",
    faqs: [
      {
        q: "Can you jump-start my car where it is parked?",
        a: "Usually, and the form asks where the car is precisely so a helper can judge that before "
          + "accepting. Tell us the parkade level, the street or the driveway, and whether a second car "
          + "can pull alongside — a battery that cannot be reached by another vehicle is the one case "
          + "that tends to defeat a jump pack.",
      },
      {
        q: "What vehicle details do you need?",
        a: "Make and model, and where the battery sits — engine bay, boot, or under a seat. \"Not sure\" "
          + "is an option; the helper brings leads for the common cases either way.",
      },
      {
        q: "What if the battery will not start?",
        a: "Then it will not start. This is an attempt by someone with cables and a jump pack, not a "
          + "guaranteed repair: a battery that has failed outright, or a fault that is not the battery, "
          + "needs a garage or a tow. You are paying for the visit and the attempt, and if something "
          + "goes wrong with how it was handled you have 24 hours to open a dispute.",
      },
      {
        q: "Is a replacement battery included?",
        a: "No. The service is a jump-start. No part is supplied, fitted or sold as part of it.",
      },
      {
        q: "How is the final price shown?",
        a: "It is a flat price for the visit, plus the usual $4.50 service fee, and it does not change "
          + "with distance or how long the attempt takes. You see the whole figure before the request "
          + "reaches a helper.",
      },
    ],
  },

  "motorcycle-taxi": {
    title: "Motorcycle Taxi — Request a Passenger Ride | Helpward",
    h1: "Request a motorcycle passenger ride",
    intro:
      "A ride as a passenger on a motorcycle, between two addresses you give. On Helpward it is "
      + "the Motorcycle Taxi service. It depends entirely on an approved rider being available "
      + "where you are, so it is worth checking the areas we cover before you plan around it.",
    faqs: [
      {
        q: "Where can I request this service?",
        a: "Only within the areas Helpward covers — Vancouver and the surrounding Lower Mainland, and "
          + "the City of San Diego within city limits. There is no airport arrangement and no service "
          + "outside those areas.",
      },
      {
        q: "How many passengers can ride?",
        a: "One. A motorcycle carries a single passenger, so a second person means a second booking and "
          + "a second rider.",
      },
      {
        q: "Is a helmet provided?",
        a: "The form asks whether you need one, so answer it honestly and the rider knows before they "
          + "accept. Riding without a legal helmet is not an option in either area we operate in.",
      },
      {
        q: "What luggage is permitted?",
        a: "Whatever you can carry safely on a bike, and the form asks what you will have with you. A "
          + "suitcase is not a motorcycle load; a backpack generally is.",
      },
      {
        q: "What happens in bad weather?",
        a: "A rider can decline, and should. Nothing in the booking obliges anyone to ride in conditions "
          + "they judge unsafe, and a request that goes unaccepted is never charged.",
      },
      {
        q: "How is the trip priced?",
        a: "By time booked rather than distance, with the full total shown before you send the request. "
          + "Your card is authorised when a rider accepts and charged once the trip is complete.",
      },
    ],
  },

  "dog-walking": {
    title: "Dog Walking — Book a Local Dog Walker | Helpward",
    h1: "Book a dog walker for your dog's next walk",
    intro:
      "Your dog gets out, on a day you cannot take them. On Helpward this is the Dog Walking "
      + "service: pick 30 or 60 minutes, say how many dogs are going, and the walker sends a "
      + "photo update and a GPS-tracked route when they are done.",
    faqs: [
      {
        q: "How long can I book a walk?",
        a: "$25 covers the first 30 minutes, and longer walks add $8 per extra 15 minutes. A 60-minute "
          + "walk is therefore $25 plus two blocks. Blocks are started rather than metered, because a "
          + "walker's time is booked rather than clocked.",
      },
      {
        q: "Can I book more than one dog?",
        a: "Yes. One dog is included and each additional dog is $8. The form asks how many are going so "
          + "the walker knows what they are agreeing to — three dogs on three leads is a different walk "
          + "from one.",
      },
      {
        q: "What should I leave for the walker?",
        a: "A lead, fresh water, and treats if your dog has them. Leave anything the walker needs where "
          + "you say it will be, and say where that is in the handover instructions.",
      },
      {
        q: "How do I share access instructions?",
        a: "Through the handover instructions on the booking. They are saved with the booking rather than "
          + "sent in a message, and only the helper actually booked for the job can read them — not every "
          + "walker who was offered it.",
      },
      {
        q: "Will I receive an update?",
        a: "Yes — a photo update and the route taken, which is the part most people book this for. You can "
          + "also message the walker while the walk is on.",
      },
      {
        q: "Can I book the same walker again?",
        a: "Yes. A walker you have used before can be saved as a favourite, and new requests can be routed "
          + "to them first rather than to whoever is nearest.",
      },
    ],
  },

  "maid-service": {
    title: "House Cleaning & Maid Service — Book a Cleaner | Helpward",
    h1: "Book a cleaner for your home",
    intro:
      "Dusting, vacuuming, kitchens, bathrooms and laundry, done by a cleaner you can book again "
      + "next week. On Helpward this is the Maid Service: say how many rooms and how long, and see "
      + "the price before anything goes to a helper.",
    faqs: [
      {
        q: "What cleaning is included?",
        a: "Ordinary household cleaning: dusting, vacuuming, kitchen and bathroom surfaces, and laundry. "
          + "The form asks what to focus on, so a cleaner spends the booked time where you want it spent.",
      },
      {
        q: "How many hours should I book?",
        a: "$80 covers the first two hours, and longer bookings add $20 per extra 30 minutes. Bedrooms "
          + "and bathrooms are questions on the form, which is the honest way to work out how much time "
          + "a home needs — a three-bathroom house is not a two-hour job.",
      },
      {
        q: "Do I provide supplies?",
        a: "The form asks. Say whether you are supplying them or want the cleaner to bring their own, so "
          + "nobody arrives to find an empty cupboard.",
      },
      {
        q: "Is deep cleaning or end-of-tenancy work included?",
        a: "No. This is regular cleaning within the time you book. Specialist work — a move-out clean "
          + "inspected by a landlord, carpet machines, anything requiring equipment a cleaner does not "
          + "carry — is outside it.",
      },
      {
        q: "Can I book more than one cleaner?",
        a: "Yes. One cleaner is included and each extra is $80, which is the sensible way to halve the "
          + "clock on a large home rather than booking twice the hours.",
      },
      {
        q: "Can I book regular cleaning?",
        a: "Yes. Save the cleaner you liked as a favourite and send future requests to them first, so the "
          + "same person comes back rather than a stranger each week.",
      },
    ],
  },

  "moving-help": {
    title: "Moving Help — Loading, Unloading & Lifting | Helpward",
    h1: "Book moving help for loading, unloading and lifting",
    intro:
      "Hands for the lifting part of a move: loading, unloading, carrying and stairs. On Helpward "
      + "this is the Moving Help service, and it is labour only — a vehicle is not part of it, so "
      + "book it alongside the van you have hired, not instead of one.",
    faqs: [
      {
        q: "Does the booking include a truck?",
        a: "No. This is people, not a vehicle. If you need a van you hire one separately, and the helpers "
          + "load it for you.",
      },
      {
        q: "How many helpers should I book?",
        a: "The form asks, and your answer is what the price is built from: one helper is included and "
          + "each additional helper is $100. A sofa down three flights is a two-person job whatever the "
          + "quote says.",
      },
      {
        q: "Is the price per helper or per crew?",
        a: "Per crew, built up from the base. $100 covers the first two hours of the crew's time, with "
          + "$12.50 per extra 15 minutes, and extra helpers add $100 each. One figure, shown in full "
          + "before you request.",
      },
      {
        q: "Can you load a rental truck?",
        a: "Yes — that is the common case. Say so in the inventory and access answers so the crew arrives "
          + "expecting a vehicle to pack rather than a room to carry things through.",
      },
      {
        q: "How do stairs and access affect the job?",
        a: "They do not change the price on their own, but they change how long the job takes, and time "
          + "beyond the first two hours does cost more. The form asks about access at both ends for "
          + "exactly that reason — a fourth-floor walk-up is not the same job as a loading bay.",
      },
      {
        q: "What items need special arrangements?",
        a: "Anything a person should not lift unaided or cannot legally move: pianos, safes, gun cabinets, "
          + "hazardous goods. Put it in the inventory answer, honestly, so a crew can decline before "
          + "arriving rather than after.",
      },
    ],
  },

  "furniture-assembly": {
    title: "Furniture Assembly — IKEA & Flat-Pack Help | Helpward",
    h1: "Book help assembling your furniture",
    intro:
      "The flat-pack box you have been stepping around for a fortnight, built. On Helpward this is "
      + "the Furniture Assembly service: say what the items are and how many, and the helper works "
      + "through them in the time you book.",
    faqs: [
      {
        q: "Can you assemble IKEA furniture?",
        a: "Yes, and it is the most common request. Any flat-pack furniture with its own instructions "
          + "and fittings is the same job — the brand matters less than whether all the parts are in "
          + "the box.",
      },
      {
        q: "What item details should I provide?",
        a: "What the items are and how many. A product name or model is worth adding: \"two Malm "
          + "drawer units\" tells a helper what they are walking into, and \"furniture\" does not.",
      },
      {
        q: "Does the helper bring tools?",
        a: "The form asks whether tools are needed, so answer it. Most flat-pack packs include the "
          + "Allen key that builds them; a power driver is a different matter and worth flagging.",
      },
      {
        q: "Is wall anchoring included?",
        a: "Only where it is straightforward and you have the fixings. Anything that means drilling into "
          + "an unknown wall, or load-bearing fixing you would want certified, is outside an assembly "
          + "booking — say what you need on the form so a helper can judge it before accepting.",
      },
      {
        q: "Do you remove the packaging?",
        a: "The form asks whether you want the packaging dealt with, and the helper can break it down and "
          + "take it out. Disposal beyond your own bins is not part of it.",
      },
      {
        q: "How is it priced?",
        a: "$55 covers the first hour, then $13.75 per extra 15 minutes. Item count drives how much time "
          + "to book rather than adding a separate charge, so the total you see is the total.",
      },
    ],
  },

  "tv-mounting": {
    title: "TV Mounting — Book Wall-Mount Installation | Helpward",
    h1: "Book help mounting your TV",
    intro:
      "A television on the wall instead of on the floor. On Helpward this is the TV Mounting "
      + "service: give the screen size, the wall type and whether you have a bracket, and the "
      + "helper mounts it.",
    faqs: [
      {
        q: "Do I need to supply a bracket?",
        a: "Yes, and the form asks which one you have. A mount has to match both the television and the "
          + "wall, so it is the one thing worth buying before you book rather than after.",
      },
      {
        q: "Which wall types are supported?",
        a: "The form asks whether it is drywall, brick, concrete or something else, because they are "
          + "genuinely different jobs needing different fixings. Say which you have; if you do not know, "
          + "say that instead of guessing.",
      },
      {
        q: "Can you mount a large TV?",
        a: "Screen size is a question on the form and the helper reads it before accepting. A very large "
          + "panel is a two-person lift, so book accordingly rather than hoping.",
      },
      {
        q: "Is cable concealment included?",
        a: "Routing cables tidily, usually. Cutting into a wall to hide them, or any new electrical work, "
          + "is not — that is an electrician's job and no part of this booking.",
      },
      {
        q: "What details affect the quote?",
        a: "Time, and nothing else. It is a flat price for the visit, so screen size and wall type change "
          + "who should accept the job rather than what you pay.",
      },
    ],
  },

  "tech-setup": {
    title: "Home Tech Setup — Wi-Fi, Printers & Devices | Helpward",
    h1: "Get help setting up your home technology",
    intro:
      "The router, the printer, the new laptop, the thing that will not connect to the other thing. "
      + "On Helpward this is the Tech Setup service: say which devices and what you want working at "
      + "the end, and a helper sits down and does it with you.",
    faqs: [
      {
        q: "Can you set up Wi-Fi or a printer?",
        a: "Yes — both are the bread and butter of it, along with new phones, laptops, televisions and "
          + "smart-home devices. The form asks what the goal is, which matters more than the device list: "
          + "\"printing from my phone\" is a finish line, \"printer\" is not.",
      },
      {
        q: "Which device details should I provide?",
        a: "What needs setting up, and what you want working. The more specific the goal, the better the "
          + "chance the hour actually ends with it working.",
      },
      {
        q: "Do I need my own subscriptions and accounts?",
        a: "Yes. A helper configures what you already pay for; they do not buy services on your behalf or "
          + "supply accounts.",
      },
      {
        q: "How are passwords handled?",
        a: "The form asks whether you have your passwords and accounts to hand, because a setup visit "
          + "stalls without them. Type them nowhere in the booking — have them ready for the visit and "
          + "enter them yourself. Nothing in a Helpward request is a place to store a credential.",
      },
      {
        q: "Is data migration included?",
        a: "Moving files and accounts across within the booked time, yes, as far as the time allows. "
          + "Recovering a failed drive or repairing hardware is a different trade and not part of this.",
      },
      {
        q: "How is it priced?",
        a: "$75 covers the first hour, then $18.75 per extra 15 minutes, plus the flat $4.50 service fee. "
          + "Book the time you think it needs; the figure is on screen before you send it.",
      },
    ],
  },

  "appliance-repair": {
    title: "Appliance Diagnostics — Book a Fault Assessment | Helpward",
    h1: "Book an appliance diagnostic visit",
    intro:
      "Something has stopped working and you do not yet know why. This booking buys the finding "
      + "out: a helper comes, assesses the fault and explains it. On Helpward it is the Appliance "
      + "Repair service, and what it delivers is a diagnosis — any actual repair is quoted "
      + "afterwards and is yours to accept or refuse.",
    faqs: [
      {
        q: "Is the repair included in this price?",
        a: "No, and this is the thing worth reading twice. You are booking an assessment: the visit, the "
          + "diagnosis and an explanation of what is wrong. Parts and labour to fix it are quoted "
          + "separately once somebody has actually looked at it.",
      },
      {
        q: "Which appliances can you assess?",
        a: "Ordinary household machines — washers, dryers, dishwashers, fridges, ovens. The form asks "
          + "which appliance, its make and model, and what it is doing, so a helper can tell before "
          + "accepting whether it is something they know.",
      },
      {
        q: "What model details do you need?",
        a: "Make, model, and the symptom in your own words. An error code, if the machine shows one, is "
          + "worth more than a paragraph of description.",
      },
      {
        q: "How are parts and further work quoted?",
        a: "By the helper, after the visit, as a separate arrangement. Helpward's booking covers the "
          + "assessment; it is not a price cap on a repair and does not commit you to one.",
      },
      {
        q: "Can I decline the repair quote?",
        a: "Yes, with nothing further owed. You have paid for the diagnosis and the diagnosis is yours — "
          + "take it to whoever you like.",
      },
      {
        q: "Where is the appliance, and can it be moved?",
        a: "The form asks, because a built-in oven and a freestanding one are different problems. Say "
          + "whether it can be pulled out and whether there is room to work behind it.",
      },
    ],
  },

  "errand-runner": {
    title: "Errand Runner — Hire Help With Everyday Errands | Helpward",
    h1: "Hire someone to run your errands",
    intro:
      "The list of small things that each take twenty minutes and together take an afternoon. On "
      + "Helpward this is the Errand Runner service: write the tasks and the stops in order, set a "
      + "spending limit if money is involved, and a helper works through them.",
    faqs: [
      {
        q: "Which errands can I request?",
        a: "Anything lawful that a person on foot or in a car can do for you: collections, drop-offs, "
          + "posting things, picking things up, queueing at a counter. The form takes one task per line, "
          + "and the stops in the order they should happen.",
      },
      {
        q: "Can a helper shop for items?",
        a: "Yes — set a spending limit on the form and the helper buys within it. If what you want is a "
          + "grocery order you have already placed and paid for, Grocery Pickup is the better fit; if it "
          + "is one parcel going one place, use Package Delivery.",
      },
      {
        q: "How are purchases paid for?",
        a: "Separately from the booking fee, and the spending limit is the control: it is the number a "
          + "helper is not meant to exceed. Keep receipts in the conversation so what was bought and what "
          + "it cost are both on the record.",
      },
      {
        q: "Can I add multiple stops?",
        a: "Yes, and the form asks for them in order. More stops means more time, and time beyond the "
          + "first hour is what moves the price.",
      },
      {
        q: "How do I share handover instructions?",
        a: "In the handover instructions on the booking — gate codes, which buzzer, where to leave things. "
          + "They are saved with the booking and readable only by the helper actually booked, not by every "
          + "helper the request was offered to.",
      },
      {
        q: "Is waiting time included?",
        a: "It is part of the booked time, so yes, within it. $35 covers the first hour and each extra 15 "
          + "minutes is $8.75 — a queue you expect to be long is worth booking time for up front.",
      },
    ],
  },

  "grocery-pickup": {
    title: "Grocery Pickup — Collect Your Prepaid Order | Helpward",
    h1: "Have your prepaid grocery order picked up",
    intro:
      "You have placed and paid for a grocery order; somebody else collects it and brings it to "
      + "you. On Helpward this is the Grocery Pickup service. It is a collection, not a shop — if "
      + "you want someone to choose and buy the items, book Errand Runner instead.",
    faqs: [
      {
        q: "Do I need to order and pay for the groceries first?",
        a: "For this service, yes. It collects an order that already exists and is already paid for, which "
          + "is why the form asks for the store, the order and the collection details rather than for a "
          + "shopping list.",
      },
      {
        q: "Can the helper shop instead?",
        a: "Not under this booking. Use Errand Runner, which takes a list and a spending limit and has "
          + "somebody buy the items for you.",
      },
      {
        q: "Which collection details are required?",
        a: "Which store and branch, the order reference, and what the shop needs to see to release it. "
          + "Those are questions on the form, and a wrong branch is the most common way one of these "
          + "goes wrong.",
      },
      {
        q: "What happens if the order is not ready?",
        a: "The helper cannot make a shop faster. Message them through the booking and decide together "
          + "whether to wait — waiting is part of the booked time — and if the collection genuinely "
          + "cannot happen, you have 24 hours after completion to raise a dispute.",
      },
      {
        q: "What about chilled or frozen items?",
        a: "Say so when you book. A collection is a short trip, but a helper who knows there is ice cream "
          + "in it plans the route differently from one who does not.",
      },
      {
        q: "How is it priced?",
        a: "By the time booked rather than the size of the order or the distance travelled, with the "
          + "complete figure shown before the request is sent.",
      },
    ],
  },

  "package-delivery": {
    title: "Local Package Delivery — Send a Parcel Across Town | Helpward",
    h1: "Book local pickup and delivery for a parcel",
    intro:
      "One parcel, one trip, across the same city. On Helpward this is the Package Delivery "
      + "service: a helper collects from you and hands it to the person you name. It is a local "
      + "courier run, not postal shipping — there is no network behind it and nothing leaves the "
      + "area we cover.",
    faqs: [
      {
        q: "What size parcel can I send?",
        a: "The form asks for size and rough weight, and the answer sets who can take it: something that "
          + "fits in a backpack suits almost any helper, a bulky box needs one with a car. Be accurate "
          + "rather than optimistic — a helper who arrives to find something twice the size described can "
          + "decline it.",
      },
      {
        q: "What destinations are supported?",
        a: "Addresses within the area we operate in, which means Vancouver and the surrounding Lower "
          + "Mainland, or the City of San Diego within city limits. There is no intercity, interprovincial "
          + "or cross-border delivery.",
      },
      {
        q: "Must someone receive the parcel?",
        a: "The form asks who receives it, so name a person and give a way to reach them. If you want it "
          + "left somewhere instead, say exactly where in the handover instructions.",
      },
      {
        q: "What proof of delivery is provided?",
        a: "The helper marks the job complete and you can message them for a photo, which is the sensible "
          + "ask for anything left rather than handed over. The booking keeps a record of when it happened.",
      },
      {
        q: "Can I send documents or keys?",
        a: "Yes, and people do. Nothing illegal, hazardous, or valuable beyond what you would be relaxed "
          + "about losing — there is no platform insurance behind the parcel, so an irreplaceable item is "
          + "better couriered by somebody who insures it.",
      },
      {
        q: "What happens if the recipient is unavailable?",
        a: "Message the helper and sort it out while they are still there — that is what the conversation "
          + "is for. Say up front what should happen if nobody answers; it is a worse question to answer "
          + "from a doorstep.",
      },
    ],
  },

  "package-return": {
    title: "Package Return Pickup — Get Your Returns Dropped Off | Helpward",
    h1: "Arrange pickup and drop-off for your returns",
    intro:
      "The returns pile by the door, taken to the carrier. On Helpward this is the Package Return "
      + "service: a helper collects your parcels and drops them at the right place. What happens "
      + "to your refund after that is the retailer's decision, not ours.",
    faqs: [
      {
        q: "Do I need a return label?",
        a: "You need the parcels to be returnable — the form asks whether the label is printed, emailed "
          + "as a QR code, or not sorted yet. Authorising the return with the retailer is your side of it; "
          + "the helper does the journey.",
      },
      {
        q: "Can the helper use a return QR code?",
        a: "Where the carrier accepts one, yes. Say on the form that is what you have, and make sure the "
          + "code reaches the helper — in the handover instructions, which only the booked helper can read.",
      },
      {
        q: "Can I return multiple parcels?",
        a: "Yes. Three parcels are included in the $25 and each one after that is $3. The form asks how "
          + "many, so the count on the booking matches the pile on the doorstep.",
      },
      {
        q: "Will I receive a drop-off receipt?",
        a: "Ask the helper for a photo of the receipt or the counter scan through the booking conversation. "
          + "It is the only evidence that matters if a retailer later says a parcel never arrived, so it is "
          + "worth asking for every time.",
      },
      {
        q: "Who issues my refund?",
        a: "The retailer, on their own timetable and by their own rules. Helpward moved the parcel; we have "
          + "no part in whether, when, or how much they refund you.",
      },
      {
        q: "Which carriers can you drop off with?",
        a: "The form asks which carrier and your preferred drop-off point. Pick one that is actually open "
          + "and actually accepts returns for your retailer — that pairing is the thing that most often "
          + "goes wrong, and it is set when you book rather than discovered at the counter.",
      },
    ],
  },

  "house-check-in": {
    title: "Home Check-In — Help While You Are Away | Helpward",
    h1: "Book a home check-in while you are away",
    intro:
      "Somebody calls at your house while you are travelling: checks the locks, waters the plants, "
      + "brings in the mail, sends you a photo report. On Helpward this is the House Check-In "
      + "service. It is a short visit, not overnight house sitting — book one for each week you "
      + "are gone if you want regular eyes on the place.",
    faqs: [
      {
        q: "What happens during a home check-in?",
        a: "A visit of the length you book — $30 covers 30 minutes — working through what you asked for: "
          + "doors and windows, plants, post, taps, anything visibly wrong. You get a photo report at the "
          + "end, which is the point of it.",
      },
      {
        q: "Is this overnight house sitting?",
        a: "No. Nobody stays, sleeps, or remains in the property between visits. If what you need is a "
          + "person living there, this is not that service.",
      },
      {
        q: "Can I request repeat visits?",
        a: "Yes, as separate bookings. Save the helper who did the first one as a favourite and send the "
          + "rest to them, so the same person comes back to a house they already know.",
      },
      {
        q: "How do I share access details?",
        a: "In the handover instructions on the booking — where the key is, the alarm code, which door. "
          + "They are stored with the booking and readable only by the helper actually booked for it, "
          + "which is exactly why they do not belong in a chat message or on the public request.",
      },
      {
        q: "Will I receive photos or a report?",
        a: "Yes. Photos and a note of what was found are what you are buying, and the helper sends them "
          + "through the booking.",
      },
      {
        q: "What if they find something wrong?",
        a: "They message you. A helper is not authorised to arrange repairs, let tradespeople in, or make "
          + "decisions about your property — they tell you what they saw and you decide.",
      },
    ],
  },

  "property-inspection": {
    title: "Property Photo & Condition Visit — Visual Report | Helpward",
    h1: "Book a property photo and condition visit",
    intro:
      "A visit to a property, photographs, and a written note of what was visible on the day. On "
      + "Helpward this is the Property Inspection service — most often booked by a landlord, a "
      + "buyer or somebody managing a place from another city. It is a record of a visit, not a "
      + "technical inspection, and the helper is not a licensed inspector.",
    faqs: [
      {
        q: "Is this a licensed home inspection?",
        a: "No, and it should not be used as one. There is no structural, electrical, plumbing or code "
          + "assessment, no licensed inspector, and nothing here is valid for a mortgage, an insurance "
          + "requirement or a pre-purchase condition. It is photographs and a written note of what could "
          + "be seen.",
      },
      {
        q: "What will the report include?",
        a: "Photographs of the areas you asked for and a plain written description of their condition on "
          + "the day of the visit. Observations, not findings, and no opinion on value or compliance.",
      },
      {
        q: "Which areas can be photographed?",
        a: "The ones you nominate and the helper can lawfully reach. The form asks the property type and "
          + "whether it is occupied, because an occupied home sets limits that an empty unit does not.",
      },
      {
        q: "How do I arrange access?",
        a: "Through the handover instructions, which only the booked helper can read. If anyone is living "
          + "there, their consent is yours to obtain before the visit — a helper will not and should not "
          + "talk their way in.",
      },
      {
        q: "When will the report be available?",
        a: "The photographs and notes come through the booking once the visit is complete. The visit is a "
          + "flat price however long it takes.",
      },
    ],
  },

  "wait-in-line": {
    title: "Hire Someone to Wait in Line — Line Sitter Service | Helpward",
    h1: "Pay someone to wait in an eligible line for you",
    intro:
      "Spend someone else's hours in the queue instead of your own. On Helpward this is the Wait "
      + "in Line service: a helper holds a place for as long as you book, then hands it over where "
      + "the venue allows it. You are paying for their time — not for admission, a ticket, or "
      + "whatever is at the front.",
    faqs: [
      {
        q: "Can someone hold my place at this venue?",
        a: "That is the venue's call, and you should check before you book. Plenty of queues allow it; "
          + "ticketed events, government offices and anything requiring the named person to be present "
          + "usually do not. Helpward cannot overrule a venue's rules and does not promise it can.",
      },
      {
        q: "How do we hand over the place?",
        a: "You meet the helper in the queue and take their spot. Agree a meeting point in the booking "
          + "and stay in touch as the line moves, because the handover is the part that needs timing.",
      },
      {
        q: "What if the helper reaches the front first?",
        a: "Then the booking has run out of usefulness unless you are there. A helper cannot buy, enter, "
          + "register or sign on your behalf — plan to arrive before the front, and extend the booking if "
          + "the queue moves slower than you thought.",
      },
      {
        q: "Can I extend the waiting time?",
        a: "Yes. $35 covers the first hour and each extra 30 minutes is $9. Arrange it with the helper "
          + "through the booking — their time is theirs, so an extension is an agreement rather than "
          + "something you can impose.",
      },
      {
        q: "Are tickets or purchases included?",
        a: "No. Nothing is bought on your behalf and nothing at the front of the line is included. You "
          + "are buying someone's hours standing still.",
      },
      {
        q: "What if the venue refuses the handover?",
        a: "Then the place is lost, and no one can promise otherwise. This is the real risk of the "
          + "service, which is why checking the venue's policy first is worth more than anything we could "
          + "write here.",
      },
    ],
  },

  "elder-assistance": {
    title: "Senior Companionship — Everyday Help for Older Adults | Helpward",
    h1: "Book companionship and everyday help for an older adult",
    intro:
      "Company, and a hand with the ordinary things — grocery trips, doctor visits, conversation, "
      + "light housekeeping. On Helpward this is the Elder Assistance service, booked by the hour "
      + "for a parent or grandparent, or for yourself. It is companionship and practical help, not "
      + "care.",
    faqs: [
      {
        q: "Is this medical or personal care?",
        a: "No. No medication is given or managed, no personal or intimate care, no nursing, no clinical "
          + "task of any kind. Helpers are approved by a person at Helpward, not licensed care "
          + "professionals, and anything in that territory needs a home-care provider instead.",
      },
      {
        q: "Can I book for a family member?",
        a: "Yes, and most people do. Say in the booking who the visit is for and how to reach them, and "
          + "tell them a helper is coming — arriving unannounced at an older person's door is nobody's "
          + "idea of help.",
      },
      {
        q: "What activities are included?",
        a: "Conversation, a walk, a grocery trip, light housekeeping, help with post and forms, company "
          + "for an outing. $76 covers the first two hours, with $19 per extra 30 minutes.",
      },
      {
        q: "Can a helper accompany an appointment?",
        a: "They can go along and be company, carry things, and take notes if asked. They cannot speak "
          + "for the person, consent to treatment, or make a decision on anyone's behalf.",
      },
      {
        q: "What accessibility details should I share?",
        a: "All of them, in the booking: stairs, mobility aids, hearing, memory, language, anything that "
          + "shapes how the visit should go. A helper who knows before accepting is a helper who can "
          + "actually help.",
      },
      {
        q: "Can the same helper come back?",
        a: "Yes, and for this service it matters more than most. Save them as a favourite and send future "
          + "requests to them first, so visits are from a familiar face rather than a new one each time.",
      },
    ],
  },

  "listening-service": {
    title: "Listening Service — Book Someone to Talk To | Helpward",
    h1: "Book an audio conversation with a listener",
    intro:
      "Half an hour of somebody's attention, on a call. On Helpward this is the Listening Service: "
      + "audio only, for as long as you book, with a person whose whole job for that time is to "
      + "listen. It is not therapy and no helper here is a therapist.",
    faqs: [
      {
        q: "Is this therapy or counselling?",
        a: "No. There is no clinical training behind it, no diagnosis, no treatment and no care plan — "
          + "it is a conversation with someone willing to listen. If you are in crisis or need clinical "
          + "help, please contact a licensed professional or your local emergency or crisis line.",
      },
      {
        q: "Is the session audio only?",
        a: "Yes. There is no video and nobody travels to you, which is why nothing on this booking has an "
          + "arrival time or a route to track.",
      },
      {
        q: "How long can I book?",
        a: "$20 covers the first 30 minutes, with $15 per extra 30 minutes. Book the length you want "
          + "rather than planning to extend mid-call.",
      },
      {
        q: "How do I join the call?",
        a: "Through the booking, at the time you chose — the call is placed within Helpward, so you do not "
          + "exchange phone numbers to make it happen.",
      },
      {
        q: "Is the conversation recorded?",
        a: "Not by Helpward. Nobody on either side should be recording it either, and if a helper suggests "
          + "otherwise, end the call and tell support.",
      },
      {
        q: "What if the call cannot connect?",
        a: "A call that did not happen is not a job done. Message through the booking, and if it genuinely "
          + "could not go ahead you have 24 hours after completion to raise a dispute and have a person at "
          + "Helpward look at it.",
      },
    ],
  },

  "sleep-call-companion": {
    title: "Sleep Call Companion — Quiet Audio Company | Helpward",
    h1: "Book quiet audio company while you fall asleep",
    intro:
      "A quiet voice on a call while you fall asleep, for an agreed stretch of time. On Helpward "
      + "this is the Sleep Call Companion service: audio only, as much or as little conversation as "
      + "you want, and a definite end time set when you book.",
    faqs: [
      {
        q: "How long does the call last?",
        a: "As long as you booked, and no longer. $30 covers the first hour, with $15 per extra 30 "
          + "minutes. There is no open-ended or all-night call — the end time is fixed before it starts.",
      },
      {
        q: "Is this audio only?",
        a: "Yes. No video, and nobody comes to you.",
      },
      {
        q: "What happens when I fall asleep?",
        a: "The helper stays on for the time you booked and then ends the call. That is what the agreed "
          + "end time is for — it means nobody has to decide anything while you are asleep.",
      },
      {
        q: "Can I choose quiet company instead of conversation?",
        a: "Yes, and plenty of people do. Say which you want when you book, so the helper knows whether "
          + "they are talking or just there.",
      },
      {
        q: "Is the call recorded?",
        a: "Not by Helpward, and no one on the call should be recording it.",
      },
      {
        q: "Is this a treatment for insomnia?",
        a: "No. It is company, not medicine. It makes no claim to treat insomnia, anxiety or any condition, "
          + "and persistent sleep trouble is worth raising with a doctor.",
      },
    ],
  },

  "rent-a-friend": {
    title: "Rent a Friend — Book Platonic Company | Helpward",
    h1: "Book platonic company for an activity",
    intro:
      "Somebody to go with, when going alone is the thing stopping you. On Helpward this is the "
      + "Rent a Friend service: company for a few hours, for a walk, a meal, a gallery, a gig. It "
      + "is platonic, and it is time rather than a relationship.",
    faqs: [
      {
        q: "Is this strictly platonic?",
        a: "Yes, entirely, with no exceptions. It is not dating, not romantic and not sexual; there is no "
          + "version of this booking that becomes any of those things. A helper can end a booking and "
          + "report it if someone treats it that way, and that account is closed.",
      },
      {
        q: "Which activities can I book?",
        a: "Ordinary public things: a coffee, a walk, a meal, an exhibition, a match, a shopping trip. $70 "
          + "covers the first two hours and each extra 30 minutes is $17.50.",
      },
      {
        q: "Are meals and tickets included?",
        a: "No. You are paying for someone's time. Anything bought along the way — food, entry, transport — "
          + "is settled separately and is worth agreeing before you go rather than at the till.",
      },
      {
        q: "Where do we meet?",
        a: "Somewhere public, agreed in the booking before the day. That is the norm for this service and "
          + "a helper is entitled to insist on it.",
      },
      {
        q: "Can I request the same companion again?",
        a: "Yes. Save them as a favourite and later requests can go to them first.",
      },
    ],
  },

  "date-companion": {
    title: "Platonic Date Companion — Book a Dinner Plus-One | Helpward",
    h1: "Book a platonic plus-one for dinner or an occasion",
    intro:
      "A plus-one for a dinner or an occasion where turning up alone is the awkward part. On "
      + "Helpward this is the Date Companion service: one person, accompanying you, for the hours "
      + "you book. The name describes the occasion, not the relationship — it is platonic.",
    faqs: [
      {
        q: "Is this a romantic or sexual service?",
        a: "No, and this is not a soft boundary. It is accompaniment and conversation in public, nothing "
          + "else, ever. Any approach otherwise ends the booking and the account.",
      },
      {
        q: "Can I book a dinner plus-one?",
        a: "Yes — that is the central case. $90 covers the first two hours, with $22.50 per extra 30 "
          + "minutes, so book through to when the evening actually ends.",
      },
      {
        q: "Are food and event costs included?",
        a: "No. The booking buys time. Dinner, drinks, entry and transport are separate, and worth settling "
          + "in advance so neither of you is working it out at the table.",
      },
      {
        q: "Can I specify a dress code?",
        a: "Yes, and you should if the venue has one. Put it in the booking rather than mentioning it on "
          + "the night.",
      },
      {
        q: "Where does the booking begin and end?",
        a: "At the public meeting point and the time you agreed, and it ends when the booked hours do. "
          + "Nobody is obliged to continue past it and nobody should be asked to.",
      },
    ],
  },

  "event-companion": {
    title: "Event Companion — Book a Platonic Event Plus-One | Helpward",
    h1: "Book a plus-one for your event",
    intro:
      "Somebody alongside you at an event — a work function, a reception, a party where you know "
      + "two people. On Helpward this is the Event Companion service: they attend with you, for "
      + "the hours you book, platonically.",
    faqs: [
      {
        q: "Which events can I book for?",
        a: "Networking evenings, work functions, receptions, parties, launches — anything you are "
          + "attending and would rather not attend alone. $150 covers the first three hours, with $25 per "
          + "extra 30 minutes.",
      },
      {
        q: "Does the companion need a ticket?",
        a: "If the event needs one, yes, and that is yours to arrange. Make sure their name is on the list "
          + "before the day; a companion turned away at the door is still a booking you made.",
      },
      {
        q: "Can I share a dress code or an agenda?",
        a: "Yes, and it makes the difference between a plus-one who fits the room and one who does not. "
          + "Put the dress code, the running order and anything they should know in the booking.",
      },
      {
        q: "Are travel and event expenses included?",
        a: "No. Time only; tickets, travel, food and drink are separate and best agreed up front.",
      },
      {
        q: "Is this a platonic service?",
        a: "Yes, without exception. It is attendance and conversation, and nothing in it is romantic or "
          + "sexual.",
      },
      {
        q: "How is it different from booking a wedding guest?",
        a: "Here the companion is with you. Wedding Guest fills seats at an event you are hosting, which is "
          + "a different job with a different briefing.",
      },
    ],
  },

  "shopping-companion": {
    title: "Shopping Companion — Company & Help at the Shops | Helpward",
    h1: "Book a companion for your shopping trip",
    intro:
      "Somebody to come shopping with you: company, a second opinion, and a hand with the bags. On "
      + "Helpward this is the Shopping Companion service. They go with you — if you would rather "
      + "someone went instead of you, that is Errand Runner.",
    faqs: [
      {
        q: "Will the companion shop with me or for me?",
        a: "With you. The whole service is company on the trip. Shopping done on your behalf, without you "
          + "there, is Errand Runner.",
      },
      {
        q: "Is personal styling included?",
        a: "No. A friendly second opinion, yes; professional styling or wardrobe consulting, no — helpers "
          + "are approved by a person at Helpward, not credentialled stylists.",
      },
      {
        q: "Can they help carry bags?",
        a: "Yes, within reason — what one person can reasonably carry. Say in the booking if it is likely "
          + "to be heavy, so a helper knows before accepting.",
      },
      {
        q: "Are purchases included?",
        a: "No. You buy what you buy; the booking is the companion's time. $70 covers the first two hours, "
          + "with $17.50 per extra 30 minutes.",
      },
      {
        q: "Can we visit more than one store?",
        a: "Yes, as many as fit the time. Say roughly where you are going, especially if mobility or "
          + "accessibility shapes the route.",
      },
    ],
  },

  "wedding-guest": {
    title: "Wedding Guest Service — Book Extra Guests | Helpward",
    h1: "Arrange additional guests for your wedding",
    intro:
      "Seats filled at your wedding by people who have been briefed and will behave well. On "
      + "Helpward this is the Wedding Guest service: attendance for the hours you book, by "
      + "approved helpers who know what you have told them and nothing you have not.",
    faqs: [
      {
        q: "Can I book more than one guest?",
        a: "Yes, as separate bookings — one per person. $135 covers the first three hours of each, with "
          + "$22.50 per extra 30 minutes.",
      },
      {
        q: "What should I include in the briefing?",
        a: "Who they are meant to be to you, names they will hear, the running order, the dress code, and "
          + "anything they should not be drawn into. The more concrete the briefing, the less anyone has to "
          + "improvise.",
      },
      {
        q: "Are meals and venue access included?",
        a: "No, and both are yours to arrange. If the venue counts heads or seats by name, tell them — a "
          + "guest who is not on the list is a problem on the day, not a surprise worth risking.",
      },
      {
        q: "Does the venue need to know?",
        a: "You should assume yes. It is your event and your relationship with the venue; Helpward is "
          + "supplying attendance, not permission.",
      },
      {
        q: "How is time and guest count priced?",
        a: "Per person, by time booked. Each guest is their own booking with its own hours, so the total is "
          + "simply the sum of them, each shown in full before you send it.",
      },
      {
        q: "How does this differ from an event companion?",
        a: "An Event Companion goes with you to someone else's event. This fills seats at yours. Different "
          + "job, different briefing.",
      },
    ],
  },

  "family-standin": {
    title: "Family Stand-In — Book a Briefed Event Role | Helpward",
    h1: "Discuss a family stand-in role for your event",
    intro:
      "A briefed, agreed role at an event where a family member will not be there. On Helpward "
      + "this is the Family Stand-In service, and it is the most constrained thing in the "
      + "catalogue: a social role at a social occasion, with everyone involved consenting, and "
      + "nothing that strays into representing you in any official way.",
    faqs: [
      {
        q: "Which roles are available?",
        a: "Social attendance roles at events — a seat filled, a person present, a briefed introduction. "
          + "That is the extent of it, and the specifics are agreed with the helper before the booking "
          + "goes ahead.",
      },
      {
        q: "How much briefing is included?",
        a: "As much as the booked time allows, and more is better here than anywhere else in the "
          + "catalogue. $300 covers the first three hours, with $50 per extra 30 minutes.",
      },
      {
        q: "What is outside the scope?",
        a: "Anything legal, medical, financial or official. No signing, no consenting, no speaking to "
          + "institutions, no identity documents, no deceiving anyone whose decision depends on it. A "
          + "helper will decline a request shaped like that, and so will Helpward.",
      },
      {
        q: "How are rehearsal and event time priced?",
        a: "Both as booked time, at the same rate — a rehearsal is time somebody spends. Book the hours "
          + "you need for both.",
      },
      {
        q: "Can I request several people?",
        a: "Yes, as separate bookings with separate briefings. Each person sees their own.",
      },
    ],
  },
};
