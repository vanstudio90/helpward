# Cutover checklist

Feature and SEO work is frozen. What follows is execution only.

Tick each line as it happens and keep this file with the release.

## 1. Owner — provision the scratch project

- [ ] Create a new Supabase project (any name, free tier, same region as
      production). It must be **blank** — the rehearsal refuses a database
      with any applied migration or any `auth.users`.
- [ ] Put its connection string and ref in the deployment environment or
      your shell, never in a file or a message:

```
export REHEARSAL_PROJECT_REF='<the new project ref>'
export REHEARSAL_DATABASE_URL='<its connection string>'
```

## 2. Developer — run the rehearsal

- [ ] `node scripts/rehearse-upgrade.mjs`
- [ ] It builds `0080` from the migrations, stops if it does not land
      there, seeds fixtures, then applies `0081` → `0089` one at a time.
- [ ] Record the full transcript here or beside this file.
- [ ] Confirm the six checks at the end pass: the matching signature,
      the `0072` municipality filter surviving, symmetric isolation, the
      self-promotion guards, `req_read` losing the offered-helper clause
      while keeping the booked helper, and `offer_summary` existing.
- [ ] Resolve any failure and re-run from a **fresh** project. A
      half-applied database is not a rehearsal.

## 3. Deployment operator — production configuration

- [ ] `DATABASE_URL` in the authorised environment. **Still outstanding.**
      Needs the production database password, which Supabase does not
      return through any API — it can only be read from the dashboard or
      reset there. This is the one item that blocks the migration step.
- [x] `STRIPE_TEST_SECRET_KEY` — added to Vercel Production 2026-11-01.
      Authenticated against Stripe as `acct_1UUsXV8ZAIHcYg7R` in test
      mode before upload, so the key is known valid and known test-mode.
      The code refuses anything but `sk_test_` rather than falling back
      to live.
- [x] `STRIPE_TEST_PUBLISHABLE_KEY` — added to Vercel Production
      2026-11-01, `pk_test_` confirmed at source.
- [x] `STRIPE_TEST_WEBHOOK_SECRET` — added to Vercel Production
      2026-11-01, taken from the sandbox secret recorded in
      `.env.rehearsal`, which that file documents as created on
      2026-10-26 against the endpoint registered at
      `https://helpward.com/api/webhooks/stripe`.
- [x] Endpoint identity confirmed by API: endpoint
      `we_1UUtvH8ZAIHcYg7RPhZ9KsN1` is `enabled` and points at
      `https://helpward.com/api/webhooks/stripe`.

  **Read this before opening Stripe.** The sandbox is a SEPARATE ACCOUNT,
  not a test mode of the live platform:

      live platform   acct_1UUsXQ6i5ULJPPDA   STRIPE_SECRET_KEY (sk_live_)
      sandbox         acct_1UUsXV8ZAIHcYg7R   STRIPE_TEST_SECRET_KEY

  So every review booking transacts wholly inside the sandbox account,
  and the endpoint above lives there. The live platform's endpoints are
  in a different account and were not touched. An account-scoped
  dashboard URL carrying the other id silently lands you in the wrong
  account — that has already cost one round trip here.

  Verification limit, stated plainly: `vercel env pull` masks every
  encrypted value, so the three uploads cannot be read back and compared.
  Presence and encryption are confirmed by `vercel env ls production`.
  The key values prove out at the first deploy through
  `scripts/preflight.mjs`; the signing secret proves out only on a
  Stripe-**delivered** test event, not on anything checkable from here.

