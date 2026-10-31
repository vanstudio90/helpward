-- CLASS: pre-deploy
-- =========================================================================
-- 0076 — rate card v1, both markets
--
-- Applies the 28 October 2026 commercial proposal. Prices become local
-- amounts per market rather than one number wearing two currency symbols.
--
-- SAFE TO REPRICE RIGHT NOW. There are zero bookings, so no accepted
-- contract exists whose agreed price could be disturbed. That will not be
-- true again: once a booking is accepted its subtotal is fixed at
-- acceptance, and a later catalogue edit must never reach back into it.
--
-- WHAT THIS MIGRATION DOES NOT DO, stated plainly because the proposal
-- warns against pretending otherwise:
--
--   * Crew multiplication. Moving Help, Maid Service and Wedding Guest
--     should be rate x people x hours. The schema expresses "base + a flat
--     amount per extra helper", which is a different sum, and the proposal
--     is explicit that a team of four is not one provider earning the
--     whole 80%. Their BASE here is the stated minimum for ONE person;
--     multi-person jobs still price wrongly and need schema work.
--   * Distance formulas. Designated Driver, Package Delivery, Package
--     Return and Grocery Pickup should quote from road distance and route
--     time. Only their minimum fare is encoded.
--   * The dog-walk duration menu. 30/45/60 minutes with a different
--     extra-dog charge at each length is not a uniform block, so the
--     closest uniform block is used and the 60-minute US price lands at
--     $41 against the proposal's $40.
--   * The appliance diagnostic credit, and TV size/wall add-ons.
--
-- Those are listed in the deferred-work notice at the end so the gap is
-- recorded in the schema rather than in somebody's memory.
-- =========================================================================

-- -------------------------------------------------------------------------
-- Per-country money for units and crew.
--
-- service_country_pricing could override the base and the time block only,
-- so an extra dog cost the same number in both currencies. The proposal
-- prices an extra dog at US$8 and CA$10, which the table could not say.
-- -------------------------------------------------------------------------
alter table public.service_country_pricing
  add column if not exists per_extra_unit_cents int check (per_extra_unit_cents >= 0),
  add column if not exists per_extra_crew_cents int check (per_extra_crew_cents >= 0);

create or replace function public.price_service_cents(
  p_service_id text,
  p_intake     jsonb
) returns int
language plpgsql stable security definer set search_path = public as $$
declare
  v_base int;
  v_rule service_pricing%rowtype;
  v_country text;
  v_cp service_country_pricing%rowtype;
  v_extra_block int;
  v_unit_cents int;
  v_crew_cents int;
  v_total int;
  v_minutes int;
  v_blocks int;
  v_units int;
  v_crew int;
begin
  select base_price_cents into v_base from services where id = p_service_id and active;
  if v_base is null then
    raise exception 'Service % is not available', p_service_id;
  end if;

  v_country := nullif(trim(coalesce(p_intake ->> '_country', '')), '');
  if v_country is not null then
    select * into v_cp from service_country_pricing
     where service_id = p_service_id and country = v_country;
    if found then
      v_base := v_cp.base_price_cents;
    end if;
  end if;

  select * into v_rule from service_pricing where service_id = p_service_id;
  if not found then
    return v_base;
  end if;

  -- Country money where given, the service's own rule otherwise.
  v_extra_block := coalesce(v_cp.extra_block_cents, v_rule.extra_block_cents);
  v_unit_cents  := coalesce(v_cp.per_extra_unit_cents, v_rule.per_extra_unit_cents);
  v_crew_cents  := coalesce(v_cp.per_extra_crew_cents, v_rule.per_extra_crew_cents);

  v_total := v_base;

  if v_rule.included_minutes is not null then
    v_minutes := nullif(trim(coalesce(p_intake ->> v_rule.duration_field, '')), '')::int;
    if v_minutes is not null and v_minutes > v_rule.included_minutes then
      v_blocks := ceil(
        (v_minutes - v_rule.included_minutes)::numeric / v_rule.extra_block_minutes
      );
      v_total := v_total + (v_blocks * v_extra_block);
    end if;
  end if;

  if v_rule.unit_field is not null then
    v_units := nullif(trim(coalesce(p_intake ->> v_rule.unit_field, '')), '')::int;
    if v_units is not null and v_units > v_rule.included_units then
      v_total := v_total + ((v_units - v_rule.included_units) * v_unit_cents);
    end if;
  end if;

  if v_rule.crew_field is not null then
    v_crew := nullif(trim(coalesce(p_intake ->> v_rule.crew_field, '')), '')::int;
    if v_crew is not null and v_crew > v_rule.included_crew then
      v_total := v_total + ((v_crew - v_rule.included_crew) * v_crew_cents);
    end if;
  end if;

  return v_total;
