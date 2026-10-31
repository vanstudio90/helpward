import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { withBearerAuth } from "@/lib/api/bearer";

/*
  Account deletion, from the app.

  APPLE REQUIRES THIS IN THE APP. Guideline 5.1.1(v): an app that
  supports account creation must let someone begin deleting the account
  from inside it. Settings used to point at the website, which is not
  what the guideline asks for and is a rejection at review.

  The behaviour is deliberately identical to the web Server Action in
  app/(app)/settings/actions.ts — same table, same 30-day grace, same
  audit entry, same "already scheduled" response — because two deletion
  paths that behave differently is how one of them ends up forgotten.

  WHAT IT IS NOT: an immediate wipe. It schedules. A cron
  (/api/cron/execute-account-deletions) does the erasing once the grace
  window closes, and signing back in during that window cancels it. That
  is the honest shape: a mis-tap on a phone must not be irreversible.

  STEP-UP STILL APPLIES. The web action re-checks the password before
  scheduling, because a leaked session alone should not be able to start
  an irreversible countdown. The app sends the same password and it is
  verified here against the caller's own identity.
*/

export const POST = withBearerAuth(async ({ user }, request) => {
  let body: { password?: unknown; confirm?: unknown; reason?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  // The same words the web form demands, so support can describe one
  // process rather than two.
  if (String(body.confirm ?? "").trim() !== "DELETE") {
    return Response.json({ error: 'Type "DELETE" exactly to confirm.' }, { status: 400 });
  }

  const password = String(body.password ?? "");
  if (!password) {
    return Response.json({ error: "Enter your password to confirm." }, { status: 400 });
  }
  if (!user.email) {
    return Response.json(
      { error: "This account has no password sign-in. Contact support to delete it." },
      { status: 400 },
    );
  }

  /*
    Step-up, verified by actually signing in with the password on a
    throwaway client. A boolean the app computed would be a boolean the
    app could send without the password.
  */
  const check = createSupabaseServiceClient();
  const { error: pwError } = await check.auth.signInWithPassword({
    email: user.email,
    password,
  });
  if (pwError) {
    return Response.json({ error: "That password is not right." }, { status: 401 });
  }

  const admin = createSupabaseServiceClient();
  const reason = String(body.reason ?? "").trim().slice(0, 500) || null;

  // A unique partial index allows one pending row per user, so an
  // existing request is reported rather than duplicated.
  const { data: existing } = await admin
    .from("account_deletion_requests")
    .select("grace_until")
    .eq("user_id", user.id)
    .eq("status", "pending")
    .maybeSingle();
  if (existing) {
    return Response.json({ scheduled: true, graceUntil: existing.grace_until, already: true });
  }

  const { data: row, error } = await admin
    .from("account_deletion_requests")
    .insert({ user_id: user.id, reason, status: "pending" })
    .select("grace_until")
    .single();
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  await admin.from("audit_log").insert({
    actor_id: user.id,
    action: "user.deletion_requested",
    target_table: "account_deletion_requests",
    target_id: user.id,
    payload: { reason_provided: Boolean(reason), source: "ios" },
  });

  return Response.json({ scheduled: true, graceUntil: row.grace_until, already: false });
});
