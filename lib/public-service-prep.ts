/*
  WHAT TO HAVE READY BEFORE THE HELPER ARRIVES.

  Every one of these is something the booking form already asks about, or
  something a job actually stalls on: a lead nobody can find, a bracket
  that was never bought, a password that lives in somebody's head, a
  return label still sitting in an inbox. A customer who reads this
  before booking has a better job than one who reads it on the doorstep.

  THE PRIVATE HALF IS NOT HERE, DELIBERATELY. Gate codes, alarm codes,
  key locations and "the spare is under the third pot" go in the
  handover instructions on the booking, which only the helper actually
  booked can read — not the several helpers an open request is offered
  to. These public lists say WHAT to prepare; they never contain the
  thing itself, and nothing here should ever be filled in with a real
  customer's details.
*/

export type ServicePrep = { items: string[] };

/** Heading, by how the service is delivered. */
export function prepHeading(deliveredByCall: boolean): string {
  return deliveredByCall ? "Before your session" : "Before your helper arrives";
}

/**
 * The one line that belongs on every physical service: where the
 * private details go, so they never end up on a public page.
 */
export const HANDOVER_LINE =
  "Keys, gate and alarm codes, and where to leave things go in the handover "
  + "instructions on your booking. Only the helper booked for the job can read "
  + "them — not everyone the request was offered to.";

