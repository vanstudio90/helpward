# Deploying the app's API — runbook

**Finish condition:** the iOS submission build completes authenticated
writes and a full booking journey.

## Where it stands

| | |
|---|---|
| `/api/v1/me` | **live in production**, 401 on a bad token, 200 with a real one |
| `/api/v1/payment-methods` | **live in production**, same |
| `/api/v1/requests` | **404** — needs migrations 0083–0087 |
| `/api/v1/bookings/[id]/cancellation` | not deployed — same bundle |

Production is **seven** migrations behind, no more. From
`schema_migrations`: production is at `0080_service_definitions`,
rehearsal at `0087_launch_scope_services`.

```
0081_helper_role_rename.sql
0082_service_taglines.sql
0083_handover_details.sql
0084_offer_payload.sql
0085_close_offer_leak.sql      <- deploy-coupled, see below
0086_set_booking_handover.sql
0087_launch_scope_services.sql
```

All seven are already applied in rehearsal, which is what makes this a
rehearsed sequence rather than a first attempt.

## The one blocker

`scripts/migrate.mjs` needs `DATABASE_URL`. It is not on this machine and
there is no way around it: no `exec_sql` RPC exists on the project, the
Supabase CLI is not installed, and the service-role key cannot run DDL
over PostgREST. The database port is reachable; the password is not here.

Get the connection string from Supabase → Project Settings → Database.

## Sequence

```bash
cd ~/sites/helpward

# 1. Confirm where production actually is, do not assume
node -e '…'   # or read schema_migrations as docs/service-scope did

# 2. Dry run first — migrate.mjs records sha256 per file, so a re-run is safe
DATABASE_URL='<production connection string>' node scripts/migrate.mjs --dry-run

# 3. Apply
DATABASE_URL='<production connection string>' node scripts/migrate.mjs

# 4. Merge the API branch into the deployed branch.
#    9 files conflict, mostly because 0081 renamed (provider) to (helper)
#    and because the content work since has rewritten the service and city
#    templates. Resolve by keeping nav-hash-fix's content and taking
#    launch-scope-and-verification's API and route moves.
git merge launch-scope-and-verification

# 5. Deploy
vercel --prod --force
```

### 0085 is deploy-coupled

`0085_close_offer_leak.sql` rewrites the `req_read` policy so a candidate
helper can no longer read `deliver_to` and `recipient`. The application
code that reads offers through `offer_summary` must ship in the same
window. Apply it and deploy together; do not leave a gap in either
direction.

## Verifying afterwards

```bash
for p in me requests payment-methods; do
  curl -s -o /dev/null -w "$p %{http_code}\n" \
    -H "Authorization: Bearer invalid" "https://helpward.com/api/v1/$p"
done
# every one should be 401. A 404 means the route did not ship.
```

Then with a real token — mint one by signing in as a test account and
reading `access_token` — `/api/v1/me` should return
`{userId, role, environment}` and `environment` should be the PRODUCTION
project ref, not the rehearsal one.

## How the two live routes were proven

Not by watching 404 become 401, which only shows a route exists. The
whole app was built against the rehearsal project and run locally, a real
user was created there, signed in for a genuine access token, and both
routes returned 200 with correct payloads while still rejecting a bad
token. The rehearsal user was then deleted and `.env.local` restored to
production.

Do the same against production after the migrations, with a real account,
before relying on it for a submission.
