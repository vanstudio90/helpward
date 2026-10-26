-- A job that needs more than one helper. Executed under REAL roles.
--
-- Moving help asks how many helpers are needed and 0053 charges for the
-- answer. Nothing staffed it: bookings.provider_id is one column, so a
-- customer paying $145 for four helpers got one, and the other three
-- were billed and never sent.
--
-- USAGE: node scripts/run-sql-suite.mjs supabase/tests/crew_staffing.sql

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

create temp table cx (customer uuid, lead uuid, mate uuid, addr uuid, req uuid, booking uuid);

do $$
declare v_cust uuid; v_lead uuid; v_mate uuid; v_addr uuid; v_req uuid;
begin
  perform pg_temp.become_service();
  select id into v_cust from profiles where role = 'customer' limit 1;
  select user_id into v_lead from provider_profiles order by user_id limit 1;
  select user_id into v_mate from provider_profiles where user_id <> v_lead order by user_id limit 1;
  if v_mate is null then raise exception 'Fixture needs TWO provider profiles'; end if;

  update provider_profiles set status = 'approved', stripe_transfers_active = true,
         stripe_connect_account_id = coalesce(stripe_connect_account_id, 'acct_fixture_' || left(user_id::text, 8))
   where user_id in (v_lead, v_mate);
  insert into provider_services (provider_id, service_id)
  values (v_lead, 'moving-help'), (v_mate, 'moving-help') on conflict do nothing;

  insert into addresses (user_id, formatted, location, country, geocode_verified, geocoded_at)
  values (v_cust, 'FIXTURE — crew',
          st_setsrid(st_makepoint(-117.1611, 32.7157), 4326)::geography, 'US', true, now())
  returning id into v_addr;

  -- Two helpers requested, which 0053 prices at base + one extra helper.
  insert into requests (customer_id, service_id, pickup_address_id,
                        estimated_price_cents, estimated_duration_min, status, intake)
  values (v_cust, 'moving-help', v_addr, 0, 120, 'matching',
          '{"crew_size":"2"}'::jsonb)
  returning id into v_req;
  perform seal_request_quote(v_req);

  -- BOTH were offered the job.
  insert into match_attempts (request_id, provider_id, distance_km, rank_score)
  values (v_req, v_lead, 1.0, 1.0), (v_req, v_mate, 2.0, 0.9);

  insert into cx values (v_cust, v_lead, v_mate, v_addr, v_req, null);
end $$;

-- ---------------------------------------------------------------------------
-- X01 — the customer is charged for the crew they asked for
-- ---------------------------------------------------------------------------
do $$
declare v_one int; v_two int;
begin
  perform pg_temp.become_service();
  v_one := price_service_cents('moving-help', '{"crew_size":"1"}'::jsonb);
  v_two := price_service_cents('moving-help', '{"crew_size":"2"}'::jsonb);
  if v_two <= v_one then
    raise exception 'FAIL X01 two helpers cost no more than one (% vs %)', v_two, v_one;
  end if;
  raise notice 'PASS X01 a second helper is charged for ($% vs $%)',
    (v_two/100.0)::numeric(10,2), (v_one/100.0)::numeric(10,2);
end $$;

-- ---------------------------------------------------------------------------
-- X02 — accepting makes you the lead and opens the other places
-- ---------------------------------------------------------------------------
do $$
declare r record; v_bk uuid; v_crew int; v_invited int; v_lead_share int;
begin
  perform pg_temp.become_service(); select * into r from cx;

  perform pg_temp.become(r.lead, 'provider');
  v_bk := accept_request(r.req, r.lead);

  perform pg_temp.become_service();
  update cx set booking = v_bk;

  select crew_size into v_crew from bookings where id = v_bk;
  if v_crew <> 2 then raise exception 'FAIL X02 booking crew_size is %, expected 2', v_crew; end if;

  select count(*) into v_invited from booking_crew
   where booking_id = v_bk and status = 'invited' and not is_lead;
  if v_invited < 1 then
    raise exception 'FAIL X02 the other offered helper was not invited to the crew';
  end if;
  raise notice 'PASS X02 accepting leads the job and opens % place(s)', v_invited;

  select share_cents into v_lead_share from booking_crew
   where booking_id = v_bk and is_lead;
  if v_lead_share <= 0 then raise exception 'FAIL X02 the lead has no share'; end if;
  raise notice 'PASS X03 the lead''s share is fixed at acceptance ($%)',
    (v_lead_share/100.0)::numeric(10,2);
