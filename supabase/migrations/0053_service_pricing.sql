-- CLASS: pre-deploy
-- =========================================================================
-- 0053 — what a service's base price actually buys
--
-- Today every service is a flat number. Dog walking quotes $24.50 whether
-- the customer asks for 30 minutes or eight hours, and moving help quotes
-- the same for one helper or four. The intake has been collecting
-- duration_min, crew_size and quantities all along; nothing read them.
--
-- MODEL
--   base_price_cents covers `included_minutes` of work and
--   `included_units` of whatever the service counts.
--   Beyond that:
--     each started block of `extra_block_minutes` adds extra_block_cents
--     each unit over included_units adds per_extra_unit_cents
--     each helper over included_crew adds per_extra_crew_cents
--
-- Blocks are STARTED, not prorated: 61 minutes into 30-minute blocks is
-- two blocks. A helper's time is booked, not metered.
--
-- THE RATES BELOW NEED THE OWNER'S SIGN-OFF. They are derived from each
-- service's existing base price on a consistent basis (an extra block is
-- priced near the base rate per unit time; an extra unit at a fraction of
-- base, since the second dog on the same walk costs less than the first).
-- The MECHANISM is what this migration is for; the NUMBERS are a business
-- decision and are meant to be edited.
--
-- Deliberately NOT priced: spend_cap on errands and groceries is a limit
-- on what the helper may spend on the customer's behalf, not a Helpward
-- charge. Pricing it would charge people for intending to buy things.
-- =========================================================================

create table if not exists service_pricing (
  service_id           text primary key references services(id) on delete cascade,

  -- Time. Null means this service is not time-priced.
  included_minutes     int,
  extra_block_minutes  int,
  extra_block_cents    int,
  duration_field       text not null default 'duration_min',

  -- Quantity. unit_field names the intake key that carries the count.
  unit_field           text,
  included_units       int not null default 1,
  per_extra_unit_cents int,

  -- Crew.
  crew_field           text,
  included_crew        int not null default 1,
  per_extra_crew_cents int,

  updated_at           timestamptz not null default now(),

  constraint time_rule_complete check (
    (included_minutes is null and extra_block_minutes is null and extra_block_cents is null)
    or (included_minutes is not null and extra_block_minutes > 0 and extra_block_cents >= 0)
  ),
  constraint unit_rule_complete check (
    (unit_field is null and per_extra_unit_cents is null)
    or (unit_field is not null and per_extra_unit_cents >= 0)
  ),
  constraint crew_rule_complete check (
    (crew_field is null and per_extra_crew_cents is null)
    or (crew_field is not null and per_extra_crew_cents >= 0)
  )
);

alter table service_pricing enable row level security;
drop policy if exists sp_read on service_pricing;
create policy sp_read on service_pricing for select using (true);
revoke insert, update, delete on service_pricing from authenticated, anon;

-- -------------------------------------------------------------------------
-- Rates
-- -------------------------------------------------------------------------
insert into service_pricing (
  service_id, included_minutes, extra_block_minutes, extra_block_cents, duration_field,
  unit_field, included_units, per_extra_unit_cents,
  crew_field, included_crew, per_extra_crew_cents
) values
  -- Companionship and care: base buys an hour, half-hours after that.
  ('date-companion',        60, 30, 2000, 'duration_min', null, 1, null, null, 1, null),
  ('event-companion',       60, 30, 2500, 'duration_min', null, 1, null, null, 1, null),
  ('wedding-guest',         60, 30, 3000, 'duration_min', null, 1, null, null, 1, null),
  ('family-standin',        60, 30, 4000, 'duration_min', null, 1, null, null, 1, null),
  ('rent-a-friend',         60, 30, 1250, 'duration_min', null, 1, null, null, 1, null),
  ('professional-cuddler',  60, 30, 2500, 'duration_min', null, 1, null, null, 1, null),
  ('shopping-companion',    60, 30, 1100, 'duration_min', null, 1, null, null, 1, null),
  ('elder-assistance',      60, 30, 1250, 'duration_min', null, 1, null, null, 1, null),
  ('listening-service',     60, 30, 1000, 'duration_min', null, 1, null, null, 1, null),
  ('sleep-call-companion',  60, 30,  900, 'duration_min', null, 1, null, null, 1, null),

  -- Dog walking: base is a 30-minute walk for one dog.
  ('dog-walking',           30, 30, 1500, 'duration_min', 'dog_count', 1, 800, null, 1, null),

  -- Waiting is sold by the hour; the field is the expected wait.
  ('wait-in-line',          60, 30,  900, 'expected_wait', null, 1, null, null, 1, null),

  -- Crew work. Base covers one helper; each extra is close to a full rate.
  ('moving-help',          null, null, null, 'duration_min', null, 1, null, 'crew_size', 1, 3500),

  -- Counted work. The second item is cheaper than the first — the helper
  -- is already there with the tools out.
  ('furniture-assembly',   null, null, null, 'duration_min', 'item_count',   1, 2500, null, 1, null),
  ('package-return',       null, null, null, 'duration_min', 'parcel_count', 1,  500, null, 1, null),
  ('maid-service',         null, null, null, 'duration_min', 'bedrooms',     1, 1500, null, 1, null),
  ('designated-driver',    null, null, null, 'duration_min', 'passengers',   2,  500, null, 1, null)
