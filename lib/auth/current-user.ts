import "server-only";
import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/*
  ONE AUTH CHECK PER REQUEST, NOT FOUR.

  Rendering /admin/inbox used to call supabase.auth.getUser() in the
  layout and again in the page, each one a network call to the auth
  service, each one roughly a round trip. The answer is identical both
  times — it is the same request, the same cookie, the same second.

  React's cache() makes the first call the only call: everything else
  in the same render gets the memoised result. NOTHING ABOUT THE CHECK
  IS WEAKENED. getUser() still verifies the token with the auth server
  rather than decoding it locally, RLS still decides what the database
  will hand over, and requireAdmin() still refuses a non-admin. What
  goes away is asking the same question three times in a row.

  The client itself is cached for the same reason: one per request
  rather than one per caller, so the cookie jar and the token it holds
  are read once.
*/

export const getRequestClient = cache(async () => createSupabaseServerClient());

/** The signed-in user, verified once per request. Null when signed out. */
export const getCurrentUser = cache(async () => {
  const supabase = await getRequestClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
});

/**
 * The admin claim, read from the verified session.
 *
 * It lives in app_metadata rather than profiles.role on purpose: a row
 * a user could update is not an authorization source. This only reads
 * what getUser() already verified.
 */
export const getCurrentRole = cache(async (): Promise<string> => {
  const user = await getCurrentUser();
  return (user?.app_metadata?.role as string | undefined) ?? "customer";
});

export const isCurrentUserAdmin = cache(async () => (await getCurrentRole()) === "admin");
