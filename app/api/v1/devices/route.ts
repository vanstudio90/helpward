import { withBearerAuth } from "@/lib/api/bearer";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

/*
  Where the app hands over its APNs token.

  Registration UPSERTS ON THE TOKEN, not on (user, token), and that is
  the whole point of the unique index. A token identifies a DEVICE. When
  somebody signs out and a colleague signs in on the same phone, the row
  must move to the new user — if it duplicated, the previous holder
  would keep receiving another person's job offers on a phone they no
  longer have.

  Written with the service client on purpose. The move case is exactly
  the one RLS cannot do: dt_insert_own would refuse a row still owned by
  the previous user, so the upsert would fail and the old owner would
  keep the device. The caller is authenticated first and the row is
  written for THAT user id and no other, so nothing here takes a user id
  from the request body.
*/

type Body = {
  token?: string;
  environment?: string;
  platform?: string;
};

export const POST = withBearerAuth(async ({ user }, request) => {
  let body: Body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const token = String(body.token ?? "").trim();
  // An APNs token is hex. Checked because this is a unique key, and a
  // junk value would occupy the slot a real device needs.
  if (!/^[0-9a-fA-F]{64,200}$/.test(token)) {
    return Response.json({ error: "That is not a device token." }, { status: 400 });
  }

  const environment = body.environment === "sandbox" ? "sandbox" : "production";
  const platform = body.platform === "android" || body.platform === "web"
    ? body.platform
    : "ios";

  const admin = createSupabaseServiceClient();
  const { error } = await admin
    .from("device_tokens")
    .upsert(
      {
        user_id: user.id,
        token,
        environment,
        platform,
        last_seen_at: new Date().toISOString(),
        // A device coming back after a reinstall is alive again.
        disabled_at: null,
        disabled_reason: null,
      },
      { onConflict: "token" },
    );

  if (error) return Response.json({ error: error.message }, { status: 409 });
  return Response.json({ registered: true });
});

/*
  Signing out should stop the notifications.

  Deleted rather than disabled: disabled_at means "APNs says this device
  is gone", and a working phone whose owner signed out is a different
  thing. Conflating them would make the retire-stale sweep lie.
*/
export const DELETE = withBearerAuth(async ({ user }, request) => {
  const token = new URL(request.url).searchParams.get("token");
  if (!token) return Response.json({ error: "Which device?" }, { status: 400 });

  const admin = createSupabaseServiceClient();
  const { error } = await admin
    .from("device_tokens")
    .delete()
    .eq("token", token)
    // Only your own. A token you do not hold is not yours to unregister.
    .eq("user_id", user.id);

  if (error) return Response.json({ error: error.message }, { status: 409 });
  return Response.json({ unregistered: true });
});