end $$;

-- ---------------------------------------------------------------------------
-- X04 — a short-handed crew cannot start
-- ---------------------------------------------------------------------------
do $$
declare r record;
begin
  perform pg_temp.become_service(); select * into r from cx;
  update bookings set payment_status = 'authorized', authorized_at = now(),
                      stripe_payment_intent_id = 'pi_fixture_crew'
   where id = r.booking;

  perform pg_temp.become(r.lead, 'provider');
  begin
    perform start_booking(r.booking);
    raise exception 'FAIL X04 a two-person job started with one helper';
  exception when others then
    if sqlerrm like 'FAIL %' then raise; end if;
    if position('more helper' in sqlerrm) = 0 then
      raise exception 'FAIL X04 refused for the wrong reason: %', sqlerrm;
    end if;
    raise notice 'PASS X04 a short-handed crew cannot start the job';
  end;
end $$;

-- ---------------------------------------------------------------------------
-- X05 — the second helper joins, and then it can
-- ---------------------------------------------------------------------------
do $$
declare r record; v_short int; v_total int; v_payout int; v_status text;
begin
  perform pg_temp.become_service(); select * into r from cx;

  perform pg_temp.become(r.mate, 'provider');
  perform accept_crew_invite(r.booking, r.mate);

  perform pg_temp.become_service();
  v_short := crew_shortfall(r.booking);
  if v_short <> 0 then raise exception 'FAIL X05 still short % after both accepted', v_short; end if;
  raise notice 'PASS X05 the crew is full once both accept';

  -- The shares must add up to exactly the payout. A rounding slip here
  -- either invents money or loses a helper a cent.
  select payout_cents into v_payout from bookings where id = r.booking;
  select coalesce(sum(share_cents), 0) into v_total from booking_crew
   where booking_id = r.booking and status in ('accepted', 'arrived');
  if v_total <> v_payout then
    raise exception 'FAIL X06 crew shares total % but the payout is %', v_total, v_payout;
  end if;
  raise notice 'PASS X06 the shares add up to the payout exactly ($%)',
    (v_payout/100.0)::numeric(10,2);

  perform pg_temp.become(r.lead, 'provider');
  perform start_booking(r.booking);
  perform pg_temp.become_service();
  select status into v_status from bookings where id = r.booking;
  if v_status <> 'in_progress' then
    raise exception 'FAIL X07 a full crew could not start the job (%)', v_status;
  end if;
  raise notice 'PASS X07 a full crew starts the job (control)';
end $$;

-- ---------------------------------------------------------------------------
-- X08 — refusals
-- ---------------------------------------------------------------------------
do $$
declare r record; v_third uuid;
begin
  perform pg_temp.become_service(); select * into r from cx;

  -- A helper who was never invited cannot join.
  select user_id into v_third from provider_profiles
   where user_id not in (r.lead, r.mate) limit 1;
  if v_third is not null then
    perform pg_temp.become(v_third, 'provider');
    begin
      perform accept_crew_invite(r.booking, v_third);
      raise exception 'FAIL X08 an uninvited helper joined the crew';
    exception when others then
      if sqlerrm like 'FAIL %' then raise; end if;
      raise notice 'PASS X08 an uninvited helper cannot join: %', left(sqlerrm, 44);
    end;
  end if;

  -- Nobody can accept on someone else's behalf.
  perform pg_temp.become(r.lead, 'provider');
  begin
    perform accept_crew_invite(r.booking, r.mate);
    raise exception 'FAIL X09 the lead accepted on another helper''s behalf';
  exception when others then
    if sqlerrm like 'FAIL %' then raise; end if;
    raise notice 'PASS X09 nobody can accept an invitation for someone else';
  end;

  -- And the crew table is not writable directly — share_cents is a claim
  -- about money.
  perform pg_temp.become(r.mate, 'provider');
  begin
    update booking_crew set share_cents = 999999 where booking_id = r.booking;
    perform pg_temp.become_service();
    if exists (select 1 from booking_crew where booking_id = r.booking and share_cents = 999999) then
      raise exception 'FAIL X10 a helper rewrote their own share';
    end if;
    raise notice 'PASS X10 a helper cannot rewrite their own share';
  exception when insufficient_privilege then
    raise notice 'PASS X10 a helper cannot write booking_crew at all';
  end;
end $$;

rollback;
