# Release candidate RC-2 — 31 October 2026

Not deployed. Production deployment remains a separate, explicitly
authorised step.

| | |
|---|---|
| Website + API | `dbe3a72be5b8d4660a68651f1d086c9cc7dc73ae` on `api-merge-rehearsal` |
| iOS | `d3056917c50542890a8f2cc7b7c566f6a4eae76c` |
| RC-1 was | `37079ea` — still in history, so the difference is reviewable |
| Tests | 534, all passing |
| Typecheck / build | clean |

```
git log --oneline 37079ea..HEAD        # everything added since RC-1
```

## Added since RC-1

**App Review isolation (migration 0088).** A review booking takes the
same path as any other — same validation, same pricing, same policies,
same payment transitions — and differs only in who can be matched. The
rule is symmetric and lives in `find_nearby_providers`: a review
request reaches only review helpers, a real request reaches none.
Neither flag can be set by its owner. Applied to the isolated
environment and proven there in both directions.

**Stripe test mode for review accounts.** Real SetupIntent, real
authorisation, real capture, against `sk_test_` keys. Resolved from the
database, never from the caller, so a client cannot ask to be billed in
test mode. A missing or non-test key **throws** rather than falling back
to live. Seven tests guard against review mode becoming a bypass.

**The publishable key comes from the server.** `/api/v1/me` returns the
key for the signed-in account, so the binary ships no review
configuration and no second key set.

**Account deletion in the app** (RC-1 had the route; this adds the
screen) and the lifecycle verified end to end.

**The review package**: `docs/app-review/review-notes.md` — the App
Store Connect text with credential fields left blank — and
`docs/app-review/build-configuration.md`, which states where this design
departs from "route the binary at an isolated environment" and why.

## Ready to submit

Nothing, yet. The pieces are built; three things have to happen first.

## Production execution steps that remain

1. **Provision a scratch Supabase project** and run the `0080` → `0087`
   rehearsal. Still the owner's action; the script refuses every
   database available here, including the existing rehearsal project,
   which is at `0087` and must not be downgraded. Verified refusing.
2. **Apply `0081`–`0088` to production** and deploy this candidate.
   `0085` is deploy-coupled. Blocked on a production `DATABASE_URL`.
3. **Configure** `STRIPE_TEST_SECRET_KEY` and
   `STRIPE_TEST_PUBLISHABLE_KEY` in the deployment environment.
4. **Create the review customer and the controlled helper** in
   production and set the two flags as an admin. Put the credentials in
   App Store Connect, not in a file.
5. **Take a backup first** and record its identity and timestamp in
   `release-candidate.md`, which still has blanks for them.
6. **Cut the iOS build** and record its number in the review notes.

## Known limits, stated

- The review journey runs on production code paths but **cannot run in
  production yet**: `/api/v1/requests` is 404 until the cutover.
  Everything has been exercised in the isolated environment instead.
- Review bookings will be production rows, flagged — not rows in a
  separate database. They should be excluded from operational reporting
  by that flag.
- The controlled helper is **operated by a person**, not automated. The
  review notes say so plainly and give the reviewer two ways not to wait
  on one.
