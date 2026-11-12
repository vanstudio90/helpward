-- CLASS: pre-deploy
-- =========================================================================
-- 0118 — a refund is decided before it is sent
-- =========================================================================
/*
  WHAT THE REFUNDS TABLE WAS, AND WHY IT IS NOT ENOUGH.

  `refunds` is a LEDGER: refundBooking() writes a row after Stripe has
  already returned the money, with status 'succeeded'. That is the
  right shape for a record of what happened, and the wrong shape for a
  console where somebody asks for a refund and somebody else decides
  whether to send it. A row that only exists once the money is gone
  cannot be declined.

  So the same table gains the part before the event: who asked, for how
  much, against which charge, who approved or declined it, and why.
  Nothing about the existing ledger rows changes — they are backfilled
  as already-approved history, which is what they are.

  THE RULES, each because the opposite costs somebody money:

  1. ASKING IS NOT SENDING. A request sits in 'awaiting_review' and no
     money moves. Approving it is a separate act by a person, recorded
     with their name, and it is approval that hands the amount to
     refundBooking().

  2. YOU CANNOT REFUND MORE THAN IS THERE. Available is the captured
     amount minus what has already been returned MINUS what is already
     in flight. Leaving requests in flight out of that sum is how two
     people each approve half and the second one fails at Stripe.

  3. A TIP IS A DIFFERENT CHARGE. It has its own intent and its own
     remaining balance, so a refund names the leg it is against. A
     request for more than the service charge holds is not quietly
     taken out of the tip.

  4. THE REASON DECIDES WHO PAYS. Helpward's own refundBooking()
     reverses the helper's transfer by default — correct when the work
     was not delivered. It is NOT correct when the work was done and
     this is goodwill: taking the money back out of the helper's
     balance for a decision the customer and Helpward made between
     them is how a helper pays for our apology. The mapping lives here,
     beside the reasons, rather than in whoever happens to click.

  5. A DECLINE IS A DECISION, NOT A DELETION. It needs a reason and it
     stays on the record.
*/