export const SERVICE_PREP: Record<string, ServicePrep> = {
  "designated-driver": {
    items: [
      "Have your keys and the car where you said it would be — a parkade level is not a street address.",
      "Know whether the car is automatic or manual, and say so on the form. A manual needs a driver who can drive one.",
      "Make sure the car is legal to drive: insured, registered, and with enough fuel for the trip.",
      "Count your passengers before booking. Everyone travelling has to fit, belted, in your own car.",
    ],
  },
  "motorcycle-taxi": {
    items: [
      "Say on the form whether you need a helmet provided. Nobody rides without a legal one.",
      "Dress for a motorcycle: covered arms and legs, closed shoes, nothing loose.",
      "Keep luggage to what you can carry safely on a bike — a backpack, not a suitcase.",
      "Be ready to postpone. A rider can decline conditions they judge unsafe, and should.",
    ],
  },
  "car-battery-jump": {
    items: [
      "Say exactly where the car is parked, and whether a second vehicle can pull alongside it.",
      "Know your make and model, and where the battery sits — engine bay, boot, or under a seat. \"Not sure\" is a fine answer.",
      "Make sure the car is reachable: unlocked, or with someone there to open it.",
      "Switch everything off — lights, heater, radio — before the helper arrives.",
    ],
  },
  "dog-walking": {
    items: [
      "Leave the lead and harness where you said they would be, and say where that is on the form.",
      "Put out fresh water, and treats if your dog has them.",
      "Tell us anything the walker should know: reactivity to other dogs, pulling, recall, a sore leg. Honesty here keeps everyone safe.",
      "Say how many dogs are going and what size they are, so the walker knows what they are agreeing to.",
    ],
  },
  "maid-service": {
    items: [
      "Decide what to focus on. Two hours spent where you want them beats two hours spread thin.",
      "Say whether you are supplying cleaning products or want the cleaner to bring their own.",
      "Clear surfaces of anything precious or personal before the visit.",
      "Tell us about pets, and shut them somewhere safe if they would rather not meet a vacuum.",
    ],
  },
  "moving-help": {
    items: [
      "Book the van separately. This is labour — helpers load and carry, they do not supply a vehicle.",
      "Pack and seal your boxes first. The booked time is for moving things, not filling them.",
      "List what is actually being moved, including anything heavy or awkward, so the crew can decline before arriving rather than after.",
      "Sort out parking at both ends, and say what the access is: stairs, a lift, a long carry.",
    ],
  },
  "furniture-assembly": {
    items: [
      "Have the boxes in the room where the furniture will live, so nothing has to be carried through a doorway once built.",
      "Check the parts and fittings are all there — a missing cam lock is between you and the retailer, and it stops the job.",
      "Say what the items are, ideally by product name, and how many.",
      "Clear floor space to work in, and say on the form whether you want the packaging broken down.",
    ],
  },
  "tv-mounting": {
    items: [
      "Buy the bracket before you book, and make sure it matches both the television and the wall.",
      "Know your wall: drywall, brick, concrete or something else. They need different fixings and it changes the job.",
      "Have the screen size to hand. A very large panel is a two-person lift.",
      "Clear the wall and the floor beneath it, and decide where the cables should run.",
    ],
  },
  "tech-setup": {
    items: [
      "Have your passwords and account logins ready — and enter them yourself. Do not put a credential in the booking.",
      "Say what you want working at the end. \"Printing from my phone\" is a finish line; \"printer\" is not.",
      "Make sure any subscription you need is already paid for. A helper configures what you have; they do not buy it.",
      "Unbox the devices and have them near a power socket.",
    ],
  },
  "appliance-repair": {
    items: [
      "Find the make, model and any error code the machine shows. It is worth more than a paragraph of description.",
      "Clear access to the appliance, and say whether it can be pulled out and whether there is room behind it.",
      "Know that this booking buys the diagnosis. Parts and repair are quoted afterwards, and you can decline.",
      "Do not run the appliance just before the visit if it is leaking or tripping power.",
    ],
  },
  "errand-runner": {
    items: [
      "Write one task per line, and list the stops in the order they should happen.",
      "Set a spending limit if anything is being bought. It is the number the helper is not meant to exceed.",
      "Have anything being dropped off packed and ready by the door.",
      "Say what happens if a shop is closed or an item is out of stock, so nobody has to guess from the pavement.",
    ],
  },
  "grocery-pickup": {
    items: [
      "Place and pay for the order first — this service collects an order that already exists, at a flat price.",
      "Have the order reference and the exact store branch — a wrong branch is the most common way this goes wrong.",
      "Check the collection slot, and tell the shop someone else is picking up if they require it.",
      "Flag chilled or frozen items when you book, so the route is planned around them.",
    ],
  },
  "package-delivery": {
    items: [
      "Have the parcel sealed, labelled with the destination, and ready at the door.",
      "Describe the size and weight honestly. A helper who arrives to find something twice the size described can decline it.",
      "Name who receives it and give a way to reach them.",
      "Say what should happen if nobody answers. That is a bad question to answer from a doorstep.",
    ],
  },
  "package-return": {
    items: [
      "Start the return with the retailer first. Authorising it is your side; the helper does the journey.",
      "Print the label, or have the QR code ready to pass on through the booking.",
      "Pack and seal each parcel, and count them — the number on the booking should match the pile by the door.",
      "Pick a carrier and drop-off point that is open and actually accepts returns for that retailer.",
    ],
  },
  "house-check-in": {
    items: [
      "List what you want done: doors and windows, plants, post, taps, bins.",
      "Say whether there is an alarm, and put the code in your handover instructions rather than anywhere public.",
      "Tell us about pets, including any that will be in the house during the visit.",
      "Leave the place reachable — a key where you said, or a neighbour who is expecting someone.",
    ],
  },
  "property-inspection": {
    items: [
      "Say what the property is and whether anyone is living there. An occupied home sets limits an empty unit does not.",
      "Get the occupier's consent before the visit if someone lives there. A helper will not talk their way in.",
      "Nominate the rooms and areas you want photographed.",
      "Arrange access through your handover instructions — a key, a lockbox, or someone to let them in.",
    ],
  },
  "wait-in-line": {
    items: [
      "Check the venue allows someone to hold a place. That is their rule, not ours, and a refused handover loses the spot.",
      "Agree a meeting point, and plan to arrive before the front of the queue.",
      "Hand over anything the helper needs from you — but nothing that only works with your ID present.",
      "Book longer than you think. Extending depends on the helper agreeing, and a queue rarely moves to plan.",
    ],
  },
  "elder-assistance": {
    items: [
      "Tell the person a helper is coming. Arriving unannounced at an older person's door helps nobody.",
      "Say what help is wanted: company, a grocery trip, light housekeeping, going along to an appointment.",
      "Share mobility, hearing, memory and language needs honestly, so the helper knows before they accept.",
      "Remember this is not care. No medication, no personal care, no nursing — that needs a home-care provider.",
    ],
  },
  "shopping-companion": {
    items: [
      "Agree a meeting point and roughly which shops you are heading to.",
      "Say if mobility or accessibility shapes the route, so the plan suits the day.",
      "Flag if the bags are likely to be heavy — it is what one person can reasonably carry.",
      "Bring your own means of paying. The companion's time is what the booking covers.",
    ],
  },
  "rent-a-friend": {
    items: [
      "Pick something ordinary and public: a coffee, a walk, a gallery, a match.",
      "Agree the public meeting point in the booking, before the day.",
      "Settle who pays for what beforehand — food, entry and transport are not included.",
      "Book the hours you actually want. The booking ends when they do.",
    ],
  },
  "date-companion": {
    items: [
      "Book the restaurant yourself, and book the hours through to when the evening really ends.",
      "Share the dress code when you book, not on the night.",
      "Agree the public meeting point in advance.",
      "Agree how the bill is handled beforehand, so neither of you is working it out at the table.",
    ],
  },
  "event-companion": {
    items: [
      "Sort the ticket or guest-list entry. A companion turned away at the door is still a booking you made.",
      "Share the dress code, the running order and anything they should know about the room.",
      "Agree where and when you are meeting, and for how long.",
      "Settle expenses in advance — travel, food and drink are separate from the booking.",
    ],
  },
  "wedding-guest": {
    items: [
      "Check with your venue. It is your event and your relationship with them; we supply attendance, not permission.",
      "Write the briefing properly: who they are to you, names they will hear, the running order, and what not to be drawn into.",
      "Arrange seating and catering for them if the venue counts heads.",
      "Book one person per booking, for the hours you need each of them.",
    ],
  },
  "family-standin": {
    items: [
      "Be clear about the role, and keep it social. Nothing legal, medical, financial or official.",
      "Book time for the briefing as well as the event — a rehearsal is time somebody spends.",
      "Make sure everyone whose decision depends on it is not being deceived. A helper will decline otherwise.",
      "Book separately for each person, with their own briefing.",
    ],
  },
  "listening-service": {
    items: [
      "Find somewhere quiet where you can speak freely for the time you booked.",
      "Allow your phone to use the microphone when the app asks, or the call cannot start.",
      "Check your signal or Wi-Fi a few minutes before, and put your phone on charge.",
      "Have a sense of what you want to talk about, though there is no obligation to stick to it.",
    ],
  },
  "sleep-call-companion": {
    items: [
      "Be ready for bed before the call starts. The end time is fixed when you book.",
      "Allow microphone access, and keep the phone charging within reach.",
      "Say whether you want quiet company or conversation, so the helper knows which they are doing.",
      "Use headphones or a speaker you can leave beside you comfortably.",
    ],
  },
};

/** The preparation list for a service, or null if none is written. */
export function servicePrep(id: string): string[] | null {
  return SERVICE_PREP[id]?.items ?? null;
}
