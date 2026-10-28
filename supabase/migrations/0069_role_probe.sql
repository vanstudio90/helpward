-- CLASS: pre-deploy safe. Adds one read-only function; changes nothing.
--
-- A WAY TO ASK "WHAT ROLE AM I?" THAT ONLY service_role MAY CALL.
--
-- preflight tried to prove a service-role key was elevated by reading a
-- table RLS hides from anon, and treating a 200 as success. That does not
-- work, and the reason is worth writing down: RLS does not REFUSE a
-- hidden row, it returns 200 with an empty array. So "anon got an empty
-- array" means "anon read the table and saw nothing", not "anon was
-- denied".
--
-- The consequence was the worst kind of false pass. An audit put the
-- ANON key in the service-role slot: the service probe returned 200 with
-- [], the anon control returned 200 with [], and preflight reported
-- "service-role key is elevated (reads what anon cannot)". Both requests
-- were the same key. Authentication was tested; authorisation never was.
--
-- Row visibility is the wrong instrument. EXECUTE privilege is the right
-- one: it is granted per role, it is checked before the function runs,
-- and a caller without it is REFUSED rather than handed an empty result.
--
-- Deliberately SECURITY INVOKER. A security-definer function would run
-- as its owner and report the owner's role, which would answer a
-- different question than the one being asked.

create or replace function public.whoami_role()
returns text
language sql
stable
security invoker
set search_path = public
as $$
  select current_user::text;
$$;

-- The whole point: only service_role may execute it.
revoke execute on function public.whoami_role() from public, anon, authenticated;
grant execute on function public.whoami_role() to service_role;

comment on function public.whoami_role() is
  'Read-only role probe for cutover preflight. Only service_role may '
  'EXECUTE it, so a caller that gets an answer has demonstrated authority '
  'rather than merely authenticating. Row-level visibility cannot show '
  'this: RLS returns 200 with an empty array rather than refusing.';

-- PostgREST caches the schema, so a function it has never seen returns
-- 404 "Could not find the function" — indistinguishable from a function
-- that does not exist. Without this the probe would fail for BOTH keys
-- and preflight would block a perfectly good environment.
notify pgrst, 'reload schema';
