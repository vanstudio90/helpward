-- CLASS: pre-deploy
-- =========================================================================
-- 0113 — service changes are drafted, reviewed and published
-- =========================================================================
/*
  WHY A DRAFT AND NOT A SAVE BUTTON.

  Editing a service edits what every future customer is quoted. The
  console already says so — "Published changes apply to new quotes" —
  but until now the buttons were disabled, because writing straight
  through from a form is how somebody changes Maid Service's block
  price while meaning to change the blurb.

  So a change is a draft first. A draft holds only what the editor can
  change, it records what the live service looked like when the draft
  was STARTED, and publishing compares the two before it writes.

  THE RULES THIS ENCODES, each because getting it wrong costs money or
  trust:

  1. A DRAFT THAT WAS BUILT ON STALE VALUES IS NOT PUBLISHED. The
     draft keeps `based_on`: the live values it was started from. If
     the live service has moved since — somebody else published, or a
     price was changed by hand — publishing is refused and the refusal
     NAMES THE FIELD that moved. A last-write-wins save silently
     discards a colleague's work; a timestamp check only says
     "something changed". This says which, and the operator can decide.

  2. A MARKET IS NEVER PUBLISHED INTO A FALLBACK. If publishing would
     leave a live market without its own base price, it is refused.
     Falling back to the shared base is a price nobody chose for that
     country.

  3. VALIDATION IS THE DATABASE'S JOB, not the form's. A negative
     price, a time-priced service with no block size, a blank title —
     all refused here, where a script and a second console cannot get
     round them.

  4. PUBLISHING IS ONE TRANSACTION AND ONE STORY. The service row,
     the shared rule and the market prices move together or not at
     all, and every event written carries the same correlation id, so
     the audit log can show the whole publication as one action rather
     than six unrelated rows.

  5. A DRAFT IS NOT A SECOND SOURCE OF TRUTH. Nothing reads drafts to
     quote a customer. They are a staging area, and a published draft
     is closed rather than left to drift.
*/

create table if not exists public.service_drafts (
  id          uuid primary key default gen_random_uuid(),
  service_id  text not null references public.services(id) on delete cascade,
  market      text not null,
  /* Only the fields the editor can change, each one optional: a draft
     that touches the blurb says nothing about the price. */
  changes     jsonb not null default '{}'::jsonb,
  /* What the live service looked like when this draft was started. */
  based_on    jsonb not null default '{}'::jsonb,
  status      text not null default 'open',
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default clock_timestamp(),
  updated_at  timestamptz not null default clock_timestamp(),
  published_at timestamptz,
  published_by uuid references public.profiles(id) on delete set null,
  note        text,
  constraint service_drafts_market_check check (market in ('CA', 'US')),
  constraint service_drafts_status_check check (status in ('open', 'published', 'discarded'))
);

/* ONE OPEN DRAFT PER SERVICE AND MARKET. Two open drafts on the same
   thing is how one of them is published and the other quietly lost. */
create unique index if not exists service_drafts_one_open_idx
  on public.service_drafts (service_id, market) where status = 'open';

create index if not exists service_drafts_service_idx
  on public.service_drafts (service_id, status);

alter table public.service_drafts enable row level security;

drop policy if exists service_drafts_admin on public.service_drafts;
create policy service_drafts_admin on public.service_drafts
  for select using (public.is_admin());

revoke all on public.service_drafts from anon, authenticated;
grant select on public.service_drafts to authenticated;

comment on table public.service_drafts is
  'Staged, unpublished changes to a service. Never read when quoting a customer.';

/* ------------------------------------------------------------------ *
 * WHAT THE LIVE SERVICE LOOKS LIKE RIGHT NOW                          *
 * ------------------------------------------------------------------ */
