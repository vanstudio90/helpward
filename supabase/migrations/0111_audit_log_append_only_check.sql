-- CLASS: pre-deploy

/*
  CAN THE PAGE PROVE ITS OWN HEADLINE?

  /admin/audit-log prints "Append-only history". Until 0109 that
  sentence was false — `authenticated` held UPDATE and DELETE on
  audit_log and the policy was FOR ALL, so any admin session could
  edit its own trail through PostgREST. A console that asserts a
  security property because the buttons are missing is worse than one
  that says nothing.

  So the claim is now ESTABLISHED, not assumed. This function asks the
  catalogue two questions, and the page prints whichever answer comes
  back:

    1. Does any browser-facing role still hold a write that changes or
       removes a row?
    2. Does any policy still permit UPDATE, DELETE or ALL?

  It is security definer because information_schema.role_table_grants
  shows a caller only the grants they are party to, and an admin's
  token is party to none of them — the check would come back "clean"
  for the wrong reason. The function takes no argument, reads nothing
  but the catalogue, and returns a boolean, so defining it is not a
  way to read anything a caller could not already see.
*/

create or replace function public.audit_log_is_append_only()
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select
    not exists (
      select 1
      from information_schema.role_table_grants
      where table_schema = 'public'
        and table_name = 'audit_log'
        and grantee in ('anon', 'authenticated')
        and privilege_type in ('UPDATE', 'DELETE', 'TRUNCATE')
    )
    and not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'audit_log'
        and cmd in ('UPDATE', 'DELETE', 'ALL')
    );
$$;

revoke all on function public.audit_log_is_append_only() from public;
grant execute on function public.audit_log_is_append_only() to authenticated, service_role;

comment on function public.audit_log_is_append_only() is
  'True when no browser-facing role can change or remove an audit_log row. The audit log page prints this answer rather than asserting the property.';

/* ------------------------------------------------------------------ *
 * SELF-TEST                                                           *
 * ------------------------------------------------------------------ */
do $$
declare
  v_ok boolean;
begin
  select public.audit_log_is_append_only() into v_ok;
  if not v_ok then
    raise exception 'audit_log is NOT append-only in this database — 0109 has not been applied here, and the page will say so.';
  end if;

  /* A grant is enough to flip it. Proven, then put back. */
  grant update on public.audit_log to authenticated;
  select public.audit_log_is_append_only() into v_ok;
  if v_ok then
    raise exception 'the check did not notice an UPDATE grant on audit_log';
  end if;
  revoke update on public.audit_log from authenticated;

  select public.audit_log_is_append_only() into v_ok;
  if not v_ok then
    raise exception 'the check stayed false after the test grant was revoked';
  end if;

  raise notice 'audit_log_is_append_only: reports true, and notices a write grant when one exists';
end $$;
