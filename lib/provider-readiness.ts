// ONE definition of what a helper needs before they can work.
//
// There were three, and they disagreed. The Dashboard banner required
// id_verified_at; the onboarding checklist listed ID and background
// checks as numbered steps; and the database — which is the only one
// that actually decides — required none of it.
//
// What the SERVER enforces, which is therefore what is true:
//
//   offer_request / matching (0004, 0030)
//       provider_profiles.status = 'approved'
//       provider_profiles.is_online = true
//       at least one provider_services row
//   accept_request (0045) -> assert_helper_payable (0043)
//       stripe_transfers_active = true
//
// id_verified_at and background_verified_at are read by NOTHING. They are
// written by nothing either — Stripe Identity and Checkr are not wired —
// so id_verified_at is permanently null for every helper who has ever
// signed up. The Dashboard's check therefore evaluated true for all of
// them, forever: every helper in the system was told to go and verify an
// ID, including the ones already completing paid jobs.
//
// This is not a check being weakened. It is a requirement that was
// displayed but never required, removed from the display so that what a
// helper is told matches what the system will do. If those checks are
// ever wired, they become requirements HERE, once, and all three surfaces
// follow — which is the point of this file.

export type ProviderReadiness = {
  /** provider_profiles.status */
  status: string | null;
  /** provider_profiles.is_online */
  isOnline: boolean;
  /** Rows in provider_services. */
  serviceCount: number;
  /** stripe_transfers_active — a destination charge will actually land. */
  transfersActive: boolean;
  /** provider_profiles.bio — not enforced, but a customer sees it. */
  hasBio: boolean;
};

export type Requirement = {
  key: "approval" | "services" | "payouts";
  label: string;
  /** What to do about it, written for the person who has to do it. */
  detail: string;
  met: boolean;
  /** Null when there is nothing for the helper to do but wait. */
  href: string | null;
  action: string | null;
};

/**
 * Everything standing between this helper and paid work, in the order it
 * has to happen, each either met or not.
 */
export function providerRequirements(r: ProviderReadiness): Requirement[] {
  const approved = r.status === "approved";
  return [
    {
      key: "approval",
      label: "Application approved",
      detail: approved
        ? "A person at Helpward approved your application."
        : r.status === "suspended"
          ? "Your account is suspended. Contact support to restore access."
          : "A person at Helpward reads every application. We'll email you when yours is decided.",
      met: approved,
      // Nothing the helper can press makes a human decide faster, and a
      // button that implies otherwise is worse than no button.
      href: r.status === "suspended" ? "/help" : null,
      action: r.status === "suspended" ? "Contact support" : null,
    },
    {
      key: "services",
      label: "Services you offer",
      detail: r.serviceCount > 0
        ? `You're offering ${r.serviceCount} ${r.serviceCount === 1 ? "service" : "services"}.`
        : "Pick at least one service. Offers only reach helpers who offer that service.",
      met: r.serviceCount > 0,
      href: "/provider/onboard",
      action: r.serviceCount > 0 ? "Change services" : "Pick services",
    },
    {
      key: "payouts",
      label: "Bank account connected",
      detail: r.transfersActive
        ? "Payouts are active."
        : "Connect a bank account. You can't accept a job until payouts work, because the payment would have nowhere to land.",
      met: r.transfersActive,
      href: "/provider/onboard",
      action: r.transfersActive ? null : "Connect payouts",
    },
  ];
}

/** The requirements not yet met. */
export function outstandingRequirements(r: ProviderReadiness): Requirement[] {
  return providerRequirements(r).filter((q) => !q.met);
}

/**
 * Whether this helper can take a job right now.
 *
 * MIRRORS THE SERVER. Deliberately excludes is_online: being offline is a
 * choice a ready helper makes, not an incomplete setup, and telling
 * someone their account is unfinished because they clocked off is the
 * same class of error as the ID check.
 */
export function canAcceptWork(r: ProviderReadiness): boolean {
  return r.status === "approved" && r.serviceCount > 0 && r.transfersActive;
}

/** Ready, but not currently receiving offers because they're offline. */
export function isReadyButOffline(r: ProviderReadiness): boolean {
  return canAcceptWork(r) && !r.isOnline;
}
