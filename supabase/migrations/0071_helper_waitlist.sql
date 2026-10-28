-- CLASS: pre-deploy safe. New table and one function; touches nothing existing.
--
-- WHERE HELPERS WANT TO WORK, AND WE ARE NOT YET.
--
-- A customer's address is checked at booking: outside a service area, the
-- dispatch guard refuses and says so before they submit. A HELPER had no
-- such check. Anyone anywhere could sign up, finish onboarding, connect a
-- Stripe payout account, wait for approval, and only then discover that no
-- request will ever reach them because Helpward does not operate in their
-- city. That is a lot of someone's evening to waste.
--
-- The signup form now asks where they work. If their city is not covered we
-- say so immediately — and because "we'll let you know" is worthless unless
-- someone is writing it down, the answer lands here.
--
-- It is also the only demand signal Helpward has for where to open next.
-- Thirty people asking for Victoria is a better reason to expand than a
-- guess about population.

create table if not exists helper_waitlist (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  city        text not null,
  region      text,
  country     text not null check (country in ('US','CA')),
  created_at  timestamptz not null default now(),
  notified_at timestamptz,
  -- One row per person per place. Someone re-submitting updates their entry
  -- rather than inflating the demand signal we plan expansion from.
  unique (email, city, country)
);

create index if not exists helper_waitlist_place_idx
  on helper_waitlist (country, region, city);

alter table helper_waitlist enable row level security;

-- No policy, and no grants: nothing reads this from the browser. It is
-- written through the SECURITY DEFINER function below, which is the only
-- door, and read by operators over a direct connection.
revoke all on helper_waitlist from anon, authenticated;

/* Join the list.
 *
 * SECURITY DEFINER so an anonymous visitor can record interest without the
 * table being readable or writable in any other way. It returns nothing —
 * a caller learns only that their request was accepted, never whether an
 * email was already on the list, which would turn this into an address
 * oracle.
 */
create or replace function public.join_helper_waitlist(
  p_email   text,
  p_city    text,
  p_region  text,
  p_country text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_email is null or position('@' in p_email) < 2 then
    raise exception 'A valid email is required' using errcode = 'HW070';
  end if;
  if p_city is null or btrim(p_city) = '' then
    raise exception 'A city is required' using errcode = 'HW071';
  end if;
  if p_country not in ('US','CA') then
    raise exception 'Unsupported country' using errcode = 'HW072';
  end if;

  insert into helper_waitlist (email, city, region, country)
  values (lower(btrim(p_email)), btrim(p_city), nullif(btrim(coalesce(p_region,'')), ''), p_country)
  on conflict (email, city, country) do update
    set created_at = now();
end;
$$;

revoke execute on function public.join_helper_waitlist(text,text,text,text) from public;
grant execute on function public.join_helper_waitlist(text,text,text,text) to anon, authenticated, service_role;

comment on table helper_waitlist is
  'Helpers who tried to sign up from a city Helpward does not serve. Written '
  'only via join_helper_waitlist(); the demand signal for where to open next.';
