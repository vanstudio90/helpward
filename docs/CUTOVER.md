# Production cutover

Everything here needs credentials or an account decision, which is why it
is the part no rehearsal can close. Work top to bottom; each step says how
to tell it worked, because most of these fail **silently** when they fail.

Run `npm run preflight` after step 3 and again after step 5. It checks
every environment variable, the Stripe mode, all twelve scheduled jobs,
the migration state, the boundary polygons, the catalogue, and whether
rehearsal accounts have leaked into production. It is read-only and prints
GO or NO-GO.

Candidate: `launch-scope-and-verification`. `main` is untouched at `6e5befc`.

---

## 0. Before anything — one decision that silently breaks eight jobs

**Vercel plan.** Hobby runs cron jobs *once a day*, and at most two of
them. Helpward declares twelve, and eight run more often than daily:

| Job | Schedule | What stops if it never runs |
|---|---|---|
| `expand-preferred-broadcasts` | every minute | A request routed to a favourite helper never opens to everyone else. It expires instead. |
| `expire-stale-requests` | every 15 min | Requests nobody accepted sit in `matching` forever. |
| `auto-cancel-no-shows` | every 15 min | A helper who never turns up keeps the booking and the hold. |
| `send-booking-reminders` | every 15 min | No T-30 reminder to either party. |
| `sweep-calls` | every 15 min | Abandoned ringing calls never clear, so the next call glares. |
| `offline-stale-helpers` | every 15 min | Helpers who closed the tab keep receiving offers they cannot see. |
| `complete-stale-in-progress` | hourly | Bookings left in progress are never closed, so money is never captured. |
| `process-data-exports` | every 30 min | A customer's data-export request is never fulfilled (a GDPR/PIPEDA obligation). |

A Hobby deploy **succeeds** and these simply never fire. Nothing reports
it. Confirm the plan allows the schedules in `vercel.json` before step 5,
or decide explicitly which of the above you are launching without.

---

## 1. Stripe: activate the account

In the Stripe Dashboard, with the **test-mode toggle OFF**:

1. **Activate payments** — business details, representative, bank account.
   Stripe decides; it is not instant.
2. **Connect → Settings → Platform profile.** This must be completed or
   `accounts.create` is rejected outright. Answer:
   - *Who are your users?* — Service providers.
   - *Does your platform lose money from disputes?* — **Yes.** Helpward's
     destination charges originate on the platform, so refunds and
     disputes hit Helpward's balance, not the helper's. Answering "no"
     here would be false and would change the account type Stripe gives
     you.
   - *Who is responsible for collecting requirements?* — Stripe.
3. **Connect → Settings → set the platform name and support contact.**
   Helpers see these on the Stripe-hosted onboarding page.
4. **Developers → API keys**, live mode: copy the **secret** key and the
   **publishable** key. These go into Vercel in step 3 — not into a file
   in this repo, and not into a chat window.

**Verify:** `npm run preflight -- --production` reports *Stripe in live
mode*. It refuses to pass if the secret and publishable keys are in
different modes, which is the mistake that makes the card form and the
server disagree about which account they are talking to.

---

## 2. Production database

1. Create the production Supabase project. Note its region — it is the
   one thing you cannot change later.
2. Get the **session-mode pooler** connection string, port **5432**.
   Not 6543: transaction mode cannot run `set local role`, which the
   migrations and the SQL suites both use.
3. Apply migrations **in order**, pre-deploy first:
   ```
   PRODUCTION_DATABASE_URL='...' node scripts/migrate.mjs --production --pre-deploy
   ```
   `--production` is required and changes three things: it reads
   `PRODUCTION_DATABASE_URL` *only*, it does not load `.env.rehearsal` or
   `.env.local` at all, and it prints the target project ref before
   touching anything. It refuses outright if that ref matches the
   rehearsal project, or if the port is not 5432.

   Without `--production` the runner prefers `REHEARSAL_DATABASE_URL`,
   which it reads from `.env.rehearsal` itself — so a
   `PRODUCTION_DATABASE_URL=...` prefix alone would have migrated
   **rehearsal** and reported success. Add `--dry-run` the first time and
   read the target line.

   The runner enforces order and refuses a file whose checksum changed
   after it ran. The remaining **ten** migrations are deploy-coupled —
   they assume the new code is already live — so run them with
   `--production --deploy-coupled` in the same window as the deploy in
   step 5, not days before. List them with:
   ```
   grep -l 'CLASS: deploy-coupled' supabase/migrations/*.sql
   ```
4. Load the boundary polygons — once per area. Full argument list and
   the municipality allowlists are in `docs/BOUNDARY-DATASETS.md`; add
   `--production` and the production credentials:
   ```
   SUPABASE_URL='https://<prod-ref>.supabase.co' \
   SERVICE_KEY='<prod service role key>' \
   node scripts/load-boundaries.mjs --production \
     --area lower-mainland-bc --file ./data/bc-municipalities.geojson \
     --source-name "…" --source-url "…" --source-version "…" --license "…" \
     --dry-run
   ```
   Then repeat for `san-diego-ca`, and `--activate <dataset-id>` each one
   only after the feature count checks out. `--production` skips the
   dotenv files, prints the target project, and refuses if the URL and the
   service key belong to different projects — a mismatched pair fails as a
   bare 401 that reads exactly like a revoked key.

   **This is the step whose absence looks like nothing is wrong.** With no
   active polygons the dispatch guard refuses every address: the site
   loads, the catalogue renders, and not one booking can be created.
   Preflight checks it explicitly.
