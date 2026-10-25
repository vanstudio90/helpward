# Helpward launch acceptance — run record

**Run date:** 2026-10-24 · **Tester:** Claude (automated, non-interactive session)
**Verdict: NOT ACCEPTED — prerequisites unmet. No regional journey was executed.**

Per the plan's own instruction ("If Stripe remains unavailable, mark the
financial journey BLOCKED; do not declare full end-to-end acceptance"), this
run does not and cannot constitute launch acceptance. What follows is the
honest subset that was executable, plus the gates that blocked the rest.

---

## Context

| Item | Value |
|---|---|
| Commit tested | **uncommitted working tree** on `main` at `6e5befc` (51 changed/added paths) |
| Deployment tested | **none** — local production build (`next build` + `next start`) only |
| Migrations present | 0029, 0030, 0031, 0032 (files only) |
| Migrations **applied** | **none of 0029–0032** — verified by live schema probe (see below) |
| Environment | local, pointed at the **production** Supabase project |
| Runtime | node 22.23.1 · next 16.2.10 · npm 10.9.8 |
| Env vars present | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `NEXT_PUBLIC_SITE_URL` |

No staging environment exists (one Supabase project, one Vercel project), so
"apply and verify migrations in staging before testing the release" could not
be satisfied as written.

## Prerequisite gates

| Prerequisite | Status | Evidence |
|---|---|---|
| Migrations 0029–0032 applied in staging | **BLOCKED** | `addresses.geocode_verified` → HTTP 400; `saved_addresses.needs_reconfirmation` → 400; `provider_profiles.location_updated_at` → 400. No `supabase` CLI on this machine and no DDL path over the REST API. |
| Mapbox configured server-side, geocoding verified | **BLOCKED** | `MAPBOX_TOKEN` absent locally and in the production env. `isGeocodingEnabled()` → `false`; `resolveAddressStrict()` → `{ok:false,reason:"geocoding_unavailable"}`. |
| One customer + one approved helper per region | **BLOCKED** | `provider_profiles` where `status=approved` → **0**. `provider_services` → **0 rows**. `is_online=true` → **0**. |
| provider_services assignment, radius, fresh location per helper | **BLOCKED** | Depends on the above. `location_updated_at` column does not exist yet. |
| Stripe test mode | **BLOCKED** | No Stripe keys in any environment. Financial journey BLOCKED by the plan's own rule. |
| Browser automation (screenshots, unread badges, read state) | **BLOCKED** | No browser tooling in this session. All UI-observation steps are unexecuted. |

---

## Section 1 — one journey per launch region

**BLOCKED in full. 0 of 3 regions attempted, 0 of 10 steps per region executed.**

No request was submitted, no offer dispatched, no booking created, no message
exchanged, no payment attempted, in any of San Diego, Los Angeles or the Lower
Mainland. There are no request IDs or booking IDs to record because nothing
was created.

Root cause: geocoding is unavailable, so *every* request submission is
refused by design before it reaches dispatch; and there are no approved
helpers with service assignments to receive an offer even if it did.

| Step | Status |
|---|---|
| 1.1–1.10, all three regions | **BLOCKED** |

---

## Section 2 — geography and matching restrictions

Mixed. The address-side rules are executable as logic and **PASS**. Everything
that lives in SQL or needs live helpers is **BLOCKED**.

