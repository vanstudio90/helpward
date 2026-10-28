/*
 * CLASSIFYING THE ANON NEGATIVE CONTROL.
 *
 * The positive assertion — the service key gets 200 and the role name
 * back — proves authority. The negative control exists to prove that
 * assertion MEANS something: the same probe must be refused for the anon
 * key, because if anon can execute it too, a 200 distinguishes nothing.
 *
 * The control was written as `status !== 200 -> refused`, which treats
 * the ABSENCE OF SUCCESS as the PRESENCE OF A DENIAL. Those are different
 * claims. An audit injected an unrelated HTTP 500 for the anon request
 * and preflight printed "anon key is refused the service-only probe" and
 * returned GO; a 404 did the same. The control had not run, and said it
 * had passed.
 *
 * This is the same mistake as reading an RLS empty array as a refusal,
 * one layer up, so it gets the same treatment: name the exact answer that
 * constitutes proof, and call everything else inconclusive.
 *
 * PostgreSQL raises 42501 (insufficient_privilege) when EXECUTE is
 * denied, and PostgREST surfaces it as 401 or 403 with that code in the
 * body. That — and only that — is a demonstrated denial.
 */

/** @typedef {{ verdict: "denied" | "allowed" | "inconclusive", reason: string }} Classification */

const INSUFFICIENT_PRIVILEGE = "42501";

/**
 * What did the anon control actually establish?
 *
 * @param {number|null} status HTTP status, or null if the request failed.
 * @param {string|null} body   Response body, or null.
 * @param {unknown} [networkError] Set when the request never completed.
 * @returns {Classification}
 */
export function classifyAnonControl(status, body, networkError) {
  if (networkError) {
    return {
      verdict: "inconclusive",
      reason: `the request never completed (${String(
        networkError && typeof networkError === "object" && "message" in networkError
          ? networkError.message
          : networkError,
      ).slice(0, 120)})`,
    };
  }

  if (status === 200) {
    return {
      verdict: "allowed",
      reason: "anon executed the service-only probe successfully, so EXECUTE is not " +
              "actually restricted and the positive assertion proves nothing",
    };
  }

  let parsed = null;
  if (typeof body === "string" && body.length > 0) {
    try { parsed = JSON.parse(body); } catch { parsed = null; }
  }

  // The one answer that proves a denial.
  if ((status === 401 || status === 403) && parsed?.code === INSUFFICIENT_PRIVILEGE) {
    return { verdict: "denied", reason: `${status} with SQLSTATE ${INSUFFICIENT_PRIVILEGE}` };
  }

  if (status === 404) {
    return {
      verdict: "inconclusive",
      reason: "404 — the function is missing from PostgREST's schema cache, so nothing " +
              "was tested. This is not a denial.",
    };
  }
  if (status === 429) {
    return { verdict: "inconclusive", reason: "429 rate limited — the control did not run" };
  }
  if (typeof status === "number" && status >= 500) {
    return { verdict: "inconclusive", reason: `${status} server error — the control did not run` };
  }
  if (status === 401 || status === 403) {
    // Right status, wrong reason: an invalid or expired anon key is an
    // AUTHENTICATION failure, which says nothing about the grant.
    const msg = parsed?.message ?? parsed?.code ?? (body ?? "").slice(0, 80);
    return {
      verdict: "inconclusive",
      reason: `${status} but not SQLSTATE ${INSUFFICIENT_PRIVILEGE} (${msg}) — that is an ` +
              "authentication failure, not a demonstrated permission denial",
    };
  }

  return {
    verdict: "inconclusive",
    reason: `unexpected status ${status}${parsed ? "" : " with a non-JSON body"}`,
  };
}
