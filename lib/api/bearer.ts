import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";

/*
  Authenticating an API request from the NATIVE APP.

  The web app authenticates from the Supabase session COOKIE, which the
  browser sends automatically and @supabase/ssr reads in
  createSupabaseServerClient(). A native app has no cookie jar we control
  and no browser bundle, so it carries the same session as a bearer token
  instead:

      Authorization: Bearer <supabase access token>

  It is the same token, issued by the same Supabase project, verified the
  same way. What changes is only where it travels.

  WHY NOT JUST REUSE THE SERVER ACTIONS: a Next.js Server Action is
  invoked by an encrypted action id that ships inside the web bundle and
  changes on every build. Nothing outside that bundle can call one. That
  is why the app gets purpose-built /api/v1 routes rather than a way to
  reach the existing mutations.
*/

export type BearerAuth = {
  user: User;
  /**
   * A Supabase client that acts AS THE CALLER — every query it runs is
   * subject to the same RLS policies as the web app.
   *
   * Deliberately not the service-role client. Service role bypasses RLS
   * entirely, so a route that used it would be re-implementing, by hand,
   * every policy the database already enforces — and the first one
   * forgotten is a data leak. Routes that genuinely need to bypass RLS
   * (webhooks, cron) should keep using createSupabaseServiceClient and
   * say why.
   */
  supabase: SupabaseClient;
};

export type BearerFailure = { error: string; status: 401 };

function isFailure(result: BearerAuth | BearerFailure): result is BearerFailure {
  return "error" in result;
}

/**
 * Resolve the caller from the Authorization header.
 *
 * Returns the user and an RLS-scoped client, or a 401 shape describing
 * what was wrong with the header. Never throws on a bad token — an
 * unauthenticated caller is an expected condition, not a fault.
 */
export async function authenticateBearer(
  request: Request,
): Promise<BearerAuth | BearerFailure> {
  const header = request.headers.get("authorization");

  if (!header) {
    return { error: "Missing Authorization header.", status: 401 };
  }

  // Case-insensitive on the scheme: RFC 7235 says the scheme is a token
  // compared case-insensitively, and URLSession is not the only client
  // that will ever call this.
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) {
    return { error: "Authorization header must be 'Bearer <token>'.", status: 401 };
  }

  const token = match[1].trim();
  if (!token) {
    return { error: "Bearer token is empty.", status: 401 };
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    // A configuration fault, not the caller's. Surfaced as 401 rather
    // than 500 only because this helper's contract is 401-or-success;
    // the message says plainly that it is our end.
    return { error: "Server is not configured for token auth.", status: 401 };
  }

  const supabase = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  /*
    getUser(token) verifies the JWT against the project's signing key on
    Supabase's side. It is NOT the same as decoding the token here and
    trusting the claims — a locally-decoded JWT proves only that someone
    sent us a well-formed string.
  */
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    return { error: "Your session has expired. Please sign in again.", status: 401 };
  }

  return { user: data.user, supabase };
}

/**
 * The 401 body shape every route answers with, matching what the app's
 * APIClient decodes: `{ "error": "..." }`.
 */
export function bearerFailureResponse(failure: BearerFailure): Response {
  return Response.json({ error: failure.error }, { status: failure.status });
}

/**
 * Wraps a handler so it only runs for an authenticated caller.
 *
 *   export const GET = withBearerAuth(async ({ user, supabase }) => { ... });
 */
export function withBearerAuth(
  handler: (auth: BearerAuth, request: Request) => Promise<Response>,
): (request: Request) => Promise<Response> {
  return async (request: Request) => {
    const result = await authenticateBearer(request);
    if (isFailure(result)) return bearerFailureResponse(result);
    return handler(result, request);
  };
}
