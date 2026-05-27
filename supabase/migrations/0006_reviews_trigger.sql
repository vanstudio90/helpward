-- After a review is inserted, recompute the provider's rating_avg + rating_count.
create or replace function public.refresh_provider_rating()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update provider_profiles
    set
      rating_avg = (
        select round(avg(rating)::numeric, 2)
        from reviews
        where provider_id = new.provider_id and customer_visible
      ),
      rating_count = (
        select count(*) from reviews where provider_id = new.provider_id and customer_visible
      )
    where user_id = new.provider_id;
  return new;
end;
$$;

drop trigger if exists reviews_refresh_rating on reviews;
create trigger reviews_refresh_rating
  after insert or update on reviews
  for each row execute function public.refresh_provider_rating();
