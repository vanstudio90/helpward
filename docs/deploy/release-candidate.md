# Release candidate RC-1 — 31 October 2026

Not deployed. Production deployment is a separate, explicitly authorised
step once this package is complete.

## What it is

| | |
|---|---|
| Website + API commit | `5e1f25d265327e680b848f169e6a8ee256a8930a` |
| Branch | `api-merge-rehearsal` (merge of `launch-scope-and-verification` into `nav-hash-fix`) |
| iOS commit | `45248cec911d30f31d12f04be1a81ba89c3f0702` |
| iOS build number | **not yet cut** — see below |
| Tests | 527, all passing |
| Typecheck | clean |
| Production build | clean, 8 service pages + 16 city pages |

## Migration sequence

Production is at `0080_service_definitions`. Apply in order:

```
0081_helper_role_rename.sql
0082_service_taglines.sql
0083_handover_details.sql
0084_offer_payload.sql
0085_close_offer_leak.sql     <- deploy-coupled
0086_set_booking_handover.sql
0087_launch_scope_services.sql
```

`0085` rewrites the `req_read` policy so a candidate helper can no
longer read `deliver_to` and `recipient`. The code that reads offers
through `offer_summary` is in this same candidate, so the migration and
the deploy go together — not one then the other.

## Environment configuration

- `DATABASE_URL` — **missing**, and the only thing blocking the cutover.
  Supabase → Project Settings → Database. It belongs in the deployment
  environment, not in a conversation.
- Everything else is already set in Vercel and unchanged by this
  candidate.
- The iOS build points at `https://helpward.com` in Release and
  `http://localhost:3000` in Debug.

## What this candidate contains

- All four `/api/v1` routes: `me`, `payment-methods`, `requests`,
  `bookings/[id]/cancellation`
- `/api/v1/account/deletion` — new, exercised end to end
- The `(provider)` → `(helper)` rename and the signed-in design kit
- Country-aware pricing across the whole quote, with three guards
- The eight-service public scope, preparation guidance, scope blocks and
  per-service FAQs
- A footer on all 78 public pages, which had none

## Recovery — re-promoting the old deployment is NOT safe after 0085

This needed checking rather than assuming, and the assumption was wrong.

`0085` replaces the `req_read` policy. Before it, the policy ended with
a clause letting any helper in `match_attempts` select the whole
request row. After it, the policy is customer, admin, or
`is_booked_helper_for_request(id)` — **a merely offered helper cannot
read the row at all** and is expected to call `my_offers()` instead.

The currently deployed helper inbox
(`app/(provider)/provider/inbox/page.tsx`) selects from `requests`
directly, `intake` included. Against a database migrated to `0085`, that
select returns nothing for a candidate helper.

**So re-promoting the previous Vercel deployment after the migrations
would leave every helper with an empty inbox and no way to accept work.**
The site would be up and the marketplace would be dead. That is worse
than the failure it was meant to recover from.

### What recovery actually is

**Roll forward by default.** The deployment that ships with these
migrations is the one that reads `my_offers()`. If something is wrong
after cutover, fix it on top of this release and deploy again.

**Roll back only as a pair.** Going back to pre-`0085` code means
restoring the database to its pre-migration state as well. The two move
together or not at all.

### Before anything is applied to production

Take a Supabase backup — Database → Backups — and record it here:

```
Backup identity:   ____________________   (Supabase backup id)
Taken at:          ____________________   (UTC)
Restore procedure: Supabase dashboard → Database → Backups → Restore,
                   then re-promote the Vercel deployment that was live
                   immediately before cutover (recorded below).
Deployment live before cutover: ____________________
```

Left blank deliberately. Taking the backup and recording its identity is
the owner's action, and a procedure written from a backup nobody has
taken is not a procedure.

### Confirm it in the rehearsal

The `0080` rehearsal is where to prove this rather than reason about it:
after applying `0085`, query `requests` as a merely-offered helper and
confirm zero rows, then confirm `my_offers()` returns the offer. Record
both outputs with this candidate.

Service scope stays separately reversible at any time:
`node scripts/service-scope.mjs restore <id> --apply`.

## Verified against the isolated environment

**Account deletion, the whole lifecycle** — not just that a row appears.

| step | result |
|---|---|
| `POST /api/v1/account/deletion`, no token | 401 |
| confirm word `delete` instead of `DELETE` | 400 |
| wrong password | 401 — step-up holds |
| correct | 200, `graceUntil` 30 days out |
| sent again | 200 `already:true`, exactly ONE row in the database |
| cron, unauthorised | 401 |
| cron, authorised, grace window already past | 200 `{checked:1, deleted:1}` |
| auth user afterwards | erased |
| `profiles` row | cascaded away |
| deletion request rows | 0 |

The grace window was back-dated for the test, because a 30-day wait
would otherwise hide whether the cron does anything at all.

Test users and rows were removed afterwards and `.env.local` restored to
production.

## Not yet done

1. The upgrade rehearsal from `0080` — needs a throwaway database.
   See `rehearsal-environment.md`; the script is written and refuses to
   run anywhere dangerous.
2. The iOS Settings screen that calls the deletion route, and an iOS
   build number.
3. The disclosed reviewer journey: a review account, and a way to
   exercise a booking without dispatching a real helper or charging a
   real card. Nothing implements a review mode yet, and with no helper
   online nothing can match.