| Test | Status | Evidence |
|---|---|---|
| Reject Santa Monica, Burbank, West Hollywood, Pasadena, Chula Vista | **PASS** | `tests/acceptance-logic.test.ts` — 5 assertions, executed |
| Accept Los Angeles + San Diego city limits | **PASS** | executed |
| Reject unsupported BC municipalities (Abbotsford, Chilliwack, Mission, Squamish, Bowen Island) | **PASS** | executed — these are the likeliest false positives, being commonly called "Lower Mainland" |
| Reject Delta, Utah while accepting Delta, BC | **PASS** | executed |
| Reject a BC municipality sent with a US country code | **PASS** | executed |
| Reject legacy placeholder coordinates | **PARTIAL — logic PASS, enforcement UNVERIFIED** | `isPlaceholderPoint()` executed and passing. The *enforcement* is the `geocode_verified` gate in `broadcast_request` (0032), which is not applied and cannot be executed here. |
| Reject unverified saved addresses | **PARTIAL** | Save path now runs the full guard (code-verified). Not executed — needs Mapbox. |
| Reject dispatch when Mapbox is unavailable | **PASS** | executed: `resolveAddressStrict` / `resolveCoordsStrict` both return `geocoding_unavailable` with no token |
| Reject an ambiguous Mapbox result | **PASS (gap found and fixed during this run)** | The request-time path requested only one candidate and never inspected `match_code`. It now rejects medium/low confidence, unmatched street numbers, and multi-candidate results. 6 assertions executed. |
| Points immediately inside/outside each boundary | **CANNOT PASS AS SPECIFIED** | See limitation below. |
| Unapproved / offline / wrong-service / stale-location / out-of-radius helper gets no offer | **BLOCKED** | All five live in `find_nearby_providers` (0032). Code-reviewed, not executed. |
| Helper with a 5 km radius excluded beyond it | **BLOCKED** | Same. Note this rule did not exist before 0032 — the helper's own radius was ignored entirely. |
| Two helpers accept simultaneously, exactly one wins | **BLOCKED** | `accept_request` uses `SELECT … FOR UPDATE` plus a status guard (code-reviewed). Requires two live helpers to execute. |

### Boundary proximity (plan step 2.3) — TEST RETAINED, implementation added

An earlier draft of this record proposed striking step 2.3 because the
municipality-name implementation could not satisfy it. **That was the wrong
direction** — it would have weakened the city-limits requirement to fit the
code. The review overturned it, and the implementation now has what the test
requires:

* **Official boundary polygons are the authoritative check** — migration 0033
  adds `service_area_datasets` + `service_area_boundaries` and
  `is_point_serviceable(geography)`.
* **Municipality-name matching is retained as a preliminary filter only.** It
  produces better error copy and avoids a boundary lookup for plainly
  out-of-area cities. Passing it grants nothing.
* **Fail-closed.** With no active dataset, `is_point_serviceable()` returns
  `no_dataset` and nothing is dispatchable. There is no fallback to the name
  check. Three executed tests assert this, and they were verified to fail
  when the fallback was deliberately reintroduced.
* **Locations outside municipal boundaries are a distinct outcome.**
  `outside_boundary` is separate from `not_in_launch_area`, with its own
  customer message, because an unincorporated address frequently geocodes
  with a neighbouring launch city's name. Saying "we don't serve San Diego"
  to someone just outside the city limits would be wrong.
* **Dataset provenance is mandatory** — `source_name`, `source_url`,
  `source_version`, `source_retrieved_at`, `license` and `source_sha256` are
  all NOT NULL. See `docs/BOUNDARY-DATASETS.md` for the candidate official
  publishers and the exclave/multipolygon cautions.

**The inside/outside test is retained as
`supabase/tests/boundary_containment.sql` and is marked UNEXECUTED.** It
derives points 25 m either side of a real boundary segment from the loaded
dataset, so it straddles the true edge rather than a guessed coordinate. It
also asserts fail-closed behaviour and warns if Los Angeles or San Diego
loaded as a single polygon (both have non-contiguous territory). It requires
the isolated environment with a dataset active.

---

## Section 3 — previously broken paths

