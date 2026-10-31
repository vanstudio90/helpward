# The rehearsal database — what is needed and why

**Status: not available on this machine. One provisioning action is
required, and it is the owner's to take.**

## Why the existing rehearsal project will not do

It is already at `0087`. Running the upgrade there proves nothing: the
upgrade has happened. The failures worth finding are the ones that only
occur going from production's exact `0080` state — a column that already
exists, a policy that was dropped by hand, a backfill that assumes rows
the older schema never had.

It must also NOT be downgraded. It is the only working copy of the
post-upgrade schema, and the app has been verified against it.

## What was checked here

| | |
|---|---|
| `postgres` / `psql` / `initdb` | not installed |
| Docker / Colima / Podman | not installed |
| Homebrew | not installed |
| Anything listening on `5432` | nothing |
| Postgres.app | not present |
| Supabase CLI | not installed |
| Supabase login (`~/.supabase/access-token`) | absent — only `telemetry.json` |

The `pg` node module **is** present and `scripts/migrate.mjs` uses it,
so the moment a connection string exists nothing else needs installing.

## Pick one (any gives a throwaway database)

**A — Postgres.app (simplest on a Mac, no terminal install).**
Download from postgresapp.com, drag to Applications, open it, click
Initialize. It then listens on `5432`. Connection string:
`postgres://$USER@127.0.0.1:5432/postgres`.

**B — a scratch Supabase project (closest to production).**
Create a new project in the Supabase dashboard — any name, free tier,
same region as production. Take the connection string from Project
Settings → Database. This is the most faithful rehearsal because it is
the same Postgres version and the same extensions.

**C — Homebrew.**
Install Homebrew, then `brew install postgresql@16 && brew services start postgresql@16`.
The heaviest option and the least like production.

I would take **B**: the rehearsal is about a specific upgrade on a
specific Postgres, and a scratch project is that, for free, in a few
minutes. It is also disposable afterwards.

## Then run it

```bash
cd ~/sites/helpward           # on the release branch
REHEARSAL_DATABASE_URL='<throwaway connection string>' \
  node scripts/rehearse-upgrade.mjs
```

It will:

1. build production's state by applying everything up to `0080`;
2. confirm it landed on `0080` and stop if it did not;
3. seed synthetic fixtures so the upgrade has something to act on;
4. apply `0081` through `0087` one at a time, in order;
5. check the coupled `0085` change — that `req_read` was rewritten and
   that `offer_summary`, which the code shipping alongside it reads,
   exists.

It **refuses to run** against a database with rows in `bookings`, so it
cannot be pointed at production or at the real rehearsal project by
mistake.

Keep its output with the release candidate: that transcript is the
evidence that the sequence works from `0080`.
