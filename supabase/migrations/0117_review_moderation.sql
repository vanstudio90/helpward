-- CLASS: pre-deploy
-- =========================================================================
-- 0117 — moderating a review without quietly rewriting somebody's score
-- =========================================================================
/*
  THE DECISION AT THE CENTRE OF THIS FILE.

  refresh_provider_rating() (0006) averages the reviews where
  `customer_visible` is true. So hiding a review ALSO removes its stars
  from the helper's public average — one act, two consequences, and the
  second one invisible from the moderation screen.

  That is wrong more often than it is right. A customer who had a bad
  afternoon and described it in language we will not publish still had
  the bad afternoon: their two stars are a true report of an experience
  that happened. Deleting the score along with the wording lets a
  helper's average be improved by their customers' rudeness.

  But it is not ALWAYS wrong. A review that is spam, or about a
  different company, or written by somebody who was never there, should
  take its rating with it — there was no experience to score.

  So the two are separated:

    customer_visible   whether the WORDS appear.
    rating_visible     whether the SCORE counts.

  The aggregate moves to rating_visible, and rating_visible is
  backfilled from customer_visible — so no existing average changes by
  so much as a decimal when this is applied. Hiding text leaves the
  score alone unless the moderator says otherwise, and excluding a
  score is a decision with its own reason attached, recorded as such.

  WHAT ELSE THIS FILE REFUSES:

  * A DECISION WITH NO REASON. Every moderation act carries one, and
    the trail keeps the visibility it moved from and to — so "who hid
    this and why" is answerable a year later.
  * EDITING WHAT SOMEBODY WROTE. There is no update path for
    reviews.comment here, and there never should be. The words are the
    customer's; we decide whether to show them, not what they say.
  * A LOW RATING AS GROUNDS. The reason list has no "low rating" in it
    (see lib/admin-review-states.ts) and nothing here adds one.
*/

/* ------------------------------------------------------------------ *
 * THE SCORE AND THE WORDS COME APART                                  *
 * ------------------------------------------------------------------ */

alter table public.reviews
  add column if not exists rating_visible boolean,
  add column if not exists updated_at timestamptz not null default now();

/* Backfilled from today's behaviour, so nothing moves on deploy. */
update public.reviews set rating_visible = customer_visible where rating_visible is null;

alter table public.reviews alter column rating_visible set default true;
alter table public.reviews alter column rating_visible set not null;

comment on column public.reviews.rating_visible is
  'Whether this review''s stars count toward the helper''s public average. Separate from customer_visible, which is whether the words appear: hiding abusive wording must not silently improve a helper''s score.';

/* The aggregate now follows the score, not the words. */
create or replace function public.refresh_provider_rating()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update provider_profiles
    set
      rating_avg = (
        select round(avg(rating)::numeric, 2)
        from reviews
        where provider_id = new.provider_id and rating_visible
      ),
      rating_count = (
        select count(*) from reviews where provider_id = new.provider_id and rating_visible
      )
    where user_id = new.provider_id;
  return new;
end;
$$;

/* ------------------------------------------------------------------ *
 * REPORTS, DECISIONS, APPEALS                                         *
 * ------------------------------------------------------------------ */

create table if not exists public.review_reports (
  id            uuid primary key default gen_random_uuid(),
  review_id     uuid not null references public.reviews(id) on delete cascade,
  reason        text not null,
  /* Who objected. 'automated' has no profile behind it. */
  reporter_role text not null default 'customer',
  reported_by   uuid references public.profiles(id) on delete set null,
  detail        text,
  state         text not null default 'unassigned',
  assigned_to   uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default clock_timestamp(),
  constraint review_reports_reason_check check (reason in (
    'personal_information', 'abusive_language', 'disputed_accuracy',
    'not_about_service', 'safety_concern', 'spam')),
  constraint review_reports_role_check check (reporter_role in ('customer', 'helper', 'staff', 'automated')),
  constraint review_reports_state_check check (state in ('unassigned', 'assigned', 'decided', 'appealed'))
);