/*
  One shape, used by three callers: starting a draft records it,
  publishing compares against it, and the console shows the difference.
  Keeping it in one function means the comparison cannot drift from
  what was recorded.
*/
create or replace function public.service_live_values(p_service text, p_market text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'title',               s.title,
    'blurb',               s.blurb,
    'tagline',             s.tagline,
    'eta_label',           s.eta_label,
    'image_url',           s.image_url,
    'active',              s.active,
    'shared_base_cents',   s.base_price_cents,
    'included_minutes',    r.included_minutes,
    'extra_block_minutes', r.extra_block_minutes,
    'shared_block_cents',  r.extra_block_cents,
    'included_units',      r.included_units,
    'base_price_cents',    c.base_price_cents,
    'extra_block_cents',   c.extra_block_cents,
    'per_extra_unit_cents', c.per_extra_unit_cents,
    'per_extra_crew_cents', c.per_extra_crew_cents
  ))
  from public.services s
  left join public.service_pricing r on r.service_id = s.id
  left join public.service_country_pricing c
    on c.service_id = s.id and c.country = p_market
  where s.id = p_service;
$$;

revoke all on function public.service_live_values(text, text) from public;
grant execute on function public.service_live_values(text, text) to authenticated, service_role;

/* ------------------------------------------------------------------ *
 * VALIDATION                                                          *
 * ------------------------------------------------------------------ */
/*
  Returns an array of complaints. Empty means publishable. It takes the
  MERGED values — live with the draft applied — because a draft is only
  ever valid in combination with what it does not touch.
*/
create or replace function public.service_draft_problems(p_merged jsonb)
returns text[]
language plpgsql
immutable
as $$
declare
  v_problems text[] := '{}';
  v_key text;
begin
  if coalesce(trim(p_merged ->> 'title'), '') = '' then
    v_problems := array_append(v_problems, 'The title cannot be empty.');
  end if;

  /* No negative money, anywhere. */
  foreach v_key in array array[
    'base_price_cents', 'extra_block_cents', 'per_extra_unit_cents',
    'per_extra_crew_cents', 'shared_base_cents', 'shared_block_cents'
  ] loop
    if (p_merged ? v_key) and (p_merged ->> v_key) ~ '^-' then
      v_problems := array_append(v_problems, format('%s cannot be negative.', v_key));
    end if;
  end loop;

  /* A market with no price of its own would fall back to a number
     nobody chose for that country. */
  if coalesce(p_merged ->> 'active', 'false')::boolean
     and (p_merged ->> 'base_price_cents') is null then
    v_problems := array_append(v_problems, 'This market has no base price of its own, so bookings would fall back to the shared price.');
  end if;

  /* Time-priced work needs a block size, or the extra time is free. */
  if (p_merged ->> 'included_minutes') is not null
     and (p_merged ->> 'extra_block_minutes') is null then
    v_problems := array_append(v_problems, 'Included time is set but the block size is not, so time beyond it would cost nothing.');
  end if;
  if (p_merged ->> 'extra_block_minutes') is not null
     and coalesce((p_merged ->> 'extra_block_minutes')::int, 0) <= 0 then
    v_problems := array_append(v_problems, 'The block size must be more than zero minutes.');
  end if;

  return v_problems;
end $$;

/* ------------------------------------------------------------------ *
 * SAVE A DRAFT                                                        *
 * ------------------------------------------------------------------ */
