-- A property inspection produces a report, and cannot be completed
-- without one. Executed under REAL roles.
--
-- Before this, the helper got the same "Mark complete" button as a dog
-- walk: the customer paid $60 for a room-by-room assessment and received
-- the word "completed".
--
-- USAGE: node scripts/run-sql-suite.mjs supabase/tests/inspection_report.sql

\set ON_ERROR_STOP on
begin;

create or replace function pg_temp.become(p_uid uuid, p_role text default 'customer')
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated',
                      'app_metadata', json_build_object('role', p_role))::text, true);
  execute 'set local role authenticated';
end $$;

create or replace function pg_temp.become_service()
returns void language plpgsql as $$
begin execute 'reset role'; perform set_config('request.jwt.claims', '', true); end $$;

create temp table ifx (customer uuid, helper uuid, other uuid, booking uuid, report uuid);

do $$
declare v_cust uuid; v_helper uuid; v_other uuid; v_addr uuid; v_req uuid; v_bk uuid;
begin
  perform pg_temp.become_service();
  select id into v_cust from profiles where role = 'customer' limit 1;
  select user_id into v_helper from provider_profiles order by user_id limit 1;
  select user_id into v_other from provider_profiles where user_id <> v_helper order by user_id limit 1;

  insert into addresses (user_id, formatted, location, country, geocode_verified, geocoded_at)
  values (v_cust, 'FIXTURE — inspection',
          st_setsrid(st_makepoint(-117.1611, 32.7157), 4326)::geography, 'US', true, now())
  returning id into v_addr;

  insert into requests (customer_id, service_id, pickup_address_id,
                        estimated_price_cents, estimated_duration_min, status, intake)
  values (v_cust, 'property-inspection', v_addr, 6450, 90, 'matched',
          '{"scope":["condition","safety","meters"],"access":"Lockbox 4821"}'::jsonb)
  returning id into v_req;

  insert into bookings (request_id, customer_id, provider_id, service_id, status,
                        scheduled_for, base_price_cents, service_fee_cents, total_cents,
                        platform_fee_cents, payout_cents, currency, payment_status, intake)
  values (v_req, v_cust, v_helper, 'property-inspection', 'in_progress', now(),
          6000, 450, 6450, 1650, 4800, 'USD', 'authorized',
          '{"scope":["condition","safety","meters"],"access":"Lockbox 4821"}'::jsonb)
  returning id into v_bk;

  insert into ifx values (v_cust, v_helper, v_other, v_bk, null);
end $$;

-- ---------------------------------------------------------------------------
-- I01 — the checklist is built from what the customer asked for
-- ---------------------------------------------------------------------------
do $$
declare r record; v_report uuid; v_items int; v_areas text[];
begin
  perform pg_temp.become_service(); select * into r from ifx;
  perform pg_temp.become(r.helper, 'provider');

  v_report := ensure_inspection_report(r.booking);
  perform pg_temp.become_service();
  update ifx set report = v_report;

  select count(*), array_agg(area order by position) into v_items, v_areas
    from inspection_items where report_id = v_report;

  if v_items <> 3 then
    raise exception 'FAIL I01 expected 3 areas from the customer''s scope, got %', v_items;
  end if;
  if v_areas <> array['condition','safety','meters'] then
    raise exception 'FAIL I01 checklist does not match the scope: %', v_areas;
  end if;
  raise notice 'PASS I01 the checklist is the scope the customer chose (%)', array_to_string(v_areas, ', ');
end $$;

-- Idempotent: opening the page twice must not duplicate the checklist.
do $$
declare r record; v_again uuid; v_items int;
begin
  perform pg_temp.become_service(); select * into r from ifx;
  perform pg_temp.become(r.helper, 'provider');
  v_again := ensure_inspection_report(r.booking);
  perform pg_temp.become_service();
  select count(*) into v_items from inspection_items where report_id = v_again;
  if v_again <> r.report or v_items <> 3 then
    raise exception 'FAIL I02 re-opening duplicated the report (% items)', v_items;
  end if;
  raise notice 'PASS I02 re-opening the report does not duplicate it';
end $$;

-- ---------------------------------------------------------------------------
-- I03 — an unfinished report cannot be sent
-- ---------------------------------------------------------------------------
do $$
declare r record;
begin
  perform pg_temp.become_service(); select * into r from ifx;
  perform pg_temp.become(r.helper, 'provider');
  begin
    perform submit_inspection_report(r.booking, 'All fine');
    raise exception 'FAIL I03 sent a report with areas still unchecked';
  exception when others then
    if sqlerrm like 'FAIL %' then raise; end if;
    if position('still unchecked' in sqlerrm) = 0 then
      raise exception 'FAIL I03 refused for the wrong reason: %', sqlerrm;
    end if;
    raise notice 'PASS I03 a report with unchecked areas cannot be sent';
  end;
