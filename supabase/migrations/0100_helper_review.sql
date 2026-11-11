-- CLASS: pre-deploy
-- =========================================================================
-- 0100 — the helper approval queue, and who owns each application
--
-- The console had a list of pending helpers and two buttons. What it
-- could not answer is the question a reviewer actually has: WHY is this
-- one still here, and is it waiting on us or on them. Thirty-three
-- applications where one needs a photo, one is waiting on a background
-- check and one has been asked a question nobody followed up are three
-- different jobs, and a single "pending" badge hides all of it.
--
-- SO THE STATE IS COMPUTED FROM THE CHECKS THEMSELVES, in one place
-- (helper_review_state) that both the list and the panel read. No
-- screen gets to invent its own idea of ready.
--
-- AND APPROVAL IS NOT READINESS. An approved helper still has to be
-- online, located, payout-ready and offering the service before a job
-- can reach them — 0098 counts that separately and the console says so
-- out loud. The two were run together on the old page, which is how a
-- marketplace ends up with approved helpers nobody can book.
--
-- WHAT THIS ADDS TO THE SCHEMA, and why each is a column rather than a
-- convention:
--
--   review_owner_id        A queue with no owners is a queue nobody
--                          works. The mockup's Owner column needs
--                          somewhere to live, and "whoever approved it"
--                          (approved_by) only exists after the fact.
--   helper_review_events   Notes, questions asked, decisions — the
--                          Activity tab. audit_log records that a thing
--                          happened; this records the conversation
--                          around it, and unlike audit_log it is meant
--                          to be read by the next reviewer.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 0. Assumptions, checked out loud.
-- -------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'provider_profiles'
                    and column_name = 'stripe_transfers_active') then
    raise exception 'REFUSING: provider_profiles.stripe_transfers_active is missing.';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'helper_is_dispatchable') then
    raise exception 'REFUSING: helper_is_dispatchable() is missing. Apply 0098 first.';
  end if;
end $$;

-- -------------------------------------------------------------------------
-- 1. Who is working this application.
-- -------------------------------------------------------------------------
alter table public.provider_profiles
  add column if not exists review_owner_id uuid references public.profiles(id) on delete set null;

comment on column public.provider_profiles.review_owner_id is
  'The admin currently responsible for this application. Distinct from approved_by, which only exists after a decision.';