| Test | Status | Evidence |
|---|---|---|
| Save a real helper; Favorites + Saved Providers, then reload | **PARTIAL** | The crash is covered by an executed regression test that drives the real function with an injected client (it fails if the bug returns — verified by reintroducing it). The **UI** path needs an approved helper to save: BLOCKED. |
| Submit + cancel a pending request; Cancelled history and direct URL agree | **BLOCKED** | Cannot submit a request without geocoding. |
| Three-stop bundle: acceptance preserves items, one service fee | **PARTIAL** | Bundle subtotal + single-fee arithmetic executed in tests. The acceptance-side fix (0031 sums bundle items; it previously priced a 3-stop bundle as one stop) is **not applied and not executed**. |
| Recurring occurrence via worker; re-run produces no duplicates | **PARTIAL** | The crash that killed every worker run (`.catch()` on a Postgrest thenable) is covered by 3 executed tests. Idempotency relies on a unique constraint and a 23505 handler — code-reviewed, **not executed**. |
| Onboarding dismissal survives navigation and reload | **BLOCKED** | Needs an authenticated session. Fix is code-verified: the read now uses the id-filtered profile. |
| Public service links, dashboard shortcuts, support, invitations, favourite actions | **PARTIAL** | Public service pages return 200 and carry the `?service=` handoff. Authenticated controls not exercised. |
| Catalog direct load + navigation: no duplicate controls, no hydration error | **PARTIAL — PASS on what is observable** | Rendered public service HTML: 3 buttons, **0 nested-button occurrences, 0 anchors inside buttons**. Static check confirms the favourite button is now a sibling of the card button, not nested inside it. The authenticated `/services` catalog is login-gated (307) so its client hydration could not be observed without a session. |

---

## Section 4 — pricing and payments

| Test | Status | Evidence |
|---|---|---|
| Helper earnings = 80% of commissionable subtotal + all tips | **PASS** | executed across 5 subtotal/tip combinations |
| Platform gross = remaining subtotal + $4.50 | **PASS** | executed across 7 subtotals |
| A tip never changes platform take | **PASS** | executed |
| Rounding reconciles exactly | **PASS** | executed for **every** subtotal 0–400 × 3 tip values (1,203 assertions), plus large/odd values |
| No cent created or lost on the split | **PASS** | executed |
| Processing cost not silently deducted from helper earnings | **PASS** | executed — nothing reduces `helperPayoutCents`; processing is documented as coming out of platform gross |
| Tax explicit | **PASS** | `taxCents` is an explicit 0, not absent |
| Authorization, capture, decline, retry, cancellation, refund, duplicate webhook | **BLOCKED** | No payment processor connected. |
| USD and CAD independently | **PARTIAL** | The split is integer-cents and currency-agnostic (executed). Currency *selection* is `accept_request`'s `CASE … WHEN 'CA' THEN 'CAD' ELSE 'USD'`, keyed off `profiles.country` — code-reviewed, needs one live booking per region to verify. |

**Note:** the `/vs/pricing` essay already stated "80% of the base service
price". The *code* was what contradicted the published copy; the essay needed
no change.

---

## Section 5 — deployment and retired pages

Fully executable, and the strongest evidence in this run.

| Test | Status | Evidence |
|---|---|---|
| Production build starts | **PASS** | `next build` compiled clean; `next start` served; **0 `⨯` server errors** across the whole run |
| Supported city + city×service routes | **PASS** | 10/10 → 200 (3 cities, 5 Vancouver services, LA + SD combos) |
| Retired published URLs → 410 | **PASS** | 11/11 → 410 (8 city pages + 3 city×service) |
| Unknown slugs → 404 | **PASS** | 4/4 → 404 — correctly distinguished from "gone" |
| Retired URLs absent from sitemap | **PASS** | 152 sitemap URLs; city entries are exactly `/cities/{vancouver,los-angeles,san-diego}`; 0 retired slugs |
| Retired URLs absent from internal links | **PASS** | 9 public pages crawled, 0 retired `/cities/*` hrefs |
| Unsupported-city claims absent | **PASS** | no Toronto/Montreal/Seattle/Austin/Chicago/Miami in rendered homepage; no "10 cities" claim |
| Fabricated activity absent | **PASS** | "247 helpers", "2,431 tasks", "12K+ reviews", "18 min", "Just completed" feed — all absent |
| Invented testimonials absent | **PASS** | none of the four fabricated names present |
| Launch claim correct | **PASS** | homepage states the three launch areas and carries the "city limits only" qualifier |
| Backfill ledger review | **BLOCKED** | No ledger — the backfill refuses to start without `MAPBOX_TOKEN`. Verified it exits without writing. |
| Rollback compatibility documented | **PASS — hazard found and fixed** | See below. |

