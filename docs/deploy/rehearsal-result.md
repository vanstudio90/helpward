# Upgrade rehearsal — result

**Executed 2026-11-01 against a blank scratch project.
Exit 0.**

## Target

| | |
|---|---|
| Project | `helpward-rehearsal-scratch` (`otnsylduqnjmfurkompa`) |
| Postgres | 17.11 — identical to the existing rehearsal project |
| Extensions at start | `pgcrypto`, `uuid-ossp` only — **no PostGIS** |
| State at start | 0 public tables, 0 `auth.users`, no migration ledger |

Connected via the session pooler on port 5432. Direct connection is
IPv6-only and this network is IPv4.

## What ran

Blank → `0080` (production's current state) → seeded → `0081` … `0089`,
one migration at a time. **86 applied, latest `0089_review_activity_hidden.sql`.**

PostGIS was **not** pre-installed; migration `0001` created it (3.3.7).
That is worth noting because it means the extension setup is reproducible
from the migrations alone rather than depending on how a project was
provisioned.

## Verified afterwards

| Check | Result |
|---|---|
| `req_read` no longer admits a merely-offered helper (`0085`) | pass |
| `req_read` still admits the booked helper | pass |
| `requests.offer_summary` column (`0084`) | pass |
| `my_offers()` — what an offered helper calls instead | pass |
| `request_private_details` (`0083`) | pass |
| `find_nearby_providers` takes the review parameter (`0088`) | pass |
| Municipality filter from `0072` survived the rebase | pass |
| Review isolation is symmetric | pass |
| Self-promotion guards on both tables | pass |
| Catalogue: 27 services, 8 active | pass |

## One correction to the script itself

The run initially reported `offer_summary exists: false`. **The migration
was fine; the check was wrong.** `offer_summary` is a column on
`requests`, not a table, so asking `to_regclass` for a relation of that
name correctly found nothing.

Fixed to test the column, `my_offers()` and `request_private_details`
separately. A check that fails when the thing works is worse than no
check — it teaches you to ignore the output.

## Conclusion

**The `0080` → `0089` sequence applies cleanly from production's exact
state.** The same commands, against production's `DATABASE_URL`, are the
cutover — see `cutover-checklist.md` step 5, and note `0085` ships with
its code.
