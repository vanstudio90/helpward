# Service scope — cut to the app's launch set, 2026-10-31

The iOS first submission ships **eight** services. The website now sells the
same eight. The other eighteen are **withdrawn, not deleted**, and come back
once the app is approved.

## Live now

`maid-service` · `wait-in-line` · `errand-runner` · `furniture-assembly` ·
`grocery-pickup` · `package-delivery` · `package-return` · `moving-help`

This list is `AppStorePolicy.launchServices` in the iOS repo. The two must
match; if you change one, change the other.

## Withdrawn, coming back

`appliance-repair` · `car-battery-jump` · `date-companion` ·
`designated-driver` · `dog-walking` · `elder-assistance` · `event-companion` ·
`family-standin` · `house-check-in` · `listening-service` ·
`motorcycle-taxi` · `property-inspection` · `rent-a-friend` ·
`shopping-companion` · `sleep-call-companion` · `tech-setup` · `tv-mounting` ·
`wedding-guest`

`professional-cuddler` was already inactive by an earlier decision and is NOT
switched on by a restore.

## Nothing was deleted

The cut flips `services.active` and nothing else. Still present and untouched
for every withdrawn service:

- its `services` row — title, blurb, price, ETA, category, **and the new
  photograph**
- its pricing rule in `service_pricing`
- its `service_completion_requirements` row
- its intake questions in `lib/service-intake.ts`
- its page copy in `lib/public-service-pages.ts` (title, H1, intro, FAQs, scope)
- its preparation list in `lib/public-service-prep.ts`
- its public name and related links in `lib/public-service-copy.ts`

A full snapshot of the database side, taken immediately before the cut, is in
`snapshot-2026-10-31.json`.

## Restoring

```
node scripts/service-scope.mjs status           # what is on and off
node scripts/service-scope.mjs restore          # dry run
node scripts/service-scope.mjs restore --apply  # put them all back
vercel --prod --force                           # republish the static pages
```

To bring back **one** service rather than all of them, set `active = true` on
that row and deploy.

## What a withdrawn URL does

It returns **404**, with a page that says we are not offering that one right
now and lists what we do offer, read live from the catalogue.

404 rather than 410. Both are reversible — a URL returning either status can
return 200 again later — so this is not about permanence. It is about what we
assert now: 410 says the resource is deliberately gone, which overstates a
pause, while 404 says only that there is nothing here at the moment. 404
claims less, and less is accurate.

(An earlier version of this note said 410 was "a promise they are never coming
back". That was wrong and is corrected here.)

They are not redirected either — sending somebody who searched for TV mounting
to a cleaning page answers a different question from the one they asked.

They also drop out of the sitemap, the public directory, the homepage grid,
related-service links and the city pages automatically, because every one of
those reads the catalogue rather than a list of its own. Sitemap went 139 → 85
URLs; service pages 26 → 8; city service pages 52 → 16.