5. Do **not** run `scripts/seed-rehearsal.mjs`. It refuses the old
   production ref by name, but it does not know about a new project —
   and its accounts are real, loginable accounts.

**Verify:** `npm run preflight -- --production` shows all migrations
applied, a polygon count for both `lower-mainland-bc` and
`san-diego-ca`, 27 active services, and **zero** rehearsal accounts.

---

## 3. Vercel environment variables

Set these on the Production environment. Every one of them fails closed,
so a missing value is a silent outage rather than an error:

| Variable | Missing means |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Nothing works. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Nobody can sign in. |
| `SUPABASE_SERVICE_ROLE_KEY` | Payments, payouts and all crons fail. |
| `STRIPE_SECRET_KEY` | No card can be held, captured or refunded. |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | The card form cannot mount. |
| `STRIPE_WEBHOOK_SECRET` | Webhook 503s; bookings never learn a payment succeeded. |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | Helper payout state never updates, so onboarded helpers still cannot accept work. |
| `MAPBOX_TOKEN` | No address geocodes; no booking can be created. |
| `MAPBOX_PERMANENT=true` | Addresses are refused rather than stored. Requires Mapbox permanent-storage terms. |
| `CRON_SECRET` | All twelve jobs return 401 and do nothing. |
| `NEXT_PUBLIC_SITE_URL` | Reset and onboarding links point at the wrong host. |
| `RESEND_API_KEY`, `HELPWARD_EMAIL_FROM` | No email at all: no receipts, no reset links. |

**Watch for trailing newlines.** A key pasted with one authenticates as
garbage and reads exactly like a wrong key. Preflight rejects any value
with leading or trailing whitespace, because this has already cost real
time on sibling sites.

`NEXT_PUBLIC_SITE_URL` must be the real origin, not a `*.vercel.app`
host — reset links are built from it.

---

## 4. Stripe webhooks

Two endpoints, both in live mode, both pointing at the production host:

| Path | Events |
|---|---|
| `/api/webhooks/stripe` | `payment_intent.succeeded`, `payment_intent.amount_capturable_updated`, `payment_intent.payment_failed`, `payment_intent.canceled`, `charge.refunded` |
| `/api/webhooks/stripe-connect` | `account.updated` |

Subscribe to exactly those events. The list is what the handlers actually
switch on — `payment_intent.amount_capturable_updated` is the one that
confirms a hold is in place, so omitting it leaves bookings stuck waiting
for a payment they already have. Do **not** add
`charge.dispute.created`: nothing handles it, so it would be logged as an
unknown event and ignored. Disputes are visible in the Stripe dashboard,
and they land on Helpward's balance (see step 1.2).

Copy each signing secret into the matching variable from step 3. They are
different secrets; swapping them makes both endpoints reject every event
with a signature error.

**Verify:** `npm run verify:webhooks`, then send a test event from the
Stripe dashboard and confirm a 200.

---

## 5. Deploy

1. `vercel login`
2. Link the project, confirm the Production environment has the variables
   from step 3.
3. Deploy the reviewed candidate — **not** `main`, which is still at
   `6e5befc` and predates all of this work.
4. Run the ten deploy-coupled migrations in this same window (step 2.3)
   if you have not already. List them with:
   `grep -l 'CLASS: deploy-coupled' supabase/migrations/*.sql`

**Verify:** `npm run preflight -- --production` returns GO, and the
build log shows `Running TypeScript` — type checking now gates the build,
so a green build means what it says.

---

## 6. Coverage, then one real booking per region

Rehearsal proves the code. It cannot prove there is anyone to do the work.

1. Onboard at least one real helper per region through Stripe's hosted
   flow, and confirm each reaches `stripe_transfers_active`. Until that
   flag is true the helper **cannot accept** anything —
   `assert_helper_payable` refuses, correctly.
2. Confirm each has picked services and is online. Offers only reach
   helpers who are approved, online, and offer that service.
3. Place one real booking yourself in each region, on the cheapest
   service, through the real customer flow. Let it complete and capture.
   Then refund it.
4. Reconcile: `npm run verify:holds` should report zero stranded holds.

Only after both regions pass should the site be advertised anywhere.

---

## What is deliberately switched off

- **Bundling** — `BUNDLING_ENABLED = false` in `lib/feature-flags.ts`.
  It bypasses per-service intake and prices every stop at base rate. The
  three conditions for turning it back on are in that file.
- **ID verification and background checks** — not wired, not claimed
  anywhere, and not required by any code path. If you wire them, they
  become requirements in `lib/provider-readiness.ts`, once, and all
  surfaces follow.
- **Push** — works, but is a no-op without the OneSignal variables.
  In-app and email notifications do not depend on it.

## Rollback

`main` is untouched at `6e5befc`, so redeploying it reverts the **code**
in one step.

It does not revert the **database**. Ten migrations are deploy-coupled,
and there are no down-migrations written for them — `scripts/migrate.mjs`
only goes forward. After step 2.3 has run, a code-only rollback leaves
the old app against a newer schema, and several functions
(`accept_request`, `start_booking`, `complete_booking`,
`find_nearby_providers`) will refuse calls the old code still makes.

So: take the Supabase point-in-time backup **before** step 2.3, and treat
that as the rollback plan. Decide this before running the migrations, not
after — it is the one step in this document that redeploying cannot undo.
