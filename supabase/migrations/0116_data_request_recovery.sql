-- CLASS: pre-deploy
-- =========================================================================
-- 0116 — getting a stuck data request moving again
-- =========================================================================
/*
  THE THREE THINGS AN OPERATOR ACTUALLY NEEDS HERE, and the reasons
  each one is narrower than it looks.

  1. REBUILD AN EXPORT. A failed build, or a link that expired before
     the person downloaded it, leaves somebody who asked for their own
     data without it. Queueing a fresh build is the fix.

     It is NOT a reissue. The expired archive is gone; what this does
     is put the request back in front of the worker, which builds a NEW
     file with a NEW link. The old link stays dead, and the caller is
     told that in those words — because "reissue" invites somebody to
     promise a customer their original link will start working again.

     A request already pending or processing is REFUSED rather than
     re-queued. Two builds of the same export race each other to write
     the same row, and the loser's file is orphaned in storage.

  2. CANCEL A SCHEDULED DELETION. Only while it is still scheduled.
     Once the worker has run, the account is gone from auth and the
     cascade has taken the rest; there is nothing to cancel and saying
     otherwise would be a lie told to somebody in a hurry. The refusal
     says what actually happened instead.

     Cancelling someone's deletion is done TO them, so they are told.
     The notification is part of the act, not a follow-up somebody has
     to remember.

  3. MARK A STUCK BUILD AS FAILED. A row sitting in 'processing'
     because a worker died is not progress, and a queue that cannot be
     told the truth about it will keep showing it as in-flight for
     ever. This records it as failed WITH the reason, which is what
     puts it back in reach of rule 1.

  EVERY ONE OF THESE NEEDS A REASON. These are acts performed on a
  person's own data at their request; "who did this and why" is the
  minimum the record has to carry.
*/

/* ------------------------------------------------------------------ *
 * 1. REBUILD                                                          *
 * ------------------------------------------------------------------ */
