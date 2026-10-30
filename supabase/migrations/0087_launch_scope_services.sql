-- CLASS: pre-deploy
-- =========================================================================
-- 0087 — the website sells the eight the app ships with
--
-- Owner decision, 29 October 2026: while the iOS app is in review, the
-- site offers the same eight services the app does. The other nineteen
-- come back afterwards.
--
-- NOTHING IS DELETED. Every row, price, tagline, image and piece of copy
-- stays exactly where it is; only `services.active` changes. The previous
-- value is recorded in `service_scope_restore` so putting them back is
-- not a judgement call later about which ones were on.
--
-- WHAT THIS COSTS, recorded here because it is easy to forget:
--
--   * /services/<slug> for nineteen services starts returning 404
--     (`getServicePublic` filters on active, and the page calls
--     notFound()).
--   * /cities/<city>/<service> is generated from the same list — two
--     launch cities × nineteen services = thirty-eight more.
--   * Fifty-seven indexed URLs in total, and the sitemap stops listing
--     them.
--
-- A 404 tells Google the page is gone. For a change meant to be undone in
-- weeks that is the wrong signal — 0088 exists to put it right, and the
-- repo's own `lib/retired-pages.ts` header makes the same argument about
-- irrelevant redirects. If the services come back soon, the pages come
-- back with them and the loss is temporary.
--
-- `accept_request` refuses an inactive service, so any request still out
-- looking for one of these cannot be accepted. There were none at the
-- time of writing; check before applying this to production.
-- =========================================================================

create table if not exists service_scope_restore (
  service_id   text primary key references services(id) on delete cascade,
  was_active   boolean not null,
  changed_at   timestamptz not null default now(),
  reason       text
);

comment on table service_scope_restore is
  'What services.active was before the app-launch scope cut, so 0088 can restore exactly that and not a guess.';

-- The eight the app ships with. Everything else is paused.
do $$
declare
  v_launch text[] := array[
    'maid-service',
    'wait-in-line',
    'errand-runner',
    'furniture-assembly',
    'grocery-pickup',
    'package-delivery',
    'package-return',
    'moving-help'
  ];
begin
  -- Remember the current state first, including for the eight that stay,
  -- so a restore returns every row to what it actually was.
  insert into service_scope_restore (service_id, was_active, reason)
  select s.id, s.active, 'app launch scope 2026-10-29'
    from services s
  on conflict (service_id) do update
    set was_active = excluded.was_active,
        changed_at = now(),
        reason     = excluded.reason;

  update services
     set active = false
   where id <> all(v_launch)
     and active;

  -- And make sure the eight are on, in case one was paused earlier.
  update services
     set active = true
   where id = any(v_launch)
     and not active;
end $$;
