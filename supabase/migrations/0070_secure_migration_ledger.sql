-- CLASS: pre-deploy safe. Locks down one table; touches no application data.
--
-- THE MIGRATION LEDGER WAS WORLD-READABLE.
--
-- scripts/migrate.mjs creates schema_migrations with a bare CREATE TABLE —
-- no RLS, no revokes. In a normal Postgres deployment that is unremarkable.
-- Under Supabase it is not: every table in the `public` schema is exposed
-- through PostgREST, and Supabase grants the anon and authenticated roles
-- access by default. So an anonymous visitor holding only the publishable
-- key could list the entire migration history.
--
-- Verified against production on 2026-10-28 before this ran: an anon-key
-- GET on /rest/v1/schema_migrations returned 0001_init.sql, 0002_rls.sql
-- and the rest.
--
-- The contents are not credentials, but they are a precise inventory of
-- the schema and its security history — which guard landed when, which
-- table arrived in which release. That is reconnaissance, handed out for
-- free, and it is also simply not a table any client should see.
--
-- Nothing in the application reads it. Only migrate.mjs does, over a
-- direct Postgres connection as the database owner, which RLS does not
-- apply to and these revokes do not affect.

alter table if exists schema_migrations enable row level security;

-- No policy is created on purpose. RLS with zero policies denies everyone
-- except the table owner and roles with BYPASSRLS, which is exactly the
-- intent: the ledger belongs to the migration runner, nobody else.
revoke all on schema_migrations from anon, authenticated;

comment on table schema_migrations is
  'Applied-migration ledger for scripts/migrate.mjs. RLS on with NO policies, '
  'and all grants revoked from anon/authenticated: nothing in the application '
  'reads this, and before migration 0070 it was readable with the public key.';
