-- CLASS: pre-deploy
-- =========================================================================
-- 0106 — the decisions staff take on a safety case
--
-- Each of these writes a timeline entry as part of the same statement
-- that makes the change, so the history cannot drift from the record.
-- And each one that CHANGES the case carries the concurrency token: a
-- reviewer whose copy is stale is refused with HW080 rather than
-- allowed to write over a colleague.
-- =========================================================================

do $$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'dispute_guard') then
    raise exception 'REFUSING: dispute_guard() is missing. Apply 0105 first.';
  end if;
end $$;

-- -------------------------------------------------------------------------
-- 1. Owner, priority, status, next review.
-- -------------------------------------------------------------------------
create or replace function public.admin_dispute_update(
  p_id uuid,
  p_expected timestamptz,
  p_owner uuid default null,
  p_clear_owner boolean default false,
  p_priority text default null,
  p_status text default null,
  p_next_review timestamptz default null,
  p_clear_review boolean default false
) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare
  v_d disputes;
  v_new timestamptz;
begin
  if not is_admin() then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;
  v_d := dispute_guard(p_id, p_expected);

  if p_status = 'resolved' then
    raise exception 'Resolving a case goes through the resolution form, which records an outcome and a reason.'
      using errcode = 'HW082';
  end if;

  update disputes set
    owner_id       = case when p_clear_owner then null else coalesce(p_owner, owner_id) end,
    priority       = coalesce(p_priority, priority),
    status         = coalesce(p_status, status),
    next_review_at = case when p_clear_review then null else coalesce(p_next_review, next_review_at) end
  where id = p_id
  returning updated_at into v_new;

  -- One event per thing that actually changed, each naming who did it.
  if p_clear_owner or (p_owner is not null and p_owner is distinct from v_d.owner_id) then
    insert into dispute_events (dispute_id, kind, body, actor_id, payload)
    values (p_id, 'assigned',
            case when p_clear_owner then 'Unassigned'
                 else coalesce((select full_name from profiles where id = p_owner), 'a reviewer') end,
            auth.uid(), jsonb_build_object('owner', p_owner));
  end if;

  if p_priority is not null and p_priority is distinct from v_d.priority then
    insert into dispute_events (dispute_id, kind, body, actor_id, payload)
    values (p_id, 'priority_changed', v_d.priority || ' → ' || p_priority, auth.uid(),
            jsonb_build_object('from', v_d.priority, 'to', p_priority));
  end if;

  if p_status is not null and p_status is distinct from v_d.status then
    insert into dispute_events (dispute_id, kind, body, actor_id, payload)
    values (p_id, 'status_changed', v_d.status || ' → ' || p_status, auth.uid(),
            jsonb_build_object('from', v_d.status, 'to', p_status));
  end if;

  if p_clear_review or p_next_review is not null then
    insert into dispute_events (dispute_id, kind, body, actor_id, payload)
    values (p_id, 'review_scheduled',
            case when p_clear_review then 'Review time cleared'
                 else 'Next review ' || to_char(p_next_review, 'DD Mon HH24:MI') end,
            auth.uid(), jsonb_build_object('next_review_at', p_next_review));
  end if;

  return v_new;
end $$;

-- -------------------------------------------------------------------------
-- 2. Notes and tasks.
--
-- Append-only, so no token: a note cannot overwrite anything. And
-- NOTHING HERE MESSAGES ANYBODY — the brief is explicit that ticking a
-- task must not send a message, and the only function that contacts a
-- party is the one named for it.
-- -------------------------------------------------------------------------
create or replace function public.admin_dispute_note(p_id uuid, p_body text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_body, ''))) = 0 then
    raise exception 'A note needs some words in it.' using errcode = 'HW083';
  end if;
  perform dispute_guard(p_id, null);

  insert into dispute_events (dispute_id, kind, body, actor_id)
  values (p_id, 'note', btrim(p_body), auth.uid());
end $$;

create or replace function public.admin_dispute_task_add(
  p_id uuid, p_label text, p_owner uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_task uuid;
begin
  if not is_admin() then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_label, ''))) = 0 then
    raise exception 'Say what the step is.' using errcode = 'HW084';
  end if;
  perform dispute_guard(p_id, null);

  insert into dispute_tasks (dispute_id, label, owner_id, created_by)
  values (p_id, btrim(p_label), p_owner, auth.uid())
  returning id into v_task;

  insert into dispute_events (dispute_id, kind, body, actor_id)
  values (p_id, 'task_added', btrim(p_label), auth.uid());

  return v_task;