end;
$$;

revoke execute on function public.price_service_cents(text, jsonb) from public, anon;
grant execute on function public.price_service_cents(text, jsonb) to authenticated, service_role;

-- -------------------------------------------------------------------------
-- The structure of each price: what the base covers, and what a further
-- block buys. Country-agnostic — a minimum of two hours is two hours in
-- both markets; only the money differs, and that lives in the table below.
--
-- READ THE BASES AS rate x minimum. The proposal quotes hourly rates with
-- minimums ("US$45 per companion-hour, two hours"), so the base is $90,
-- not $45. An hourly service with a two-hour minimum does not start at one
-- hour's total, and encoding $45 would have halved every social booking.
-- -------------------------------------------------------------------------
insert into service_pricing (service_id, included_minutes, extra_block_minutes,
                             extra_block_cents, duration_field,
                             unit_field, included_units, per_extra_unit_cents,
                             crew_field, included_crew, per_extra_crew_cents)
values
  -- Hourly work, 15-minute blocks after the minimum.
  ('errand-runner',       60,  15,  875, 'duration_min', null, 1, null, null, 1, null),
  ('furniture-assembly',  60,  15, 1375, 'duration_min', null, 1, null, null, 1, null),
  ('tech-setup',          60,  15, 1875, 'duration_min', null, 1, null, null, 1, null),
  ('house-check-in',      30,  15, 1500, 'duration_min', null, 1, null, null, 1, null),
  -- Social and companionship work, 30-minute blocks.
  ('date-companion',     120,  30, 2250, 'duration_min', null, 1, null, null, 1, null),
  ('event-companion',    180,  30, 2500, 'duration_min', null, 1, null, null, 1, null),
  ('family-standin',     180,  30, 5000, 'duration_min', null, 1, null, null, 1, null),
  ('rent-a-friend',      120,  30, 1750, 'duration_min', null, 1, null, null, 1, null),
  ('shopping-companion', 120,  30, 1750, 'duration_min', null, 1, null, null, 1, null),
  ('elder-assistance',   120,  30, 1900, 'duration_min', null, 1, null, null, 1, null),
  ('wedding-guest',      180,  30, 2250, 'duration_min', null, 1, null, null, 1, null),
  ('maid-service',       120,  30, 2000, 'duration_min', null, 1, null, 'crew_size', 1, 8000),
  ('moving-help',        120,  15, 1250, 'duration_min', null, 1, null, 'crew_size', 1, 10000),
  -- Remote sessions, sold as a booked block.
  ('listening-service',   30,  30, 1500, 'duration_min', null, 1, null, null, 1, null),
  ('sleep-call-companion',60,  30, 1500, 'duration_min', null, 1, null, null, 1, null),
  -- Dog walking: a 15-minute block is the closest uniform approximation of
  -- the proposal's 30/45/60 menu. 45 minutes lands exactly; 60 lands at
  -- US$41 against the proposed US$40.
  ('dog-walking',         30,  15,  800, 'duration_min', 'dog_count', 1, 800, null, 1, null),
  -- Parcels over the included three.
  ('package-return',    null,null, null, 'duration_min', 'parcel_count', 3, 300, null, 1, null)
on conflict (service_id) do update set
  included_minutes     = excluded.included_minutes,
  extra_block_minutes  = excluded.extra_block_minutes,
  extra_block_cents    = excluded.extra_block_cents,
  duration_field       = excluded.duration_field,
  unit_field           = excluded.unit_field,
  included_units       = excluded.included_units,
  per_extra_unit_cents = excluded.per_extra_unit_cents,
  crew_field           = excluded.crew_field,
  included_crew        = excluded.included_crew,
  per_extra_crew_cents = excluded.per_extra_crew_cents,
  updated_at           = now();