- [ ] **Add four events to the test-mode payments endpoint.** It is
      subscribed to `payment_intent.succeeded` alone, but the handler
      processes five:

          payment_intent.amount_capturable_updated
          payment_intent.canceled
          payment_intent.payment_failed
          payment_intent.succeeded
          charge.refunded

      The missing `amount_capturable_updated` is the durable half of the
      authorise-at-acceptance recovery. Without it, a reviewer whose
      browser dies between bank approval and the app recording it keeps a
      booking that never shows its hold confirmed, and no retry fixes it.

      In the **sandbox account `acct_1UUsXV8ZAIHcYg7R`** (switch
      accounts first; confirm the id before clicking anything):
      Developers → Webhooks → `we_1UUtvH8ZAIHcYg7RPhZ9KsN1` →
      Update details → add the four events.

      Editing enabled events does **not** rotate the signing secret, so
      the value already uploaded stays correct. Do not delete and
      recreate the endpoint: that *would* issue a new secret and the
      uploaded one would then be wrong.

## 4. Deployment operator — backup and approval

- [x] **Owner approved the cutover, 2026-11-01.**
- [ ] On-demand Supabase backup — **not taken.** The owner approved
      without one. `release-candidate.md` records this, what it costs
      (0 bookings / 0 reviews / 0 payouts exist; at most a day of the 95
      profiles and 67 requests is at risk) and how to restore anyway.
- [x] Deployment live before cutover recorded:
      `https://helpward-pl2dqwo0h-vanstudio.vercel.app`

Recovery is **roll-forward**. Re-promoting the old deployment after
`0085` leaves every helper with an empty inbox — see that document.

## 5. Developer — cutover

Run the whole sequence with one command. It stops at the first failure
and states what condition production is in, so a partial run is never
ambiguous:

```
~/.helpward-cutover/run-cutover.sh
```

It reads the connection string from `~/.helpward-cutover/production-db-url`
(mode 600, written by `set-production-db.sh`), logs to
`~/.helpward-cutover/cutover-<timestamp>.log`, and performs:

1. `migrate.mjs --production --pre-deploy` — 7 migrations
2. `vercel deploy --prod --force`
3. `migrate.mjs --production --deploy-coupled` — `0081`, `0085`
4. `notify pgrst, 'reload schema'`
5. Ledger check, expecting 86/86
6. The webhook signature proof
7. Public surface and API route codes
8. `preflight --production`, if live Stripe keys are in the shell

**The variable is `PRODUCTION_DATABASE_URL`, not `DATABASE_URL`.** This
checklist previously said the latter, which `--production` ignores
entirely — it reads `PRODUCTION_DATABASE_URL` only, loads no dotenv file,
and refuses a target whose ref is not `HELPWARD_PRODUCTION_REF`.

### Verified before running: 77/86 applied, 9 pending

A `--dry-run` against production confirmed `0080` and everything below it
is applied, with `0081`–`0089` pending.

### The ordering question, checked rather than assumed

`selectFiles()` filters by **class, not sequence**, so `--pre-deploy`
applies `0082`–`0089` *before* the numerically earlier `0081`. The
rehearsal only ever ran them in numeric order, so this ordering was
untested.

It is safe, and here is why rather than a reassurance: `0081` renames the
`user_role` enum value, rewrites `handle_new_user` and `cancel_booking`
from their live definitions, and migrates `favorites.kind`. No pending
pre-deploy migration references `user_role` or either function —
`0088`/`0089` touch `broadcast_request`, `find_nearby_providers`,
`hide_review_account_reviews`, `reject_self_review_flag` and
`skip_review_helper_task_count` only. `0081` is also self-checking: it
raises rather than guessing if a definition does not match the shape it
expects, so a wrong order fails loudly instead of corrupting silently.

### CUTOVER EXECUTED 2026-11-01 — complete and verified

Run by the owner from their own terminal, since the preparing agent's
permission mode refused production writes. Log:
`~/.helpward-cutover/cutover-20261101T230011Z.log`.

| Step | Result |
|---|---|
| 1. Pre-deploy migrations | 7 applied, 131–215ms each |
| 2. Deploy | `helpward-gcd8go8wl`, build 52s, aliased to helpward.com |
| 3. Deploy-coupled `0081`, `0085` | applied, 225ms / 139ms |
| 4. Schema cache reload | **failed first run** — see below — then applied |
| 5. Ledger | **86/86 applied** · 74 pre-deploy · 12 deploy-coupled |
| 6. Webhook signature | **200** signed; 400 unsigned; 400 bogus |
| 7. Routes | all pass, see the corrected table below |

