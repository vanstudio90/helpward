-- CLASS: pre-deploy
-- =========================================================================
-- 0115 — recording a venue, and recording what it said
-- =========================================================================
/*
  WHAT MAKES THIS TABLE DIFFERENT FROM A SETTINGS SCREEN.

  checkVenue() reads these rows on every Wait in Line request, from the
  website and from the app. A row that says "refused" stops a booking
  being taken; a row that says "allowed" lets one through and tells the
  customer it is fine. So an edit here is not a preference — it changes
  what strangers are allowed to buy, and in one direction it changes
  what we have already told them.

  THE RULES, each because the opposite has a victim:

  1. A NEW VENUE KNOWS NOTHING. It is created with all four answers
     'unknown', never 'allowed'. Creating a venue is recording that a
     place exists; it is not a claim that somebody rang them up. The
     table already refuses a non-unknown answer without an attributed
     confirmation (0074's venues_confirmed_attribution) — this keeps
     the creation path from being the way round it.

  2. AN ANSWER NEEDS A SOURCE. Moving any field off 'unknown' requires
     who said so and how we know. "A permission with no evidence is
     somebody's memory of a phone call" is already printed on the
     screen; this is where it stops being advice.

  3. REFUSING A VENUE DOES NOT CANCEL ANYBODY'S BOOKING. It returns
     the count of open requests at that venue so operations can look at
     them. Silently cancelling work somebody has paid for, from a
     settings panel, is not a thing this console does — and neither is
     pretending the change has no consequences.

  4. A DUPLICATE IS WORSE THAN A MISSING ROW. lookup_venue() matches on
     the normalised name and takes the most recently confirmed row, so
     a second "Service Canada" in the same country silently shadows the
     first. Creating one is refused, with the existing row named.

  5. TWO PEOPLE EDITING ONE VENUE IS A CONFLICT, not a race. The
     caller passes the updated_at it was looking at, and a write
     against a moved row is refused rather than applied.
*/

/* ------------------------------------------------------------------ *
 * CREATE                                                              *
 * ------------------------------------------------------------------ */