-- A passenger surcharge inside a vehicle's legal capacity charges for a
-- seat that costs the driver nothing. The proposal rejects it outright.
delete from service_pricing where service_id = 'designated-driver';

-- -------------------------------------------------------------------------
-- The money, per market. Every figure is a service subtotal BEFORE the
-- flat service fee, tax, approved expenses and any tip.
--
-- USD and CAD are independent local prices, not an exchange-rate
-- conversion of one another.
-- -------------------------------------------------------------------------
insert into service_country_pricing
  (service_id, country, base_price_cents, extra_block_cents,
   per_extra_unit_cents, per_extra_crew_cents)
values
  ('designated-driver',    'US',  6000, null, null,  null),
  ('designated-driver',    'CA',  6500, null, null,  null),
  ('car-battery-jump',     'US',  6500, null, null,  null),
  ('car-battery-jump',     'CA',  8000, null, null,  null),
  ('grocery-pickup',       'US',  2000, null, null,  null),
  ('grocery-pickup',       'CA',  2500, null, null,  null),
  ('errand-runner',        'US',  3500,  875, null,  null),
  ('errand-runner',        'CA',  4000, 1000, null,  null),
  ('package-delivery',     'US',  2000, null, null,  null),
  ('package-delivery',     'CA',  2500, null, null,  null),
  ('package-return',       'US',  2500, null,  300,  null),
  ('package-return',       'CA',  3000, null,  400,  null),
  ('appliance-repair',     'US',  9900, null, null,  null),
  ('appliance-repair',     'CA', 11000, null, null,  null),
  ('furniture-assembly',   'US',  5500, 1375, null,  null),
  ('furniture-assembly',   'CA',  6000, 1500, null,  null),
  ('house-check-in',       'US',  3000, 1500, null,  null),
  ('house-check-in',       'CA',  3500, 1750, null,  null),
  ('maid-service',         'US',  8000, 2000, null,  8000),
  ('maid-service',         'CA',  9000, 2250, null,  9000),
  ('moving-help',          'US', 10000, 1250, null, 10000),
  ('moving-help',          'CA', 11000, 1375, null, 11000),
  ('tech-setup',           'US',  7500, 1875, null,  null),
  ('tech-setup',           'CA',  8500, 2125, null,  null),
  ('tv-mounting',          'US',  9900, null, null,  null),
  ('tv-mounting',          'CA', 12000, null, null,  null),
  ('date-companion',       'US',  9000, 2250, null,  null),
  ('date-companion',       'CA', 11000, 2750, null,  null),
  ('dog-walking',          'US',  2500,  800,  800,  null),
  ('dog-walking',          'CA',  2700,  800, 1000,  null),
  ('event-companion',      'US', 15000, 2500, null,  null),
  ('event-companion',      'CA', 18000, 3000, null,  null),
  ('family-standin',       'US', 30000, 5000, null,  null),
  ('family-standin',       'CA', 37500, 6250, null,  null),
  ('rent-a-friend',        'US',  7000, 1750, null,  null),
  ('rent-a-friend',        'CA',  8000, 2000, null,  null),
  ('shopping-companion',   'US',  7000, 1750, null,  null),
  ('shopping-companion',   'CA',  8000, 2000, null,  null),
  ('wedding-guest',        'US', 13500, 2250, null,  null),
  ('wedding-guest',        'CA', 16500, 2750, null,  null),
  ('elder-assistance',     'US',  7600, 1900, null,  null),
  ('elder-assistance',     'CA',  8400, 2100, null,  null),
  ('listening-service',    'US',  2000, 1500, null,  null),
  ('listening-service',    'CA',  2500, 1900, null,  null),
  ('sleep-call-companion', 'US',  3000, 1500, null,  null),
  ('sleep-call-companion', 'CA',  3800, 1900, null,  null),
  ('property-inspection',  'US',  8500, null, null,  null),
  ('property-inspection',  'CA', 10000, null, null,  null),
  -- Inactive. Rates recorded so activation is a single deliberate act
  -- rather than an invented price under time pressure.
  ('professional-cuddler', 'US', 10000, 5000, null,  null),
  ('professional-cuddler', 'CA', 13000, 6500, null,  null)