### Rollback compatibility (plan step 5.7) — CORRECTED

Two corrections since the first draft.

**1. The migration deadlock (found here, fixed).** The original single `0030`
both added `provider_profiles.location_updated_at` (required *by* the new
code) and replaced `broadcast_request` with a version the *old* code cannot
satisfy. There was no safe order. It is now split by compatibility class:

| Migration | Class | Before the deploy? |
|---|---|---|
| `0029_address_verification` | additive columns | **Yes** |
| `0030_matching_columns` | additive column + index + `max_location_age()` | **Yes** — required by the new code |
| `0033_service_area_boundaries` | new tables + functions | **Yes** |
| `0034_dispatch_refusals` | new table + functions | **Yes** |
| `0031_payout_split` | function, no column dependency | Yes |
| `0035_matching_functions` | functions, **not backward compatible** | **No** |

**Forward:** `0029`,`0030`,`0033`,`0034` → load boundaries → backfill →
deploy → `0031` → `0035`.

**2. A forward-safe order is not sufficient — and the first draft's
down-migration was wrong.** It restored the permissive pre-0035
`broadcast_request` so rollback would "work". That bypassed address
verification to make rollback appear successful and would have re-enabled
dispatch to the legacy placeholder coordinates. **It has been deleted.**

The corrected posture: address verification is a safety requirement, not a
feature flag. An application release that cannot produce verified addresses
must not dispatch. So rolling back **does not revert `0035`** — and with
`0035` in place, old code is refused. What makes that operable is that the
refusal is now **loud and actionable** rather than silent:

* migration `0034` adds `dispatch_refusals`; every refusal records a row with
  a machine-readable reason;
* the first occurrence per request of any *configuration* fault notifies
  **every admin** (`notifications.type = 'dispatch_blocked'`);
* `dispatch_health()` groups refusals and flags everything except
  `no_eligible_helper` as `is_configuration_fault = true`;
* `broadcast_request` no longer returns a bare 0 — it names the cause
  (`address_unverified`, `boundary_no_dataset`, `boundary_outside`,
  `no_pickup_location`, `no_eligible_helper`).

So an application/migration mismatch announces itself within one request
instead of quietly halting the marketplace. **Recovery is to roll forward**,
not to weaken the gate.

**3. The emergency override was relaxing the wrong check — corrected.** The
second draft relaxed `geocode_verified` while keeping boundary containment,
reasoning that geography still bounded the damage. **It did not.** The legacy
placeholder coordinate is `(-123.1207, 49.2827)` — downtown Vancouver, inside
an approved launch municipality — so all 53 legacy placeholder rows pass
`is_point_serviceable()` as `serviceable`. Boundary containment cannot reject
a coordinate that is geographically plausible and factually wrong about where
the customer lives, and an audit trail naming an owner and reason records
accountability, not location correctness.

The override is now `supabase/rollback/0035_emergency_relax_boundary.sql` and
inverts the relaxation. It relaxes **boundary containment only** — the check
that can fail spuriously (bad dataset load, dropped exclave, projection
error). Two gates are **not overridable by anything in this codebase**:

* `addresses.geocode_verified` must be true
* `is_placeholder_point()` must be false

Migration 0035 now also calls `is_placeholder_point()` **unconditionally** in
the normal dispatch path, independent of `geocode_verified`, so a buggy
backfill that wrongly marked a placeholder row verified still cannot send a
helper to it. New refusal reason `address_placeholder`.

There is therefore **no override that makes an application rollback dispatch
again**, by design: a release that cannot produce verified addresses cannot
dispatch, and recovery is to roll forward.

Production availability: the override must not be applied to production until
this condition is signed off. It refuses without a recorded reason and owner,
refuses if 0035 is not applied, and records every boundary-relaxed dispatch.

Rehearsal now covers R16–R20: under the override, an unverified address is
still refused, a placeholder address is still refused, and a verified
out-of-boundary address dispatches with a recorded `boundary_outside` row.
R20 marks a placeholder row verified by hand and confirms it is still
refused.