on conflict (service_id) do update set
  included_minutes = excluded.included_minutes,
  extra_block_minutes = excluded.extra_block_minutes,
  extra_block_cents = excluded.extra_block_cents,
  duration_field = excluded.duration_field,
  unit_field = excluded.unit_field,
  included_units = excluded.included_units,
  per_extra_unit_cents = excluded.per_extra_unit_cents,
  crew_field = excluded.crew_field,
  included_crew = excluded.included_crew,
  per_extra_crew_cents = excluded.per_extra_crew_cents,
  updated_at = now();

-- -------------------------------------------------------------------------
-- price_service_cents — the authoritative subtotal
-- -------------------------------------------------------------------------
-- Mirrored in lib/service-pricing.ts for the live quote. Two
-- implementations of one sum is a drift risk, so
-- scripts/verify-pricing-parity.mjs runs both over a grid of inputs and
-- fails on any disagreement.
--
-- Returns the COMMISSIONABLE SUBTOTAL — no service fee, no tip. priceTask
-- in lib/pricing.ts adds those.
create or replace function public.price_service_cents(
  p_service_id text,
  p_intake     jsonb
) returns int
language plpgsql stable security definer set search_path = public as $$
declare
  v_base int;
  v_rule service_pricing%rowtype;
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

  select * into v_rule from service_pricing where service_id = p_service_id;
  if not found then
    return v_base;   -- flat-priced service
  end if;

  v_total := v_base;

  -- Time beyond what the base covers, in started blocks.
  if v_rule.included_minutes is not null then
    v_minutes := nullif(trim(coalesce(p_intake ->> v_rule.duration_field, '')), '')::int;
    if v_minutes is not null and v_minutes > v_rule.included_minutes then
      v_blocks := ceil(
        (v_minutes - v_rule.included_minutes)::numeric / v_rule.extra_block_minutes
      );
      v_total := v_total + (v_blocks * v_rule.extra_block_cents);
    end if;
  end if;

  -- Units beyond those included.
  if v_rule.unit_field is not null then
    v_units := nullif(trim(coalesce(p_intake ->> v_rule.unit_field, '')), '')::int;
    if v_units is not null and v_units > v_rule.included_units then
      v_total := v_total + ((v_units - v_rule.included_units) * v_rule.per_extra_unit_cents);
    end if;
  end if;

  -- Helpers beyond those included.
  if v_rule.crew_field is not null then
    v_crew := nullif(trim(coalesce(p_intake ->> v_rule.crew_field, '')), '')::int;
    if v_crew is not null and v_crew > v_rule.included_crew then
      v_total := v_total + ((v_crew - v_rule.included_crew) * v_rule.per_extra_crew_cents);
    end if;
  end if;

  return v_total;
exception
  -- A non-numeric answer in a priced field must never silently become a
  -- free booking. Fall back to the base price and let the server-side
  -- intake validation reject the request on its own terms.
  when invalid_text_representation then
    return v_base;
end;
$$;

revoke execute on function public.price_service_cents(text, jsonb) from public;
grant execute on function public.price_service_cents(text, jsonb) to authenticated, service_role;
