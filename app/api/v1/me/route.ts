import { withBearerAuth } from "@/lib/api/bearer";
import { publishableKeyFor } from "@/lib/stripe";

/*
  Who the caller is, and which database answered.

  This route exists to make the native app's authentication path provable
  on demand rather than discoverable during a payment. It is the first
  thing to check when the app says it cannot reach Helpward: a 401 means
  the token is the problem, a 200 naming the wrong project means the build
  is pointed at the wrong backend.

  It reads the role through the RLS-scoped client, so a 200 here also
  proves the caller's policies resolve — not merely that their token
  parses.
*/
export const GET = withBearerAuth(async ({ user, supabase }) => {
  // Filtered by id: profiles_read exposes every provider row, so an
  // unfiltered single() returns someone else's row and a wrong role.
  // This is the same trap the web sign-in hit.
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_review_account")
    .eq("id", user.id)
    .maybeSingle();

  /*
    The Supabase project ref, derived from the URL rather than stored
    separately so it cannot drift from the project actually being talked
    to. "xhmgmegraieouudyjjlv" is production; "ximiprtvddqdadbvfyjn" is
    rehearsal.
  */
  const projectRef =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.match(/https:\/\/([^.]+)\./)?.[1] ?? "unknown";

  return Response.json({
    userId: user.id,
    // The profiles row is the authority on role. app_metadata carries a
    // copy for the middleware's routing, and the two can disagree if a
    // role is changed without re-issuing the token.
    role: profile?.role ?? "customer",
    environment: projectRef,
    /*
      WHICH STRIPE THE APP SHOULD TALK TO, decided here rather than
      compiled in. An App Review account transacts in Stripe TEST mode —
      live mode rejects a test card — and the only way to do that without
      shipping two key sets in the binary is for the server to say which
      publishable key applies to the signed-in account.

      A publishable key is public by design; the secret never leaves the
      server. An ordinary account is told the live key and nothing about
      the review configuration.
    */
    isReviewAccount: Boolean(profile?.is_review_account),
    stripePublishableKey: publishableKeyFor(Boolean(profile?.is_review_account)),
  });
});