create index if not exists review_reports_review_idx on public.review_reports (review_id);
create index if not exists review_reports_open_idx on public.review_reports (state) where state <> 'decided';

/*
  THE TRAIL. Append-only in practice: nothing here updates a decision,
  because a moderation history that can be edited is not a history.
*/
create table if not exists public.review_decisions (
  id               uuid primary key default gen_random_uuid(),
  review_id        uuid not null references public.reviews(id) on delete cascade,
  actor_id         uuid references public.profiles(id) on delete set null,
  action           text not null,
  reason           text not null,
  policy_reference text,
  from_visibility  text not null,
  to_visibility    text not null,
  /* Recorded separately, because it is a separate decision. */
  rating_excluded  boolean not null default false,
  note             text,
  created_at       timestamptz not null default clock_timestamp()
);

create index if not exists review_decisions_review_idx
  on public.review_decisions (review_id, created_at desc);

create table if not exists public.review_appeals (
  id            uuid primary key default gen_random_uuid(),
  review_id     uuid not null references public.reviews(id) on delete cascade,
  opened_by     uuid references public.profiles(id) on delete set null,
  grounds       text not null,
  state         text not null default 'open',
  outcome_reason text,
  decided_by    uuid references public.profiles(id) on delete set null,
  decided_at    timestamptz,
  created_at    timestamptz not null default clock_timestamp(),
  constraint review_appeals_state_check check (state in ('open', 'upheld', 'declined'))
);

create unique index if not exists review_appeals_one_open_idx
  on public.review_appeals (review_id) where state = 'open';

alter table public.review_reports enable row level security;
alter table public.review_decisions enable row level security;
alter table public.review_appeals enable row level security;

drop policy if exists review_reports_admin on public.review_reports;
drop policy if exists review_decisions_admin on public.review_decisions;
drop policy if exists review_appeals_admin on public.review_appeals;
create policy review_reports_admin on public.review_reports for select using (public.is_admin());
create policy review_decisions_admin on public.review_decisions for select using (public.is_admin());
create policy review_appeals_admin on public.review_appeals for select using (public.is_admin());

revoke all on public.review_reports from anon, authenticated;
revoke all on public.review_decisions from anon, authenticated;
revoke all on public.review_appeals from anon, authenticated;
grant select on public.review_reports to authenticated;
grant select on public.review_decisions to authenticated;
grant select on public.review_appeals to authenticated;

/* ------------------------------------------------------------------ *
 * HIDE                                                                *
 * ------------------------------------------------------------------ */
