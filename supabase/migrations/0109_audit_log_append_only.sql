-- CLASS: pre-deploy
-- =========================================================================
-- 0109 — the audit log becomes what it claims to be
--
-- The console is about to show the sentence "Read-only history —
-- changes are recorded as new events" above this table. It was not
-- true. `authenticated` held UPDATE and DELETE on audit_log, and the
-- al_admin policy was FOR ALL, so any admin session could edit or
-- erase its own trail straight through PostgREST. Proven rather than
-- assumed: an UPDATE and a DELETE both succeeded as an admin in a
-- rolled-back transaction before this was written.
--
-- An audit log an operator can rewrite is not an audit log. It is a
-- list of things nobody has got round to changing yet.
--
-- SO: APPEND ONLY, FOR EVERYBODY WHO REACHES IT WITH A BROWSER TOKEN.
-- Admins keep reading it and the app keeps writing to it; nobody with
-- a session may amend a line of it. The service role — which is the
-- server, not a person — is untouched, because that is what inserts
-- most of these rows.
--
-- A CORRECTION IS A NEW EVENT. That is the only mechanism left, which
-- is the one the brief asks for.
-- =========================================================================

do $$
begin
  if not exists (select 1 from information_schema.tables
                  where table_schema = 'public' and table_name = 'audit_log') then
    raise exception 'REFUSING: audit_log is missing.';
  end if;
end $$;

-- 1. Nobody holding a browser token may change or remove a line.
revoke update, delete, truncate on public.audit_log from anon, authenticated;

-- 2. And the policy stops saying "for all".
drop policy if exists al_admin on public.audit_log;

create policy al_admin_read on public.audit_log
  for select using (is_admin());

/*
  Inserting is still allowed for an admin session, because some client
  paths record their own actions. It cannot be used to rewrite history:
  without UPDATE or DELETE, the worst a forged row can do is sit beside
  the real ones with its actor recorded.
*/
create policy al_admin_append on public.audit_log
  for insert with check (is_admin());

-- 3. Proven, both ways.
do $$
declare
  v_admin uuid;
  v_id bigint;
  v_refused int := 0;
begin
  select id into v_admin from profiles where role = 'admin' limit 1;
  if v_admin is null then
    raise notice '0109: no admin fixture; the append-only guard was not exercised.';
    return;
  end if;

  insert into audit_log (actor_id, action, target_table, target_id, payload)
  values (null, 'audit.selftest', 'audit_log', null, '{"note":"0109 self-test"}'::jsonb)
  returning id into v_id;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin::text, 'role', 'authenticated',
                      'app_metadata', json_build_object('role', 'admin'))::text, true);
  perform set_config('role', 'authenticated', true);

  begin
    update audit_log set action = 'tampered' where id = v_id;
    if found then raise exception 'updated'; end if;
    v_refused := v_refused + 1;              -- RLS silently matched nothing
  exception
    when insufficient_privilege then v_refused := v_refused + 1;
    when others then
      if sqlerrm = 'updated' then null; else v_refused := v_refused + 1; end if;
  end;

  begin
    delete from audit_log where id = v_id;
    if found then raise exception 'deleted'; end if;
    v_refused := v_refused + 1;
  exception
    when insufficient_privilege then v_refused := v_refused + 1;
    when others then
      if sqlerrm = 'deleted' then null; else v_refused := v_refused + 1; end if;
  end;

  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);

  if v_refused <> 2 then
    raise exception '0109: an admin session could still amend the audit log (% of 2 refused).', v_refused;
  end if;

  -- Reading it must still work, or the console goes dark.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin::text, 'role', 'authenticated',
                      'app_metadata', json_build_object('role', 'admin'))::text, true);
  perform set_config('role', 'authenticated', true);
  if (select count(*) from audit_log) = 0 then
    raise exception '0109: locking the log also hid it from admins.';
  end if;
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);

  delete from audit_log where id = v_id;   -- as postgres, clearing the probe
end $$;
