-- CLASS: pre-deploy
-- =========================================================================
-- 0074 — Wait in Line: country pricing, venue permissions, real outcomes
--
-- Three additions, all backward compatible. Nothing here changes the price
-- or behaviour of any existing service or any request already in flight.
--
-- -----------------------------------------------------------------------
-- 1. PRICE BY COUNTRY
--
-- Prices were one number per service. A $15 service rendered as "US$15" in
-- San Diego and "CA$15" in Vancouver — the same figure with a different
-- symbol, which is a currency label, not a price.
--
-- HOW THE COUNTRY REACHES THE PRICER, AND WHY THIS WAY.
-- price_service_cents(service_id, intake) is called from three places that
-- must all arrive at the same number: the quote in new-request, the quote
-- fingerprint, and accept_request. The fingerprint exists precisely so an
-- offer cannot be accepted at a different price from the one quoted, so a
-- country that reached one caller and not the others would void every
-- offer with HW022.
--
-- Adding a parameter would mean rewriting compute_request_fingerprint and
-- accept_request (0058's version, the largest function in the schema) to
-- pass it. Instead the country travels INSIDE the intake, under the
-- reserved key `_country`, which every one of those callers already reads
-- from the same stored row. No signature changes, no caller rewrites, and
-- the three cannot disagree because there is only one value.
--
-- `_country` is written SERVER-SIDE from the attested pickup address and
-- overwrites anything posted (see sealIntakeCountry in lib/country-price.ts).
-- A request with no `_country` — every one that already exists — prices
-- exactly as it does today.
-- -----------------------------------------------------------------------

create table if not exists public.service_country_pricing (
  service_id        text not null references services(id) on delete cascade,
  country           text not null check (country in ('US', 'CA')),
  base_price_cents  int  not null check (base_price_cents >= 0),
  -- Null means "use the service_pricing row's extra_block_cents", so a
  -- country can override the first hour without restating the whole rule.
  extra_block_cents int check (extra_block_cents >= 0),
  updated_at        timestamptz not null default now(),
  primary key (service_id, country)
);

alter table public.service_country_pricing enable row level security;

-- Prices are public: the catalogue shows them before anyone logs in.
drop policy if exists scp_read on public.service_country_pricing;
create policy scp_read on public.service_country_pricing for select using (true);
revoke insert, update, delete on public.service_country_pricing from anon, authenticated;

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

  -- Country override, if this service has one and the request carries a
  -- country. Unknown or absent country falls through to the single price,
  -- which is what every existing request does.
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
    return v_base;   -- flat-priced service
  end if;

  -- A country may override the extra block too; null means keep the rule's.
  v_extra_block := coalesce(v_cp.extra_block_cents, v_rule.extra_block_cents);

  v_total := v_base;

  -- Time beyond what the base covers, in started blocks.
  if v_rule.included_minutes is not null then
    v_minutes := nullif(trim(coalesce(p_intake ->> v_rule.duration_field, '')), '')::int;
    if v_minutes is not null and v_minutes > v_rule.included_minutes then
      v_blocks := ceil(
        (v_minutes - v_rule.included_minutes)::numeric / v_rule.extra_block_minutes
      );
      v_total := v_total + (v_blocks * v_extra_block);
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
end;
$$;

revoke execute on function public.price_service_cents(text, jsonb) from public, anon;
grant execute on function public.price_service_cents(text, jsonb) to authenticated, service_role;

-- The approved pilot rates. US$35 / CA$40 for the first hour.
--
-- The extra block scales with the first hour rather than staying at $9:
-- leaving it would make hour two cost half of hour one for identical work.
-- US$17.50 and CA$20.00 per 30 minutes hold the hourly rate flat.
insert into public.service_country_pricing (service_id, country, base_price_cents, extra_block_cents)
values ('wait-in-line', 'US', 3500, 1750),
       ('wait-in-line', 'CA', 4000, 2000)
on conflict (service_id, country) do update
  set base_price_cents = excluded.base_price_cents,
      extra_block_cents = excluded.extra_block_cents,
      updated_at = now();

-- -----------------------------------------------------------------------
-- 2. VENUE PERMISSIONS
--
-- A customer cannot give Helpward permission to break someone else's queue
-- rules. Whether a paid stand-in is allowed, and whether a place can be
-- handed over, is the venue's decision and nobody else's.
--
-- This is a directory of what we have actually CHECKED. Three states, and
-- the distinction between the second and third is the whole point:
--
--   allowed   — someone confirmed the venue permits it. Who and when are
--               recorded, because "we checked" with no date is a rumour.
--   refused   — someone confirmed it does not. Bookings are blocked.
--   unknown   — nobody has checked. NOT the same as allowed. The booking
--               proceeds with the risk stated plainly to the customer and
--               the helper verifying on arrival, because refusing every
--               unlisted venue would mean launching with a directory of
--               almost nothing.
--
-- An absent row is `unknown`, so the table starts empty and safe.
-- -----------------------------------------------------------------------

do $$ begin
  create type venue_permission as enum ('allowed', 'refused', 'unknown');
exception when duplicate_object then null; end $$;

create table if not exists public.venues (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  -- Normalised for lookup: a customer typing "Tim Hortons" must match the
  -- row stored as "Tim Horton's". Same normaliser the municipalities use.
  name_key            text generated always as (public.normalize_municipality(name)) stored,
  address             text,
  city                text,
  region              text,
  country             text check (country in ('US', 'CA')),
  area_id             text,

  substitutes_allowed venue_permission not null default 'unknown',
  customer_may_replace venue_permission not null default 'unknown',
  full_party_required venue_permission not null default 'unknown',
  numbers_transferable venue_permission not null default 'unknown',

  -- Free text because every venue's answer is different: "they call the
  -- name on the booking", "the number is voided if you leave the line".
  early_turn_policy   text,
  notes               text,

  -- Provenance. A permission with no attribution cannot be re-checked.
  confirmed_by        uuid references profiles(id),
  confirmed_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists venues_name_key_idx on public.venues (name_key);
create index if not exists venues_area_idx on public.venues (area_id);

alter table public.venues enable row level security;

-- Readable by anyone: the booking form has to warn before submission, and
-- that warning is needed by a logged-out visitor pricing the service too.
drop policy if exists venues_read on public.venues;
create policy venues_read on public.venues for select using (true);

drop policy if exists venues_admin_write on public.venues;
create policy venues_admin_write on public.venues for all
  using (is_admin()) with check (is_admin());

revoke insert, update, delete on public.venues from anon, authenticated;

-- A claim that nobody signed is not a confirmation. Enforced rather than
-- documented, because the one thing this table exists to prevent is a
-- guess being read later as a verified fact.
alter table public.venues drop constraint if exists venues_confirmed_attribution;
alter table public.venues add constraint venues_confirmed_attribution check (
  (substitutes_allowed = 'unknown' and customer_may_replace = 'unknown'
   and full_party_required = 'unknown' and numbers_transferable = 'unknown')
  or (confirmed_by is not null and confirmed_at is not null)
);

-- Look a venue up by what the customer typed. Returns at most one row.
create or replace function public.lookup_venue(p_name text, p_country text default null)
returns setof public.venues
language sql stable as $$
  select * from public.venues
   where name_key = public.normalize_municipality(coalesce(p_name, ''))
     and (p_country is null or country is null or country = p_country)
   order by confirmed_at desc nulls last
   limit 1;
$$;

grant execute on function public.lookup_venue(text, text) to anon, authenticated, service_role;

-- -----------------------------------------------------------------------
-- 3. HOW A WAITING JOB ACTUALLY ENDED
--
-- "Completed" was the only way a booking could finish, which is wrong for
-- this service in a way that matters to the customer's bill. Reaching the
-- front of the queue is not the only acceptable outcome, and not every
-- outcome deserves the same charge:
--
--   customer_took_over         the handover happened. The service worked.
--   booked_period_ended        the helper waited the whole booked block
--                              and the customer did not arrive. They
--                              bought a block of time and got it.
--   queue_closed               the queue shut, or the item sold out, after
--                              valid waiting. The waiting was still done.
--   venue_refused_substitution the venue would not accept a stand-in, so
--                              no valid waiting was ever possible.
--
-- The first three are charged. The last is NOT: the customer must not pay
-- for a service the venue made impossible. The helper's travel is a real
-- cost and is deliberately NOT settled here, because Helpward has no
-- disclosed travel-compensation policy and inventing a charge for one
-- would be worse than leaving it visible and unpaid. It is recorded so
-- support can see how often it happens and what it costs.
--
-- complete_booking now RETURNS the settlement its outcome requires rather
-- than the caller deciding. The rule lives with the outcome, in one place,
-- and cannot drift between the helper's app and an admin tool.
-- -----------------------------------------------------------------------

alter table public.bookings
  add column if not exists completion_outcome text;

alter table public.bookings drop constraint if exists bookings_completion_outcome_valid;
alter table public.bookings add constraint bookings_completion_outcome_valid check (
  completion_outcome is null or completion_outcome in (
    'customer_took_over', 'booked_period_ended', 'queue_closed',
    'venue_refused_substitution', 'completed'
  )
);

revoke update (completion_outcome) on public.bookings from authenticated, anon;

-- Which outcomes are chargeable. One definition, used by the function
-- below and readable by anything that needs to explain a bill.
create or replace function public.outcome_is_chargeable(p_outcome text)
returns boolean
language sql immutable as $$
  select coalesce(p_outcome, 'completed') <> 'venue_refused_substitution';
$$;

grant execute on function public.outcome_is_chargeable(text) to authenticated, service_role;

-- Replaced rather than overloaded: a default on a second parameter would
-- make the existing one-argument call ambiguous.
drop function if exists public.complete_booking(uuid);

create or replace function public.complete_booking(
  p_booking_id uuid,
  p_outcome    text default null
) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_booking record;
  v_outcome text;
begin
  select * into v_booking from bookings where id = p_booking_id for update;
  if not found then
    raise exception 'Booking not found';
  end if;
  if auth.uid() <> v_booking.provider_id
    and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin'
  then
    raise exception 'Only the provider can complete this booking';
  end if;
  if v_booking.status <> 'in_progress' then
    raise exception 'Booking is not in progress';
  end if;

  v_outcome := coalesce(nullif(trim(coalesce(p_outcome, '')), ''), 'completed');
  if v_outcome not in ('customer_took_over', 'booked_period_ended', 'queue_closed',
                       'venue_refused_substitution', 'completed') then
    raise exception 'Unknown completion outcome: %', v_outcome;
  end if;

  -- assert_booking_paid checks an authorization is in place. An outcome
  -- that is not chargeable still needs one — it is what gets released.
  perform assert_booking_paid(v_booking);

  update bookings
    set status = 'completed', completed_at = now(), completion_outcome = v_outcome
    where id = p_booking_id;

  -- A job the venue made impossible is not a completed task, and must not
  -- inflate the helper's record.
  if outcome_is_chargeable(v_outcome) then
    update provider_profiles
      set tasks_completed = tasks_completed + 1
      where user_id = v_booking.provider_id;
  end if;

  insert into notifications (user_id, type, payload)
  values (v_booking.customer_id, 'task_completed',
          jsonb_build_object('booking_id', p_booking_id, 'outcome', v_outcome));

  return case when outcome_is_chargeable(v_outcome) then 'capture' else 'release' end;
end;
$$;

revoke execute on function public.complete_booking(uuid, text) from public, anon;
grant execute on function public.complete_booking(uuid, text) to authenticated, service_role;