**Bidirectional rehearsal** is specified as R1–R16 in
`supabase/rollback/ROLLBACK.md`, including rolling the app back (R11),
confirming `dispatch_health()` reports the fault (R12), rolling forward
(R13), and proving the emergency script refuses without an owner (R14).
`scripts/verify-migration-state.mjs` automates the schema and behaviour
probes. **All of R1–R16 are UNEXECUTED** — they need the isolated
environment, which does not exist yet (no Postgres, Docker or Supabase CLI on
this machine either, so no local rehearsal was possible).

---

## Release gate

**NOT MET.** The gate requires all nonfinancial tests passing in each region,
reliable boundary enforcement, and a passing sandbox financial journey. Zero
regional journeys ran and the financial journey is blocked.

### Ordered path to a real acceptance run

1. Provision `MAPBOX_TOKEN` (Vercel + local). **Until this exists, every request submission is refused** — that is intended fail-closed behaviour, not a bug, but it means the app cannot take a booking.
2. Stand up a staging Supabase project so migrations are not first applied to production.
3. Apply `0029` + `0030`, deploy, then `0031` + `0032`.
4. Run `node scripts/backfill-addresses.mjs --dry-run`, review the ledger, then `--apply`. Confirm ambiguous / failed / out-of-area rows remain unverified.
5. Approve one test helper per region; give each a `provider_services` assignment, a radius, and a live GPS fix. Confirm `find_nearby_providers` returns them.
6. Decide boundary-proximity option (a) or (b) above.
7. Connect Stripe test mode.
8. Then execute Sections 1–4 with a browser, capturing request/booking IDs and screenshots per step.

### Open items with owners needed

| Item | Status |
|---|---|
| Boundary-proximity method | **DECIDED** — official polygons authoritative, name matching preliminary, inside/outside test retained |
| Staging environment | Not provisioned |
| Stripe account + keys | Not provisioned |
| Mapbox token | Not provisioned |
| Helper approval + onboarding for 3 regions | Not started |
| Official boundary datasets | Not loaded — publishers identified in `docs/BOUNDARY-DATASETS.md`; version/sha must be captured at download |
| Bidirectional migration rehearsal (R1–R16) | **Unexecuted** — needs the isolated environment |
| 48 remaining type errors | **Remaining under review** — categories alone do not establish runtime safety |

### What this run does establish

* 65 automated tests execute and pass, covering the two-stage service-area check and its fail-closed behaviour, the municipality allowlist, the ambiguity gate, placeholder detection, and the full pricing split including exhaustive rounding reconciliation.
* The two crashes found in review are covered by tests that were **proven to fail** when the bugs were reintroduced.
* Route status codes, sitemap, internal links and fabricated-content removal are verified against a real production build with zero server errors.
* One new defect (no ambiguity rejection at request time) and one new deployment hazard (the migration deadlock) were found *by* running this plan, and both are fixed.


---

## Commit status

A **reviewable commit for testing** was created on branch
`launch-scope-and-verification`. It is explicitly **not** a production
deployment, and `main` is untouched.

What is *not* in the commit's scope, restated so it cannot be mistaken for
verified work:

* **Regional journeys (Sections 1, 3 partially): UNEXECUTED.** No request,
  booking, offer, message, tracking event or completion exists in any region.
* **Browser checks: UNEXECUTED.** No screenshots, no unread-badge or
  read-state observation, no mobile viewport verification. No browser tooling
  was available in this session.
* **Payments (Section 4 second half): BLOCKED.** No processor is connected.
* **Migration rehearsal (R1–R16): UNEXECUTED.** No isolated environment.
* **Boundary containment (`supabase/tests/boundary_containment.sql`):
  UNEXECUTED.** No dataset loaded.

What the commit does carry as executed evidence: 62 passing automated tests
(including regressions proven to fail when their bugs are reintroduced), a
clean production build, and 25/25 route assertions with zero server errors.
