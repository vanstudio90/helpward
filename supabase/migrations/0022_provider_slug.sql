-- Human-readable slugs for helper profile URLs. /providers/<uuid> stays
-- working forever (the route resolver checks UUID shape first), but every
-- approved helper also gets a /providers/maya-r-3a8b style URL that
-- shareable and SEO-friendly.
--
-- Slug format: kebab(profiles.full_name) + "-" + first 4 hex of user_id.
-- The suffix kills the "two Mayas" collision problem without leaking
-- anything sensitive (4 chars of a uuid is just 16 bits of entropy, but
-- we already have user_id everywhere else so there's no novel exposure).

alter table provider_profiles
  add column if not exists slug text;

create unique index if not exists provider_profiles_slug_unique
  on provider_profiles(slug) where slug is not null;

-- Backfill: generate a slug for every existing provider_profile from the
-- linked profiles.full_name. We use a single SQL pass with regexp_replace
-- to kebab-case the name and concat the user_id prefix. Idempotent — only
-- updates rows where slug is currently null.
update provider_profiles pp
set slug = lower(
  regexp_replace(
    regexp_replace(coalesce(p.full_name, 'helper'), '[^a-zA-Z0-9]+', '-', 'g'),
    '(^-+|-+$)', '', 'g'
  )
) || '-' || substr(pp.user_id::text, 1, 4)
from profiles p
where p.id = pp.user_id
  and pp.slug is null;
