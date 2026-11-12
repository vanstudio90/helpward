-- CLASS: pre-deploy
-- =========================================================================
-- 0114 — the region dropdown asks a small question
-- =========================================================================
/*
  WHAT THIS REPLACES, AND WHAT IT DOES NOT.

  /admin/helpers and /admin/bookings each fetched the whole operations
  snapshot to fill a region filter. Measured on production that
  document costs about 10.5ms of server time and 1,873 bytes, so it was
  never the emergency it looked like. What makes it worth replacing is
  narrower: the snapshot's region list ignores the window and counts
  EVERY request ever made, so it is the one part of that document that
  does not get cheaper as the window narrows.

  THE FIRST ATTEMPT WAS SLOWER, which is why this function exists. Doing
  the same work in TypeScript meant reading request rows and review
  profiles across the wire and counting them in node: 59ms, against
  roughly 41ms for the snapshot it was supposed to beat. Aggregation
  belongs where the rows are. This returns the finished list.

  It is security definer because it reads `requests` and `profiles` to
  answer a question about neither — it returns city names and nothing
  else, never a row, an id or a person.
*/

/*
  ONE CALL, NOT TWO.

  The list and the reason it might be empty come back together. An
  empty dropdown has two causes that call for different responses —
  nobody has recorded a city at all, or every request that did belongs
  to a test account this view hides — and asking that as a second
  question would double the queries behind one dropdown.
*/
create or replace function public.admin_filter_regions(p_include_review boolean default false)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  with scoped as (
    select r.pickup_city, coalesce(p.is_review_account, false) as is_review
    from public.requests r
    left join public.profiles p on p.id = r.customer_id
    where r.pickup_city is not null
  )
  select jsonb_build_object(
    'regions', coalesce((
      select jsonb_agg(name order by n desc, name)
      from (
        select pickup_city as name, count(*) as n
        from scoped
        where p_include_review or not is_review
        group by pickup_city
      ) g
    ), '[]'::jsonb),
    'hidden_as_review', (select count(*) from scoped where is_review)
  );
$$;

revoke all on function public.admin_filter_regions(boolean) from public;
grant execute on function public.admin_filter_regions(boolean) to authenticated, service_role;

/* ------------------------------------------------------------------ *
 * SELF-TEST                                                           *
 * ------------------------------------------------------------------ */
do $$
declare
  v_all jsonb;
  v_excl jsonb;
  v_hidden int;
begin
  v_excl := public.admin_filter_regions(false) -> 'regions';
  v_all  := public.admin_filter_regions(true) -> 'regions';
  v_hidden := (public.admin_filter_regions(false) ->> 'hidden_as_review')::int;

  if jsonb_typeof(v_excl) <> 'array' or jsonb_typeof(v_all) <> 'array' then
    raise exception 'the region list is not an array';
  end if;

  /* Including test activity can only ever widen the list. */
  if jsonb_array_length(v_all) < jsonb_array_length(v_excl) then
    raise exception 'excluding review activity returned MORE regions than including it';
  end if;

  /* It returns names, not rows: no object, no id, no person. */
  if exists (select 1 from jsonb_array_elements(v_all) e where jsonb_typeof(e) <> 'string') then
    raise exception 'the region list contains something that is not a name';
  end if;

  if v_hidden < 0 then
    raise exception 'the hidden count is negative';
  end if;

  raise notice 'filter regions: % visible, % with review activity included, % request(s) hidden as test',
    jsonb_array_length(v_excl), jsonb_array_length(v_all), v_hidden;
end $$;
