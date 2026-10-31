-- CLASS: pre-deploy
-- =========================================================================
-- 0077 — Motorcycle Taxi back in the catalogue, with a real fare
--
-- Reactivated on the owner's instruction, having stated they will confirm
-- insurance and passenger-carrier authority. 0076 deactivated it because
-- it was live at $12 with no stated basis and no confirmed authority to
-- carry paying passengers; the owner has taken that decision, and this
-- migration carries it out.
--
-- IT CANNOT GO BACK AT $12. That was the unexplained legacy number the
-- commercial proposal singled out: below Package Delivery's US$20 minimum,
-- for a journey that carries a person rather than a parcel. Reactivating
-- at that figure would publish the exact fare the proposal told us not to.
--
-- PROVISIONAL FARE, and labelled as such. The proposal set this service to
-- "quote only" precisely because no comparable authorised local operator
-- was found, so there is no benchmark to copy. The figures below are
-- positioned against Helpward's own card rather than invented from
-- nothing:
--
--   Package Delivery   US$20 / CA$25   a short vehicle trip, no passenger
--   MOTORCYCLE TAXI    US$25 / CA$30   a short trip carrying a person
--   Designated Driver  US$60 / CA$65   a whole engagement in the
--                                      customer's own car
--
-- This is a floor for a short point-to-point ride, NOT a validated market
-- rate. Replace it with the authorised supplier's approved fare once the
-- authority and insurance are confirmed — that is the number that should
-- stand, and this one exists only so the service is not live at $12.
-- =========================================================================

insert into service_country_pricing
  (service_id, country, base_price_cents, extra_block_cents,
   per_extra_unit_cents, per_extra_crew_cents)
values
  ('motorcycle-taxi', 'US', 2500, null, null, null),
  ('motorcycle-taxi', 'CA', 3000, null, null, null)
on conflict (service_id, country) do update set
  base_price_cents     = excluded.base_price_cents,
  extra_block_cents    = excluded.extra_block_cents,
  per_extra_unit_cents = excluded.per_extra_unit_cents,
  per_extra_crew_cents = excluded.per_extra_crew_cents,
  updated_at           = now();

-- The no-country fallback follows the US fare, as every other service does.
update services
   set base_price_cents = 2500,
       active = true,
       -- The old blurb promised speed through traffic, which is a reason to
       -- ride between stationary cars. Helpward should not advertise that.
       blurb = 'A ride across the city on the back of a licensed rider''s '
            || 'motorcycle, helmet provided. One passenger, one journey.'
 where id = 'motorcycle-taxi';

do $$
declare v_active boolean; v_base int; v_rows int;
begin
  select active, base_price_cents into v_active, v_base
    from services where id = 'motorcycle-taxi';
  select count(*) into v_rows
    from service_country_pricing where service_id = 'motorcycle-taxi';

  if not coalesce(v_active, false) then
    raise exception 'motorcycle-taxi did not reactivate';
  end if;
  if v_base = 1200 then
    raise exception 'motorcycle-taxi is live at the unexplained $12 fare again';
  end if;
  if v_rows <> 2 then
    raise exception 'motorcycle-taxi needs a fare in both markets, found %', v_rows;
  end if;

  -- The invariant 0076 established: no active service may be missing a
  -- local price in either market.
  if exists (
    select 1 from services s where s.active
     and (not exists (select 1 from service_country_pricing c
                       where c.service_id = s.id and c.country = 'US')
       or not exists (select 1 from service_country_pricing c
                       where c.service_id = s.id and c.country = 'CA'))
  ) then
    raise exception 'an active service has no local price';
  end if;

  raise notice 'motorcycle-taxi active at a provisional fare';
end $$;
