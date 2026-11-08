import { withBearerAuth } from "@/lib/api/bearer";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { startHelperOnboarding, refreshHelperPayoutState } from "@/lib/payments";

/*
  PAYOUT SETUP, FROM THE APP.

  Connecting a bank account is Stripe's own hosted flow — identity
  documents, bank details, the lot — so the app opens a web page for it
  rather than rebuilding it in SwiftUI. That is not a loophole: being
  paid for real-world work is not a digital purchase, and Stripe's
  onboarding is the only place those details may be typed.

  Two verbs, because the hosted flow has two ends:

    POST  mint a fresh account link and hand back its URL
    GET   ask Stripe what the state actually is, now

  GET exists because account.updated is a webhook, and a webhook can be
  late, retried or misconfigured — while the helper is standing here NOW
  looking at a step that still says unfinished. The website's onboarding
  page does the same thing on return for the same reason.
*/

const RETURN_TO =
  `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://helpward.com"}/helper/onboard?payouts=done`;

export const POST = withBearerAuth(async ({ user }) => {
  const result = await startHelperOnboarding(user.id, RETURN_TO);
  if (!result.ok) {
    return Response.json({ error: result.message }, { status: 409 });
  }
  return Response.json({ url: result.url, accountId: result.accountId });
});

export const GET = withBearerAuth(async ({ user }) => {
  /*
    Read the stored account id with the service client rather than the
    caller's: pp_read lets a helper read their own row, but this is the
    one field where asking Stripe about someone else's account id would
    be a real leak, so the id is resolved from the authenticated user
    and never taken from the request.
  */
  const admin = createSupabaseServiceClient();
  const { data: profile } = await admin
    .from("provider_profiles")
    .select("stripe_connect_account_id, stripe_transfers_active")
    .eq("user_id", user.id)
    .maybeSingle();

  const accountId = profile?.stripe_connect_account_id as string | null | undefined;
  if (!accountId) {
    // Not started is not an error. It is the state every helper begins in.
    return Response.json({ started: false, transfersActive: false });
  }

  const refreshed = await refreshHelperPayoutState(accountId);
  if (!refreshed.ok) {
    /*
      Stripe would not answer. Report the flag we already hold rather
      than inventing "not payable", which would tell a helper whose
      payouts are fine that they cannot work.
    */
    return Response.json({
      started: true,
      transfersActive: profile?.stripe_transfers_active === true,
      stale: true,
      error: refreshed.message,
    });
  }

  return Response.json({ started: true, transfersActive: refreshed.payable, stale: false });
});