end $$;

-- ---------------------------------------------------------------------------
-- I04 — and the booking cannot be completed without one
-- ---------------------------------------------------------------------------
do $$
declare r record;
begin
  perform pg_temp.become_service(); select * into r from ifx;
  perform pg_temp.become(r.helper, 'provider');
  begin
    perform complete_booking(r.booking);
    raise exception 'FAIL I04 completed an inspection with no report';
  exception when others then
    if sqlerrm like 'FAIL %' then raise; end if;
    if position('inspection report' in sqlerrm) = 0 then
      raise exception 'FAIL I04 refused for the wrong reason: %', sqlerrm;
    end if;
    raise notice 'PASS I04 an inspection cannot be completed without its report';
  end;
end $$;

-- ---------------------------------------------------------------------------
-- I05 — only the assigned helper may write findings
-- ---------------------------------------------------------------------------
do $$
declare r record; v_item uuid; v_after text;
begin
  perform pg_temp.become_service(); select * into r from ifx;
  select id into v_item from inspection_items where report_id = r.report order by position limit 1;

  perform pg_temp.become(r.other, 'provider');
  update inspection_items set condition = 'good', note = 'injected' where id = v_item;
  perform pg_temp.become_service();
  select condition::text into v_after from inspection_items where id = v_item;
  if v_after <> 'not_checked' then
    raise exception 'FAIL I05 an unassigned helper wrote a finding (now %)', v_after;
  end if;
  raise notice 'PASS I05 an unassigned helper cannot write findings';

  -- Nor can the CUSTOMER: a report the subject can edit is not a report.
  perform pg_temp.become(r.customer, 'customer');
  update inspection_items set condition = 'good' where id = v_item;
  perform pg_temp.become_service();
  select condition::text into v_after from inspection_items where id = v_item;
  if v_after <> 'not_checked' then
    raise exception 'FAIL I06 the customer edited their own inspection (now %)', v_after;
  end if;
  raise notice 'PASS I06 the customer cannot edit the report about their property';
end $$;

-- ---------------------------------------------------------------------------
-- POSITIVE CONTROL — a finished report sends, and the job then completes
-- ---------------------------------------------------------------------------
do $$
declare r record; v_submitted timestamptz; v_status text; v_notified int;
begin
  perform pg_temp.become_service(); select * into r from ifx;

  perform pg_temp.become(r.helper, 'provider');
  update inspection_items set condition = 'good', note = 'Checked, no issues'
   where report_id = r.report;
  perform submit_inspection_report(r.booking, 'Property is in good order throughout.');

  perform pg_temp.become_service();
  select submitted_at into v_submitted from inspection_reports where id = r.report;
  if v_submitted is null then raise exception 'FAIL I07 a complete report did not send'; end if;
  raise notice 'PASS I07 a complete report sends (control)';

  select count(*) into v_notified from notifications
   where user_id = r.customer and type = 'inspection_report_ready';
  if v_notified = 0 then
    raise exception 'FAIL I08 the customer was not told their report was ready';
  end if;
  raise notice 'PASS I08 the customer is notified the report is ready';

  perform pg_temp.become(r.helper, 'provider');
  perform complete_booking(r.booking);
  perform pg_temp.become_service();
  select status into v_status from bookings where id = r.booking;
  if v_status <> 'completed' then
    raise exception 'FAIL I09 the job did not complete after the report was sent (%)', v_status;
  end if;
  raise notice 'PASS I09 the job completes once the report is sent (control)';
end $$;

-- ---------------------------------------------------------------------------
-- I10 — the customer can READ it
-- ---------------------------------------------------------------------------
do $$
declare r record; v_rows int;
begin
  perform pg_temp.become_service(); select * into r from ifx;
  perform pg_temp.become(r.customer, 'customer');
  select count(*) into v_rows from inspection_items where report_id = r.report;
  if v_rows <> 3 then
    raise exception 'FAIL I10 the customer cannot read the report they paid for (% rows)', v_rows;
  end if;
  raise notice 'PASS I10 the customer can read the report they paid for';

  -- But an unrelated helper cannot.
  perform pg_temp.become(r.other, 'provider');
  select count(*) into v_rows from inspection_items where report_id = r.report;
  if v_rows <> 0 then
    raise exception 'FAIL I11 an unrelated helper read someone''s property report (% rows)', v_rows;
  end if;
  raise notice 'PASS I11 an unrelated helper cannot read it';
end $$;

rollback;
