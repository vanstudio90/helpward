# How the submitted binary handles review accounts

**The brief asked how the binary "routes the disclosed review accounts
into the isolated environment". It does not, and that is the design
decision — so it is worth stating plainly rather than quietly.**

## What was asked for, and what was built instead

Routing a review account to a different backend would mean the binary
carrying a second environment: another Supabase URL, another anon key,
and a switch that selects between them. Two things follow from that, and
both are worse than the problem:

1. The switch exists in everyone's copy. Whatever gates it — a build
   flag, a hidden gesture, an email suffix — is in the binary and can be
   found. "Ordinary users must not gain access to test-payment controls"
   is hard to guarantee once the control ships.
2. **The reviewer would not be testing the submitted app.** They would
   be testing it against a backend no customer uses. The point of review
   access is to exercise what ships.

So isolation is **per account, inside production**, not per backend:

- The submitted binary points at `helpward.com` and the production
  Supabase project. One environment, like every customer's copy.
- `profiles.is_review_account` marks the demonstration account.
  `provider_profiles.is_review_helper` marks the controlled helper.
- The database's matching function enforces the separation **both
  ways**: a review request reaches only review helpers, and a real
  request reaches none of them.
- Stripe mode follows the account: review accounts transact against test
  keys, with real SetupIntents, real authorisations and real captures.
- The publishable key is **returned by `/api/v1/me`** for the signed-in
  account, so the binary ships no review configuration and no second key
  set.

## Why ordinary users cannot reach any of it

- Neither flag can be set by its owner. Both tables carry a trigger that
  rejects the change unless the caller is an admin — tested, and it
  refuses.
- There is nothing to toggle in the app. The publishable key is whatever
  the server returned for that account; an ordinary account is told the
  live key.
- A test helper cannot be offered a real booking, so the pool cannot
  leak work in either direction.
- Review rows live in production tables but are matchable only by the
  review helper. **This is the real trade-off of the approach**: review
  bookings are production rows, flagged, rather than rows in a separate
  database. They should be excluded from operational reporting by the
  same flag.

## What stays separate

| | Real | Review |
|---|---|---|
| Supabase project | production | production, flagged rows |
| Matched helpers | approved public helpers | the controlled test helper only |
| Stripe secret | `STRIPE_SECRET_KEY` (live) | `STRIPE_TEST_SECRET_KEY` (`sk_test_` only — the code refuses anything else) |
| Stripe publishable | live, compiled in | test, returned by `/api/v1/me` |
| Stripe customers, payment methods, payouts | live account | test account — different objects entirely |
| Webhooks | live endpoint + secret | test-mode events do not reach the live endpoint |

## Environment variables to configure before submission

In the deployment environment, never in a document or a commit:

```
STRIPE_TEST_SECRET_KEY        sk_test_…    required for the review journey
STRIPE_TEST_PUBLISHABLE_KEY   pk_test_…    returned by /api/v1/me to review accounts
```

If `STRIPE_TEST_SECRET_KEY` is missing or is not an `sk_test_` key, a
review account's payment **throws** rather than falling back to the live
client. That is deliberate: a silent fallback would charge a reviewer
real money.

## Still required before this works in production

The review journey runs entirely on production code paths, but those
paths are not all in production yet:

- `/api/v1/requests` returns 404 until the cutover, so the app cannot
  create a request at all.
- Migration `0088` creates the flags and the matching rule. It is in
  this release and applied to the isolated environment; production is at
  `0080`.
- The review customer and the controlled helper must be created, and the
  two flags set by an admin, after the cutover.

Until then the journey is demonstrable only in the isolated environment,
which is where it has been exercised.
