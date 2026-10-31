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

## Recovery

The site deploys by `vercel --prod --force`; the previous deployment
stays addressable in Vercel and can be re-promoted, so the web half
rolls back in one action.

**The migrations do not.** `0085` changes a policy and `0087` changes
`services.active`. Before applying, take a Supabase backup — Database →
Backups — and note its timestamp here. Rolling the code back without
rolling the database back leaves the old code reading objects `0083`
onwards introduced, so if the cutover is abandoned both halves go back
together.

Service scope is separately reversible at any time:
`node scripts/service-scope.mjs restore <id> --apply`.

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