-- -------------------------------------------------------------------------
-- 2. The review conversation.
-- -------------------------------------------------------------------------
create table if not exists public.helper_review_events (
  id          bigserial primary key,
  provider_id uuid not null references public.profiles(id) on delete cascade,
  kind        text not null check (kind in ('note', 'info_requested', 'assigned', 'approved', 'rejected')),
  body        text check (length(body) <= 4000),
  actor_id    uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists helper_review_events_provider_idx
  on public.helper_review_events (provider_id, created_at desc);

alter table public.helper_review_events enable row level security;

/*
  ADMIN ONLY, BOTH WAYS. A reviewer's note about an application is not
  something its subject may read: "waiting on a second reference, gut
  feeling is no" is a sentence that exists to be honest internally and
  would be a disaster in the applicant's hands.
*/
drop policy if exists helper_review_events_admin on public.helper_review_events;
create policy helper_review_events_admin on public.helper_review_events
  for all using (is_admin()) with check (is_admin());

grant select, insert on public.helper_review_events to authenticated;
grant usage, select on sequence public.helper_review_events_id_seq to authenticated;

-- -------------------------------------------------------------------------
-- 3. One definition of "why is this still here".
--
-- Ordered the way a reviewer triages: what WE are waiting on from the
-- applicant first, then what a third party owes us, then ready. The
-- first failing check wins, because a photo-less application is not
-- also "waiting on a background check" in any useful sense.
-- -------------------------------------------------------------------------
create or replace function public.helper_review_state(p_user_id uuid)
returns text
language sql stable set search_path = public as $$
  select case
    when (select max(created_at) from helper_review_events e
           where e.provider_id = p_user_id and e.kind = 'info_requested') is not null
     and (select max(created_at) from helper_review_events e
           where e.provider_id = p_user_id and e.kind = 'info_requested')
         > coalesce((select greatest(pp.id_verified_at, pp.background_verified_at, pp.stripe_onboarded_at)
                       from provider_profiles pp where pp.user_id = p_user_id), 'epoch'::timestamptz)
      then 'info_requested'
    when coalesce((select btrim(coalesce(p.avatar_url, '')) from profiles p where p.id = p_user_id), '') = ''
      then 'photo_missing'
    when not exists (select 1 from profile_contacts c where c.user_id = p_user_id and coalesce(c.phone, '') <> '')
      then 'contact_missing'
    when (select pp.id_verified_at from provider_profiles pp where pp.user_id = p_user_id) is null
      then 'identity_pending'
    when (select pp.background_verified_at from provider_profiles pp where pp.user_id = p_user_id) is null
      then 'background_pending'
    when not coalesce((select pp.stripe_transfers_active from provider_profiles pp where pp.user_id = p_user_id), false)
      then 'payout_incomplete'
    else 'ready'
  end;
$$;

comment on function public.helper_review_state is
  'Why an application is still open: info_requested, photo_missing, contact_missing, identity_pending, background_pending, payout_incomplete, or ready. The list and the review panel both read this, so they cannot disagree.';

-- -------------------------------------------------------------------------
-- 4. The queue.
-- -------------------------------------------------------------------------
create or replace function public.admin_helper_queue(
  p_tab text default 'queue',        -- queue | all | approved | suspended
  p_region text default null,
  p_owner uuid default null,
  p_state text default null,
  p_search text default null,
  p_sort text default 'oldest',      -- oldest | newest | waiting
  p_include_review boolean default false,
  p_limit int default 6,
  p_offset int default 0
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
begin
  if not is_admin() then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;

  return (
    with base as (
      select
        pp.user_id,
        p.full_name,
        p.avatar_url,
        p.country,
        pp.status::text as status,
        pp.created_at,
        pp.approved_at,
        pp.review_owner_id,
        owner.full_name as owner_name,
        helper_review_state(pp.user_id) as state,
        helper_is_dispatchable(pp.*) as dispatchable,
        coalesce(pp.stripe_transfers_active, false) as payout_ready,
        (select count(*) from provider_services ps where ps.provider_id = pp.user_id) as service_count,
        (select string_agg(s.title, ', ' order by s.title)
           from provider_services ps join services s on s.id = ps.service_id
          where ps.provider_id = pp.user_id) as services,
        (select string_agg(distinct pc.muni_key, ', ')
           from provider_cities pc where pc.provider_id = pp.user_id) as cities,
        -- Where they say they are, for the Area column. base_address is
        -- free text the helper typed; the city list is what dispatch
        -- actually uses, so both are offered and neither is invented.
        pp.base_address,
        extract(epoch from now() - pp.created_at) as waiting_seconds
      from provider_profiles pp
      join profiles p on p.id = pp.user_id
      left join profiles owner on owner.id = pp.review_owner_id
      where (p_include_review or not coalesce(pp.is_review_helper, false))
    ),
    tabbed as (
      select * from base
      where case p_tab
              when 'queue' then status = 'pending'
              when 'approved' then status = 'approved'
              when 'suspended' then status in ('suspended', 'banned')
              else true
            end
        and (p_region is null or base_address ilike '%' || p_region || '%'
             or cities ilike '%' || p_region || '%')
        and (p_owner is null or review_owner_id = p_owner)
        and (p_state is null or state = p_state)
        and (v_search is null
             or full_name ilike '%' || v_search || '%'
             or user_id::text like lower(v_search) || '%')
    )
    select jsonb_build_object(
      'as_of', now(),
      'total', (select count(*) from tabbed),
      'limit', p_limit,
      'offset', p_offset,
      /*
        The five counters. Disjoint by construction: the state function
        returns exactly one reason, so an application is counted once
        and the columns add up to the pending total.
      */
      'counts', (
        select jsonb_build_object(
          'pending_review', count(*) filter (where status = 'pending'),
          'ready_for_decision', count(*) filter (where status = 'pending' and state = 'ready'),
          'needs_information', count(*) filter (
            where status = 'pending' and state in ('info_requested', 'photo_missing', 'contact_missing')),
          'checks_pending', count(*) filter (
            where status = 'pending' and state in ('identity_pending', 'background_pending', 'payout_incomplete')),
          'approved', count(*) filter (where status = 'approved'),
          'suspended', count(*) filter (where status in ('suspended', 'banned'))
        ) from base
      ),
      'priorities', (
        select jsonb_build_object(
          'waiting_over_48h', count(*) filter (where status = 'pending' and waiting_seconds > 172800),
          'unassigned', count(*) filter (where status = 'pending' and review_owner_id is null),
          'ready_for_decision', count(*) filter (where status = 'pending' and state = 'ready')
        ) from base
      ),
      'owners', coalesce((
        select jsonb_agg(distinct jsonb_build_object('id', review_owner_id, 'name', owner_name))
        from base where review_owner_id is not null
      ), '[]'::jsonb),
      'rows', coalesce((
        select jsonb_agg(jsonb_build_object(
          'user_id', user_id,
          'ref', 'HP-' || upper(substr(user_id::text, 1, 4)),
          'name', full_name,
          'avatar_url', avatar_url,
          'status', status,
          'state', state,
          'owner_id', review_owner_id,
          'owner_name', owner_name,
          'services', services,
          'service_count', service_count,
          -- country is its own type, so it is cast rather than coalesced
          -- straight into a text column — Postgres refuses the mix.
          'area', coalesce(nullif(cities, ''), base_address, country::text),
          'waiting_seconds', waiting_seconds,
          'created_at', created_at,
          'dispatchable', dispatchable,
          'payout_ready', payout_ready
        ) order by
          case p_sort when 'newest' then 0 else 1 end * extract(epoch from created_at) desc,
          case p_sort when 'newest' then 1 else 0 end * extract(epoch from created_at))
        from (
          select * from tabbed
          order by case when p_sort = 'newest' then created_at end desc nulls last,
                   case when p_sort <> 'newest' then created_at end asc nulls last
          limit p_limit offset p_offset
        ) page
      ), '[]'::jsonb)
    )
  );
end $$;

revoke execute on function public.admin_helper_queue(text, text, uuid, text, text, text, boolean, int, int) from public;
grant execute on function public.admin_helper_queue(text, text, uuid, text, text, text, boolean, int, int) to authenticated;

-- -------------------------------------------------------------------------
-- 5. One application, in full.
-- -------------------------------------------------------------------------
create or replace function public.admin_helper_detail(p_user_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_pp provider_profiles;
  v_state text;
begin
  if not is_admin() then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;

  select * into v_pp from provider_profiles where user_id = p_user_id;
  if not found then return null; end if;
  v_state := helper_review_state(p_user_id);

  return jsonb_build_object(
    'user_id', v_pp.user_id,
    'ref', 'HP-' || upper(substr(v_pp.user_id::text, 1, 4)),
    'name', (select full_name from profiles where id = v_pp.user_id),
    'avatar_url', (select avatar_url from profiles where id = v_pp.user_id),
    'status', v_pp.status,
    'state', v_state,
    'bio', v_pp.bio,
    'languages', v_pp.languages,
    'base_address', v_pp.base_address,
    'country', (select country from profiles where id = v_pp.user_id),
    'created_at', v_pp.created_at,
    'approved_at', v_pp.approved_at,
    'approved_by', (select full_name from profiles where id = v_pp.approved_by),
    'rejection_reason', v_pp.rejection_reason,
    'owner', (select jsonb_build_object('id', p.id, 'name', p.full_name)
                from profiles p where p.id = v_pp.review_owner_id),
    'is_review_helper', coalesce(v_pp.is_review_helper, false),

    'services', coalesce((
      select jsonb_agg(s.title order by s.title)
      from provider_services ps join services s on s.id = ps.service_id
      where ps.provider_id = v_pp.user_id
    ), '[]'::jsonb),
    'cities', coalesce((
      select jsonb_agg(distinct pc.muni_key) from provider_cities pc where pc.provider_id = v_pp.user_id
    ), '[]'::jsonb),

    /*
      THE CHECKS, EACH ON ITS OWN. Five separate facts, not a funnel:
      an application can have a cleared background check and no photo.
      The old overview drew them as a sequence and reported approvals
      sitting after zero verified helpers, which is what a funnel does
      to independent checks.
    */
    'checks', jsonb_build_array(
      jsonb_build_object('key', 'photo', 'label', 'Profile photo',
        'ok', coalesce(btrim((select coalesce(avatar_url, '') from profiles where id = v_pp.user_id)), '') <> '',
        'value', case when coalesce(btrim((select coalesce(avatar_url, '') from profiles where id = v_pp.user_id)), '') <> ''
                      then 'Provided' else 'Missing' end,
        'note', 'Required before approval (0095) — the trigger refuses it, not the screen.'),
      jsonb_build_object('key', 'contact', 'label', 'Contact details',
        'ok', exists (select 1 from profile_contacts c where c.user_id = v_pp.user_id and coalesce(c.phone, '') <> ''),
        'value', case when exists (select 1 from profile_contacts c where c.user_id = v_pp.user_id and coalesce(c.phone, '') <> '')
                      then 'Complete' else 'No phone number' end,
        'note', null),
      jsonb_build_object('key', 'identity', 'label', 'Identity verification',
        'ok', v_pp.id_verified_at is not null,
        'value', case when v_pp.id_verified_at is not null
                      then 'Verified ' || to_char(v_pp.id_verified_at, 'DD Mon YYYY') else 'Not verified' end,
        'note', null),
      jsonb_build_object('key', 'background', 'label', 'Background check',
        'ok', v_pp.background_verified_at is not null,
        'value', coalesce(nullif(v_pp.background_check_status, ''),
                 case when v_pp.background_verified_at is not null then 'Cleared' else 'Not started' end),
        'note', null),
      jsonb_build_object('key', 'payout', 'label', 'Payout account',
        'ok', coalesce(v_pp.stripe_transfers_active, false),
        'value', case when coalesce(v_pp.stripe_transfers_active, false) then 'Transfers enabled'
                      when v_pp.stripe_connect_account_id is null then 'Not started'
                      else coalesce(nullif(v_pp.stripe_disabled_reason, ''), 'Incomplete') end,
        'note', 'accept_request refuses a helper who cannot be paid (0045), approved or not.')
    ),

    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
               'kind', e.kind, 'body', e.body, 'at', e.created_at,
               'actor', coalesce(a.full_name, 'Staff')) order by e.created_at desc)
      from helper_review_events e
      left join profiles a on a.id = e.actor_id
      where e.provider_id = v_pp.user_id
    ), '[]'::jsonb),

    -- Readiness AFTER approval, kept visibly apart from the decision.
    'dispatch', jsonb_build_object(
      'dispatchable', helper_is_dispatchable(v_pp.*),
      'is_online', v_pp.is_online,
      'vacation_mode', coalesce(v_pp.vacation_mode, false),
      'location_updated_at', v_pp.location_updated_at,
      'service_radius_km', v_pp.service_radius_km,
      'services_chosen', (select count(*) from provider_services ps where ps.provider_id = v_pp.user_id)
    ),

    /*
      WHAT MAY BE DONE, and the reason when it may not. Approval without
      a photo is refused by require_helper_photo_for_approval (0095) —
      a trigger, so it refuses the service role too. Better the button
      explains itself than the operator meets HW020.
    */
    'actions', jsonb_build_object(
      'approve', v_pp.status = 'pending'
                 and coalesce(btrim((select coalesce(avatar_url, '') from profiles where id = v_pp.user_id)), '') <> '',
      'approve_blocked_reason', case
        when v_pp.status <> 'pending' then 'This application has already been decided.'
        when coalesce(btrim((select coalesce(avatar_url, '') from profiles where id = v_pp.user_id)), '') = ''
          then 'A profile photo is required before approval. The database refuses the change without one.'
        else null end,
      'reject', v_pp.status = 'pending',
      'request_info', v_pp.status = 'pending'
    )
  );
