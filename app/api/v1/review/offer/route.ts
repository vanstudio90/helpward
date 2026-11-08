import { createClient } from "@supabase/supabase-js";
import { withBearerAuth } from "@/lib/api/bearer";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { POST as createRequest } from "@/app/api/v1/requests/route";

/*
  PUT A JOB IN THE REVIEWER'S INBOX.

  The controlled helper's inbox is empty for a structural reason, not a
  broken one: every request a review account creates is accepted inside
  that same call, by design, so a reviewer on the CUSTOMER side never
  waits for a human. A reviewer on the HELPER side gets the opposite
  problem — the offer is answered before they can see it.

  So this asks the ordinary creation route for one, left standing.

  It calls that route's handler DIRECTLY rather than reimplementing it.
  The route's own comment is emphatic that it is a re-use of the web's
  one-shot path and not a second implementation — same dispatch guard,
  intake validation, trip check, country seal, database pricer, quote
  seal and broadcast, in that order, each present because something went
  wrong without it. A review-only shortcut past any of those would be
  demonstrating a path no customer takes, which is the one thing the
  review notes promise we do not do.

  Refuses anybody who is not a controlled helper.
*/

/** What a reviewer is told to enter for Errand Runner, so the demo job
 *  matches the notes rather than being a different thing with the same
 *  name. */
const DEMO_JOB = {
  serviceId: "errand-runner",
  address: "1055 W Georgia St, Vancouver, BC",
  intake: {
    tasks: "Collect dry cleaning",
    stops: "Robson St dry cleaners",
    spend_cap: "20",
  },
  leaveUnaccepted: true,
} as const;

export const POST = withBearerAuth(async ({ user }) => {
  const admin = createSupabaseServiceClient();

  // Controlled helpers only. This mints a session for another account,
  // so the gate is the whole security of the endpoint.
  const { data: helper } = await admin
    .from("provider_profiles")
    .select("is_review_helper")
    .eq("user_id", user.id)
    .maybeSingle();
  if (helper?.is_review_helper !== true) {
    return Response.json({ error: "Not available on this account." }, { status: 403 });
  }

  const { data: customer } = await admin
    .from("profiles")
    .select("id")
    .eq("is_review_account", true)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (!customer?.id) {
    return Response.json(
      { error: "No review customer account exists. Run scripts/setup-review-accounts.mjs." },
      { status: 409 },
    );
  }

  const { data: authUser } = await admin.auth.admin.getUserById(customer.id);
  const email = authUser?.user?.email;
  if (!email) {
    return Response.json({ error: "The review customer has no email." }, { status: 409 });
  }

  /*
    A SESSION FOR THE REVIEW CUSTOMER, WITHOUT KNOWING THEIR PASSWORD.

    generateLink mints the token and does NOT send an email, so nothing
    reaches a real inbox. Exchanged immediately for a session that is
    used once, here, and never leaves this function — the customer's
    password stays where it is, in the operator's 0600 file.
  */
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  const hashedToken = link?.properties?.hashed_token;
  if (linkError || !hashedToken) {
    return Response.json(
      { error: linkError?.message ?? "Could not start a session for the review customer." },
      { status: 500 },
    );
  }

  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data: session, error: otpError } = await anon.auth.verifyOtp({
    token_hash: hashedToken,
    type: "magiclink",
  });
  const accessToken = session?.session?.access_token;
  if (otpError || !accessToken) {
    return Response.json(
      { error: otpError?.message ?? "Could not start a session for the review customer." },
      { status: 500 },
    );
  }

  const created = await createRequest(
    new Request("https://helpward.com/api/v1/requests", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(DEMO_JOB),
    }),
  );

  const body = await created.json();
  if (!created.ok) {
    return Response.json(
      { error: (body as { error?: string }).error ?? "Could not create the demo job." },
      { status: created.status },
    );
  }

  /*
    candidateCount is the number actually offered it. Zero means the
    request exists and nobody was told — the controlled helpers being
    offline or stale — and a reviewer staring at an empty inbox deserves
    to know that rather than assume the app is broken.
  */
  return Response.json({
    requestId: (body as { requestId: string }).requestId,
    offeredTo: (body as { candidateCount?: number }).candidateCount ?? 0,
  });
});