Previous deployment, for the record:
`https://helpward-pl2dqwo0h-vanstudio.vercel.app`

**Step 4 failed on a defect in this repo's own script**, not on anything
in production. `run-cutover.sh` ran the notify as an inline `node -e`
with escaped quotes, which zsh mangled into invalid JavaScript. It is now
`scripts/reload-schema-cache.mjs`, a file, which needs no escaping. The
failure was safely placed: migrations and deploy had already succeeded,
and the step is recoverable by re-running it.

Cache reload confirmed effective through the REST API, which is the thing
that actually breaks when the cache is stale:

    rpc whoami_role          200  "service_role"
    rpc my_offers            200  []
    profiles.is_review_account      200   (0088)
    requests.offer_summary          200   (0084)
    provider_profiles.is_review_helper  200   (0088)

### Acceptance criteria — the baseline, and a correction

Measured on live `helpward.com` before and after:

| Route | Before | After | Meaning |
|---|---|---|---|
| `/`, `/pricing`, `/how-it-works` | 200 | 200 | unbroken |
| `GET /api/v1/me` | 401 | 401 | already shipped |
| `GET /api/v1/payment-methods` | 401 | 401 | already shipped |
| `GET /api/v1/requests` | **404** | **405** | route now exists |
| `GET /api/v1/account/deletion` | **404** | **405** | route now exists |
| `GET /api/v1/review/advance` | **404** | **405** | route now exists |
| `POST /api/v1/requests` | — | **401** | authenticates |
| `POST /api/v1/account/deletion` | — | **401** | authenticates |
| `POST /api/v1/review/advance` | — | **401** | authenticates |

**Correction to what this document previously claimed.** It said those
three routes must return 401. They return **405** to a GET, because all
three export `POST` only — 405 is the correct answer to the wrong method
and proves the route exists, but it does not prove authentication. The
auth check needs the right verb: `POST` with no Authorization header
returns `401 {"error":"Missing Authorization header."}` on all three.
Probing only with GET would have reported a pass that tested nothing.

The webhook probe flipped from `400 bad_signature` to `200`, confirming
`STRIPE_TEST_WEBHOOK_SECRET` reached the runtime — Vercel variables apply
only to new deployments, which is why it failed before. Unsigned and
wrongly-signed events are still refused, so the dual-secret path did not
loosen verification.

### Why a developer could not run this

In the session that prepared this release, the agent's permission mode
refused production migrations and deploys outright (`Production Deploy`),
and separately refused Stripe account writes. Everything up to the point
of writing to production was completed and verified; execution itself
needs either an operator or a granted permission rule.

## 6. Developer — the production reviewer journey

- [ ] Create the review customer and the controlled helper.
- [ ] As an admin, set `profiles.is_review_account` and
      `provider_profiles.is_review_helper`. Neither can be self-set.
- [ ] Bring the controlled helper online and give it the eight services.
- [ ] From the intended iOS build, walk: request → automatic acceptance
      → payment confirmation if the bank asks → **Advance demo booking**
      (start) → **Advance demo booking** (complete, captures) →
      cancellation on a second booking → account deletion.
- [ ] Walk each of the eight services' intake and completion once, using
      the values in `docs/app-review/review-notes.md`.
- [ ] Confirm with a **real** account that the Advance control is absent
      and `/api/v1/review/advance` returns 403.

## 7. Developer / owner — archive and submit

- [ ] Archive the build. Record its number in the review notes.
- [ ] Enter the review credentials in App Store Connect — not in a file.
- [ ] Review notes must state plainly that the helper accepts
      automatically and that **Advance demo booking** exists on the
      review account only. Both are already written in
      `docs/app-review/review-notes.md`; check the wording still matches
      what shipped.
- [ ] Submit.

---

## 8. What is left, in order — 2026-11-01

