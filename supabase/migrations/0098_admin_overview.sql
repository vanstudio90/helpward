-- CLASS: pre-deploy
-- =========================================================================
-- 0098 — what the operations console reads
--
-- The admin overview was a 30-day analytics page: charts of bookings,
-- signups and disputes. Useful for a board meeting, useless at 9am when
-- a safety report is four minutes old and nobody owns it. This is the
-- other thing — what needs attention now, and where every helper is.
--
-- TWO FUNCTIONS, BECAUSE THEY MOVE AT DIFFERENT SPEEDS.
--
--   admin_overview_snapshot   counts, money, queues, coverage, health.
--                             Reloaded when a person asks.
--   admin_live_operations     where helpers are and what they are doing.
--                             Polled every few seconds.
--
-- Each returns ONE jsonb document, so every figure on a card comes from
-- the same transaction. A dashboard assembled from eight separate
-- queries shows eight different instants and invites exactly the
-- conversation this console exists to prevent: "the map says three, the
-- counter says four."
--
-- THE RULES THE SHAPE ENFORCES, each of which has bitten somebody:
--
--   REVIEW ACTIVITY IS NOT THE MARKETPLACE. appreview@ and the
--   controlled helpers transact in Stripe test mode against isolated
--   dispatch. Counting them inflates every number here. They are
--   excluded unless p_include_review says otherwise, and the UI says
--   which it is looking at.
--
--   CAD AND USD ARE NEVER ADDED. Money comes back as an array keyed by
--   currency. There is no total, because there is no such number.
--
--   A HOLD IS NOT REVENUE. Authorized, captured, refunded and
--   payouts-pending are four fields, not one.
--
--   "ELIGIBLE" MEANS DISPATCHABLE. Approved is not online; online is not
--   located; located is not payout-ready. The eligibility test below is
--   find_nearby_providers' own predicate list (0088), minus the
--   per-request distance — because a count that disagrees with the
--   matcher is a count that lies about why nothing matched.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 0. Assumptions, checked out loud.
-- -------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'max_location_age') then
    raise exception 'REFUSING: max_location_age() is missing. Apply 0030 first.';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'provider_profiles'
                    and column_name = 'is_review_helper') then
    raise exception 'REFUSING: provider_profiles.is_review_helper is missing. Apply 0088 first.';
  end if;
end $$;

-- -------------------------------------------------------------------------
-- 1. Is this helper dispatchable right now?
--
-- Lifted from find_nearby_providers (0088) so the console and the matcher
-- cannot disagree. What is NOT here: the distance tests, which need a
-- pickup point, and the service test, which the caller adds.
--
-- stripe_transfers_active is deliberately NOT part of this. The matcher
-- offers work to a helper who cannot yet be paid — accept_request is
-- where assert_helper_payable stops it (0045) — so folding it in here
-- would report a smaller pool than the one actually being offered work.
-- The console shows it as its own number instead.
-- -------------------------------------------------------------------------
create or replace function public.helper_is_dispatchable(pp public.provider_profiles)
returns boolean
language sql stable set search_path = public as $$
  select pp.status = 'approved'
     and pp.is_online = true
     and coalesce(pp.vacation_mode, false) = false
     and pp.current_location is not null
     and pp.location_updated_at is not null
     and pp.location_updated_at > now() - max_location_age();
$$;

comment on function public.helper_is_dispatchable is
  'find_nearby_providers'' own predicates minus distance and service. If that function changes, change this with it: the overview counts helpers this says are dispatchable.';