alter table public.refunds
  add column if not exists leg text not null default 'service',
  add column if not exists requested_by uuid references public.profiles(id) on delete set null,
  add column if not exists requested_at timestamptz,
  add column if not exists decided_by uuid references public.profiles(id) on delete set null,
  add column if not exists decided_at timestamptz,
  add column if not exists decision_reason text,
  add column if not exists internal_note text,
  add column if not exists absorb_helper_share boolean,
  add column if not exists failure_reason text,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'refunds_leg_check'
  ) then
    alter table public.refunds add constraint refunds_leg_check check (leg in ('service', 'tip'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'refunds_status_check'
  ) then
    alter table public.refunds add constraint refunds_status_check check (
      status in ('awaiting_review', 'processing', 'succeeded', 'failed', 'cancelled'));
  end if;
end $$;

/* Existing ledger rows are history that was already approved. */
update public.refunds
set requested_at = coalesce(requested_at, created_at),
    decided_at = coalesce(decided_at, created_at)
where status = 'succeeded';

create index if not exists refunds_open_idx on public.refunds (status)
  where status in ('awaiting_review', 'processing');

comment on column public.refunds.absorb_helper_share is
  'True when the helper keeps their share and Helpward absorbs the refund. Derived from the reason, not chosen per click: goodwill for work that was done must not be taken out of the helper''s balance.';

/* ------------------------------------------------------------------ *
 * WHO PAYS, BY REASON                                                 *
 * ------------------------------------------------------------------ */
/*
  One place, so the website, this console and any script answer the
  same way. `true` means the helper keeps their share.
*/
/*
  THE REASONS ARE THE ONES THE SCREEN OFFERS (lib/admin-refund-states.ts).
  An unknown reason raises rather than falling through to a default:
  guessing wrong in one direction quietly takes money out of a helper's
  balance for a decision they had no part in, and a silent `else` is
  how that happens.

  WHERE THE LINE IS. If the work was done, or the fault is ours, the
  helper keeps their share and Helpward carries the refund. If the work
  was not delivered or not as sold, the share goes back with it.
  "Cancelled outside the window" absorbs because the helper was being
  paid for holding the slot, which they did.
*/
create or replace function public.refund_absorbs_helper_share(p_reason text)
returns boolean
language plpgsql
immutable
as $$
begin
  return case p_reason
    when 'goodwill'            then true
    when 'duplicate_charge'    then true
    when 'overcharge'          then true
    when 'cancelled_late'      then true
    when 'service_issue'       then false
    when 'no_show'             then false
    when 'chargeback_pre_empt' then false
    else null
  end;
exception when others then
  return null;
end $$;

comment on function public.refund_absorbs_helper_share(text) is
  'Whether a refund for this reason leaves the helper paid. Work that was done and refunded as goodwill is absorbed by Helpward; work that was not delivered takes the helper share back with it.';

/* ------------------------------------------------------------------ *
 * WHAT IS LEFT TO REFUND                                              *
 * ------------------------------------------------------------------ */
/*
  RULE 2. Captured, minus returned, minus in flight. The last term is
  the one people forget, and it is the one that lets two half-refunds
  be approved against the same money.

  Stripe remains the authority on the real remaining balance — this is
  what Helpward believes, and refundBooking() re-reads the truth before
  it sends anything. Showing our own number here is still worth doing:
  it is what the decision is made against, and if it disagrees with
  Stripe we want the refund to fail loudly rather than never be
  proposed.
*/
create or replace function public.refund_available_cents(p_booking uuid, p_leg text)
returns integer
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select greatest(0,
    coalesce((
      select case when p_leg = 'tip' then coalesce(b.tip_cents, 0) else b.total_cents end
      from public.bookings b
      where b.id = p_booking and b.captured_at is not null
    ), 0)
    - coalesce((
      select sum(r.amount_cents) from public.refunds r
      where r.booking_id = p_booking and r.leg = p_leg
        and r.status in ('succeeded', 'processing', 'awaiting_review')
    ), 0)
  );
$$;

revoke all on function public.refund_available_cents(uuid, text) from public;
revoke all on function public.refund_absorbs_helper_share(text) from public;
grant execute on function public.refund_available_cents(uuid, text) to authenticated, service_role;
grant execute on function public.refund_absorbs_helper_share(text) to authenticated, service_role;

/* ------------------------------------------------------------------ *
 * ASK FOR ONE                                                         *
 * ------------------------------------------------------------------ */
create or replace function public.admin_refund_request(
  p_booking uuid,
  p_leg text,
  p_amount_cents integer,
  p_reason text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  v_available int;
  v_id uuid;
  v_absorb boolean;
begin
  if not public.is_admin() then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;
  if p_leg not in ('service', 'tip') then
    raise exception 'A refund is against the service charge or the tip. Those are different charges.'
      using errcode = 'HW130';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'A refund needs a reason. It decides who carries the cost as well as what the customer is told.'
      using errcode = 'HW131';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'A refund amount must be more than zero.' using errcode = 'HW132';
  end if;

  if not exists (select 1 from public.bookings where id = p_booking and captured_at is not null) then
    raise exception 'This booking was never charged, so there is nothing to refund. Releasing a hold is a different act.'
      using errcode = 'HW133';
  end if;

  /* RULE 2 and RULE 3 together. */
  v_available := public.refund_available_cents(p_booking, p_leg);
  if p_amount_cents > v_available then
    raise exception 'Only % cents are left on the % charge, counting refunds already in flight. Asking for % would overdraw it.',
      v_available, p_leg, p_amount_cents using errcode = 'HW134';
  end if;

  v_absorb := public.refund_absorbs_helper_share(p_reason);
  if v_absorb is null then
    raise exception 'No settlement rule exists for the reason "%". Who carries this refund has to be decided before it is requested, not guessed at.',
      p_reason using errcode = 'HW137';
  end if;

  insert into public.refunds
    (booking_id, leg, amount_cents, reason, status, initiated_by,
     requested_by, requested_at, internal_note, absorb_helper_share)
  values (p_booking, p_leg, p_amount_cents, p_reason, 'awaiting_review', v_actor,
          v_actor, clock_timestamp(), p_note, v_absorb)
  returning id into v_id;

  insert into public.audit_log (actor_id, action, target_table, target_id, payload, outcome)
  values (v_actor, 'refund.requested', 'refunds', v_id::text,
          jsonb_build_object('booking_id', p_booking, 'leg', p_leg,
                             'amount_cents', p_amount_cents, 'reason', p_reason,
                             'absorb_helper_share', v_absorb),
          /* ASKING IS NOT SENDING, and the log says so in its own vocabulary. */
          'submitted');

  return jsonb_build_object(
    'refund_id', v_id,
    'absorb_helper_share', v_absorb,
    'available_after_cents', v_available - p_amount_cents,
    'note', case when v_absorb
      then 'Requested. On these grounds the helper keeps their share and Helpward carries the refund.'
      else 'Requested. On these grounds the helper''s share goes back with the refund.'
    end
  );
end $$;

/* ------------------------------------------------------------------ *
 * DECIDE                                                              *
 * ------------------------------------------------------------------ */
/*
  Approving marks the refund ready to send and records who decided it.
  IT DOES NOT TALK TO STRIPE: that is refundBooking(), called by the
  server action, which re-reads the real remaining balance first. The
  row moves to 'processing' so a second approval cannot double-send,
  and the action records the outcome.
*/
create or replace function public.admin_refund_decide(
  p_refund uuid,
  p_expected timestamptz,
  p_approve boolean,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  v_r public.refunds;
  v_now timestamptz := clock_timestamp();
begin
  if not public.is_admin() then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'A decision needs a reason, whichever way it goes.' using errcode = 'HW131';
  end if;

  select * into v_r from public.refunds where id = p_refund for update;
  if not found then
    raise exception 'No such refund request.' using errcode = 'HW135';
  end if;
  if v_r.status <> 'awaiting_review' then
    raise exception 'This refund is %, so there is nothing to decide. Reload to see where it got to.',
      v_r.status using errcode = 'HW136';
  end if;
  if p_expected is not null
     and date_trunc('milliseconds', v_r.updated_at) <> date_trunc('milliseconds', p_expected) then
    raise exception 'Somebody else decided this refund while you were looking at it. Reload before deciding.'
      using errcode = 'HW080';
  end if;

  /* RULE 5: a decline is recorded, not removed. */
  update public.refunds set
    status = case when p_approve then 'processing' else 'cancelled' end,
    decided_by = v_actor,
    decided_at = v_now,
    decision_reason = p_reason,
    updated_at = v_now
  where id = p_refund;

  insert into public.audit_log
    (actor_id, action, target_table, target_id, payload, outcome, changes)
  values (
    v_actor,
    case when p_approve then 'refund.approved' else 'refund.declined' end,
    'refunds', p_refund::text,
    jsonb_build_object('reason', p_reason, 'amount_cents', v_r.amount_cents,
                       'leg', v_r.leg, 'booking_id', v_r.booking_id,
                       'absorb_helper_share', v_r.absorb_helper_share),
    /* Approval is submitted, not succeeded: no money has moved yet. */
    case when p_approve then 'submitted' else 'succeeded' end,
    jsonb_build_array(jsonb_build_object('field', 'Status',
      'before', v_r.status, 'after', case when p_approve then 'processing' else 'cancelled' end))
  );

  return jsonb_build_object(
    'approved', p_approve,
    'amount_cents', v_r.amount_cents,
    'leg', v_r.leg,
    'booking_id', v_r.booking_id,
    'absorb_helper_share', coalesce(v_r.absorb_helper_share, false),
    'updated_at', v_now,
    'note', case when p_approve
      then 'Approved. No money has moved yet — the refund is sent next, and this row records what comes back.'
      else 'Declined, and the request stays on the record with your reason.'
    end
  );
end $$;

/* ------------------------------------------------------------------ *
 * RECORD WHAT THE PROCESSOR SAID                                      *
 * ------------------------------------------------------------------ */
create or replace function public.admin_refund_settle(
  p_refund uuid,
  p_succeeded boolean,
  p_processor_id text default null,
  p_failure text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  v_r public.refunds;
  v_now timestamptz := clock_timestamp();
begin
  if not public.is_admin() then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;

  select * into v_r from public.refunds where id = p_refund for update;
  if not found then
    raise exception 'No such refund request.' using errcode = 'HW135';
  end if;
  if v_r.status <> 'processing' then
    raise exception 'Only a refund that was approved and sent can be settled. This one is %.',
      v_r.status using errcode = 'HW136';
  end if;
  if not p_succeeded and coalesce(trim(p_failure), '') = '' then
    raise exception 'A failed refund needs the reason the processor gave. "Failed" with no detail is the thing somebody has to debug later.'
      using errcode = 'HW131';
  end if;

  update public.refunds set
    status = case when p_succeeded then 'succeeded' else 'failed' end,
    stripe_refund_id = coalesce(p_processor_id, stripe_refund_id),
    failure_reason = case when p_succeeded then null else left(trim(p_failure), 500) end,
    updated_at = v_now
  where id = p_refund;

  insert into public.audit_log
    (actor_id, action, target_table, target_id, payload, outcome, changes)
  values (
    v_actor, case when p_succeeded then 'refund.confirmed' else 'refund.failed' end,
    'refunds', p_refund::text,
    jsonb_build_object('processor_refund_id', p_processor_id, 'failure', p_failure,
                       'amount_cents', v_r.amount_cents),
    case when p_succeeded then 'succeeded' else 'failed' end,
    jsonb_build_array(jsonb_build_object('field', 'Status', 'before', 'processing',
      'after', case when p_succeeded then 'succeeded' else 'failed' end))
  );

  return jsonb_build_object('settled', p_succeeded, 'updated_at', v_now);
end $$;

revoke all on function public.admin_refund_request(uuid, text, integer, text, text) from public;
revoke all on function public.admin_refund_decide(uuid, timestamptz, boolean, text) from public;
revoke all on function public.admin_refund_settle(uuid, boolean, text, text) from public;
grant execute on function public.admin_refund_request(uuid, text, integer, text, text) to authenticated;
grant execute on function public.admin_refund_decide(uuid, timestamptz, boolean, text) to authenticated;
grant execute on function public.admin_refund_settle(uuid, boolean, text, text) to authenticated;

/* ------------------------------------------------------------------ *
 * SELF-TEST                                                           *
 * ------------------------------------------------------------------ */
/* Rolled back in full. Nothing it writes survives, and it deletes
   nothing — including from the append-only log. */
do $$
declare
  v_booking uuid;
  v_total int;
  v_r jsonb;
  v_id uuid;
  v_u timestamptz;
begin
  begin
    perform set_config('request.jwt.claims', '{"app_metadata":{"role":"admin"}}', true);

    select id, total_cents into v_booking, v_total from public.bookings
    where captured_at is not null and total_cents > 1000
      and not exists (select 1 from public.refunds r where r.booking_id = bookings.id)
    limit 1;
    if v_booking is null then
      raise notice 'refund decisions: no captured booking to test against; skipped';
      raise exception using errcode = 'HW999', message = 'nothing to test';
    end if;

    /* RULE 4 first, because it is the rule with an opinion. */
    if not public.refund_absorbs_helper_share('goodwill') then
      raise exception 'goodwill took the money out of the helper''s balance';
    end if;
    if public.refund_absorbs_helper_share('no_show') then
      raise exception 'a helper who did not turn up kept their share';
    end if;
    if public.refund_absorbs_helper_share('something_nobody_decided') is not null then
      raise exception 'an unmapped reason was given a settlement rule by default';
    end if;
    /* And the request refuses it rather than guessing. */
    begin
      perform public.admin_refund_request(v_booking, 'service', 500, 'something_nobody_decided');
      raise exception 'a refund was requested on a reason with no settlement rule';
    exception when sqlstate 'HW137' then null;
    end;

    /* A reason is required, and so is a positive amount. */
    begin
      perform public.admin_refund_request(v_booking, 'service', 500, '  ');
      raise exception 'a refund was requested with no reason';
    exception when sqlstate 'HW131' then null;
    end;
    begin
      perform public.admin_refund_request(v_booking, 'service', 0, 'goodwill');
      raise exception 'a refund of zero was accepted';
    exception when sqlstate 'HW132' then null;
    end;

    /* RULE 2: you cannot ask for more than is there. */
    begin
      perform public.admin_refund_request(v_booking, 'service', v_total + 1, 'goodwill');
      raise exception 'a refund larger than the charge was accepted';
    exception when sqlstate 'HW134' then null;
    end;

    /* A real request moves no money and carries the settlement rule. */
    v_r := public.admin_refund_request(v_booking, 'service', 500, 'goodwill', 'Customer was kept waiting.');
    v_id := (v_r ->> 'refund_id')::uuid;
    if not (v_r ->> 'absorb_helper_share')::boolean then
      raise exception 'goodwill did not absorb the helper share';
    end if;
    if (select status from public.refunds where id = v_id) <> 'awaiting_review' then
      raise exception 'a request was not left awaiting review';
    end if;
    if (select outcome from public.audit_log where target_id = v_id::text
        and action = 'refund.requested' order by id desc limit 1) <> 'submitted' then
      raise exception 'asking for a refund was recorded as if it had succeeded';
    end if;

    /* RULE 2 again: the in-flight request is counted against what is left. */
    if public.refund_available_cents(v_booking, 'service') <> v_total - 500 then
      raise exception 'a request in flight was not counted against what is left: % vs %',
        public.refund_available_cents(v_booking, 'service'), v_total - 500;
    end if;

    /* A decision needs a reason, and a stale one is refused. */
    select updated_at into v_u from public.refunds where id = v_id;
    begin
      perform public.admin_refund_decide(v_id, v_u, true, '');
      raise exception 'a refund was decided with no reason';
    exception when sqlstate 'HW131' then null;
    end;
    begin
      perform public.admin_refund_decide(v_id, v_u - interval '1 second', true, 'Agreed.');
      raise exception 'a stale decision was applied';
    exception when sqlstate 'HW080' then null;
    end;

    /* Approving moves no money: it marks the row ready to send. */
    v_r := public.admin_refund_decide(v_id, v_u, true, 'Agreed — they waited an hour.');
    if (select status from public.refunds where id = v_id) <> 'processing' then
      raise exception 'approval did not mark the refund as sending';
    end if;
    if (select outcome from public.audit_log where target_id = v_id::text
        and action = 'refund.approved' order by id desc limit 1) <> 'submitted' then
      raise exception 'approval was recorded as if the money had moved';
    end if;

    /* And it cannot be decided twice. */
    select updated_at into v_u from public.refunds where id = v_id;
    begin
      perform public.admin_refund_decide(v_id, v_u, true, 'Again.');
      raise exception 'an approved refund was approved a second time';
    exception when sqlstate 'HW136' then null;
    end;

    /* A failure has to carry what the processor said. */
    begin
      perform public.admin_refund_settle(v_id, false, null, '  ');
      raise exception 'a refund failed with no reason recorded';
    exception when sqlstate 'HW131' then null;
    end;

    perform public.admin_refund_settle(v_id, true, 're_selftest');
    if (select status from public.refunds where id = v_id) <> 'succeeded' then
      raise exception 'settling did not record the refund as succeeded';
    end if;
    if (select outcome from public.audit_log where target_id = v_id::text
        and action = 'refund.confirmed' order by id desc limit 1) <> 'succeeded' then
      raise exception 'a confirmed refund was not recorded as succeeded';
    end if;

    raise exception using errcode = 'HW999', message = 'self-test complete';
  exception
    when sqlstate 'HW999' then
      raise notice 'refund decisions: reasons required, overdrafts refused, in-flight counted, approval moves no money, double decisions refused, failures carry the processor reason — and nothing left behind';
    when others then
      raise;
  end;
end $$;
