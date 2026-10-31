-- CLASS: pre-deploy
-- =========================================================================
-- 0080 — make each service's one-line definition match what it actually is
--
-- services.blurb is the single most reused string on the site: the
-- catalogue card, the meta description, the opening answer, the
-- schema.org Service description and the directory listing all read it.
-- An external content review found six where it promises something the
-- detailed scope on the same page then withdraws.
--
-- These are not stylistic. Each one produces a specific bad booking:
--
--   grocery-pickup       said we shop a list "at any store" and deliver
--                        "within an hour". The service collects a PREPAID,
--                        PACKED order. Someone books expecting a shop.
--   appliance-repair     said a "certified technician" "diagnoses and
--                        repairs", "most fixed same day". The booking buys
--                        a DIAGNOSIS; the repair is quoted afterwards, and
--                        the same page says specialist work needs a
--                        qualified trade — contradicting itself.
--   property-inspection  said a "verified inspector" produces a report for
--                        "due diligence". The page explicitly excludes
--                        technical and pre-purchase inspection, which is
--                        exactly what due diligence means to a buyer.
--   listening-service    offered "in-person or video". It is audio only.
--   sleep-call-companion offered "voice or video". It is audio only.
--   package-delivery     promised delivery "in under 90 minutes". Nothing
--                        measures or enforces that, and matching depends
--                        on a helper accepting at all.
--
-- The timing promises go rather than soften. "Under 90 minutes" is a
-- number a customer holds you to, and there have been no completed
-- bookings to derive one from.
--
-- NOTE FOR THE OWNER: "certified technician" and "verified inspector" are
-- removed because the same pages state the opposite. That is a different
-- decision from the screening claims you asked to keep — those describe
-- something you intend to do; these describe a qualification that
-- contradicts the scope beside it.
-- =========================================================================

update services set blurb =
  'Collect a grocery order you have already placed and paid for, and bring '
  || 'it to your door. Tell us the store, the branch and the collection '
  || 'reference. If you need someone to choose the items instead, book an errand.'
where id = 'grocery-pickup';

update services set blurb =
  'A visit to work out what is wrong with one appliance, and a written '
  || 'explanation of what repairing it would involve. Parts and the repair '
  || 'itself are quoted afterwards, so you decide once the fault is known.'
where id = 'appliance-repair';

update services set blurb =
  'A visit to a property with photographs and a written note of its '
  || 'condition on the day. A record of what was visible — not a technical, '
  || 'pre-purchase or licensed building inspection.'
where id = 'property-inspection';

update services set blurb =
  'An audio call with someone whose job is to listen, for the length you '
  || 'book. Voice only. No therapy and no advice — just somebody paying '
  || 'attention for as long as you need.'
where id = 'listening-service';

update services set blurb =
  'Quiet audio company while you fall asleep, ending at a time you set '
  || 'beforehand. Audio only, one person, nothing recorded.'
where id = 'sleep-call-companion';

update services set blurb =
  'One parcel collected and delivered across town — documents, a forgotten '
  || 'key, a gift. Say where it is going and who should receive it.'
where id = 'package-delivery';

-- The blurb promised a helmet outright while the booking form asks whether
-- one is needed. The form is right: a rider carries one spare, not two.
update services set blurb =
  'A ride across the city on the back of a licensed rider''s motorcycle, '
  || 'with a helmet provided if you ask for one. One passenger, one journey.'
where id = 'motorcycle-taxi';

-- -------------------------------------------------------------------------
-- Checks. A definition that re-acquires one of these contradicts the page
-- it sits on, so the migration fails rather than shipping it quietly.
-- -------------------------------------------------------------------------
do $$
declare r record; v_bad text := '';
begin
  for r in select id, blurb from services where active loop
    -- Scope and qualification claims the pages themselves contradict.
    if r.blurb ~* '(certified|verified)\s+(technician|inspector)' then
      v_bad := v_bad || format('%s: qualification claim; ', r.id);
    end if;
    -- Delivery-time promises nothing measures.
    if r.blurb ~* '(within an hour|under \d+ minutes|most fixed same day)' then
      v_bad := v_bad || format('%s: timing promise; ', r.id);
    end if;
    -- Video, on services that are audio only.
    -- Deliberately matches the bare word, including "no video": a
    -- definition that has to mention video at all is one a reader can
    -- misread. These services say "voice only" or "audio only" instead.
    if r.id in ('listening-service','sleep-call-companion') and r.blurb ~* 'video' then
      v_bad := v_bad || format('%s: offers video; ', r.id);
    end if;
  end loop;

  if v_bad <> '' then
    raise exception 'service definitions still contradict their scope — %', v_bad;
  end if;
  raise notice 'all active service definitions match their scope';
end $$;
