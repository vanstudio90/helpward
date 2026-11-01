-- CLASS: pre-deploy
-- =========================================================================
-- 0089 — review activity stays out of everything a customer reads
--
-- 0088 isolated WHO can be matched. That is only half of it: a
-- demonstration booking still creates rows, and those rows feed things
-- real people look at — a helper's public rating, their review list,
-- their completed-task count, the public helper directory.
--
-- A five-star review written by App Review is not a customer's opinion
-- and must not raise anybody's average.
--
-- Separate from 0088 because 0088 is already applied in rehearsal and
-- the migration runner checksums every file. Editing an applied
-- migration is how two environments quietly stop matching.
-- =========================================================================

-- A review left on a review booking is not customer-visible, so it is
-- already excluded from the average by refresh_provider_rating's filter.
-- Belt and braces: mark it at the source rather than relying on whoever
-- inserts it to remember.
create or replace function public.hide_review_account_reviews()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_review_customer boolean := false;
begin
  select coalesce(p.is_review_account, false) into v_review_customer
  from profiles p where p.id = new.customer_id;

  if v_review_customer then
    new.customer_visible := false;
  end if;
  return new;
end;
$$;

drop trigger if exists reviews_hide_review_account on reviews;
create trigger reviews_hide_review_account
  before insert or update on reviews
  for each row execute function public.hide_review_account_reviews();

-- tasks_completed is shown on a helper's public profile and feeds the
-- ranking score. A demonstration booking must not inflate it, so the
-- review helper's counter is pinned at zero.
create or replace function public.skip_review_helper_task_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(new.is_review_helper, false) then
    new.tasks_completed := 0;
    new.rating_avg := null;
    new.rating_count := 0;
  end if;
  return new;
end;
$$;

drop trigger if exists helper_review_counters on public.provider_profiles;
create trigger helper_review_counters
  before insert or update on public.provider_profiles
  for each row execute function public.skip_review_helper_task_count();

-- And the controlled helper is not a person anyone should be browsing to.
-- helpers_public is the public directory view; excluding it there keeps the
-- test account out of search, profiles and any "our helpers" listing.
do $$
begin
  if to_regclass('public.helpers_public') is not null then
    execute $v$
      create or replace view public.helpers_public as
      select * from provider_profiles
       where status = 'approved'
         and coalesce(is_review_helper, false) = false
    $v$;
  end if;
end $$;
