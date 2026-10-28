-- CLASS: pre-deploy
-- =========================================================================
-- 0065 — the service catalogue stops claiming screening we do not run
--
-- Independent testing, 27 October: Elder Assistance still read
-- "Background-checked companion for seniors". The page copy was corrected
-- earlier; the DATABASE row was not, so the card rendered the old claim
-- wherever the catalogue is read — which is most places.
--
-- background_verified_at is written only by the Checkr webhook, and
-- Checkr is not wired. No helper has one.
-- =========================================================================

-- Four rows claimed screening or cover that does not exist. "Vetted" and
-- "Insured" are the same promise in fewer words, and a customer reads
-- them as checks somebody ran.
update services set blurb =
  'A companion for seniors — grocery trips, doctor visits, conversation, light housekeeping.'
 where id = 'elder-assistance';

update services set blurb =
  'A handyperson assembles your flat-pack furniture — IKEA, beds, desks, dressers, shelves. Tools included.'
 where id = 'furniture-assembly';

update services set blurb =
  'A cleaner for dusting, vacuuming, kitchens, bathrooms and laundry — the same cleaner can be re-booked weekly.'
 where id = 'maid-service';

update services set blurb =
  'A walker takes your dog out for 30 or 60 minutes — fresh water, treats, GPS-tracked route and photo update.'
 where id = 'dog-walking';

-- Catch anything else the catalogue claims that the platform cannot do.
do $$
declare r record; v_bad int := 0;
begin
  for r in
    select id, blurb from services
     where active
       and (blurb ~* 'background.check|insur|vetted|screened|\$1M')
  loop
    raise warning 'service % still claims: %', r.id, left(r.blurb, 90);
    v_bad := v_bad + 1;
  end loop;

  if v_bad > 0 then
    raise exception
      '% active service(s) still claim screening or insurance that does not exist', v_bad;
  end if;
  raise notice 'no active service claims screening or insurance';
end $$;