create or replace function public.admin_data_export_retry(p_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  v_row public.data_export_requests;
  v_was text;
  v_had_link boolean;
begin
  if not public.is_admin() then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Say why this is being rebuilt. It is recorded with the request.'
      using errcode = 'HW110';
  end if;

  select * into v_row from public.data_export_requests where id = p_id for update;
  if not found then
    raise exception 'No such export request.' using errcode = 'HW111';
  end if;

  if v_row.status in ('pending', 'processing') then
    raise exception 'This export is already queued (%). The worker runs every 30 minutes; a second build would race the first.',
      v_row.status using errcode = 'HW112';
  end if;

  v_was := v_row.status;
  v_had_link := v_row.archive_url is not null;

  update public.data_export_requests set
    status = 'pending',
    archive_url = null,
    archive_size_bytes = null,
    expires_at = null,
    completed_at = null,
    failure_reason = null
  where id = p_id;

  insert into public.audit_log
    (actor_id, action, target_table, target_id, payload, outcome, changes)
  values (
    v_actor, 'data_export.rebuild_queued', 'data_export_requests', p_id::text,
    jsonb_build_object('reason', p_reason, 'previous_status', v_was,
                       'previous_link_invalidated', v_had_link),
    'submitted',
    jsonb_build_array(jsonb_build_object('field', 'Status', 'before', v_was, 'after', 'pending'))
  );

  return jsonb_build_object(
    'queued', true,
    'previous_status', v_was,
    'note', case
      when v_had_link then 'Queued for a fresh build. The previous download link is now dead and will not come back — the new build produces a new one.'
      else 'Queued for a fresh build. The worker runs every 30 minutes.'
    end
  );
end $$;

/* ------------------------------------------------------------------ *
 * 2. CANCEL A SCHEDULED DELETION                                      *
 * ------------------------------------------------------------------ */
create or replace function public.admin_deletion_cancel(p_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  v_row public.account_deletion_requests;
  v_notified boolean := false;
begin
  if not public.is_admin() then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Say why the deletion is being cancelled. The person asked for it, so the record has to say who stopped it and why.'
      using errcode = 'HW110';
  end if;

  select * into v_row from public.account_deletion_requests where id = p_id for update;
  if not found then
    raise exception 'No such deletion request.' using errcode = 'HW111';
  end if;

  if v_row.status = 'executed' then
    raise exception 'This account has already been deleted. There is nothing to cancel — the login is gone from auth and the cascade has taken the rest.'
      using errcode = 'HW113';
  end if;
  if v_row.status = 'executing' then
    raise exception 'The worker is carrying this deletion out right now. Wait for it to finish, then look at what it did.'
      using errcode = 'HW113';
  end if;
  if v_row.status = 'cancelled' then
    raise exception 'This deletion was already cancelled.' using errcode = 'HW113';
  end if;

  update public.account_deletion_requests set
    status = 'cancelled',
    cancelled_at = clock_timestamp(),
    failure_reason = null
  where id = p_id;

  /*
    THE PERSON IS TOLD. They asked for their account to be deleted and
    somebody else has stopped it; finding that out by noticing they can
    still log in is not acceptable.
  */
  if v_row.user_id is not null then
    insert into public.notifications (user_id, type, payload)
    values (v_row.user_id, 'account_deletion_cancelled',
            jsonb_build_object('request_id', p_id, 'reason', p_reason));
    v_notified := true;
  end if;

  insert into public.audit_log
    (actor_id, action, target_table, target_id, payload, outcome, changes)
  values (
    v_actor, 'account_deletion.cancelled', 'account_deletion_requests', p_id::text,
    jsonb_build_object('reason', p_reason, 'requester_notified', v_notified),
    'succeeded',
    jsonb_build_array(jsonb_build_object('field', 'Status', 'before', v_row.status, 'after', 'cancelled'))
  );

  return jsonb_build_object(
    'cancelled', true,
    'requester_notified', v_notified,
    'note', case
      when v_notified then 'Cancelled, and the account holder has been told in the app.'
      else 'Cancelled. The account holder could NOT be notified — this request has no account attached to it.'
    end
  );
end $$;

/* ------------------------------------------------------------------ *
 * 3. RECORD A STUCK BUILD AS FAILED                                   *
 * ------------------------------------------------------------------ */
create or replace function public.admin_data_export_mark_failed(p_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  v_row public.data_export_requests;
begin
  if not public.is_admin() then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Say what went wrong. A failure with no reason is the thing somebody has to debug later.'
      using errcode = 'HW110';
  end if;

  select * into v_row from public.data_export_requests where id = p_id for update;
  if not found then
    raise exception 'No such export request.' using errcode = 'HW111';
  end if;
  if v_row.status not in ('pending', 'processing') then
    raise exception 'Only a build that is waiting or in progress can be recorded as failed. This one is %.',
      v_row.status using errcode = 'HW114';
  end if;

  update public.data_export_requests
  set status = 'failed', failure_reason = left(trim(p_reason), 500)
  where id = p_id;

  insert into public.audit_log
    (actor_id, action, target_table, target_id, payload, outcome, changes)
  values (
    v_actor, 'data_export.marked_failed', 'data_export_requests', p_id::text,
    jsonb_build_object('reason', p_reason),
    'succeeded',
    jsonb_build_array(jsonb_build_object('field', 'Status', 'before', v_row.status, 'after', 'failed'))
  );

  return jsonb_build_object('marked', true,
    'note', 'Recorded as failed. It can now be queued for a fresh build.');
end $$;

revoke all on function public.admin_data_export_retry(uuid, text) from public;
revoke all on function public.admin_deletion_cancel(uuid, text) from public;
revoke all on function public.admin_data_export_mark_failed(uuid, text) from public;
grant execute on function public.admin_data_export_retry(uuid, text) to authenticated;
grant execute on function public.admin_deletion_cancel(uuid, text) to authenticated;
grant execute on function public.admin_data_export_mark_failed(uuid, text) to authenticated;

/* ------------------------------------------------------------------ *
 * SELF-TEST                                                           *
 * ------------------------------------------------------------------ */
/*
  Rolled back in full. These functions touch a real person's data
  request, so the test needs a row to act on — and the one thing it
  must not do is leave that row, or its events, behind. Nothing is
  deleted; the subtransaction simply never commits.
*/
do $$
declare
  v_user uuid;
  v_export uuid;
  v_del uuid;
  v_r jsonb;
begin
  begin
    perform set_config('request.jwt.claims', '{"app_metadata":{"role":"admin"}}', true);

    /* A request needs an owner, and the only ids here belong to real
       people. Borrowed for the length of a transaction that is thrown
       away, and never written into an attribution: auth.uid() stays
       null, so the events below are the system's. */
    select id into v_user from public.profiles order by created_at limit 1;
    if v_user is null then
      raise notice 'data request recovery: no profile to attach a test request to; skipped';
      raise exception using errcode = 'HW999', message = 'nothing to test';
    end if;

    insert into public.data_export_requests (user_id, status, requested_at, archive_url, expires_at)
    values (v_user, 'ready', now() - interval '40 days', 'exports/old.zip', now() - interval '10 days')
    returning id into v_export;

    /* A reason is required. */
    begin
      perform public.admin_data_export_retry(v_export, '   ');
      raise exception 'a rebuild was queued with no reason';
    exception when sqlstate 'HW110' then null;
    end;

    /* The rebuild clears the dead link and says so. */
    v_r := public.admin_data_export_retry(v_export, 'Link expired before they downloaded it.');
    if (select status from public.data_export_requests where id = v_export) <> 'pending' then
      raise exception 'the rebuild did not queue the request';
    end if;
    if (select archive_url from public.data_export_requests where id = v_export) is not null then
      raise exception 'the dead link survived the rebuild';
    end if;
    if position('will not come back' in (v_r ->> 'note')) = 0 then
      raise exception 'the rebuild did not say the old link is gone: %', v_r ->> 'note';
    end if;

    /* A second rebuild races the first, so it is refused. */
    begin
      perform public.admin_data_export_retry(v_export, 'again');
      raise exception 'a queued export was queued a second time';
    exception when sqlstate 'HW112' then null;
    end;

    /* A stuck build can be recorded as failed, and then rebuilt. */
    v_r := public.admin_data_export_mark_failed(v_export, 'Worker died mid-build.');
    if (select status from public.data_export_requests where id = v_export) <> 'failed' then
      raise exception 'marking failed did not take';
    end if;
    perform public.admin_data_export_retry(v_export, 'Trying again after the worker was fixed.');

    /* ...but a finished one cannot be called failed. */
    update public.data_export_requests set status = 'delivered' where id = v_export;
    begin
      perform public.admin_data_export_mark_failed(v_export, 'nope');
      raise exception 'a delivered export was recorded as failed';
    exception when sqlstate 'HW114' then null;
    end;

    /* Cancelling a deletion: only while it is still scheduled. */
    insert into public.account_deletion_requests (user_id, status, requested_at, grace_until)
    values (v_user, 'pending', now(), now() + interval '7 days')
    returning id into v_del;

    begin
      perform public.admin_deletion_cancel(v_del, '');
      raise exception 'a deletion was cancelled with no reason';
    exception when sqlstate 'HW110' then null;
    end;

    v_r := public.admin_deletion_cancel(v_del, 'They rang and asked us to stop it.');
    if (select status from public.account_deletion_requests where id = v_del) <> 'cancelled' then
      raise exception 'the deletion was not cancelled';
    end if;
    if not (v_r ->> 'requester_notified')::boolean then
      raise exception 'the account holder was not told their deletion was stopped';
    end if;
    if not exists (select 1 from public.notifications
                   where user_id = v_user and type = 'account_deletion_cancelled') then
      raise exception 'no notification row was written';
    end if;

    /* And an executed one cannot be un-executed. */
    update public.account_deletion_requests set status = 'executed', executed_at = now() where id = v_del;
    begin
      perform public.admin_deletion_cancel(v_del, 'changed our minds');
      raise exception 'a completed deletion was cancelled';
    exception when sqlstate 'HW113' then
      if position('already been deleted' in sqlerrm) = 0 then
        raise exception 'the refusal did not say what actually happened: %', sqlerrm;
      end if;
    end;

    raise exception using errcode = 'HW999', message = 'self-test complete';
  exception
    when sqlstate 'HW999' then
      raise notice 'data request recovery: reasons required, dead links cleared, double-queue refused, stuck builds recoverable, cancellation notifies and stops at executed — and nothing left behind';
    when others then
      raise;
  end;
end $$;
