-- CLASS: pre-deploy
-- =========================================================================
-- 0075 — what Wait in Line actually sells
--
-- The catalogue blurb read:
--
--   "Someone stands in line for you — DMV, passport office, restaurant,
--    ticket release, sneaker drop. By the hour."
--
-- Two of those five examples cannot be delivered. US passport appointments
-- are non-transferable and the State Department warns about third-party
-- booking; DMV queues are generally issued against a named appointment or
-- a person-linked ticket. Advertising them invites a booking no helper can
-- lawfully complete, and the customer only finds out at the counter.
--
-- The replacement names what the service IS and what it is not. "An
-- eligible queue" and "where the venue allows" are load-bearing: the venue
-- decides whether a stand-in is permitted, not Helpward and not the
-- customer, and the sentence about admission is there because reaching the
-- front is not something anyone can promise.
-- =========================================================================

update services set
  blurb = 'A helper waits in an eligible queue for as long as you book, then hands '
       || 'their place to you where the venue allows it. You are paying for their '
       || 'time — admission, stock and appointments are not guaranteed.'
where id = 'wait-in-line';

do $$
declare v_blurb text;
begin
  select blurb into v_blurb from services where id = 'wait-in-line';
  if v_blurb is null then
    raise exception 'wait-in-line is missing from the catalogue';
  end if;
  if v_blurb ~* '(passport|dmv)' then
    raise exception 'the blurb still advertises a queue that cannot be served: %', v_blurb;
  end if;
  raise notice 'wait-in-line blurb updated';
end $$;
