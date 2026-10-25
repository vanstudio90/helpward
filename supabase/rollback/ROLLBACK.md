# Migration + rollback runbook

Rehearse **both directions** in the isolated environment before this release
reaches production. A forward order that works is not sufficient evidence.

## Migration classes

| Migration | Class | Apply before the app deploy? | Safe to leave in place on app rollback? |
|---|---|---|---|
| `0029_address_verification` | additive columns | **Yes** | Yes — old code ignores them |
| `0030_matching_columns` | additive column + index + `max_location_age()` | **Yes** — required *by* the new code | Yes |
| `0031_payout_split` | function, no new column dependency | Yes | Yes — old code calls it unchanged; only amounts differ |
| `0033_service_area_boundaries` | new tables + functions | **Yes** | Yes — unused by old code |
| `0034_dispatch_refusals` | new table + functions | **Yes** | Yes — unused by old code |
| `0035_matching_functions` | functions, **NOT backward compatible** | **No** — apply with or after the deploy | **Yes, intentionally** — see below |

## Forward sequence

1. `0029`, `0030`, `0033`, `0034` — all additive. Nothing changes behaviour.
2. Load official boundary polygons (`scripts/load-boundaries.mjs`) and mark a
   dataset active. **Until this is done `is_point_serviceable()` returns
   `no_dataset` and nothing is dispatchable** — fail-closed by design.
3. Run the address backfill (`scripts/backfill-addresses.mjs --dry-run`, review
   the ledger, then `--apply`).
4. Deploy the application release.
5. `0031`, then `0035`.
6. Verify: `node scripts/verify-migration-state.mjs`.

Step 2 and 3 can run before or after step 4; both are safe in either order.
Step 5 must not precede step 4.

## Rollback

**Rolling the application back does not require reverting `0035`, and you
should not revert it.**

With `0035` applied and an older release running, the old code cannot set
`addresses.geocode_verified`. Every new request is therefore refused at the
verification gate. That is correct: a release that cannot verify an address
must not be dispatching helpers to it.

What makes this safe to operate is that the refusal is **loud**:

* every refusal writes a `dispatch_refusals` row with reason
  `address_unverified`;
* the first occurrence per request notifies **every admin**
  (`notifications.type = 'dispatch_blocked'`);
* `select * from dispatch_health()` groups refusals and flags everything
  except `no_eligible_helper` as `is_configuration_fault = true`.

So an application/migration mismatch announces itself within one request
instead of silently halting the marketplace.

### Rollback procedure

1. Roll the application back.
2. Immediately run `select * from dispatch_health('24 hours');`.
3. Expect `address_unverified` with `is_configuration_fault = true`. This
   confirms the mismatch is in effect and dispatch is intentionally stopped.
4. **Recover by rolling forward** — redeploy the verifying release — not by
   weakening the gate.
5. There is **no override that makes an application rollback dispatch
   again**, and that is deliberate. Address verification is never relaxed, so
   a release that cannot produce verified addresses cannot dispatch. Roll
   forward.

### The emergency override relaxes boundary containment ONLY

`supabase/rollback/0035_emergency_relax_boundary.sql` exists for one fault:
boundary containment refusing addresses that are genuinely inside a launch
city (a bad dataset load, a dropped exclave, a projection error).

It **cannot** dispatch an unverified or placeholder location. Two gates are
not overridable by anything in this codebase:

* `addresses.geocode_verified` must be true
* `is_placeholder_point()` must be false

The second matters specifically because **boundary containment cannot catch
the placeholder**. The legacy fallback coordinate is downtown Vancouver,
inside an approved launch municipality, so all 53 legacy rows pass
`is_point_serviceable()` as `serviceable`. An earlier draft of the override
relaxed verification and kept the boundary check on the reasoning that
geography constrained the damage; it did not. Recording an owner, a reason
and an audit event establishes accountability, not location correctness.

Production availability: do not apply this file to production until that
condition has been reviewed and signed off. It requires a deliberate psql run
with `helpward.rollback_reason` and `helpward.rollback_owner` set, refuses
without them, refuses if migration 0035 is not applied, and records every
boundary-relaxed dispatch so the geographic blast radius is measurable.

### What rollback must never do

* Restore placeholder geocoding (`PLACEHOLDER_POINT`). It is retained in
  `lib/geocode.ts` **only** so the backfill can recognise legacy rows.
* Revert the application-side guard that refuses to *create* an unverified
  address.
* Relax the boundary check to make a region look serviceable.

Each of those makes rollback look successful while re-enabling dispatch to
coordinates nobody verified.

## Rehearsal checklist (isolated environment)

Record PASS/FAIL for each. `scripts/verify-migration-state.mjs` automates the
schema and behaviour probes.

| # | Step | Expected |
|---|---|---|
| R1 | Apply `0029`,`0030`,`0033`,`0034` against a copy of production data | succeed; old app unaffected |
| R2 | Probe schema | new columns/tables/functions present |
| R3 | Submit a request on the **old** app build | still dispatches (0035 not yet applied) |
| R4 | Load boundaries, mark active | `is_point_serviceable` on a known in-city point → `serviceable` |
| R5 | Known unincorporated point | → `outside_boundary` |
| R6 | Deactivate dataset, re-probe | → `no_dataset`, and nothing dispatchable |
| R7 | Run backfill `--dry-run` then `--apply` | ledger classifies; ambiguous/failed/out-of-area stay unverified |
| R8 | Deploy new app, apply `0031`,`0035` | succeed |
| R9 | Submit a request at a verified in-boundary address | dispatches; no `dispatch_refusals` row |
| R10 | Submit at an unremediated legacy address | refused; `address_unverified` row; admin notified |
| R11 | **Roll the app back** to the previous build | requests refused, `address_unverified` rows accumulate, admins notified within one request |
| R12 | `dispatch_health()` during R11 | returns `address_unverified` with `is_configuration_fault = true` |
| R13 | Roll forward again | dispatch resumes with no further intervention |
| R14 | Attempt `0035_emergency_relax_boundary.sql` with no reason/owner set | **refuses** with a hint |
| R15 | Same with reason + owner set | applies; writes `audit_log` row naming what is relaxed and what is still enforced |
| R16 | Under the override, submit at an **unverified** address | **still refused**, `address_unverified` recorded |
| R17 | Under the override, submit at a **placeholder** address | **still refused**, `address_placeholder` recorded — proves boundary relaxation does not open the placeholder path |
| R18 | Under the override, submit at a verified address **outside** all boundaries | dispatches, and a `boundary_outside` row records that it was allowed through |
| R19 | Re-apply `0035_matching_functions.sql` | boundary gate restored |
| R20 | With 0035 applied normally, mark a placeholder row `geocode_verified = true` by hand and submit | **still refused**, `address_placeholder` — proves the guard is independent of the verification flag |
