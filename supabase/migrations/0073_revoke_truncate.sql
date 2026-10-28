-- CLASS: pre-deploy
-- =========================================================================
-- 0073 — take TRUNCATE away from the client roles
--
-- Found while verifying 0072: provider_cities was granted TRUNCATE to
-- `authenticated`, alongside the SELECT its policy intends. 50 other public
-- tables carried the same grant — bookings, payouts, profiles, messages,
-- refunds, disputes — because Supabase's default schema setup issues a
-- blanket `grant all on all tables in schema public to anon, authenticated`
-- and every table created since inherited it.
--
-- WHY IT MATTERS. TRUNCATE is not subject to row-level security. PostgreSQL
-- checks the table privilege and nothing else, so no policy on any of these
-- tables constrains it. For provider_cities specifically it would also
-- defeat the point of 0072's design: the table has no insert/update/delete
-- policy precisely so that set_provider_working_cities() is the only write
-- path and every write is validated against a real boundary. A role that
-- can TRUNCATE can empty the table without passing through it.
--
-- WHAT THE REAL EXPOSURE WAS. Low, and worth stating plainly rather than
-- dressing up. PostgREST does not expose TRUNCATE: it builds SELECT,
-- INSERT, UPDATE, DELETE and RPC calls, and there is no way to post
-- arbitrary SQL through it. Every public function callable by anon or
-- authenticated that contains a dynamic EXECUTE is a PostGIS built-in, and
-- those run as the invoker, which owns nothing. So this was a privilege
-- that should not have existed rather than a hole anyone could reach today.
-- It is revoked because the next SECURITY DEFINER helper, or the next
-- direct-connection tool that assumes `authenticated` is harmless, should
-- not be the thing that discovers it.
--
-- SAFE TO APPLY. The application never issues TRUNCATE — the only matches
-- in the tree are Tailwind's `truncate` class. Migrations and admin tooling
-- connect as the owner or service_role, neither of which is touched here.
-- =========================================================================

-- The assertion counts only objects THIS role owns.
--
-- `revoke ... on all tables in schema public` silently skips anything
-- postgres does not own, and PostGIS leaves three such objects behind:
-- spatial_ref_sys (owned by supabase_admin) and the geometry_columns /
-- geography_columns views. None is application data, TRUNCATE on a view is
-- not a thing, and spatial_ref_sys is restorable reference data shipped by
-- the extension. Asserting zero across the whole schema just makes the
-- migration fail on something it has no power to change, so the check is
-- scoped to the set it can actually clear and the remainder is reported.
do $$
declare
  v_before int;
  v_after  int;
  v_skipped text;
begin
  select count(*) into v_before
    from information_schema.role_table_grants g
    join pg_class c on c.relname = g.table_name
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
   where g.table_schema = 'public'
     and g.grantee in ('anon', 'authenticated')
     and g.privilege_type = 'TRUNCATE'
     and pg_get_userbyid(c.relowner) = current_user;

  revoke truncate on all tables in schema public from anon, authenticated;

  select count(*) into v_after
    from information_schema.role_table_grants g
    join pg_class c on c.relname = g.table_name
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
   where g.table_schema = 'public'
     and g.grantee in ('anon', 'authenticated')
     and g.privilege_type = 'TRUNCATE'
     and pg_get_userbyid(c.relowner) = current_user;

  if v_after <> 0 then
    raise exception 'TRUNCATE still granted on % owned table/role pairs', v_after;
  end if;

  select string_agg(distinct g.table_name, ', ') into v_skipped
    from information_schema.role_table_grants g
    join pg_class c on c.relname = g.table_name
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
   where g.table_schema = 'public'
     and g.grantee in ('anon', 'authenticated')
     and g.privilege_type = 'TRUNCATE';

  raise notice 'revoked TRUNCATE on % owned table/role pairs', v_before;
  if v_skipped is not null then
    raise notice 'not owned by %, left as-is (PostGIS): %', current_user, v_skipped;
  end if;
end $$;

-- And tables created from here on. The default privileges that produced
-- this are owned by the role that creates the tables, so the ALTER has to
-- name it; postgres is the owner every migration runs as.
alter default privileges for role postgres in schema public
  revoke truncate on tables from anon, authenticated;

-- A table created by the supabase_admin role (dashboard "New table")
-- inherits that role's defaults instead, so cover it too. Wrapped because
-- the role is not present on every local or CI Postgres.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_admin') then
    execute 'alter default privileges for role supabase_admin in schema public '
            'revoke truncate on tables from anon, authenticated';
  end if;
exception when insufficient_privilege then
  raise notice 'could not alter supabase_admin default privileges — new '
               'dashboard-created tables may still grant TRUNCATE';
end $$;
