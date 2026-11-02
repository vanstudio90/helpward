import { withBearerAuth } from "@/lib/api/bearer";
import { cancelPendingDeletion, type CancellationTrigger } from "@/lib/account-deletion";

/*
  Calling off a scheduled deletion, from the app.

  TWO CALLERS, ONE ENDPOINT:

    signed_in  AuthService calls this immediately after a successful
               password sign-in, because that is what the delete screen
               and the website both promise happens.
    undo       The customer taps "Keep my account" on the screen that
               tells them deletion is scheduled, while still signed in.

  The second exists because the first is not enough on its own. Scheduling
  deletion does not sign anyone out, so somebody who changes their mind a
  minute later is still holding a valid session and has nothing to "sign
  back in" to. Telling them to sign out and in again to undo a mis-tap is
  not a recovery path anybody should have to be told.

  IT IS NOT GATED ON A PASSWORD, deliberately, and this is the opposite
  judgement to the one the POST next door makes. Step-up protects the
  irreversible direction. Requiring it to KEEP an account would mean
  somebody who could not remember their password had no way to stop the
  countdown, which turns a forgotten password into a deleted account.
*/

const TRIGGERS: CancellationTrigger[] = ["signed_in", "undo"];

export const POST = withBearerAuth(async ({ user }, request) => {
  /*
    The body is optional. A sign-in sends nothing in the ordinary case
    and should not be refused for it, so a missing or unparseable body
    means the default trigger rather than a 400.
  */
  let trigger: CancellationTrigger = "signed_in";
  try {
    const body = (await request.json()) as { trigger?: unknown };
    const asked = String(body?.trigger ?? "") as CancellationTrigger;
    if (TRIGGERS.includes(asked)) trigger = asked;
  } catch {
    // Keep the default.
  }

  const result = await cancelPendingDeletion(user.id, trigger);

  /*
    `cancelled: false` is a 200, not a 404. Nothing was pending is the
    answer on nearly every sign-in there will ever be, and an error
    status would make the app treat the normal case as a fault.
  */
  return Response.json(result);
});
