# Image replacement — resume here

**State at 2026-10-31, interrupted by a planned Mac restart.**

Goal (owner, item 1): replace the **14 service photographs that do not show the
service**. Keep the purple-and-white design and the existing 5:3 card
proportions. Never present stock photography as a Helpward customer, helper or
completed job. 12 of the 26 services keep their current photo.

## Method that must not be skipped

**Look at every candidate before using it.** Unsplash alt text is
auto-generated and wrong often enough to matter — a search for
"jump starting car battery" returned a photo of shoes. Every pick below was
downloaded and viewed. Do the same for the remaining ones.

Only `images.unsplash.com/photo-*` (free Unsplash License).
**Do NOT use `plus.unsplash.com/premium_photo-*`** — that is Unsplash+, a paid
tier this account does not hold.

Construct the stored URL in the same shape as the existing rows:
`https://images.unsplash.com/photo-<ID>?auto=format&fit=crop&w=800&q=70`

## CONFIRMED PICKS (viewed, correct) — 5 of 14

| Service | Photo ID | What it actually shows |
|---|---|---|
| `elder-assistance` | `1704475686860-ab71b444df6b` | An older woman and a younger woman laughing together while gardening. **No clinical clothing** — this was the owner's specific objection to the current one. |
| `package-delivery` | `1566576721346-d4a3b4eaeb55` | A cardboard parcel being handed from one person to another. No warehouse, no uniform, no carrier branding. |
| `tv-mounting` | `1701421048182-2a628d927578` | A flat-screen television clearly **mounted on a wall**, screen off, no brand logos. |
| `car-battery-jump` | `1597766321604-9de3ff9e93e2` | Hands holding red and black jumper-cable clamps over an open engine bay. |
| `furniture-assembly` | `1772338537689-056082f100a9` | Someone driving a screwdriver into a white flat-pack panel at a cam-lock fitting. |

Downloaded copies: `~/Documents/helpward-image-work/candidates/`
(`elder_3.jpg`, `pkgdel_1.jpg`, `tvmount_1.jpg`, `battery2_1.jpg`, `furn_1.jpg`).

## STILL TO PICK — 9 of 14

`appliance-repair`, `date-companion`, `errand-runner`, `listening-service`,
`moving-help`, `package-return`, `sleep-call-companion`, `tech-setup`,
`wait-in-line`.

Best candidate so far for **appliance-repair**: `1754732693535-7ffb5e1a51d6`
(the inside of a washing machine with the back panel off — motor, belt and
wiring visible). Viewed. On-subject but has no person in frame and an odd
magenta light; searches for a technician examining a household appliance
returned nothing better. Worth one more look before settling.

Unviewed candidates already gathered:
- moving-help: `1620455800201-7f00aeef12ed` (person loading boxes into a van),
  `1761574319274-8a3a9cd80a6e` (unloading crates from a van)
- wait-in-line: `1743324754696-c636e1aed0b6` (people standing in a line),
  `1786985903807-1bd9aae14c61` (long queue inside a building)

Searches not yet run: errand-runner, package-return, tech-setup,
listening-service, sleep-call-companion, date-companion.

## How to apply a pick

`services.image_url` in Supabase is the single source for both the website and
the iOS app, so one update fixes both surfaces. Service role key is in
`.env.local`. After updating, redeploy — the service pages are statically
generated with 1-hour ISR, so a deploy is what republishes them.

Alt text stays `alt=""` while an image is decorative. Once a photograph
genuinely shows the work being done, give it real descriptive alt text — see
the note in `app/services/[slug]/page.tsx`.

## Reference

- Findings for all 26 current photos: `contact-sheet-findings.json`
- Current published URLs: `current-images.json`
- Contact sheet for the designer:
  https://claude.ai/code/artifact/237986a2-f89e-4d72-828e-71900b698e8e