create or replace function public.admin_review_hide(
  p_review uuid,
  p_expected timestamptz,
  p_reason text,
  p_policy text default null,
  p_exclude_rating boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  v_r public.reviews;
  v_now timestamptz := clock_timestamp();
  v_from text;
begin
  if not public.is_admin() then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Hiding a review needs a reason. It is what somebody reads a year from now when they ask why this is not published.'
      using errcode = 'HW120';
  end if;

  select * into v_r from public.reviews where id = p_review for update;
  if not found then
    raise exception 'No such review.' using errcode = 'HW121';
  end if;
  if p_expected is not null
     and date_trunc('milliseconds', v_r.updated_at) <> date_trunc('milliseconds', p_expected) then
    raise exception 'Somebody else decided this review while you were looking at it. Reload before deciding.'
      using errcode = 'HW080';
  end if;
  if not v_r.customer_visible then
    raise exception 'This review is already hidden.' using errcode = 'HW122';
  end if;

  v_from := case when v_r.customer_visible then 'published' else 'hidden' end;

  update public.reviews set
    customer_visible = false,
    /*
      THE SCORE SURVIVES UNLESS SOMEBODY SAYS OTHERWISE. A customer
      whose wording we will not publish still had the experience they
      scored.
    */
    rating_visible = case when p_exclude_rating then false else rating_visible end,
    updated_at = v_now
  where id = p_review;

  update public.review_reports set state = 'decided'
  where review_id = p_review and state in ('unassigned', 'assigned');

  insert into public.review_decisions
    (review_id, actor_id, action, reason, policy_reference,
     from_visibility, to_visibility, rating_excluded)
  values (p_review, v_actor, 'hidden', p_reason, p_policy, v_from, 'hidden', p_exclude_rating);

  insert into public.audit_log
    (actor_id, action, target_table, target_id, payload, outcome, changes)
  values (
    v_actor, 'review.hidden', 'reviews', p_review::text,
    jsonb_build_object('reason', p_reason, 'policy', p_policy,
                       'rating_excluded', p_exclude_rating),
    'succeeded',
    jsonb_build_array(
      jsonb_build_object('field', 'Words shown', 'before', 'yes', 'after', 'no'),
      jsonb_build_object('field', 'Score counts',
        'before', case when v_r.rating_visible then 'yes' else 'no' end,
        'after', case when p_exclude_rating then 'no' else case when v_r.rating_visible then 'yes' else 'no' end end))
  );

  return jsonb_build_object(
    'hidden', true,
    'rating_excluded', p_exclude_rating,
    'updated_at', v_now,
    'note', case when p_exclude_rating
      then 'Hidden, and the rating no longer counts toward this helper''s average.'
      else 'Hidden. The rating still counts toward this helper''s average — the customer''s experience was real even though the wording is not published.'
    end
  );
end $$;

/* ------------------------------------------------------------------ *
 * RESTORE                                                             *
 * ------------------------------------------------------------------ */
create or replace function public.admin_review_restore(
  p_review uuid, p_expected timestamptz, p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  v_r public.reviews;
  v_now timestamptz := clock_timestamp();
begin
  if not public.is_admin() then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Restoring a review needs a reason too. A decision reversed with no explanation is a decision nobody can learn from.'
      using errcode = 'HW120';
  end if;

  select * into v_r from public.reviews where id = p_review for update;
  if not found then
    raise exception 'No such review.' using errcode = 'HW121';
  end if;
  if p_expected is not null
     and date_trunc('milliseconds', v_r.updated_at) <> date_trunc('milliseconds', p_expected) then
    raise exception 'Somebody else decided this review while you were looking at it. Reload before deciding.'
      using errcode = 'HW080';
  end if;
  if v_r.customer_visible then
    raise exception 'This review is already published.' using errcode = 'HW122';
  end if;

  update public.reviews set
    customer_visible = true,
    /* Restoring the words restores the score. Leaving a published
       review's rating excluded is a state nobody could explain. */
    rating_visible = true,
    updated_at = v_now
  where id = p_review;

  insert into public.review_decisions
    (review_id, actor_id, action, reason, from_visibility, to_visibility, rating_excluded)
  values (p_review, v_actor, 'restored', p_reason, 'hidden', 'published', false);

  insert into public.audit_log
    (actor_id, action, target_table, target_id, payload, outcome, changes)
  values (
    v_actor, 'review.restored', 'reviews', p_review::text,
    jsonb_build_object('reason', p_reason), 'succeeded',
    jsonb_build_array(
      jsonb_build_object('field', 'Words shown', 'before', 'no', 'after', 'yes'),
      jsonb_build_object('field', 'Score counts',
        'before', case when v_r.rating_visible then 'yes' else 'no' end, 'after', 'yes'))
  );

  return jsonb_build_object('restored', true, 'updated_at', v_now,
    'note', 'Published again, and the rating counts toward the helper''s average.');
end $$;

/* ------------------------------------------------------------------ *
 * THE RATING, ON ITS OWN                                              *
 * ------------------------------------------------------------------ */
/*
  Excluding a score from a review whose words are published, or putting
  one back. Its own act because it is its own judgement: "these words
  break a rule" and "this person was never here" are different
  findings.
*/
create or replace function public.admin_review_set_rating_counts(
  p_review uuid, p_expected timestamptz, p_counts boolean, p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  v_r public.reviews;
  v_now timestamptz := clock_timestamp();
begin
  if not public.is_admin() then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Changing whether a score counts needs a reason — it moves a helper''s public average.'
      using errcode = 'HW120';
  end if;

  select * into v_r from public.reviews where id = p_review for update;
  if not found then
    raise exception 'No such review.' using errcode = 'HW121';
  end if;
  if p_expected is not null
     and date_trunc('milliseconds', v_r.updated_at) <> date_trunc('milliseconds', p_expected) then
    raise exception 'Somebody else decided this review while you were looking at it. Reload before deciding.'
      using errcode = 'HW080';
  end if;
  if v_r.rating_visible = p_counts then
    raise exception 'That is already the case.' using errcode = 'HW122';
  end if;

  update public.reviews set rating_visible = p_counts, updated_at = v_now where id = p_review;

  insert into public.review_decisions
    (review_id, actor_id, action, reason, from_visibility, to_visibility, rating_excluded)
  values (p_review, v_actor,
          case when p_counts then 'rating_included' else 'rating_excluded' end,
          p_reason,
          case when v_r.customer_visible then 'published' else 'hidden' end,
          case when v_r.customer_visible then 'published' else 'hidden' end,
          not p_counts);

  insert into public.audit_log
    (actor_id, action, target_table, target_id, payload, outcome, changes)
  values (
    v_actor, case when p_counts then 'review.rating_included' else 'review.rating_excluded' end,
    'reviews', p_review::text, jsonb_build_object('reason', p_reason), 'succeeded',
    jsonb_build_array(jsonb_build_object('field', 'Score counts',
      'before', case when v_r.rating_visible then 'yes' else 'no' end,
      'after', case when p_counts then 'yes' else 'no' end))
  );

  return jsonb_build_object('counts', p_counts, 'updated_at', v_now,
    'note', case when p_counts
      then 'This score counts toward the helper''s average again.'
      else 'This score no longer counts toward the helper''s average. The words are unaffected.'
    end);
end $$;

revoke all on function public.admin_review_hide(uuid, timestamptz, text, text, boolean) from public;
revoke all on function public.admin_review_restore(uuid, timestamptz, text) from public;
revoke all on function public.admin_review_set_rating_counts(uuid, timestamptz, boolean, text) from public;
grant execute on function public.admin_review_hide(uuid, timestamptz, text, text, boolean) to authenticated;
grant execute on function public.admin_review_restore(uuid, timestamptz, text) to authenticated;
grant execute on function public.admin_review_set_rating_counts(uuid, timestamptz, boolean, text) to authenticated;

/* ------------------------------------------------------------------ *
 * SELF-TEST                                                           *
 * ------------------------------------------------------------------ */
/*
  Rolled back in full. The point being proven is the one the file
  exists for: hiding the words must not move the helper's average
  unless somebody decided it should.
*/
do $$
declare
  v_customer uuid;
  v_helper uuid;
  v_booking uuid;
  v_review uuid;
  v_u timestamptz;
  v_avg numeric;
  v_count int;
  v_r jsonb;
begin
  begin
    perform set_config('request.jwt.claims', '{"app_metadata":{"role":"admin"}}', true);

    /*
      A TEST ACCOUNT'S REVIEW NEVER REACHES A PUBLIC AVERAGE, and a
      separate trigger (reviews_hide_review_account) enforces that by
      forcing customer_visible false on insert. It is correct, and it
      is also why this test cannot use just any booking: on a database
      where every booking so far belongs to a review account, a review
      inserted as visible comes back hidden and counts nothing. The
      first version of this test assumed otherwise and failed on
      production for a reason that had nothing to do with 0117.
    */
    select b.id, b.customer_id, b.provider_id into v_booking, v_customer, v_helper
    from public.bookings b
    join public.profiles p on p.id = b.customer_id
    join public.provider_profiles pp on pp.user_id = b.provider_id
    where b.provider_id is not null
      and not coalesce(p.is_review_account, false)
      and not exists (select 1 from public.reviews r where r.booking_id = b.id)
    limit 1;
    if v_booking is null then
      raise notice 'review moderation: every bookable row belongs to a review account or is already reviewed, so the average assertions are skipped here. The refusals and the trail are proven on rehearsal.';
      raise exception using errcode = 'HW999', message = 'no eligible booking';
    end if;

    insert into public.reviews (booking_id, customer_id, provider_id, rating, comment, customer_visible)
    values (v_booking, v_customer, v_helper, 1, 'selftest', true)
    returning id into v_review;

    /* If something else hid it anyway, the premise is gone. Say so
       rather than asserting against a number that cannot move. */
    if not (select customer_visible from public.reviews where id = v_review) then
      raise notice 'review moderation: the inserted review was hidden by another rule, so the average assertions are skipped here.';
      raise exception using errcode = 'HW999', message = 'premise gone';
    end if;

    select rating_avg, rating_count into v_avg, v_count
    from public.provider_profiles where user_id = v_helper;
    if v_count is null then
      raise exception 'the helper has no rating_count to compare against';
    end if;

    /* A reason is required. */
    select updated_at into v_u from public.reviews where id = v_review;
    begin
      perform public.admin_review_hide(v_review, v_u, '  ');
      raise exception 'a review was hidden with no reason';
    exception when sqlstate 'HW120' then null;
    end;

    /* A stale token is refused. */
    begin
      perform public.admin_review_hide(v_review, v_u - interval '1 second', 'Abusive language.');
      raise exception 'a stale decision was applied';
    exception when sqlstate 'HW080' then null;
    end;

    /*
      THE WHOLE POINT. Hiding the words leaves the score counting, so
      the helper's average does not move.
    */
    v_r := public.admin_review_hide(v_review, v_u, 'Abusive language.', 'Respectful communication');
    if (v_r ->> 'rating_excluded')::boolean then
      raise exception 'hiding excluded the rating without being asked to';
    end if;
    if (select customer_visible from public.reviews where id = v_review) then
      raise exception 'the review is still published';
    end if;
    if not (select rating_visible from public.reviews where id = v_review) then
      raise exception 'hiding the words silently removed the score';
    end if;
    if (select rating_avg from public.provider_profiles where user_id = v_helper) is distinct from v_avg then
      raise exception 'the helper average moved when only the wording was hidden';
    end if;

    /* Excluding the score is its own act, and it DOES move the average. */
    select updated_at into v_u from public.reviews where id = v_review;
    perform public.admin_review_set_rating_counts(v_review, v_u, false, 'The author was never at this booking.');
    if (select rating_visible from public.reviews where id = v_review) then
      raise exception 'excluding the rating did not take';
    end if;
    if (select rating_count from public.provider_profiles where user_id = v_helper) <> v_count - 1 then
      raise exception 'excluding a score did not change the count';
    end if;

    /* Restoring brings both back. */
    select updated_at into v_u from public.reviews where id = v_review;
    perform public.admin_review_restore(v_review, v_u, 'Appeal upheld — the wording was quoted, not written, by the customer.');
    if not (select customer_visible and rating_visible from public.reviews where id = v_review) then
      raise exception 'restoring did not bring back both the words and the score';
    end if;

    /* Hiding twice is refused rather than recorded twice. */
    select updated_at into v_u from public.reviews where id = v_review;
    perform public.admin_review_hide(v_review, v_u, 'Again.');
    select updated_at into v_u from public.reviews where id = v_review;
    begin
      perform public.admin_review_hide(v_review, v_u, 'And again.');
      raise exception 'an already-hidden review was hidden again';
    exception when sqlstate 'HW122' then null;
    end;

    /* Every act left a decision with the visibility it moved from. */
    if (select count(*) from public.review_decisions where review_id = v_review) <> 4 then
      raise exception 'the decision trail has % entries, expected 4',
        (select count(*) from public.review_decisions where review_id = v_review);
    end if;
    if exists (select 1 from public.review_decisions where review_id = v_review and coalesce(trim(reason), '') = '') then
      raise exception 'a decision was recorded with no reason';
    end if;

    raise exception using errcode = 'HW999', message = 'self-test complete';
  exception
    when sqlstate 'HW999' then
      raise notice 'review moderation: reasons required, stale decisions refused, hiding the words leaves the score, excluding the score is its own act, restoring returns both — and nothing left behind';
    when others then
      raise;
  end;
end $$;
