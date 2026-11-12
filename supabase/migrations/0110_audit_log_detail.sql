-- CLASS: pre-deploy
-- =========================================================================
-- 0110 — the audit log learns what it was always being asked
--
-- The console wants four things from an event that this table never
-- held: what the attempt RESULTED in, what the actor WAS at the time,
-- which request it belonged to, and what actually changed.
--
-- THE ROLE IS FILLED IN BY A TRIGGER, not by every caller.
--
-- There are twenty-odd places that write to this table. Asking each to
-- remember a new column is asking for a column that is right in the
-- places somebody remembered and null everywhere else. The claim is
-- already in the request's JWT, so a BEFORE INSERT trigger reads it
-- there — and every existing write path starts recording the role at
-- the event without a line of application code changing.
--
-- This matters more than it sounds in THIS product: the admin claim
-- lives in app_metadata, not in profiles.role, so a reader that looks
-- up the profile today can be wrong the moment it looks. Three events
-- in production already name a customer who was acting as an admin.
--
-- NOTHING IS BACKFILLED. An old row does not know what its actor was,
-- and inventing it from today's profile would be the exact mistake the
-- column exists to prevent. Old events read "not recorded", which is
-- true.
-- =========================================================================

do $$
begin
  if not exists (select 1 from information_schema.tables
                  where table_schema = 'public' and table_name = 'audit_log') then
    raise exception 'REFUSING: audit_log is missing.';
  end if;
end $$;

alter table public.audit_log
  add column if not exists outcome text,
  add column if not exists role_at_event text,
  add column if not exists correlation_id text,
  add column if not exists changes jsonb;

comment on column public.audit_log.outcome is
  'succeeded | submitted | denied | failed. "submitted" means the result is still with somebody else — a processor, a mail provider. An attempt and its outcome are different events.';
comment on column public.audit_log.role_at_event is
  'What the actor was WHEN THEY ACTED, read from the verified claim by trg_audit_context. Never looked up from profiles afterwards.';
comment on column public.audit_log.correlation_id is
  'Ties an attempt, the server work and the outcome together. Null where nobody set one.';
comment on column public.audit_log.changes is
  'Only the fields that moved: [{field, before, after}]. Saved with the event, never reconstructed from current values.';

alter table public.audit_log drop constraint if exists audit_log_outcome_check;
alter table public.audit_log add constraint audit_log_outcome_check
  check (outcome is null or outcome in ('succeeded', 'submitted', 'denied', 'failed'));

create index if not exists audit_log_correlation_idx
  on public.audit_log (correlation_id) where correlation_id is not null;
create index if not exists audit_log_recent_idx
  on public.audit_log (created_at desc, id desc);

/*
  THE CONTEXT TRIGGER.

  Fills what the request already knows and the caller did not say. It
  never overwrites a value a caller supplied — a function that knows it
  only submitted something can say so, and this will not promote it to
  succeeded.
*/
create or replace function public.audit_context()
returns trigger
language plpgsql set search_path = public as $$
declare
  v_claims json;
begin
  if new.outcome is null then
    new.outcome := 'succeeded';
  end if;

  if new.role_at_event is null then
    begin
      v_claims := nullif(current_setting('request.jwt.claims', true), '')::json;
    exception when others then
      v_claims := null;
    end;

    new.role_at_event := coalesce(
      v_claims -> 'app_metadata' ->> 'role',
      -- No claim at all means the server did it: a cron, a webhook, a
      -- migration. That is a different actor from a person, and saying
      -- "system" is more use than saying nothing.
      case when new.actor_id is null then 'system' else null end
    );
  end if;

  return new;
end $$;

drop trigger if exists trg_audit_context on public.audit_log;
create trigger trg_audit_context
  before insert on public.audit_log
  for each row execute function public.audit_context();

-- -------------------------------------------------------------------------
-- Proven.
-- -------------------------------------------------------------------------
do $$
declare
  v_admin uuid;
  v_id bigint;
  v_role text;
  v_outcome text;
begin
  select id into v_admin from profiles where role = 'customer' limit 1;

  -- A write with no claim at all is the server acting.
  insert into audit_log (actor_id, action, target_table)
  values (null, 'audit.selftest', 'audit_log') returning id into v_id;
  select role_at_event, outcome into v_role, v_outcome from audit_log where id = v_id;
  if v_role <> 'system' or v_outcome <> 'succeeded' then
    raise exception '0110: an unattributed write recorded role % / outcome %.', v_role, v_outcome;
  end if;
  delete from audit_log where id = v_id;

  if v_admin is null then
    raise notice '0110: no profile fixture; the claim path was not exercised.';
    return;
  end if;

  /*
    THE CASE THAT MATTERS: somebody acting as an admin whose profile row
    says customer. The event must record what they WERE — admin — not
    what the profile says they are.
  */
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin::text, 'role', 'authenticated',
                      'app_metadata', json_build_object('role', 'admin'))::text, true);

  insert into audit_log (actor_id, action, target_table)
  values (v_admin, 'audit.selftest', 'audit_log') returning id into v_id;
  select role_at_event into v_role from audit_log where id = v_id;
  if v_role <> 'admin' then
    raise exception '0110: an admin action recorded the role as %, which is what the profile says, not what they were.', v_role;
  end if;
  delete from audit_log where id = v_id;

  -- A caller that knows better is not overruled.
  insert into audit_log (actor_id, action, target_table, outcome)
  values (v_admin, 'audit.selftest', 'audit_log', 'submitted') returning id into v_id;
  if (select outcome from audit_log where id = v_id) <> 'submitted' then
    raise exception '0110: the trigger overwrote an outcome the caller supplied.';
  end if;
  delete from audit_log where id = v_id;

  perform set_config('request.jwt.claims', '', true);
end $$;