-- -------------------------------------------------------------------------
-- 2. Where everyone is, and what they are doing.
-- -------------------------------------------------------------------------
create or replace function public.admin_live_operations(
  p_include_review boolean default false
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_result jsonb;
begin
  if not is_admin() then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'as_of', now(),
    'location_max_age_seconds', extract(epoch from max_location_age()),

    /*
      HELPERS. Anyone online, plus anyone mid-job even if their app has
      gone quiet — a helper whose phone died halfway through a booking is
      the single most important pin on this map, and dropping them for
      being offline is how they disappear from it.
    */
    'helpers', coalesce((
      select jsonb_agg(h order by h->>'state', h->>'name')
      from (
        select jsonb_build_object(
          'id', pp.user_id,
          'name', coalesce(p.full_name, 'Helper'),
          'avatar_url', p.avatar_url,
          'lat', st_y(pp.current_location::geometry),
          'lng', st_x(pp.current_location::geometry),
          'is_online', pp.is_online,
          'location_updated_at', pp.location_updated_at,
          'location_age_seconds',
            case when pp.location_updated_at is null then null
                 else extract(epoch from now() - pp.location_updated_at) end,
          'is_review_helper', coalesce(pp.is_review_helper, false),
          'payout_ready', coalesce(pp.stripe_transfers_active, false),
          'state', case
            when b.id is not null and b.status = 'in_progress' then 'on_job'
            when b.id is not null then 'assigned'
            when not helper_is_dispatchable(pp.*) then 'stale'
            else 'waiting'
          end,
          'booking_id', b.id,
          'booking_status', b.status,
          'service_id', b.service_id,
          'service_title', s.title,
          'customer_name', cp.full_name,
          'started_at', b.started_at,
          'scheduled_for', b.scheduled_for
        ) as h
        from provider_profiles pp
        join profiles p on p.id = pp.user_id
        -- The job they are on, newest first where there is more than one.
        left join lateral (
          select bk.* from bookings bk
           where bk.provider_id = pp.user_id
             and bk.status in ('scheduled', 'in_progress')
           order by case bk.status when 'in_progress' then 0 else 1 end, bk.scheduled_for
           limit 1
        ) b on true
        left join services s on s.id = b.service_id
        left join profiles cp on cp.id = b.customer_id
        where (p_include_review or not coalesce(pp.is_review_helper, false))
          and (pp.is_online = true or b.id is not null)
          and pp.current_location is not null
      ) helpers
    ), '[]'::jsonb),

    /*
      JOBS, pinned at the pickup the customer gave rather than at the
      helper — the two are the same only at the moment of arrival, and
      the difference is usually the thing being asked about.
    */
    'jobs', coalesce((
      select jsonb_agg(j order by j->>'status', j->>'scheduled_for')
      from (
        select jsonb_build_object(
          'booking_id', b.id,
          'status', b.status,
          'service_id', b.service_id,
          'service_title', s.title,
          'customer_name', cp.full_name,
          'helper_name', hp.full_name,
          'helper_id', b.provider_id,
          'scheduled_for', b.scheduled_for,
          'started_at', b.started_at,
          'crew_size', b.crew_size,
          'lat', st_y(a.location::geometry),
          'lng', st_x(a.location::geometry),
          'address', a.formatted
        ) as j
        from bookings b
        join profiles cp on cp.id = b.customer_id
        left join profiles hp on hp.id = b.provider_id
        left join services s on s.id = b.service_id
        left join requests r on r.id = b.request_id
        left join addresses a on a.id = r.pickup_address_id
        where b.status in ('scheduled', 'in_progress')
          and (p_include_review or not coalesce(cp.is_review_account, false))
      ) jobs
    ), '[]'::jsonb),

    /*
      WAITING. A request still looking for somebody. The age is the
      number that matters: five minutes of silence is a customer
      watching a spinner.
    */
    'waiting', coalesce((
      select jsonb_agg(w order by (w->>'age_seconds')::numeric desc)
      from (
        select jsonb_build_object(
          'request_id', r.id,
          'service_id', r.service_id,
          'service_title', s.title,
          'customer_name', cp.full_name,
          'created_at', r.created_at,
          'age_seconds', extract(epoch from now() - r.created_at),
          'offers_sent', (select count(*) from match_attempts ma where ma.request_id = r.id),
          'lat', st_y(a.location::geometry),
          'lng', st_x(a.location::geometry),
          'address', a.formatted
        ) as w
        from requests r
        join profiles cp on cp.id = r.customer_id
        left join services s on s.id = r.service_id
        left join addresses a on a.id = r.pickup_address_id
        where r.status = 'matching'
          and (p_include_review or not coalesce(cp.is_review_account, false))
      ) waiting
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end $$;

revoke execute on function public.admin_live_operations(boolean) from public;
grant execute on function public.admin_live_operations(boolean) to authenticated;

comment on function public.admin_live_operations is
  'Helpers (with the job they are on, or waiting), active jobs at their pickup points, and requests still matching. Admin only; review accounts excluded unless asked for.';

-- -------------------------------------------------------------------------
-- 3. The rest of the overview, in one consistent read.
-- -------------------------------------------------------------------------
create or replace function public.admin_overview_snapshot(
  p_window interval default interval '1 day',
  p_include_review boolean default false,
  /*
    ONE REGION, OR ALL OF THEM.

    Matched against requests.pickup_city, which is where demand
    physically is. Null means every region, and the console says which
    it is showing — a filtered dashboard that looks unfiltered is how a
    quiet Tuesday in one city gets read as a quiet Tuesday everywhere.

    Helpers are NOT filtered by it, and that is deliberate rather than
    an omission: a helper serves wherever they said they work, and most
    have said nothing, which the matcher reads as everywhere. Narrowing
    them by region here would invent a restriction the dispatcher does
    not apply.
  */
  p_region text default null
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_from timestamptz := now() - p_window;
  v_prior_from timestamptz := now() - (p_window * 2);
  v_result jsonb;
begin
  if not is_admin() then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'as_of', now(),
    'window_seconds', extract(epoch from p_window),
    'includes_review_activity', p_include_review,
    'region', p_region,
    -- Offered by the console's dropdown. Built from the requests that
    -- exist, so it can never list a region nobody has ever booked in.
    'regions', coalesce((
      select jsonb_agg(jsonb_build_object('name', pickup_city, 'requests', n) order by n desc)
      from (
        select r.pickup_city, count(*) as n
        from requests r
        join profiles p on p.id = r.customer_id
        where r.pickup_city is not null
          and (p_include_review or not coalesce(p.is_review_account, false))
        group by r.pickup_city
      ) regions
    ), '[]'::jsonb),

    -- ---------------------------------------------------------------
    -- The five counters, each with the same figure for the window
    -- before it so the change is a measurement rather than a mood.
    -- ---------------------------------------------------------------
    'kpis', (
      with scoped_requests as (
        select r.* from requests r
        join profiles p on p.id = r.customer_id
        where (p_include_review or not coalesce(p.is_review_account, false))
          and (p_region is null or r.pickup_city = p_region)
      ),
      scoped_bookings as (
        select b.* from bookings b
        join profiles p on p.id = b.customer_id
        left join requests rq on rq.id = b.request_id
        where (p_include_review or not coalesce(p.is_review_account, false))
          and (p_region is null or rq.pickup_city = p_region)
      ),
      eligible as (
        select pp.*, coalesce(pp.stripe_transfers_active, false) as payable
        from provider_profiles pp
        where (p_include_review or not coalesce(pp.is_review_helper, false))
          and helper_is_dispatchable(pp.*)
      )
      select jsonb_build_object(
        'requests', jsonb_build_object(
          'value', (select count(*) from scoped_requests where created_at >= v_from),
          'prior', (select count(*) from scoped_requests where created_at >= v_prior_from and created_at < v_from)
        ),
        'active_bookings', jsonb_build_object(
          'value', (select count(*) from scoped_bookings where status in ('scheduled', 'in_progress')),
          'in_progress', (select count(*) from scoped_bookings where status = 'in_progress')
        ),
        'eligible_helpers', jsonb_build_object(
          'value', (select count(*) from eligible),
          'payout_ready', (select count(*) from eligible where payable),
          -- Approved but not dispatchable: the gap people actually ask about.
          'approved_total', (
            select count(*) from provider_profiles pp
             where pp.status = 'approved'
               and (p_include_review or not coalesce(pp.is_review_helper, false))
          )
        ),
        'captured', (
          -- Per currency. There is no combined figure on purpose.
          select coalesce(jsonb_agg(jsonb_build_object(
                   'currency', currency, 'cents', cents, 'prior_cents', prior_cents)
                 order by currency), '[]'::jsonb)
          from (
            select currency,
                   sum(total_cents) filter (where captured_at >= v_from) as cents,
                   sum(total_cents) filter (where captured_at >= v_prior_from and captured_at < v_from) as prior_cents
            from scoped_bookings
            /*
              A CAPTURE THAT WAS LATER REFUNDED STILL HAPPENED.

              This read `payment_status in ('captured','partial_refund')`,
              which quietly drops a booking the moment it is refunded in
              full — so a day's captured total shrank retroactively as
              refunds landed, and the refunds column counted the same
              money a second time. The event is what is being counted
              here, and `captured_at` is when it occurred.
            */
            where captured_at is not null and payment_status <> 'failed'
            group by currency
          ) c
        ),
        /*
          COMPLETION RATE over bookings that REACHED AN END inside the
          window — completed or cancelled. Counting completions against
          all bookings would punish today for jobs that are still
          running, and flatter it for jobs cancelled yesterday.
        */
        'completion', (
          select jsonb_build_object(
            'completed', count(*) filter (where ended_at >= v_from and status = 'completed'),
            'ended',     count(*) filter (where ended_at >= v_from),
            'prior_completed', count(*) filter (where ended_at < v_from and status = 'completed'),
            'prior_ended',     count(*) filter (where ended_at < v_from)
          )
          from (
            select status, coalesce(completed_at, cancelled_at) as ended_at
            from scoped_bookings
            where status in ('completed', 'cancelled')
              and coalesce(completed_at, cancelled_at) >= v_prior_from
          ) ended
        )
      )
    ),

    -- ---------------------------------------------------------------
    -- What needs a person. Severity, age, owner, and where to go.
    -- ---------------------------------------------------------------
    'needs_attention', coalesce((
      select jsonb_agg(i order by
               case i->>'severity' when 'urgent' then 0 else 1 end,
               (i->>'age_seconds')::numeric desc)
      from (
        -- Safety reports: anything unresolved, however old.
        select jsonb_build_object(
          'kind', 'safety', 'severity', 'urgent',
          'title', 'Safety report',
          'detail', coalesce(s.title, 'Booking') || ' · ' || upper(substr(d.booking_id::text, 1, 6)),
          'age_seconds', extract(epoch from now() - d.created_at),
          'owner', case when d.resolved_by is null then null else op.full_name end,
          'action', 'Open case', 'href', '/admin/disputes'
        ) as i
        from disputes d
        left join bookings b on b.id = d.booking_id
        left join services s on s.id = b.service_id
        left join profiles op on op.id = d.resolved_by
        left join profiles cp on cp.id = b.customer_id
        where d.category = 'safety' and d.status in ('open', 'investigating', 'escalated')
          and (p_include_review or not coalesce(cp.is_review_account, false))

        union all

        -- Nobody matched yet, and it has been long enough to notice.
        select jsonb_build_object(
          'kind', 'unmatched', 'severity',
            case when now() - r.created_at > interval '10 minutes' then 'urgent' else 'attention' end,
          'title', 'No helper matched',
          'detail', coalesce(s.title, r.service_id) || ' · ' || upper(substr(r.id::text, 1, 6)),
          'age_seconds', extract(epoch from now() - r.created_at),
          'owner', null,
          'action', 'Review request', 'href', '/admin/bookings'
        )
        from requests r
        join profiles cp on cp.id = r.customer_id
        left join services s on s.id = r.service_id
        where r.status = 'matching'
          and r.created_at < now() - interval '3 minutes'
          and (p_include_review or not coalesce(cp.is_review_account, false))

        union all

        -- A card that would not take the money for work already done.
        select jsonb_build_object(
          'kind', 'capture_failed', 'severity', 'urgent',
          'title', 'Capture failed',
          'detail', coalesce(s.title, b.service_id) || ' · ' || upper(substr(b.id::text, 1, 6)),
          'age_seconds', extract(epoch from now() - coalesce(b.completed_at, b.created_at)),
          'owner', null,
          'action', 'Review payment', 'href', '/admin/payments'
        )
        from bookings b
        join profiles cp on cp.id = b.customer_id
        left join services s on s.id = b.service_id
        where b.payment_status = 'failed'
          and b.status in ('completed', 'in_progress', 'scheduled')
          and (p_include_review or not coalesce(cp.is_review_account, false))

        union all

        -- Applications waiting on a human. One row, not one per helper.
        select jsonb_build_object(
          'kind', 'approvals', 'severity', 'attention',
          'title', 'Helper approval',
          'detail', count(*)::text || ' application' || case when count(*) = 1 then '' else 's' end,
          'age_seconds', extract(epoch from now() - min(pp.created_at)),
          'owner', null,
          'action', 'Review queue', 'href', '/admin/helpers'
        )
        from provider_profiles pp
        where pp.status = 'pending'
          and (p_include_review or not coalesce(pp.is_review_helper, false))
        having count(*) > 0

        union all

        -- Booked, the hour came and went, nobody started it.
        select jsonb_build_object(
          'kind', 'overdue', 'severity', 'urgent',
          'title', 'Job never started',
          'detail', coalesce(s.title, b.service_id) || ' · ' || upper(substr(b.id::text, 1, 6)),
          'age_seconds', extract(epoch from now() - b.scheduled_for),
          'owner', null,
          'action', 'Open booking', 'href', '/admin/bookings'
        )
        from bookings b
        join profiles cp on cp.id = b.customer_id
        left join services s on s.id = b.service_id
        where b.status = 'scheduled'
          and b.scheduled_for < now() - interval '15 minutes'
          and (p_include_review or not coalesce(cp.is_review_account, false))
      ) issues
    ), '[]'::jsonb),

    -- ---------------------------------------------------------------
    -- The queues, as three lists rather than three counts.
    --
    -- "Matching" lives in `requests` and the other two in `bookings`:
    -- a request that nobody has accepted is not a booking yet, and
    -- flattening them into one table is how a console starts claiming
    -- bookings that do not exist.
    -- ---------------------------------------------------------------
    'bookings_in_motion', jsonb_build_object(
      'matching', coalesce((
        select jsonb_agg(m order by m->>'created_at')
        from (
          select jsonb_build_object(
            'id', r.id, 'ref', 'RQ-' || upper(substr(r.id::text, 1, 6)),
            'service_title', coalesce(s.title, r.service_id),
            'customer_name', cp.full_name,
            'helper_name', null,
            'status', 'matching',
            'created_at', r.created_at,
            'scheduled_for', r.scheduled_for,
            'href', '/admin/bookings'
          ) as m
          from requests r
          join profiles cp on cp.id = r.customer_id
          left join services s on s.id = r.service_id
          where r.status = 'matching'
            and (p_include_review or not coalesce(cp.is_review_account, false))
            and (p_region is null or r.pickup_city = p_region)
          limit 25
        ) q
      ), '[]'::jsonb),
      'scheduled', coalesce((
        select jsonb_agg(m order by m->>'scheduled_for')
        from (
          select jsonb_build_object(
            'id', b.id, 'ref', 'BK-' || upper(substr(b.id::text, 1, 6)),
            'service_title', coalesce(s.title, b.service_id),
            'customer_name', cp.full_name,
            'helper_name', hp.full_name,
            'status', 'scheduled',
            'created_at', b.created_at,
            'scheduled_for', b.scheduled_for,
            'payment_status', b.payment_status,
            'href', '/admin/bookings'
          ) as m
          from bookings b
          join profiles cp on cp.id = b.customer_id
          left join profiles hp on hp.id = b.provider_id
          left join services s on s.id = b.service_id
          where b.status = 'scheduled'
            and (p_include_review or not coalesce(cp.is_review_account, false))
            and (p_region is null or exists (
                  select 1 from requests rq where rq.id = b.request_id and rq.pickup_city = p_region))
          limit 25
        ) q
      ), '[]'::jsonb),
      'in_progress', coalesce((
        select jsonb_agg(m order by m->>'started_at')
        from (
          select jsonb_build_object(
            'id', b.id, 'ref', 'BK-' || upper(substr(b.id::text, 1, 6)),
            'service_title', coalesce(s.title, b.service_id),
            'customer_name', cp.full_name,
            'helper_name', hp.full_name,
            'status', 'in_progress',
            'created_at', b.created_at,
            'started_at', b.started_at,
            'payment_status', b.payment_status,
            'href', '/admin/bookings'
          ) as m
          from bookings b
          join profiles cp on cp.id = b.customer_id
          left join profiles hp on hp.id = b.provider_id
          left join services s on s.id = b.service_id
          where b.status = 'in_progress'
            and (p_include_review or not coalesce(cp.is_review_account, false))
            and (p_region is null or exists (
                  select 1 from requests rq where rq.id = b.request_id and rq.pickup_city = p_region))
          limit 25
        ) q
      ), '[]'::jsonb)
    ),

    -- ---------------------------------------------------------------
    -- Money, kept in its four states and never summed across currency.
    -- ---------------------------------------------------------------
    'money', coalesce((
      select jsonb_agg(m order by m->>'currency')
      from (
        select jsonb_build_object(
          'currency', cur,
          'captured_cents', coalesce(captured, 0),
          'authorized_cents', coalesce(held, 0),
          'refunded_cents', coalesce(refunded, 0),
          'payouts_pending_cents', coalesce(payouts_pending, 0)
        ) as m
        from (
          select b.currency as cur,
                 sum(b.total_cents) filter (
                   where b.captured_at >= v_from
                     and b.payment_status <> 'failed') as captured,
                 -- Holds are a CURRENT state, not a windowed total: money
                 -- reserved on cards right now.
                 sum(b.total_cents) filter (where b.payment_status = 'authorized') as held,
                 (select sum(rf.amount_cents)
                    from refunds rf join bookings rb on rb.id = rf.booking_id
                   where rb.currency = b.currency and rf.created_at >= v_from
                     and rf.status in ('succeeded', 'pending')) as refunded,
                 (select sum(po.amount_cents) from payouts po
                   where upper(po.currency) = upper(b.currency)
                     and po.status in ('pending', 'in_transit')) as payouts_pending
          from bookings b
          join profiles p on p.id = b.customer_id
          where (p_include_review or not coalesce(p.is_review_account, false))
          group by b.currency
        ) per_currency
      ) money
    ), '[]'::jsonb),

    -- ---------------------------------------------------------------
    -- Demand against helpers who could actually take it.
    -- ---------------------------------------------------------------
    'coverage', coalesce((
      select jsonb_agg(c order by (c->>'waiting')::int desc, c->>'title')
      from (
        select jsonb_build_object(
          'service_id', s.id,
          'title', s.title,
          'waiting', (
            select count(*) from requests r
            join profiles cp on cp.id = r.customer_id
            where r.service_id = s.id and r.status = 'matching'
              and (p_include_review or not coalesce(cp.is_review_account, false))
              and (p_region is null or r.pickup_city = p_region)
          ),
          'eligible_online', (
            select count(*) from provider_profiles pp
            join provider_services ps on ps.provider_id = pp.user_id and ps.service_id = s.id
            where (p_include_review or not coalesce(pp.is_review_helper, false))
              and helper_is_dispatchable(pp.*)
          ),
          'offering_total', (
            select count(*) from provider_profiles pp
            join provider_services ps on ps.provider_id = pp.user_id and ps.service_id = s.id
            where pp.status = 'approved'
              and (p_include_review or not coalesce(pp.is_review_helper, false))
          )
        ) as c
        from services s
        where s.active
      ) coverage
    ), '[]'::jsonb),

    -- ---------------------------------------------------------------
    -- Signals, not reassurance.
    --
    -- Every row here is something this database actually records. There
    -- is no API uptime check and no webhook ledger, so neither claims to
    -- be green: a dashboard that says "Operational" because nothing
    -- measured it is worse than one that admits the gap.
    -- ---------------------------------------------------------------
    'health', jsonb_build_object(
      'dispatch_refusals_1h', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'reason', reason, 'occurrences', occurrences,
                 'requests', distinct_requests, 'last_seen', last_seen,
                 'configuration_fault', is_configuration_fault)
               order by is_configuration_fault desc, occurrences desc)
        from dispatch_health(interval '1 hour')
      ), '[]'::jsonb),
      'failed_captures_24h', (
        select count(*) from bookings b
        join profiles p on p.id = b.customer_id
        where b.payment_status = 'failed' and b.created_at > now() - interval '24 hours'
          and (p_include_review or not coalesce(p.is_review_account, false))
      ),
      'online_with_stale_location', (
        select count(*) from provider_profiles pp
        where pp.is_online = true
          and (pp.location_updated_at is null or pp.location_updated_at <= now() - max_location_age())
          and (p_include_review or not coalesce(pp.is_review_helper, false))
      ),
      'last_recorded_job_action', (
        select max(created_at) from audit_log where action like 'cron.%'
      ),
      'boundary_enforcement', (select boundary_enforcement_mode())
    ),

    -- ---------------------------------------------------------------
    -- What just happened, from the rows themselves.
    -- ---------------------------------------------------------------
    'activity', coalesce((
      select jsonb_agg(a order by (a->>'at') desc)
      from (
        select * from (
          select jsonb_build_object(
            'kind', 'captured', 'at', b.captured_at,
            'label', 'Payment captured',
            'detail', upper(substr(b.id::text, 1, 6)),
            'href', '/admin/payments'
          ) as a
          from bookings b join profiles p on p.id = b.customer_id
          where b.captured_at is not null
            and (p_include_review or not coalesce(p.is_review_account, false))
          order by b.captured_at desc limit 5
        ) x
        union all
        select * from (
          select jsonb_build_object(
            'kind', 'accepted', 'at', b.created_at,
            'label', 'Helper accepted',
            'detail', upper(substr(b.id::text, 1, 6)),
            'href', '/admin/bookings'
          )
          from bookings b join profiles p on p.id = b.customer_id
          where (p_include_review or not coalesce(p.is_review_account, false))
          order by b.created_at desc limit 5
        ) y
        union all
        select * from (
          select jsonb_build_object(
            'kind', 'refunded', 'at', rf.created_at,
            'label', 'Refund ' || rf.status,
            'detail', upper(substr(rf.booking_id::text, 1, 6)),
            'href', '/admin/refunds'
          )
          from refunds rf
          order by rf.created_at desc limit 5
        ) z
      ) events
      where (a->>'at') is not null
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end $$;

revoke execute on function public.admin_overview_snapshot(interval, boolean, text) from public;
grant execute on function public.admin_overview_snapshot(interval, boolean, text) to authenticated;

comment on function public.admin_overview_snapshot is
  'One consistent read behind the operations overview: counters, the attention queue, money per currency, coverage, signals and recent activity. Admin only; review activity excluded unless asked for.';

-- -------------------------------------------------------------------------
-- 4. Prove the guard, here, rather than trusting the two lines above.
-- -------------------------------------------------------------------------
do $$
declare
  v_customer uuid;
  v_refused boolean := false;
begin
  select id into v_customer from profiles where role = 'customer' limit 1;
  if v_customer is null then
    raise notice '0098: no customer to test the admin guard with; skipped.';
    return;
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_customer::text, 'role', 'authenticated',
                      'app_metadata', json_build_object('role', 'customer'))::text, true);
  begin
    perform admin_overview_snapshot();
  exception when insufficient_privilege then
    v_refused := true;
  end;
  perform set_config('request.jwt.claims', '', true);

  if not v_refused then
    raise exception '0098: a customer could read admin_overview_snapshot.';
  end if;
end $$;
