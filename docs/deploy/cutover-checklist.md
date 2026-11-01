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

- [ ] `DATABASE_URL` in the authorised environment.
- [ ] `STRIPE_TEST_SECRET_KEY` — must begin `sk_test_`. The code refuses
      anything else rather than falling back to live.
- [ ] `STRIPE_TEST_PUBLISHABLE_KEY` — `pk_test_`.
- [ ] `STRIPE_TEST_WEBHOOK_SECRET` — from the **test-mode** webhook
      endpoint in Stripe.
- [ ] Confirm that endpoint points at `https://helpward.com/api/webhooks/stripe`
      and that the secret you copied belongs to **that** endpoint. A
      mismatch here is silent: review events would fail signature
      verification and a reviewer's hold would never reconcile.

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
