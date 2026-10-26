# Migration + rollback runbook

Rehearse **both directions** in the isolated environment before this release
reaches production. A forward order that works is not sufficient evidence.

## Migration classes

Two classes only. Getting this wrong is how the previous draft managed to
publish a sequence that reapplied `0031` *after* `0036` and silently
restored the unhardened `accept_request` (review finding D05). There is now
exactly one definition of that function, at the end of `0036`, and `0031`
has been removed.

| Migration | Class | Why |
|---|---|---|
| `0029_address_verification` | **Pre-deploy safe** | additive columns; old code ignores them |
| `0030_matching_columns` | **Pre-deploy safe** | additive column + index; required *by* the new code |
| `0033_service_area_boundaries` | **Pre-deploy safe** | new tables/functions, unused by old code. **Carries the boundary loader's service-role authorisation and grants**, because boundaries are loaded before the cutover — putting that fix in a deploy-coupled migration made the documented sequence stop at the load step. |
| `0034_dispatch_refusals` | **Pre-deploy safe** | new table/functions, unused by old code |
| `0035_quote_identity` | **Pre-deploy safe** | `requests.quote_fingerprint`, `compute_bundle_fingerprint()`, `seal_bundle_quote()`. Additive and unused by old code — but the NEW app calls `seal_bundle_quote()` the moment it deploys, so this must land first. Split out of `0036` for exactly that reason. |
| `0037_boundary_enforcement_mode` | **Pre-deploy safe** | new table/functions, unused by old code |
| `0036_attestation_integrity` | **DEPLOY-COUPLED** | its `request_bundle_items` trigger rejects every non-service INSERT, which is exactly how the *previous* application writes bundle stops. Applying it before the cutover breaks bundle creation on the running release. It also hardens `accept_request` to require a sealed quote fingerprint that only the new code produces. |
| `0038_matching_functions` | **DEPLOY-COUPLED** | `broadcast_request` refuses unverified addresses, which old code cannot produce |

## Authoritative forward sequence

Run exactly this. Do not reapply anything afterwards.

1. `0029`, `0030`, `0033`, `0034`, `0035`, `0037` — pre-deploy safe, no behaviour change. Every function the new release calls lives in these; nothing here constrains the old release.
2. Load official boundary polygons (`scripts/load-boundaries.mjs`), verify
   the probes, then `--activate`.
3. Run the address backfill: `--dry-run`, review the ledger, then `--apply`.
4. **Deploy the application release.**
5. `0036`, then `0038`.
6. Run the SQL suites — **after step 5, never before**. Both depend on
   objects that `0036`/`0038` create (`quote_fingerprint`,
   `seal_bundle_quote()`, the attestation and quote triggers, the hardened
   `accept_request`, `is_placeholder_point()`), and
   `boundary_containment.sql` additionally needs an active boundary dataset
   from step 2:
   `\i supabase/tests/quote_integrity.sql` then
   `\i supabase/tests/boundary_containment.sql`. Both roll back; both must
   pass, including the negative controls.
7. Verify: `node scripts/verify-migration-state.mjs`, then confirm the final
   `accept_request` definition is the hardened one (it must contain
   `compute_bundle_fingerprint`) and that
   `has_function_privilege('authenticated', 'public.broadcast_request(uuid,int)', 'EXECUTE')`
   is **false**.

Steps 2 and 3 may run before or after step 4. Step 5 must not precede it.

## Rollback

**Rolling the application back does not require reverting `0038`, and you
should not revert it.**

With `0038` applied and an older release running, the old code cannot set
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
without them, refuses if migration 0038 is not applied, and records every
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
| R1 | Apply `0029`,`0030`,`0033`,`0034`,`0035`,`0037` against a copy of production data | succeed; old app unaffected, including bundle creation |
| R2 | Probe schema | new columns/tables/functions present |
| R2b | Run the boundary loader with **service-role REST credentials, before `0036`** | succeeds — this is the dependency that previously blocked a fresh rehearsal |
| R2c | Call `insert_service_area_boundary` as a customer and as anon | denied |
| R3 | Submit a request on the **old** app build | still dispatches (0035 not yet applied) |
| R4 | Load boundaries, mark active | `is_point_serviceable` on a known in-city point → `serviceable` |
| R5 | Known unincorporated point | → `outside_boundary` |
| R6 | Deactivate dataset, re-probe | → `no_dataset`, and nothing dispatchable |
| R7 | Run backfill `--dry-run` then `--apply` | ledger classifies; ambiguous/failed/out-of-area stay unverified |
| R8 | Deploy new app, then apply `0036`,`0038` | succeed; final accept_request contains compute_bundle_fingerprint |
| R8a | Immediately after R8, submit a two-stop bundle through the customer form | succeeds — proves no window exists where the app calls `seal_bundle_quote()` before `0035` provides it |
| R8b | `\i supabase/tests/quote_integrity.sql` | all assertions pass under real customer / provider / service contexts. **Must run after R8**: the suite needs `quote_fingerprint`, `seal_bundle_quote()`, the attestation and quote triggers, and the hardened `accept_request`, all of which arrive with `0036`/`0038`. |
| R8c | §7 negative controls, automated within R8b | each guard is disabled in turn and its assertion must FAIL; anything blocked for an unrelated reason reports `FAIL negative control …` rather than passing |
| R8d | §7 closing check | reports all real guard definitions restored — the controls must not leave a weakened function behind |
| R8e | `\i supabase/tests/boundary_containment.sql` | needs an active dataset (R4) and `0038`'s `is_placeholder_point`/`broadcast_request`; its §7 executes a real dispatch |
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
| R19 | `select set_boundary_enforcement('enforced', …)` | boundary gate restored in BOTH layers |
| R19b | During the override, submit through the **customer form** | succeeds — proves the override's scope covers request creation, not just broadcast (R08) |
| R20 | With 0035 applied normally, mark a placeholder row `geocode_verified = true` by hand and submit | **still refused**, `address_placeholder` — proves the guard is independent of the verification flag |