Everything below needs an operator: the preparing agent's permission mode
refused production migrations and deploys. Each step is one command.

### 8.1 Repair the four migrations that never ran

```
cd /tmp/hw-merge
export PRODUCTION_DATABASE_URL="$(cat ~/.helpward-cutover/production-db-url)"
export HELPWARD_PRODUCTION_REF=xhmgmegraieouudyjjlv
export HELPWARD_PRODUCTION_ORIGIN=https://helpward.com

node scripts/reapply-migrations.mjs \
  0049_refund_ledger_identity.sql \
  0058_crew_on_acceptance.sql \
  0063_call_truth_and_gating.sql
```

`0044` is deliberately absent from that list: `0090` supersedes it and
also closes the `pm_self` policy that `0044` left behind.

### 8.2 Apply 0090 — DONE 2026-11-01

```
node scripts/migrate.mjs --production --only 0090
```

It asserts its own effects in a do-block, so it fails loudly rather than
recording another ledger row for work that did not happen.

### 8.3 Confirm the repair

```
node scripts/audit-migration-effects.mjs
```

Expect no discrepancies. Before the repair it reported eight.

### 8.4 Deploy the review-journey fix

```
vercel deploy --prod --force
```

Ships `prepareReviewHelper()`. Until this lands, the controlled helper
must be refreshed within 30 minutes of any demonstration:
`node scripts/refresh-review-helper.mjs`.

### 8.5 Prove the journey — DONE 2026-11-01, 8/8

```
node scripts/review-journey.mjs
```

Expect eight passes. Before the repair all eight created a booking but
none could hold a card.

Then confirm the isolation holds from the other side: sign in with an
ordinary account and `POST /api/v1/review/advance` — it must return
**403**, and the Advance control must be absent in the app.

### 8.6 Submit

The build is archived and exported: **1.0.0 (1)**, Apple Distribution,
team `5X7WKD8U78`, at `~/Documents/helpward-build-1`. Upload and submit
only once 8.5 passes — a reviewer who cannot save a card cannot complete
a booking, and that is a rejection rather than a delay.

### 8.7 Rotate two database passwords

Production and `helpward-rehearsal-scratch` share one password and both
went through chat. Each needs its own rotation: Supabase → project →
Settings → Database → Reset database password. Afterwards re-run
`~/.helpward-cutover/set-production-db.sh` so the stored URI matches, and
delete the scratch project, which is billable.

---

## 9. Journey verified end to end — 2026-11-01

`0090` applied (146ms). The audit dropped from eight discrepancies to
three; the payment_methods findings are closed.

`scripts/review-journey.mjs`: **8 passed, 0 failed.** Each service went
request -> accepted with the card held -> started -> completed and
captured, through the same endpoints the app and helper use.

| Service | Quote | Final |
|---|---|---|
| errand-runner | CA$44.50 | completed/captured |
| maid-service | CA$94.50 | completed/captured |
| moving-help | CA$224.50 | completed/captured |
| furniture-assembly | CA$64.50 | completed/captured |
| grocery-pickup | CA$29.50 | completed/captured |
| package-delivery | CA$29.50 | completed/captured |
| package-return | CA$34.50 | completed/captured |
| wait-in-line | CA$44.50 | completed/captured |

Confirmed in Stripe rather than only in our own tables: nine succeeded
test-mode PaymentIntents in CAD, each with
`transfer_data.destination = acct_1UUtVQ9u2smD2qAZ`, so the destination
split reaches the helper. Cancellation was exercised too — the API
returned `holdReleased: true` and Stripe moved that intent to
`canceled`.

Isolation holds from the other side: an ordinary account aimed at a
genuine review booking gets `403 "Not available on this account."`

**Still outstanding:** 8.1 (re-apply 0049, 0058, 0063), 8.4 (deploy
`prepareReviewHelper`), 8.6 (submit), 8.7 (rotate both passwords). Until
8.4 ships, run `scripts/refresh-review-helper.mjs` within 30 minutes of
a demonstration.
