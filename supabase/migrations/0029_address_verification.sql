-- CLASS: pre-deploy
-- Address geocode verification + launch service areas.
--
-- Context: MAPBOX_TOKEN was never set in production, so every address
-- insert fell back to a hardcoded "downtown Vancouver" placeholder point.
-- 53 of 57 rows in `addresses` carry that exact coordinate, including
-- addresses in Montreal, Brooklyn and Chicago. Nothing in the schema could
-- distinguish a verified address from a placeholder.
--
-- These columns make that distinction explicit and permanent, so an
-- unrepaired legacy row can never qualify a task for dispatch.

alter table addresses
  add column if not exists geocode_verified boolean not null default false,
  -- Set by the backfill when a legacy row could not be resolved
  -- unambiguously; the customer must reconfirm it before it is usable.
  add column if not exists needs_reconfirmation boolean not null default false,
  add column if not exists geocoded_at timestamptz,
  -- Free-text note from the backfill (match confidence, failure reason).
  add column if not exists geocode_note text;

alter table saved_addresses
  add column if not exists city text,
  add column if not exists region text,
  add column if not exists country text,
  add column if not exists geocode_verified boolean not null default false,
  add column if not exists needs_reconfirmation boolean not null default false,
  add column if not exists geocoded_at timestamptz,
  add column if not exists geocode_note text;

-- Every pre-existing row is unverified by definition. The defaults above
-- already achieve this for existing rows; these statements are explicit so
-- the intent survives a re-run against a partially migrated database.
update addresses set geocode_verified = false where geocode_verified is null;
update saved_addresses set geocode_verified = false where geocode_verified is null;

-- Flag the known placeholder rows so the backfill can find them fast and
-- so any accidental dispatch query can exclude them cheaply.
update addresses
   set needs_reconfirmation = true,
       geocode_note = coalesce(geocode_note, 'legacy placeholder point (pre-0029)')
 where geocode_verified = false
   and location is not null
   and abs(st_x(location::geometry) - (-123.1207)) < 0.000001
   and abs(st_y(location::geometry) - 49.2827)     < 0.000001;

create index if not exists addresses_unverified_idx
  on addresses (geocode_verified) where geocode_verified = false;

comment on column addresses.geocode_verified is
  'True only when Mapbox returned real coordinates AND a municipality for this address. Never set by a fallback path. Required for dispatch.';
