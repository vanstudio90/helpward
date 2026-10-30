-- CLASS: pre-deploy
-- =========================================================================
-- 0082 — a short line for every service
--
-- The catalogue card shows a photo, a title and one line. `blurb` is a
-- full sentence written for a service PAGE — "A visit to work out what is
-- wrong with one appliance, with a written finding and a quote for the
-- repair" — and in a card half a screen wide it clips mid-thought.
--
-- A tagline is not a shortened blurb. It answers one question, in the
-- words a customer would use: what is this?
--
-- IN THE DATABASE, not in the app. Two apps and a website read this
-- catalogue; a Swift copy of 27 lines would be a second source of truth
-- for copy, and copy drifts faster than code.
--
-- ACCURACY RULES, inherited from lib/service-copy.ts because this is the
-- same kind of promise:
--   * never assert a timeframe, guarantee or check the platform does not
--     perform — matching depends on a helper accepting;
--   * no prices, which go stale the first time the rate card moves;
--   * say what the booking IS, not how good it is.
-- =========================================================================

alter table services add column if not exists tagline text;

comment on column services.tagline is
  'One short line for a catalogue card — under 40 characters. Not a shortened blurb: it answers "what is this?" in a customer''s own words. No prices, no timeframes, no guarantees.';

update services set tagline = v.tagline
  from (values
    ('appliance-repair',     'Help with a broken appliance'),
    ('car-battery-jump',     'Help for a flat battery'),
    ('date-companion',       'A plus-one for the evening'),
    ('designated-driver',    'A helper drives your car'),
    ('dog-walking',          'A walk for your dog'),
    ('elder-assistance',     'Company and help for seniors'),
    ('errand-runner',        'Your errands, run for you'),
    ('event-companion',      'A plus-one for your event'),
    ('family-standin',       'A stand-in for the day'),
    ('furniture-assembly',   'Put it together'),
    ('grocery-pickup',       'Your grocery order, collected'),
    ('house-check-in',       'Someone checks on your home'),
    ('listening-service',    'Someone to talk to'),
    ('maid-service',         'Help around your home'),
    ('motorcycle-taxi',      'A ride across the city'),
    ('moving-help',          'Lifting and loading help'),
    ('package-delivery',     'Send something across town'),
    ('package-return',       'Returns dropped off for you'),
    ('professional-cuddler', 'Platonic comforting company'),
    ('property-inspection',  'A visit with a written report'),
    ('rent-a-friend',        'A friendly local to hang out'),
    ('shopping-companion',   'A second opinion while you shop'),
    ('sleep-call-companion', 'Quiet company as you fall asleep'),
    ('tech-setup',           'Your new device, set up'),
    ('tv-mounting',          'Your TV on the wall'),
    ('wait-in-line',         'Someone waits in line for you'),
    ('wedding-guest',        'A guest to fill a seat')
  ) as v(id, tagline)
 where services.id = v.id;

-- Every ACTIVE service must have one: a card with a blank line under the
-- title looks broken, and the fallback is the clipped blurb this replaces.
do $$
declare v_missing int;
begin
  select count(*) into v_missing
    from services where active and (tagline is null or btrim(tagline) = '');
  if v_missing > 0 then
    raise exception 'ERROR: % active service(s) have no tagline', v_missing;
  end if;
end $$;

-- Length is the whole point. 40 characters is what fits beside a chevron
-- in half a phone's width without shrinking.
do $$
declare r record;
begin
  for r in select id, tagline from services where length(tagline) > 40 loop
    raise exception 'ERROR: tagline for % is % chars (max 40): %',
      r.id, length(r.tagline), r.tagline;
  end loop;
end $$;