create or replace function public.admin_service_draft_save(
  p_service text,
  p_market  text,
  p_changes jsonb,
  p_note    text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  v_live jsonb;
  v_draft public.service_drafts;
  v_clean jsonb := '{}'::jsonb;
  v_key text;
begin
  if not public.is_admin() then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;

  select public.service_live_values(p_service, p_market) into v_live;
  if v_live is null then
    raise exception 'No such service: %', p_service using errcode = 'HW090';
  end if;

  /*
    A CHANGE THAT CHANGES NOTHING IS NOT A CHANGE. Dropping fields
    equal to the live value keeps the "unpublished changes" list
    honest — otherwise opening a form and saving it records a dozen
    changes nobody made.
  */
  for v_key in select jsonb_object_keys(p_changes) loop
    if (p_changes -> v_key) is distinct from (v_live -> v_key) then
      v_clean := v_clean || jsonb_build_object(v_key, p_changes -> v_key);
    end if;
  end loop;

  select * into v_draft from public.service_drafts
  where service_id = p_service and market = p_market and status = 'open';

  if found then
    update public.service_drafts
    set changes = v_clean,
        note = coalesce(p_note, note),
        updated_at = clock_timestamp()
    where id = v_draft.id
    returning * into v_draft;
  else
    insert into public.service_drafts (service_id, market, changes, based_on, created_by, note)
    values (p_service, p_market, v_clean, v_live, v_actor, p_note)
    returning * into v_draft;
  end if;

  insert into public.audit_log (actor_id, action, target_table, target_id, payload, outcome, changes)
  values (
    v_actor, 'service.draft_saved', 'services', p_service,
    jsonb_build_object('market', p_market, 'draft_id', v_draft.id, 'fields', jsonb_object_keys_array(v_clean)),
    'submitted',
    (select coalesce(jsonb_agg(jsonb_build_object(
       'field', k,
       'before', v_draft.based_on ->> k,
       'after', v_clean ->> k)), '[]'::jsonb)
     from jsonb_object_keys(v_clean) k)
  );

  return jsonb_build_object(
    'draft_id', v_draft.id,
    'changed_fields', (select count(*) from jsonb_object_keys(v_clean)),
    'updated_at', v_draft.updated_at
  );
end $$;

/* A small helper the payload above wants; kept separate so the insert
   stays readable. */
create or replace function public.jsonb_object_keys_array(p jsonb)
returns text[]
language sql
immutable
as $$ select coalesce(array(select jsonb_object_keys(p)), '{}'::text[]) $$;

revoke all on function public.admin_service_draft_save(text, text, jsonb, text) from public;
grant execute on function public.admin_service_draft_save(text, text, jsonb, text) to authenticated;

/* ------------------------------------------------------------------ *
 * PUBLISH A DRAFT                                                     *
 * ------------------------------------------------------------------ */
create or replace function public.admin_service_draft_publish(p_draft uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  v_draft public.service_drafts;
  v_live jsonb;
  v_merged jsonb;
  v_problems text[];
  v_stale text[] := '{}';
  v_key text;
  v_changes jsonb;
  v_corr text;
begin
  if not public.is_admin() then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;

  select * into v_draft from public.service_drafts where id = p_draft for update;
  if not found then
    raise exception 'No such draft.' using errcode = 'HW091';
  end if;
  if v_draft.status <> 'open' then
    raise exception 'This draft was already %.', v_draft.status using errcode = 'HW092';
  end if;
  if v_draft.changes = '{}'::jsonb then
    raise exception 'This draft changes nothing.' using errcode = 'HW093';
  end if;

  v_live := public.service_live_values(v_draft.service_id, v_draft.market);

  /*
    RULE 1. Only the fields this draft TOUCHES are checked for staleness.
    A colleague editing the blurb while you edit the price is not a
    conflict, and refusing it would teach people to republish blindly.
    A field you are about to overwrite that has moved underneath you IS
    a conflict, and the refusal names it.
  */
  for v_key in select jsonb_object_keys(v_draft.changes) loop
    if (v_live -> v_key) is distinct from (v_draft.based_on -> v_key) then
      v_stale := array_append(v_stale, format('%s is now %s, not %s as when this draft was started',
        v_key,
        coalesce(v_live ->> v_key, 'unset'),
        coalesce(v_draft.based_on ->> v_key, 'unset')));
    end if;
  end loop;
  if array_length(v_stale, 1) > 0 then
    raise exception 'The live service changed since this draft was started: %',
      array_to_string(v_stale, '; ') using errcode = 'HW094';
  end if;

  v_merged := v_live || v_draft.changes;

  /* RULE 3. The database refuses what the form might not. */
  v_problems := public.service_draft_problems(v_merged);
  if array_length(v_problems, 1) > 0 then
    raise exception 'This draft cannot be published: %',
      array_to_string(v_problems, ' ') using errcode = 'HW095';
  end if;

  /* RULE 4. Everything moves together, inside this one transaction. */
  update public.services set
    title            = coalesce(v_draft.changes ->> 'title', title),
    blurb            = case when v_draft.changes ? 'blurb' then v_draft.changes ->> 'blurb' else blurb end,
    tagline          = case when v_draft.changes ? 'tagline' then v_draft.changes ->> 'tagline' else tagline end,
    eta_label        = case when v_draft.changes ? 'eta_label' then v_draft.changes ->> 'eta_label' else eta_label end,
    image_url        = case when v_draft.changes ? 'image_url' then v_draft.changes ->> 'image_url' else image_url end,
    active           = coalesce((v_draft.changes ->> 'active')::boolean, active),
    base_price_cents = coalesce((v_draft.changes ->> 'shared_base_cents')::int, base_price_cents)
  where id = v_draft.service_id;

  if v_draft.changes ?| array['included_minutes', 'extra_block_minutes', 'shared_block_cents', 'included_units'] then
    update public.service_pricing set
      included_minutes    = coalesce((v_draft.changes ->> 'included_minutes')::int, included_minutes),
      extra_block_minutes = coalesce((v_draft.changes ->> 'extra_block_minutes')::int, extra_block_minutes),
      extra_block_cents   = coalesce((v_draft.changes ->> 'shared_block_cents')::int, extra_block_cents),
      included_units      = coalesce((v_draft.changes ->> 'included_units')::int, included_units),
      updated_at          = clock_timestamp()
    where service_id = v_draft.service_id;
  end if;

  if v_draft.changes ?| array['base_price_cents', 'extra_block_cents', 'per_extra_unit_cents', 'per_extra_crew_cents'] then
    insert into public.service_country_pricing as c
      (service_id, country, base_price_cents, extra_block_cents, per_extra_unit_cents, per_extra_crew_cents)
    values (
      v_draft.service_id, v_draft.market,
      (v_merged ->> 'base_price_cents')::int,
      (v_merged ->> 'extra_block_cents')::int,
      (v_merged ->> 'per_extra_unit_cents')::int,
      (v_merged ->> 'per_extra_crew_cents')::int
    )
    on conflict (service_id, country) do update set
      base_price_cents     = excluded.base_price_cents,
      extra_block_cents    = excluded.extra_block_cents,
      per_extra_unit_cents = excluded.per_extra_unit_cents,
      per_extra_crew_cents = excluded.per_extra_crew_cents;
  end if;

  update public.service_drafts
  set status = 'published', published_at = clock_timestamp(),
      published_by = v_actor, updated_at = clock_timestamp()
  where id = v_draft.id;

  /*
    ONE EVENT, EVERY FIELD. The before is the value this draft was
    built on — which, rule 1 having passed, is also the value that was
    live a moment ago.
  */
  select coalesce(jsonb_agg(jsonb_build_object(
      'field', k,
      'before', v_draft.based_on ->> k,
      'after', v_draft.changes ->> k) order by k), '[]'::jsonb)
  into v_changes
  from jsonb_object_keys(v_draft.changes) k;

  v_corr := 'draft:' || v_draft.id::text;

  insert into public.audit_log
    (actor_id, action, target_table, target_id, payload, outcome, correlation_id, changes)
  values (
    v_actor, 'service.published', 'services', v_draft.service_id,
    jsonb_build_object('market', v_draft.market, 'draft_id', v_draft.id),
    'succeeded', v_corr, v_changes
  );

  return jsonb_build_object(
    'service_id', v_draft.service_id,
    'market', v_draft.market,
    'fields_published', jsonb_array_length(v_changes),
    'correlation_id', v_corr
  );
end $$;

revoke all on function public.admin_service_draft_publish(uuid) from public;
grant execute on function public.admin_service_draft_publish(uuid) to authenticated;

/* ------------------------------------------------------------------ *
 * DISCARD A DRAFT                                                     *
 * ------------------------------------------------------------------ */
/* Discarding keeps the row. Deleting it would remove the only record
   that somebody prepared a change and thought better of it. */
create or replace function public.admin_service_draft_discard(p_draft uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  v_draft public.service_drafts;
begin
  if not public.is_admin() then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'A reason is required to discard a draft.' using errcode = 'HW096';
  end if;

  update public.service_drafts
  set status = 'discarded', note = p_reason, updated_at = clock_timestamp()
  where id = p_draft and status = 'open'
  returning * into v_draft;
  if not found then
    raise exception 'No open draft with that id.' using errcode = 'HW091';
  end if;

  insert into public.audit_log
    (actor_id, action, target_table, target_id, payload, outcome, correlation_id)
  values (
    v_actor, 'service.draft_discarded', 'services', v_draft.service_id,
    jsonb_build_object('market', v_draft.market, 'draft_id', v_draft.id, 'reason', p_reason),
    'succeeded', 'draft:' || v_draft.id::text
  );

  return jsonb_build_object('draft_id', v_draft.id);
end $$;

revoke all on function public.admin_service_draft_discard(uuid, text) from public;
grant execute on function public.admin_service_draft_discard(uuid, text) to authenticated;

/* ------------------------------------------------------------------ *
 * SELF-TEST                                                           *
 * ------------------------------------------------------------------ */
/*
  THE TEST LEAVES NOTHING BEHIND, AND NOT BY DELETING ANYTHING.

  A self-test that writes rows and then tidies up has to delete from
  audit_log, which is the one table nothing may delete from — and an
  earlier self-test in this project borrowed a real customer's id as
  its actor and left three events naming somebody who did nothing. So
  this one runs inside a subtransaction that is ALWAYS rolled back:
  every row it writes disappears, including its audit events, and no
  delete is ever issued. It also signs its work as nobody — the claim
  it sets has no subject — so the events it writes while running are
  attributed to the system rather than to a person.
*/
do $$
declare
  v_draft uuid;
  v_result jsonb;
  v_count int;
  v_title text;
  v_price int;
  v_changes jsonb;
begin
  begin
    perform set_config('request.jwt.claims',
      '{"app_metadata":{"role":"admin"}}', true);

    insert into public.services (id, category_id, title, blurb, base_price_cents, active, countries)
    values ('__selftest_svc__',
            (select id from public.service_categories order by id limit 1),
            'Self test', 'before', 5000, true, array['CA']::country[]);
    insert into public.service_pricing (service_id, included_minutes, extra_block_minutes, extra_block_cents)
    values ('__selftest_svc__', 60, 15, 1000);
    insert into public.service_country_pricing (service_id, country, base_price_cents, extra_block_cents)
    values ('__selftest_svc__', 'CA', 5500, 1100);

    /* A change that changes nothing is not recorded as a change. */
    v_result := public.admin_service_draft_save('__selftest_svc__', 'CA',
      jsonb_build_object('title', 'Self test'));
    if (v_result ->> 'changed_fields')::int <> 0 then
      raise exception 'a no-op edit was recorded as a change';
    end if;

    /* A real edit is. */
    v_result := public.admin_service_draft_save('__selftest_svc__', 'CA',
      jsonb_build_object('title', 'Self test renamed', 'base_price_cents', 6000));
    v_draft := (v_result ->> 'draft_id')::uuid;
    if (v_result ->> 'changed_fields')::int <> 2 then
      raise exception 'a two-field edit recorded % fields', v_result ->> 'changed_fields';
    end if;

    /* Saving again replaces the open draft rather than opening a second. */
    perform public.admin_service_draft_save('__selftest_svc__', 'CA',
      jsonb_build_object('title', 'Self test renamed'));
    select count(*) into v_count from public.service_drafts
    where service_id = '__selftest_svc__' and status = 'open';
    if v_count <> 1 then
      raise exception 'saving twice left % open drafts', v_count;
    end if;

    /* RULE 1: a field that moved underneath the draft blocks publishing,
       and the refusal names it. */
    update public.services set title = 'Changed by somebody else' where id = '__selftest_svc__';
    begin
      perform public.admin_service_draft_publish(v_draft);
      raise exception 'a stale draft was published';
    exception when sqlstate 'HW094' then
      if position('title' in sqlerrm) = 0 then
        raise exception 'the staleness refusal did not name the field: %', sqlerrm;
      end if;
    end;

    /* A field the draft does NOT touch moving is not a conflict. */
    update public.services set title = 'Self test' where id = '__selftest_svc__';
    perform public.admin_service_draft_save('__selftest_svc__', 'CA',
      jsonb_build_object('base_price_cents', 6000));
    select id into v_draft from public.service_drafts
    where service_id = '__selftest_svc__' and status = 'open';
    update public.services set blurb = 'somebody edited the blurb' where id = '__selftest_svc__';

    /* RULE 3: validation refuses a live market with no price of its own. */
    begin
      perform public.admin_service_draft_save('__selftest_svc__', 'CA',
        jsonb_build_object('base_price_cents', null));
      perform public.admin_service_draft_publish(
        (select id from public.service_drafts where service_id = '__selftest_svc__' and status = 'open'));
      raise exception 'a market with no base price was published';
    exception when sqlstate 'HW095' then
      null;
    end;

    /* RULE 4: a real publication moves the row and records every field. */
    perform public.admin_service_draft_save('__selftest_svc__', 'CA',
      jsonb_build_object('base_price_cents', 6000, 'extra_block_cents', 1200));
    select id into v_draft from public.service_drafts
    where service_id = '__selftest_svc__' and status = 'open';
    v_result := public.admin_service_draft_publish(v_draft);

    select base_price_cents into v_price from public.service_country_pricing
    where service_id = '__selftest_svc__' and country = 'CA';
    if v_price <> 6000 then
      raise exception 'publishing did not apply the price: %', v_price;
    end if;

    select changes into v_changes from public.audit_log
    where action = 'service.published' and target_id = '__selftest_svc__'
    order by id desc limit 1;
    if jsonb_array_length(coalesce(v_changes, '[]'::jsonb)) <> 2 then
      raise exception 'the publication event recorded % fields', jsonb_array_length(coalesce(v_changes, '[]'::jsonb));
    end if;
    if (v_changes -> 0 ->> 'before') = (v_changes -> 0 ->> 'after') then
      raise exception 'the publication event lists a field that did not move';
    end if;

    /* The published draft is closed, not left to drift. */
    select count(*) into v_count from public.service_drafts
    where service_id = '__selftest_svc__' and status = 'open';
    if v_count <> 0 then
      raise exception 'the draft stayed open after publishing';
    end if;

    /* Publishing it twice is refused. */
    begin
      perform public.admin_service_draft_publish(v_draft);
      raise exception 'a published draft was published again';
    exception when sqlstate 'HW092' then
      null;
    end;

    /* Discarding needs a reason. */
    perform public.admin_service_draft_save('__selftest_svc__', 'CA',
      jsonb_build_object('title', 'to be discarded'));
    select id into v_draft from public.service_drafts
    where service_id = '__selftest_svc__' and status = 'open';
    begin
      perform public.admin_service_draft_discard(v_draft, '   ');
      raise exception 'a draft was discarded without a reason';
    exception when sqlstate 'HW096' then
      null;
    end;
    perform public.admin_service_draft_discard(v_draft, 'not going ahead');
    select title into v_title from public.services where id = '__selftest_svc__';
    if v_title <> 'Self test' then
      raise exception 'discarding changed the live service';
    end if;

    /* Everything above now disappears. */
    raise exception using errcode = 'HW999', message = 'self-test complete';
  exception
    when sqlstate 'HW999' then
      raise notice 'service drafts: no-op edits, staleness by field, validation, publication, double-publish and discard all behave — and nothing was left behind';
    when others then
      raise;
  end;
end $$;