create or replace function public.admin_venue_create(
  p_name    text,
  p_address text default null,
  p_city    text default null,
  p_region  text default null,
  p_country text default null,
  p_area_id text default null,
  p_notes   text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  v_id uuid;
  v_existing public.venues;
begin
  if not public.is_admin() then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'A venue needs a name — it is what the customer types.'
      using errcode = 'HW100';
  end if;
  if p_country is not null and p_country not in ('CA', 'US') then
    raise exception 'Country must be CA or US.' using errcode = 'HW101';
  end if;

  /* RULE 4. */
  select * into v_existing from public.venues
  where name_key = public.normalize_municipality(p_name)
    and (p_country is null or country is null or country = p_country)
  limit 1;
  if found then
    raise exception 'A venue matching that name already exists in this country (%, %). Edit that one instead — a second row would shadow it at booking time.',
      v_existing.name, coalesce(v_existing.city, 'no city recorded')
      using errcode = 'HW102';
  end if;

  /* RULE 1. Everything unknown, because nobody has asked yet. */
  insert into public.venues (name, address, city, region, country, area_id, notes,
                             substitutes_allowed, customer_may_replace,
                             full_party_required, numbers_transferable)
  values (trim(p_name), p_address, p_city, p_region, p_country, p_area_id, p_notes,
          'unknown', 'unknown', 'unknown', 'unknown')
  returning id into v_id;

  insert into public.audit_log (actor_id, action, target_table, target_id, payload, outcome)
  values (v_actor, 'venue.created', 'venues', v_id::text,
          jsonb_build_object('name', trim(p_name), 'city', p_city, 'country', p_country),
          'succeeded');

  return jsonb_build_object(
    'id', v_id,
    'permissions_recorded', false,
    'note', 'Created with every answer unknown. Requests at this venue still go ahead, with the customer told it is unverified.'
  );
end $$;

revoke all on function public.admin_venue_create(text, text, text, text, text, text, text) from public;
grant execute on function public.admin_venue_create(text, text, text, text, text, text, text) to authenticated;

/* ------------------------------------------------------------------ *
 * RECORD WHAT THE VENUE SAID                                          *
 * ------------------------------------------------------------------ */
create or replace function public.admin_venue_set_permissions(
  p_id        uuid,
  p_expected  timestamptz,
  p_substitutes_allowed   text,
  p_customer_may_replace  text,
  p_full_party_required   text,
  p_numbers_transferable  text,
  p_source    text,
  p_reason    text default null,
  p_early_turn_policy text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  v_v public.venues;
  v_changes jsonb := '[]'::jsonb;
  v_any_known boolean;
  v_open int;
  v_now timestamptz := clock_timestamp();
begin
  if not public.is_admin() then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;

  select * into v_v from public.venues where id = p_id for update;
  if not found then
    raise exception 'No such venue.' using errcode = 'HW103';
  end if;

  /* RULE 5. Millisecond precision, because a JS Date carries no more. */
  if p_expected is not null
     and date_trunc('milliseconds', v_v.updated_at) <> date_trunc('milliseconds', p_expected) then
    raise exception 'Somebody else changed this venue while you were editing it. Reload before saving.'
      using errcode = 'HW080';
  end if;

  if p_substitutes_allowed not in ('allowed', 'refused', 'unknown')
     or p_customer_may_replace not in ('allowed', 'refused', 'unknown')
     or p_full_party_required not in ('allowed', 'refused', 'unknown')
     or p_numbers_transferable not in ('allowed', 'refused', 'unknown') then
    raise exception 'An answer is allowed, refused, or unknown. Nothing else.'
      using errcode = 'HW104';
  end if;

  v_any_known := p_substitutes_allowed <> 'unknown'
    or p_customer_may_replace <> 'unknown'
    or p_full_party_required <> 'unknown'
    or p_numbers_transferable <> 'unknown';

  /*
    RULE 2. The missing source is checked first because it is the
    operator's own omission and they can fix it; a session with no
    verified identity is reported after, and separately.

    That second check also covers what the table already knew:
    venues_confirmed_attribution (0074) refuses a recorded answer with
    no confirmer, so an unidentified caller would otherwise hit a
    constraint violation — a 500 and a stack trace where the operator
    needed a sentence.
  */
  if v_any_known and coalesce(trim(p_source), '') = '' then
    raise exception 'Recording an answer needs a source: who told us, and how. An answer with no evidence is somebody''s memory of a phone call.'
      using errcode = 'HW105';
  end if;
  if v_any_known and v_actor is null then
    raise exception 'Recording an answer has to be attributable to the person who recorded it, and this session has no verified identity. Sign in again.'
      using errcode = 'HW107';
  end if;

  /* Only the fields that moved, with the value they moved from. */
  if v_v.substitutes_allowed::text <> p_substitutes_allowed then
    v_changes := v_changes || jsonb_build_object('field', 'Stand-ins allowed',
      'before', v_v.substitutes_allowed::text, 'after', p_substitutes_allowed);
  end if;
  if v_v.customer_may_replace::text <> p_customer_may_replace then
    v_changes := v_changes || jsonb_build_object('field', 'Customer may swap in',
      'before', v_v.customer_may_replace::text, 'after', p_customer_may_replace);
  end if;
  if v_v.full_party_required::text <> p_full_party_required then
    v_changes := v_changes || jsonb_build_object('field', 'Full party required',
      'before', v_v.full_party_required::text, 'after', p_full_party_required);
  end if;
  if v_v.numbers_transferable::text <> p_numbers_transferable then
    v_changes := v_changes || jsonb_build_object('field', 'Numbers transferable',
      'before', v_v.numbers_transferable::text, 'after', p_numbers_transferable);
  end if;
  if p_early_turn_policy is not null
     and coalesce(v_v.early_turn_policy, '') <> p_early_turn_policy then
    v_changes := v_changes || jsonb_build_object('field', 'Early turn policy',
      'before', coalesce(v_v.early_turn_policy, 'not recorded'), 'after', p_early_turn_policy);
  end if;

  if jsonb_array_length(v_changes) = 0 then
    raise exception 'Nothing changed.' using errcode = 'HW106';
  end if;

  update public.venues set
    substitutes_allowed  = p_substitutes_allowed::venue_permission,
    customer_may_replace = p_customer_may_replace::venue_permission,
    full_party_required  = p_full_party_required::venue_permission,
    numbers_transferable = p_numbers_transferable::venue_permission,
    early_turn_policy    = coalesce(p_early_turn_policy, early_turn_policy),
    notes                = case when coalesce(trim(p_source), '') = '' then notes
                                else trim(p_source) end,
    /* An attributed confirmation, or none at all. The table's own
       constraint refuses the half-way state. */
    confirmed_by = case when v_any_known then v_actor else null end,
    confirmed_at = case when v_any_known then v_now else null end,
    updated_at   = v_now
  where id = p_id;

  /*
    RULE 3. What this change touches, counted but NOT acted on.

    A request records its venue as free text in the intake, which is
    also how lookup_venue finds it — so the same normalisation answers
    "which open requests are at this venue".
  */
  select count(*) into v_open
  from public.requests r
  where r.service_id = 'wait-in-line'
    and r.status::text in ('pending', 'matched', 'accepted', 'scheduled')
    and public.normalize_municipality(coalesce(r.intake ->> 'venue_name', '')) = v_v.name_key;

  insert into public.audit_log
    (actor_id, action, target_table, target_id, payload, outcome, changes)
  values (
    v_actor, 'venue.permissions_recorded', 'venues', p_id::text,
    jsonb_build_object(
      'name', v_v.name, 'source', p_source, 'reason', p_reason,
      'open_requests_at_venue', v_open),
    'succeeded', v_changes
  );

  return jsonb_build_object(
    'fields_changed', jsonb_array_length(v_changes),
    'open_requests_at_venue', v_open,
    'confirmed', v_any_known,
    'updated_at', v_now,
    'note', case
      when v_open = 0 then 'No open request is waiting at this venue.'
      else format('%s open request(s) name this venue. Nothing has been cancelled and no money has moved — operations should look at them.', v_open)
    end
  );
end $$;

revoke all on function public.admin_venue_set_permissions(uuid, timestamptz, text, text, text, text, text, text, text) from public;
grant execute on function public.admin_venue_set_permissions(uuid, timestamptz, text, text, text, text, text, text, text) to authenticated;

/* ------------------------------------------------------------------ *
 * SELF-TEST                                                           *
 * ------------------------------------------------------------------ */
/* Rolled back in full, like 0113's — no row survives and nothing is
   deleted. The claim it signs with has no subject, so its events are
   the system's, never a person's. */
do $$
declare
  v_id uuid;
  v_r jsonb;
  v_updated timestamptz;
begin
  begin
    perform set_config('request.jwt.claims', '{"app_metadata":{"role":"admin"}}', true);

    /* RULE 1: a new venue knows nothing. */
    v_r := public.admin_venue_create('Selftest Hall', '1 Test St', 'Vancouver', 'BC', 'CA');
    v_id := (v_r ->> 'id')::uuid;
    if (v_r ->> 'permissions_recorded')::boolean then
      raise exception 'a new venue claimed to have permissions recorded';
    end if;
    if (select substitutes_allowed from public.venues where id = v_id) <> 'unknown' then
      raise exception 'a new venue was created with an answer nobody gave';
    end if;

    /* RULE 4: the second one is refused, and names the first. */
    begin
      perform public.admin_venue_create('selftest  hall', null, 'Vancouver', 'BC', 'CA');
      raise exception 'a shadowing duplicate was created';
    exception when sqlstate 'HW102' then
      if position('Selftest Hall' in sqlerrm) = 0 then
        raise exception 'the duplicate refusal did not name the existing venue: %', sqlerrm;
      end if;
    end;

    select updated_at into v_updated from public.venues where id = v_id;

    /* RULE 2: an answer with no source is refused. */
    begin
      perform public.admin_venue_set_permissions(
        v_id, v_updated, 'refused', 'unknown', 'unknown', 'unknown', '  ');
      raise exception 'an answer was recorded with no source';
    exception when sqlstate 'HW105' then
      null;
    end;

    /* Only 'unknown' everywhere needs no source — that is erasing a
       claim, not making one. */
    begin
      perform public.admin_venue_set_permissions(
        v_id, v_updated, 'unknown', 'unknown', 'unknown', 'unknown', '');
      raise exception 'a no-op change was accepted';
    exception when sqlstate 'HW106' then
      null;
    end;

    /* RULE 2's other half: nobody signed this session, so an answer
       cannot be attributed and is refused before the table's own
       constraint turns it into a 500. */
    begin
      perform public.admin_venue_set_permissions(
        v_id, v_updated, 'refused', 'unknown', 'unknown', 'unknown', 'Duty manager, by phone');
      raise exception 'an unattributable answer was recorded';
    exception when sqlstate 'HW107' then
      null;
    end;

    /* RULE 5: a stale token is refused. */
    begin
      perform public.admin_venue_set_permissions(
        v_id, v_updated - interval '1 second',
        'refused', 'unknown', 'unknown', 'unknown', 'Duty manager, by phone');
      raise exception 'a stale write was applied';
    exception when sqlstate 'HW080' then
      null;
    end;

    /*
      THE SUCCESSFUL WRITE, WITHOUT BORROWING A PERSON.

      The happy path for a RECORDED answer needs a real confirmer, and
      the only ids available here belong to real people — borrowing one
      is what put three events in production naming a customer who did
      nothing. So the write proven here changes a field that is not an
      answer: the rest of the path is identical, and nothing has to be
      attributed to anybody.
    */
    v_r := public.admin_venue_set_permissions(
      v_id, v_updated, 'unknown', 'unknown', 'unknown', 'unknown',
      '', 'Policy note taken from their website.', 'Numbers called from 9am');
    if (v_r ->> 'fields_changed')::int <> 1 then
      raise exception 'a one-field change recorded %', v_r ->> 'fields_changed';
    end if;
    if (v_r ->> 'confirmed')::boolean then
      raise exception 'a change that recorded no answer was marked confirmed';
    end if;
    if (select confirmed_at from public.venues where id = v_id) is not null then
      raise exception 'a venue with every answer unknown carries a confirmation';
    end if;

    /* RULE 3: the count is returned, and nothing was cancelled. */
    if (v_r ->> 'open_requests_at_venue') is null then
      raise exception 'the change did not say what it touches';
    end if;

    /* The event carries the field, with what it moved from. */
    if (select changes -> 0 ->> 'before' from public.audit_log
        where action = 'venue.permissions_recorded' and target_id = v_id::text
        order by id desc limit 1) <> 'not recorded' then
      raise exception 'the event did not record the value it moved from';
    end if;

    /* An answer outside the three states is refused. */
    select updated_at into v_updated from public.venues where id = v_id;
    begin
      perform public.admin_venue_set_permissions(
        v_id, v_updated, 'probably', 'unknown', 'unknown', 'unknown', 'a source');
      raise exception 'an invented permission state was accepted';
    exception when sqlstate 'HW104' then
      null;
    end;

    raise exception using errcode = 'HW999', message = 'self-test complete';
  exception
    when sqlstate 'HW999' then
      raise notice 'venue writes: unknown on creation, duplicates refused by name, answers need a source, stale writes refused, open requests counted not cancelled — and nothing left behind';
    when others then
      raise;
  end;
end $$;