end $$;

create or replace function public.admin_dispute_task_set(p_task_id uuid, p_done boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare v_t dispute_tasks;
begin
  if not is_admin() then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;

  update dispute_tasks set
    done_at = case when p_done then now() else null end,
    done_by = case when p_done then auth.uid() else null end
  where id = p_task_id
  returning * into v_t;

  if not found then raise exception 'No such step.' using errcode = 'HW085'; end if;

  insert into dispute_events (dispute_id, kind, body, actor_id)
  values (v_t.dispute_id, case when p_done then 'task_completed' else 'task_reopened' end,
          v_t.label, auth.uid());
end $$;

-- -------------------------------------------------------------------------
-- 3. Evidence: adding it, and the fact of looking at it.
-- -------------------------------------------------------------------------
create or replace function public.admin_dispute_evidence_add(
  p_id uuid,
  p_kind text,
  p_filename text default null,
  p_mime text default null,
  p_size bigint default null,
  p_path text default null,
  p_reference uuid default null,
  p_description text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_ev uuid;
begin
  if not is_admin() then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;
  perform dispute_guard(p_id, null);

  insert into dispute_evidence (dispute_id, kind, filename, mime_type, size_bytes,
                                storage_path, reference_id, description, added_by)
  values (p_id, p_kind, p_filename, p_mime, p_size, p_path, p_reference,
          nullif(btrim(coalesce(p_description, '')), ''), auth.uid())
  returning id into v_ev;

  insert into dispute_events (dispute_id, kind, body, actor_id, payload)
  values (p_id, 'evidence_added',
          coalesce(p_filename, p_description, p_kind), auth.uid(),
          jsonb_build_object('evidence_id', v_ev, 'kind', p_kind));

  return v_ev;
end $$;

/*
  THE CONSOLE PROMISES "ACCESS IS LOGGED", so this writes the log
  BEFORE it returns the path the caller needs in order to sign a URL.
  If the insert fails, nobody gets the file.
*/
create or replace function public.admin_dispute_evidence_open(
  p_evidence_id uuid,
  p_reason text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_ev dispute_evidence;
begin
  if not is_admin() then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;

  select * into v_ev from dispute_evidence where id = p_evidence_id;
  if not found then raise exception 'No such evidence.' using errcode = 'HW086'; end if;

  insert into dispute_evidence_access (evidence_id, actor_id, reason)
  values (p_evidence_id, auth.uid(), nullif(btrim(coalesce(p_reason, '')), ''));

  insert into dispute_events (dispute_id, kind, body, actor_id, payload)
  values (v_ev.dispute_id, 'evidence_viewed', coalesce(v_ev.filename, v_ev.kind), auth.uid(),
          jsonb_build_object('evidence_id', p_evidence_id));

  insert into audit_log (actor_id, action, target_table, target_id, payload)
  values (auth.uid(), 'dispute.evidence_viewed', 'dispute_evidence', p_evidence_id::text,
          jsonb_build_object('dispute_id', v_ev.dispute_id, 'reason', p_reason));

  return jsonb_build_object(
    'storage_path', v_ev.storage_path,
    'filename', v_ev.filename,
    'kind', v_ev.kind,
    'reference_id', v_ev.reference_id);
end $$;

-- -------------------------------------------------------------------------
-- 4. The finding.
--
-- THIS FUNCTION MOVES NO MONEY AND TOUCHES NO ACCOUNT. It writes an
-- outcome, a reason, a resolution row and a timeline entry. A refund
-- is a payment action and a restriction is an account action; both
-- have their own screens, their own confirmations and their own audit
-- entries, and a case being closed is not consent to either.
-- -------------------------------------------------------------------------
create or replace function public.admin_dispute_resolve(
  p_id uuid,
  p_expected timestamptz,
  p_outcome text,
  p_reason text,
  p_notify jsonb default '{}'::jsonb,
  p_accept_open_tasks boolean default false
) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare
  v_d disputes;
  v_open int;
  v_new timestamptz;
begin
  if not is_admin() then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;
  v_d := dispute_guard(p_id, p_expected);

  if v_d.status = 'resolved' then
    raise exception 'This case is already resolved.' using errcode = 'HW087';
  end if;
  if p_outcome not in ('upheld', 'partly_upheld', 'not_upheld', 'no_action', 'duplicate', 'withdrawn') then
    raise exception 'Choose an outcome.' using errcode = 'HW088';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 20 then
    raise exception 'Write the reasoning out — this is what somebody reads when the case is questioned.'
      using errcode = 'HW089';
  end if;

  select count(*) into v_open from dispute_tasks where dispute_id = p_id and done_at is null;
  if v_open > 0 and not p_accept_open_tasks then
    raise exception '% step(s) on this case are still open. Finish them, or close with that on the record.', v_open
      using errcode = 'HW090';
  end if;

  insert into dispute_resolutions (dispute_id, outcome, reason, resolved_by, notified, open_tasks)
  values (p_id, p_outcome, btrim(p_reason), auth.uid(), coalesce(p_notify, '{}'::jsonb), v_open);

  update disputes set
    status = 'resolved',
    outcome = p_outcome,
    resolution = btrim(p_reason),
    resolved_by = auth.uid(),
    resolved_at = now()
  where id = p_id
  returning updated_at into v_new;

  insert into dispute_events (dispute_id, kind, body, actor_id, payload)
  values (p_id, 'resolved', p_outcome || ': ' || btrim(p_reason), auth.uid(),
          jsonb_build_object('outcome', p_outcome, 'open_tasks', v_open, 'notify', p_notify));

  insert into audit_log (actor_id, action, target_table, target_id, payload)
  values (auth.uid(), 'dispute.resolved', 'disputes', p_id::text,
          jsonb_build_object('outcome', p_outcome, 'open_tasks', v_open));

  return v_new;
end $$;

create or replace function public.admin_dispute_reopen(
  p_id uuid,
  p_expected timestamptz,
  p_reason text
) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare
  v_d disputes;
  v_new timestamptz;
begin
  if not is_admin() then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;
  v_d := dispute_guard(p_id, p_expected);

  if v_d.status <> 'resolved' then
    raise exception 'This case is already open.' using errcode = 'HW091';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 10 then
    raise exception 'Say why it is being reopened.' using errcode = 'HW092';
  end if;

  /*
    The previous finding is KEPT — stamped as reopened rather than
    deleted. "We found no fault in March" is exactly what somebody
    needs to read in June, including the fact that it was revisited.
  */
  update dispute_resolutions set
    reopened_at = now(), reopened_by = auth.uid(), reopen_reason = btrim(p_reason)
  where dispute_id = p_id and reopened_at is null;

  update disputes set
    status = 'investigating',
    outcome = null,
    resolved_at = null,
    resolved_by = null,
    reopened_count = reopened_count + 1
  where id = p_id
  returning updated_at into v_new;

  insert into dispute_events (dispute_id, kind, body, actor_id)
  values (p_id, 'reopened', btrim(p_reason), auth.uid());

  insert into audit_log (actor_id, action, target_table, target_id, payload)
  values (auth.uid(), 'dispute.reopened', 'disputes', p_id::text,
          jsonb_build_object('reason', btrim(p_reason)));

  return v_new;
end $$;

-- -------------------------------------------------------------------------
-- 5. Escalation, and being told it landed.
-- -------------------------------------------------------------------------
create or replace function public.admin_dispute_escalate(
  p_id uuid,
  p_expected timestamptz,
  p_to uuid,
  p_reason text
) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare v_new timestamptz;
begin
  if not is_admin() then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;
  perform dispute_guard(p_id, p_expected);

  if p_to is null then
    raise exception 'Escalate to somebody in particular — a queue nobody owns is where cases die.'
      using errcode = 'HW093';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 10 then
    raise exception 'Say what you need from them.' using errcode = 'HW094';
  end if;

  update disputes set
    status = 'escalated',
    priority = case when priority in ('low', 'normal') then 'high' else priority end,
    escalated_to = p_to,
    escalated_at = now(),
    escalation_reason = btrim(p_reason),
    escalation_ack_at = null,
    escalation_ack_by = null,
    owner_id = p_to
  where id = p_id
  returning updated_at into v_new;

  -- They are told, and the case records that they were.
  insert into notifications (user_id, type, payload)
  values (p_to, 'dispute_escalated',
          jsonb_build_object('dispute_id', p_id, 'reason', btrim(p_reason)));

  insert into dispute_events (dispute_id, kind, body, actor_id, payload)
  values (p_id, 'escalated', btrim(p_reason), auth.uid(),
          jsonb_build_object('to', p_to));

  insert into audit_log (actor_id, action, target_table, target_id, payload)
  values (auth.uid(), 'dispute.escalated', 'disputes', p_id::text,
          jsonb_build_object('to', p_to, 'reason', btrim(p_reason)));

  return v_new;
end $$;

create or replace function public.admin_dispute_ack_escalation(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;

  update disputes set escalation_ack_at = now(), escalation_ack_by = auth.uid()
  where id = p_id and escalated_at is not null and escalation_ack_at is null;

  if not found then
    raise exception 'There is no unacknowledged escalation on this case.' using errcode = 'HW095';
  end if;

  insert into dispute_events (dispute_id, kind, body, actor_id)
  values (p_id, 'escalation_acknowledged', 'Picked up', auth.uid());
end $$;

-- -------------------------------------------------------------------------
-- 6. Recording a report that arrived outside the app.
-- -------------------------------------------------------------------------
create or replace function public.admin_dispute_duplicates(
  p_booking uuid default null,
  p_customer uuid default null,
  p_helper uuid default null
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', d.id,
             'ref', case when d.kind = 'safety' then 'SF-' else 'DS-' end || upper(substr(d.id::text, 1, 4)),
             'title', initcap(replace(d.category, '_', ' ')),
             'status', d.status, 'created_at', d.created_at)
           order by d.created_at desc)
    from disputes d
    where d.status <> 'resolved'
      and ((p_booking is not null and d.booking_id = p_booking)
           or (p_customer is not null and d.customer_id = p_customer)
           or (p_helper is not null and d.helper_id = p_helper))
  ), '[]'::jsonb);
end $$;

create or replace function public.admin_dispute_create(
  p_kind text,
  p_category text,
  p_description text,
  p_source text default 'staff',
  p_priority text default 'normal',
  p_booking uuid default null,
  p_customer uuid default null,
  p_helper uuid default null,
  p_reported_by_name text default null,
  p_next_review timestamptz default null,
  p_stripe_dispute_id text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_customer uuid := p_customer;
  v_helper uuid := p_helper;
begin
  if not is_admin() then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;
  if p_kind not in ('safety', 'service') then
    raise exception 'A case is either a safety report or a service dispute.' using errcode = 'HW096';
  end if;
  if length(btrim(coalesce(p_description, ''))) < 20 then
    raise exception 'Write down what was reported, in their words where you can.' using errcode = 'HW097';
  end if;
  if p_booking is null and p_customer is null and p_helper is null then
    raise exception 'A case has to be about somebody or some job.' using errcode = 'HW098';
  end if;

  if p_booking is not null then
    select coalesce(v_customer, b.customer_id), coalesce(v_helper, b.provider_id)
      into v_customer, v_helper
      from bookings b where b.id = p_booking;
  end if;

  insert into disputes (booking_id, opened_by, category, description, status, kind, priority,
                        source, reported_by_name, customer_id, helper_id, next_review_at,
                        owner_id, stripe_dispute_id)
  values (p_booking, auth.uid(), p_category, btrim(p_description), 'open', p_kind, p_priority,
          p_source, nullif(btrim(coalesce(p_reported_by_name, '')), ''), v_customer, v_helper,
          p_next_review, auth.uid(), nullif(btrim(coalesce(p_stripe_dispute_id, '')), ''))
  returning id into v_id;

  insert into dispute_events (dispute_id, kind, body, actor_id, payload)
  values (v_id, 'reported', btrim(p_description), auth.uid(),
          jsonb_build_object('source', p_source, 'recorded_by_staff', true));

  insert into audit_log (actor_id, action, target_table, target_id, payload)
  values (auth.uid(), 'dispute.created', 'disputes', v_id::text,
          jsonb_build_object('kind', p_kind, 'source', p_source));

  return v_id;
end $$;

-- -------------------------------------------------------------------------
-- 7. Contacting a party — through the support inbox, not a second
--    messaging system nobody can audit.
-- -------------------------------------------------------------------------
create or replace function public.admin_dispute_contact(
  p_id uuid,
  p_party text,                      -- customer | helper
  p_subject text,
  p_body text,
  p_channel text default 'in_app'
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_d disputes;
  v_b bookings;
  v_person uuid;
  v_case uuid;
  v_msg jsonb;
begin
  if not is_admin() then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;
  if p_party not in ('customer', 'helper') then
    raise exception 'Say which party.' using errcode = 'HW099';
  end if;

  select * into v_d from disputes where id = p_id;
  if not found then raise exception 'No such case.' using errcode = 'HW081'; end if;
  select * into v_b from bookings where id = v_d.booking_id;

  v_person := case p_party
                when 'customer' then coalesce(v_d.customer_id, v_b.customer_id)
                else coalesce(v_d.helper_id, v_b.provider_id) end;
  if v_person is null then
    raise exception 'This case does not name a % with an account.', p_party using errcode = 'HW100';
  end if;

  /*
    A REAL CONVERSATION, in the inbox, labelled with which party it is
    and linked back to this case. Delivery state comes from the same
    machinery as every other support message, so "we contacted them"
    can be checked rather than believed.
  */
  insert into support_cases (subject, channel, customer_id, party_role, booking_id,
                             dispute_id_link, created_by, assignee_id, status,
                             contact_email, priority)
  values (btrim(p_subject), p_channel, v_person, p_party, v_d.booking_id,
          p_id, auth.uid(), coalesce(v_d.owner_id, auth.uid()), 'open',
          case when p_channel = 'email' then (select email from auth.users where id = v_person) end,
          case when v_d.kind = 'safety' then 'high' else 'normal' end)
  returning id into v_case;

  v_msg := admin_support_reply(v_case, p_body, false);

  insert into dispute_events (dispute_id, kind, body, actor_id, payload)
  values (p_id, 'party_contacted', p_party || ': ' || btrim(p_subject), auth.uid(),
          jsonb_build_object('case_id', v_case, 'party', p_party, 'channel', p_channel));

  return jsonb_build_object('case_id', v_case, 'message', v_msg);
end $$;

revoke execute on function public.admin_dispute_update(uuid, timestamptz, uuid, boolean, text, text, timestamptz, boolean) from public;
revoke execute on function public.admin_dispute_note(uuid, text) from public;
revoke execute on function public.admin_dispute_task_add(uuid, text, uuid) from public;
revoke execute on function public.admin_dispute_task_set(uuid, boolean) from public;
revoke execute on function public.admin_dispute_evidence_add(uuid, text, text, text, bigint, text, uuid, text) from public;
revoke execute on function public.admin_dispute_evidence_open(uuid, text) from public;
revoke execute on function public.admin_dispute_resolve(uuid, timestamptz, text, text, jsonb, boolean) from public;
revoke execute on function public.admin_dispute_reopen(uuid, timestamptz, text) from public;
revoke execute on function public.admin_dispute_escalate(uuid, timestamptz, uuid, text) from public;
revoke execute on function public.admin_dispute_ack_escalation(uuid) from public;
revoke execute on function public.admin_dispute_duplicates(uuid, uuid, uuid) from public;
revoke execute on function public.admin_dispute_create(text, text, text, text, text, uuid, uuid, uuid, text, timestamptz, text) from public;
revoke execute on function public.admin_dispute_contact(uuid, text, text, text, text) from public;

grant execute on function public.admin_dispute_update(uuid, timestamptz, uuid, boolean, text, text, timestamptz, boolean) to authenticated;
grant execute on function public.admin_dispute_note(uuid, text) to authenticated;
grant execute on function public.admin_dispute_task_add(uuid, text, uuid) to authenticated;
grant execute on function public.admin_dispute_task_set(uuid, boolean) to authenticated;
grant execute on function public.admin_dispute_evidence_add(uuid, text, text, text, bigint, text, uuid, text) to authenticated;
grant execute on function public.admin_dispute_evidence_open(uuid, text) to authenticated;
grant execute on function public.admin_dispute_resolve(uuid, timestamptz, text, text, jsonb, boolean) to authenticated;
grant execute on function public.admin_dispute_reopen(uuid, timestamptz, text) to authenticated;
grant execute on function public.admin_dispute_escalate(uuid, timestamptz, uuid, text) to authenticated;
grant execute on function public.admin_dispute_ack_escalation(uuid) to authenticated;
grant execute on function public.admin_dispute_duplicates(uuid, uuid, uuid) to authenticated;
grant execute on function public.admin_dispute_create(text, text, text, text, text, uuid, uuid, uuid, text, timestamptz, text) to authenticated;
grant execute on function public.admin_dispute_contact(uuid, text, text, text, text) to authenticated;

-- -------------------------------------------------------------------------
-- 8. The rules, proven.
-- -------------------------------------------------------------------------
do $$
declare
  v_staff uuid;
  v_case uuid;
  v_stamp timestamptz;
  v_task uuid;
  v_money_before jsonb;
  v_refused int := 0;
begin
  select id into v_staff from profiles limit 1;
  if v_staff is null then
    raise notice '0106: no profile fixture; the case rules were not exercised.';
    return;
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_staff::text, 'role', 'authenticated',
                      'app_metadata', json_build_object('role', 'admin'))::text, true);

  v_case := admin_dispute_create('safety', 'safety',
    'Self-test: a report taken over the telephone about conduct on a job.',
    'phone', 'high', null, v_staff, null, 'A caller', null, null);

  select updated_at into v_stamp from disputes where id = v_case;

  -- A STALE TOKEN IS REFUSED rather than allowed to overwrite.
  begin
    perform admin_dispute_update(v_case, v_stamp - interval '1 second', null, false, 'urgent');
    raise exception '0106: a stale copy of the case was allowed to write over it.';
  exception when sqlstate 'HW080' then null;
  end;

  -- The right token works, and returns the new one.
  v_stamp := admin_dispute_update(v_case, v_stamp, null, false, 'urgent');

  -- RESOLVING WITH OPEN STEPS IS REFUSED until it is acknowledged.
  v_task := admin_dispute_task_add(v_case, 'Request the helper''s account of the job');
  begin
    perform admin_dispute_resolve(v_case, v_stamp, 'no_action',
      'Self-test reasoning, long enough to be a real sentence about the finding.');
    raise exception '0106: a case was closed with an open step and no acknowledgement.';
  exception when sqlstate 'HW090' then null;
  end;

  perform admin_dispute_task_set(v_task, true);

  -- A FINDING NEEDS REASONING.
  begin
    perform admin_dispute_resolve(v_case, v_stamp, 'no_action', 'fine');
    raise exception '0106: a finding was accepted with no reasoning.';
  exception when sqlstate 'HW089' then null;
  end;

  v_stamp := admin_dispute_resolve(v_case, v_stamp, 'not_upheld',
    'Self-test: spoke to both parties, no evidence of the conduct described, no action taken.');

  -- CLOSING MOVED NO MONEY AND TOUCHED NO ACCOUNT.
  if exists (select 1 from refunds where created_at > now() - interval '1 minute') then
    raise exception '0106: resolving a case created a refund.';
  end if;
  if exists (select 1 from profiles where restricted_at > now() - interval '1 minute') then
    raise exception '0106: resolving a case restricted somebody.';
  end if;

  -- REOPENING KEEPS THE PREVIOUS FINDING.
  v_stamp := admin_dispute_reopen(v_case, v_stamp, 'New information from the customer.');
  if (select count(*) from dispute_resolutions where dispute_id = v_case and reopened_at is not null) <> 1 then
    raise exception '0106: the previous finding was not kept when the case was reopened.';
  end if;
  if (select outcome from disputes where id = v_case) is not null then
    raise exception '0106: a reopened case still carries its old outcome.';
  end if;

  -- The whole set refuses a customer.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_staff::text, 'role', 'authenticated',
                      'app_metadata', json_build_object('role', 'customer'))::text, true);

  begin perform admin_dispute_queue(); exception when insufficient_privilege then v_refused := v_refused + 1; end;
  begin perform admin_dispute_detail(v_case); exception when insufficient_privilege then v_refused := v_refused + 1; end;
  begin perform admin_dispute_note(v_case, 'x'); exception when insufficient_privilege then v_refused := v_refused + 1; end;
  begin perform admin_dispute_resolve(v_case, null, 'upheld', 'trying it on from a customer account'); exception when insufficient_privilege then v_refused := v_refused + 1; end;
  begin perform admin_dispute_evidence_open(gen_random_uuid()); exception when insufficient_privilege then v_refused := v_refused + 1; end;

  perform set_config('request.jwt.claims', '', true);

  if v_refused <> 5 then
    raise exception '0106: a customer reached % of the five case functions.', 5 - v_refused;
  end if;

  delete from disputes where id = v_case;
end $$;