end $$;

revoke execute on function public.admin_helper_detail(uuid) from public;
grant execute on function public.admin_helper_detail(uuid) to authenticated;

-- -------------------------------------------------------------------------
-- 6. Owning, asking, noting.
-- -------------------------------------------------------------------------
create or replace function public.admin_assign_helper_review(
  p_provider_id uuid,
  p_owner_id uuid
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;

  update provider_profiles set review_owner_id = p_owner_id where user_id = p_provider_id;

  insert into helper_review_events (provider_id, kind, body, actor_id)
  values (p_provider_id, 'assigned',
          case when p_owner_id is null then 'Unassigned'
               else coalesce((select full_name from profiles where id = p_owner_id), 'a reviewer') end,
          auth.uid());
end $$;

create or replace function public.admin_request_helper_info(
  p_provider_id uuid,
  p_message text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_message, ''))) < 10 then
    raise exception 'Say what is needed — the applicant sees this message.' using errcode = 'HW042';
  end if;

  insert into helper_review_events (provider_id, kind, body, actor_id)
  values (p_provider_id, 'info_requested', btrim(p_message), auth.uid());

  -- The applicant is told. A question nobody is asked is not a question.
  insert into notifications (user_id, type, payload)
  values (p_provider_id, 'helper_info_requested', jsonb_build_object('message', btrim(p_message)));

  insert into audit_log (actor_id, action, target_table, target_id, payload)
  values (auth.uid(), 'helper.info_requested', 'provider_profiles', p_provider_id,
          jsonb_build_object('message', btrim(p_message)));
