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

- [ ] Take a Supabase backup (Database → Backups).
- [ ] Fill the blanks in `release-candidate.md`: backup identity, UTC
      timestamp, restore procedure, and the deployment live immediately
      before cutover.
- [ ] Obtain the owner's explicit approval to proceed.

Recovery is **roll-forward**. Re-promoting the old deployment after
`0085` leaves every helper with an empty inbox — see that document.

## 5. Developer — cutover

- [ ] `DATABASE_URL=… node scripts/migrate.mjs --dry-run`
- [ ] `DATABASE_URL=… node scripts/migrate.mjs`
- [ ] `vercel --prod --force`
- [ ] `0085` is deploy-coupled: the migration and this deploy go
      together.
- [ ] Verify the existing site still works: the eight service pages, the
      directory, `/pricing`, a city page, and that country pricing still
      shows both figures.
- [ ] Verify the app's API is reachable: all four `/api/v1` routes should
      answer **401** to a bad token, not 404.

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