on conflict (service_id, country) do update set
  base_price_cents     = excluded.base_price_cents,
  extra_block_cents    = excluded.extra_block_cents,
  per_extra_unit_cents = excluded.per_extra_unit_cents,
  per_extra_crew_cents = excluded.per_extra_crew_cents,
  updated_at           = now();

-- -------------------------------------------------------------------------
-- The fallback base follows the US rate.
--
-- services.base_price_cents is what price_service_cents uses when a request
-- carries no country — legacy rows, and any future path that forgets to
-- seal one. Leaving the 2026 catalogue's old numbers there would make that
-- fallback a silent discount of up to 70%.
-- -------------------------------------------------------------------------
update services s
   set base_price_cents = cp.base_price_cents
  from service_country_pricing cp
 where cp.service_id = s.id and cp.country = 'US';

-- -------------------------------------------------------------------------
-- Motorcycle Taxi: deactivated, not priced.
--
-- The proposal found no comparable authorised motorcycle passenger service
-- in either market, and carrying paying passengers needs passenger-carrier
-- authority and insurance for that exact service — a motorcycle licence
-- does not establish it. It was live at $12, a number with no stated basis.
--
-- Deactivating is the only honest option available here: there is no
-- quote-only flow to put it behind, and a catalogue cannot advertise a
-- fare for work nobody has confirmed anyone may lawfully perform. This is
-- NOT a finding that such an operation is unlawful — it is a refusal to
-- publish a tariff before the authority is confirmed. Reversible from
-- /admin/services the moment it is.
-- -------------------------------------------------------------------------
update services set active = false where id = 'motorcycle-taxi';

-- -------------------------------------------------------------------------
-- Checks, so a typo in 100 numbers above fails here and not in a customer's
-- basket.
-- -------------------------------------------------------------------------
do $$
declare
  v_missing text;
  v_bad     text;
  v_us      int;
  v_ca      int;
begin
  -- Every active service must have both markets priced.
  select string_agg(s.id, ', ') into v_missing
    from services s
   where s.active
     and (not exists (select 1 from service_country_pricing c
                       where c.service_id = s.id and c.country = 'US')
       or not exists (select 1 from service_country_pricing c
                       where c.service_id = s.id and c.country = 'CA'));
  if v_missing is not null then
    raise exception 'active services with no rate in both markets: %', v_missing;
  end if;

  -- A Canadian price below its US counterpart is almost always a
  -- transposed pair; the proposal has CA at or above US throughout.
  select string_agg(u.service_id, ', ') into v_bad
    from service_country_pricing u
    join service_country_pricing c
      on c.service_id = u.service_id and c.country = 'CA'
   where u.country = 'US' and c.base_price_cents < u.base_price_cents;
  if v_bad is not null then
    raise exception 'CA priced below US — transposed pair? %', v_bad;
  end if;

  -- Spot-check two the proposal states outright, so the whole table
  -- cannot pass while the arithmetic is wrong.
  select price_service_cents('wait-in-line', '{"expected_wait":"60","_country":"US"}'::jsonb) into v_us;
  select price_service_cents('dog-walking', '{"duration_min":"30","dog_count":"3","_country":"CA"}'::jsonb) into v_ca;
  if v_us <> 3500 then raise exception 'Wait in Line US 1h should be 3500, got %', v_us; end if;
  -- CA$27 + two extra dogs at CA$10 = CA$47, the proposal's worked example.
  if v_ca <> 4700 then raise exception 'three dogs 30min CA should be 4700, got %', v_ca; end if;

  raise notice 'rate card v1 applied and checked';
end $$;

-- -------------------------------------------------------------------------
-- DEFERRED, and recorded here rather than in anyone's memory.
-- -------------------------------------------------------------------------
comment on table public.service_country_pricing is
  'Rate card v1 (proposal of 2026-10-28). Expresses base, time blocks, '
  'per-unit and per-crew money per market. Does NOT yet express: crew '
  'multiplication (rate x people x hours — moving-help, maid-service and '
  'wedding-guest price a multi-person job wrongly), road-distance quoting '
  '(designated-driver, package-delivery, package-return, grocery-pickup '
  'carry only their minimum fare), the dog-walk duration menu (a uniform '
  '15-minute block approximates it; 60 minutes lands at US$41 vs US$40), '
  'the appliance diagnostic credit, and TV size/wall add-ons.';