end $$;

create or replace function public.admin_add_helper_note(
  p_provider_id uuid,
  p_body text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_body, ''))) = 0 then
    raise exception 'A note needs some words in it.' using errcode = 'HW043';
  end if;

  insert into helper_review_events (provider_id, kind, body, actor_id)
  values (p_provider_id, 'note', btrim(p_body), auth.uid());
end $$;

revoke execute on function public.admin_assign_helper_review(uuid, uuid) from public;
revoke execute on function public.admin_request_helper_info(uuid, text) from public;
revoke execute on function public.admin_add_helper_note(uuid, text) from public;
grant execute on function public.admin_assign_helper_review(uuid, uuid) to authenticated;
grant execute on function public.admin_request_helper_info(uuid, text) to authenticated;
grant execute on function public.admin_add_helper_note(uuid, text) to authenticated;

-- -------------------------------------------------------------------------
-- 7. The guards, proven.
-- -------------------------------------------------------------------------
do $$
declare
  v_customer uuid;
  v_helper uuid;
  v_refused int := 0;
begin
  select id into v_customer from profiles where role = 'customer' limit 1;
  select user_id into v_helper from provider_profiles limit 1;
  if v_customer is null or v_helper is null then
    raise notice '0100: no fixtures to test the guards with; skipped.';
    return;
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_customer::text, 'role', 'authenticated',
                      'app_metadata', json_build_object('role', 'customer'))::text, true);

  begin perform admin_helper_queue(); exception when insufficient_privilege then v_refused := v_refused + 1; end;
  begin perform admin_helper_detail(v_helper); exception when insufficient_privilege then v_refused := v_refused + 1; end;
  begin perform admin_add_helper_note(v_helper, 'x'); exception when insufficient_privilege then v_refused := v_refused + 1; end;
  begin perform admin_assign_helper_review(v_helper, null); exception when insufficient_privilege then v_refused := v_refused + 1; end;

  perform set_config('request.jwt.claims', '', true);

  if v_refused <> 4 then
    raise exception '0100: a customer reached % of the four admin functions.', 4 - v_refused;
  end if;
end $$;
