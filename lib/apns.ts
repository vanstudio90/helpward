import "server-only";
import { sign as cryptoSign } from "node:crypto";
import http2 from "node:http2";

/*
  PUSH, SENT BY US, TO APPLE, WITH NOBODY IN BETWEEN.

  No SDK and no third party: a device token goes to api.push.apple.com
  over HTTP/2 with a signed JWT, which is the whole protocol. The
  alternative on the table was OneSignal, which would have meant their
  SDK in the binary, a privacy-manifest entry, an App Store
  data-collection disclosure, and uploading this same Apple key to them
  anyway.

  Three details that are easy to get wrong and expensive to debug,
  because APNs answers all of them with the same unhelpful 403:

  1. THE JWT SIGNATURE IS NOT DER. Node's default ECDSA output is a DER
     SEQUENCE; JWS ES256 wants the raw r||s pair. `dsaEncoding:
     "ieee-p1363"` asks for exactly that, and skipping it produces a
     token Apple rejects as malformed.

  2. THE TOKEN MUST BE REUSED. Apple rate-limits provider token
     generation and refuses a token older than an hour, so it is cached
     and regenerated on a timer rather than per send. Minting one per
     notification gets the whole app throttled.

  3. SANDBOX AND PRODUCTION ARE DIFFERENT HOSTS. A token registered by a
     development or TestFlight build is meaningless to the production
     host and vice versa, which is why device_tokens records which one
     it came from and this sends to each group separately.
*/

const HOSTS = {
  production: "https://api.push.apple.com",
  sandbox: "https://api.sandbox.push.apple.com",
} as const;

export type ApnsEnvironment = keyof typeof HOSTS;

export function apnsConfigured(): boolean {
  return Boolean(
    process.env.APNS_KEY &&
      process.env.APNS_KEY_ID &&
      process.env.APNS_TEAM_ID &&
      process.env.APNS_BUNDLE_ID,
  );
}

/** Regenerated well inside Apple's one-hour limit. */
const TOKEN_TTL_MS = 45 * 60 * 1000;
let cached: { token: string; madeAt: number } | null = null;

function providerToken(): string {
  if (cached && Date.now() - cached.madeAt < TOKEN_TTL_MS) return cached.token;

  const key = (process.env.APNS_KEY ?? "").replace(/\\n/g, "\n");
  const header = { alg: "ES256", kid: process.env.APNS_KEY_ID };
  const claims = { iss: process.env.APNS_TEAM_ID, iat: Math.floor(Date.now() / 1000) };
  const encode = (o: unknown) =>
    Buffer.from(JSON.stringify(o)).toString("base64url");
  const signingInput = `${encode(header)}.${encode(claims)}`;

  // ieee-p1363, not DER. See note 1 above.
  const signature = cryptoSign("sha256", Buffer.from(signingInput), {
    key,
    dsaEncoding: "ieee-p1363",
  }).toString("base64url");

  const token = `${signingInput}.${signature}`;
  cached = { token, madeAt: Date.now() };
  return token;
}

/** Discard the cached JWT — called when Apple says it is no longer good. */
function forgetProviderToken() {
  cached = null;
}

export type ApnsAlert = {
  title: string;
  body: string;
  /** Delivered to the app, not shown. Used to open the right screen. */
  data?: Record<string, string>;
  /** Unread count to show on the app icon. Omit to leave it alone. */
  badge?: number;
  /**
   * A job offer expires, so it is allowed through Focus and a locked
   * screen the way a ride request is. Anything that can wait is not.
   *
   * Requires the Time Sensitive Notifications capability; without it
   * iOS ignores the level rather than failing, so this is safe to send
   * before the entitlement is enabled.
   */
  timeSensitive?: boolean;
  /** Collapses earlier notifications with the same id. */
  collapseId?: string;
};

export type ApnsSendResult = {
  sent: number;
  /** Tokens APNs says are dead — the app was deleted or reinstalled. */
  dead: string[];
  errors: { token: string; reason: string }[];
};

/**
 * Deliver one alert to many tokens in a single environment.
 *
 * One HTTP/2 session for the batch, which is the point of HTTP/2 and
 * the reason this is not a loop of fetch() calls.
 */
export async function sendApns(
  tokens: string[],
  environment: ApnsEnvironment,
  alert: ApnsAlert,
): Promise<ApnsSendResult> {
  const result: ApnsSendResult = { sent: 0, dead: [], errors: [] };
  if (!apnsConfigured() || tokens.length === 0) return result;

  const body = JSON.stringify({
    aps: {
      alert: { title: alert.title, body: alert.body },
      sound: "default",
      ...(alert.badge === undefined ? {} : { badge: alert.badge }),
      ...(alert.timeSensitive ? { "interruption-level": "time-sensitive" } : {}),
    },
    ...(alert.data ?? {}),
  });

  const client = http2.connect(HOSTS[environment]);
  // A connection-level failure must not take the caller down with it;
  // every token in this batch is reported as an error instead.
  const connectionError = new Promise<Error>((resolve) =>
    client.once("error", resolve),
  );

  try {
    await Promise.all(
      tokens.map(
        (token) =>
          new Promise<void>((resolve) => {
            const request = client.request({
              ":method": "POST",
              ":path": `/3/device/${token}`,
              authorization: `bearer ${providerToken()}`,
              "apns-topic": process.env.APNS_BUNDLE_ID,
              "apns-push-type": "alert",
              // 10 = deliver immediately. The lower setting exists to
              // save battery by letting iOS hold a notification, which
              // is the opposite of what an expiring offer needs.
              "apns-priority": "10",
              ...(alert.collapseId ? { "apns-collapse-id": alert.collapseId } : {}),
              "content-type": "application/json",
            });

            let status = 0;
            let payload = "";
            request.setEncoding("utf8");
            request.on("response", (headers) => {
              status = Number(headers[":status"] ?? 0);
            });
            request.on("data", (chunk) => {
              payload += chunk;
            });
            request.on("error", (e) => {
              result.errors.push({ token, reason: e.message });
              resolve();
            });
            request.on("end", () => {
              if (status === 200) {
                result.sent += 1;
              } else {
                let reason = payload;
                try {
                  reason = (JSON.parse(payload) as { reason?: string }).reason ?? payload;
                } catch {
                  /* keep the raw body */
                }
                /*
                  410 Unregistered means the app is gone from that
                  device; BadDeviceToken means it was never ours. Both
                  are permanent, so the row is retired rather than
                  retried forever.
                */
                if (status === 410 || reason === "BadDeviceToken" || reason === "Unregistered") {
                  result.dead.push(token);
                } else {
                  if (reason === "ExpiredProviderToken") forgetProviderToken();
                  result.errors.push({ token, reason: `${status} ${reason}` });
                }
              }
              resolve();
            });

            request.end(body);
          }),
      ),
    );
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    for (const token of tokens) result.errors.push({ token, reason: error.message });
  } finally {
    client.close();
  }

  // Surface a connection failure that never produced per-request errors.
  if (result.sent === 0 && result.errors.length === 0 && result.dead.length === 0) {
    const error = await Promise.race([
      connectionError,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 0)),
    ]);
    if (error) for (const token of tokens) result.errors.push({ token, reason: error.message });
  }

  return result;
}
