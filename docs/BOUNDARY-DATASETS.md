# Official municipal boundary datasets

The authoritative service-area test is polygon containment against official
municipal boundaries (`service_area_boundaries`, migration 0033).
Municipality-name matching remains only a preliminary filter.

**Nothing is dispatchable until a dataset is loaded and marked active.**
`is_point_serviceable()` returns `no_dataset` and the system fails closed.

## Candidate authoritative sources

These are the official publishers to load from. **Do not record a version
string from this document** — capture `source_version`, `source_retrieved_at`
and `source_sha256` from the file you actually download, at download time.
That is the whole point of the provenance columns.

### Lower Mainland, British Columbia
- **Publisher:** Province of British Columbia — BC Data Catalogue (DataBC)
- **Layer:** Municipalities / Legally Defined Administrative Areas of BC
- **Why:** provincially maintained legal municipal boundaries, which is what
  "city limits" means for the 15 approved municipalities.
- **Licence:** confirm the Open Government Licence – British Columbia terms at
  download and record them in `license`.
- **Caution:** the layer covers all BC municipalities. Filter to the 15
  approved names and verify the count is exactly 15 before activating. The
  City and District of North Vancouver are **separate features**, as are the
  City and Township of Langley — four features for what the launch list calls
  two names.

### Los Angeles and San Diego, California
Two viable routes; pick one and record which:
- **Per-city open data** — the City of Los Angeles and City of San Diego each
  publish their own boundary. Most authoritative for a single city.
- **US Census TIGER/Line "Places"** — one national file containing
  incorporated places; convenient for loading both cities consistently.
  Record the TIGER vintage year as `source_version`.
- **Caution:** both cities have non-contiguous territory. Los Angeles
  includes San Pedro/Wilmington via the harbour strip and the separate
  Pacific Palisades area; San Diego has several exclaves. Geometry **must**
  be loaded as `MultiPolygon` — loading only the largest ring silently drops
  neighbourhoods that are inside city limits.

## Explicit handling of locations outside municipal boundaries

A geocoded address can sit inside no municipality at all — unincorporated
county land. This is the realistic failure mode that name matching alone
cannot catch, because such an address frequently geocodes with a neighbouring
city's place name (an unincorporated San Diego County address reported as
"San Diego").

This case is handled as a **distinct** outcome, not folded into "we don't
serve your city":

| Verdict | Meaning | Customer sees |
|---|---|---|
| `serviceable` | inside an active boundary | request proceeds |
| `outside_boundary` | geocoded fine, inside no boundary we operate in | "That address sits just outside the city limits we currently serve." |
| `no_dataset` | no active dataset; we cannot answer | "We can't confirm service coverage right now" — request refused |

Every non-serviceable dispatch attempt is recorded in `dispatch_refusals`
with reason `boundary_outside` or `boundary_no_dataset`, and the latter
notifies admins as a configuration fault.

## Loading

```
node scripts/load-boundaries.mjs \
  --area lower-mainland-bc \
  --file ./data/bc-municipalities.geojson \
  --source-name "BC Data Catalogue — Legally Defined Administrative Areas" \
  --source-url "<exact download URL>" \
  --source-version "<version/vintage from the publisher>" \
  --license "<licence recorded at download>" \
  --dry-run
```

The loader computes `source_sha256` from the file, filters to the approved
municipality list for the area, refuses to activate on a feature-count
mismatch, and leaves the dataset inactive until `--activate` is passed.

## Verification before activating

1. `node scripts/verify-migration-state.mjs` — confirms the dataset row and
   feature count.
2. Probe known points: a downtown address in each launch city must return
   `serviceable`; a known unincorporated address and an excluded municipality
   (Abbotsford, Santa Monica) must return `outside_boundary`.
3. Probe a known **exclave** (e.g. a San Pedro address for Los Angeles) to
   prove MultiPolygon geometry survived the load.
4. Run the boundary SQL test: `supabase/tests/boundary_containment.sql`.
