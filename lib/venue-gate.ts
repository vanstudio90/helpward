/*
 * Whether a waiting job may proceed at a given venue.
 *
 * The rule this encodes: a customer cannot give Helpward permission to
 * break somebody else's queue rules. Whether a paid stand-in is allowed is
 * the venue's decision, and the only three honest states are "we checked
 * and it is allowed", "we checked and it is not", and "nobody has checked".
 *
 * The third is NOT the first. Treating unknown as allowed is how a service
 * ends up sending helpers to queues that eject them; treating unknown as
 * refused would mean launching with a directory of almost nothing and
 * blocking every venue in both cities. So unknown proceeds, with the risk
 * stated plainly to the customer and verified by the helper on arrival —
 * and `venue_refused_substitution` exists as a completion outcome
 * precisely because that verification sometimes fails.
 */

export type VenuePermission = "allowed" | "refused" | "unknown";

export type VenueRecord = {
  name: string;
  substitutesAllowed: VenuePermission;
  customerMayReplace: VenuePermission;
  fullPartyRequired: VenuePermission;
  numbersTransferable: VenuePermission;
  earlyTurnPolicy: string | null;
  confirmedAt: string | null;
};

export type GateVerdict =
  | { allow: false; reason: string }
  | { allow: true; level: "confirmed" | "unverified"; notice: string | null };

/**
 * @param venue    the directory row, or null when the venue is not listed
 * @param handover "swap" means the customer takes the helper's place —
 *                 the case a venue is most likely to prohibit
 */
export function checkVenue(
  venue: VenueRecord | null,
  handover: string | undefined,
): GateVerdict {
  // Not in the directory: nobody has checked. Proceed, say so.
  if (!venue) {
    return {
      allow: true,
      level: "unverified",
      notice:
        "We haven't confirmed this venue's rules. Your helper will check with staff when they "
        + "arrive, and will tell you straight away if a stand-in isn't allowed — you won't be "
        + "charged for the wait if the venue refuses.",
    };
  }

  // Checked, and the answer was no. This is the only hard block: we know
  // the job cannot be done, so taking the booking would be taking money
  // for something we have already established is impossible.
  if (venue.substitutesAllowed === "refused") {
    return {
      allow: false,
      reason:
        `${venue.name} doesn't allow anyone to queue on someone else's behalf, so we can't take `
        + `this booking. If their policy has changed, let us know and we'll re-check it.`,
    };
  }

  // Substitutes are fine, but the handover specifically is not.
  if (handover === "swap" && venue.customerMayReplace === "refused") {
    return {
      allow: false,
      reason:
        `${venue.name} doesn't allow a place to be handed over, so your helper can't swap out `
        + `for you. They can still collect something for you if that's permitted — change the `
        + `handover option to do that.`,
    };
  }

  if (venue.substitutesAllowed === "allowed") {
    const extra: string[] = [];
    if (venue.fullPartyRequired === "allowed") {
      extra.push("everyone in your party must be present before you're seated or admitted");
    }
    if (venue.numbersTransferable === "refused") {
      extra.push("queue numbers here can't be transferred, so you'll need to arrive for the handover");
    }
    if (venue.earlyTurnPolicy) extra.push(venue.earlyTurnPolicy);

    return {
      allow: true,
      level: "confirmed",
      notice: extra.length
        ? `We've confirmed ${venue.name} allows this. Worth knowing: ${extra.join("; ")}.`
        : `We've confirmed ${venue.name} allows a helper to wait and hand over.`,
    };
  }

  // Listed, but this particular question was never answered.
  return {
    allow: true,
    level: "unverified",
    notice:
      `We have ${venue.name} on file but haven't confirmed their stand-in policy. Your helper `
      + `will check on arrival, and you won't be charged for the wait if they're turned away.`,
  };
}
