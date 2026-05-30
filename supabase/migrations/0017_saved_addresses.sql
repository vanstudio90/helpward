-- Saved addresses — customers stash named places ("Home", "Mom's", "Office")
-- so /new-request can offer one-tap fill instead of forcing them to retype
-- the same line every booking.
--
-- This table is separate from the existing `addresses` table on purpose.
-- `addresses` rows are per-booking immutable snapshots (so historical
-- bookings keep showing what was filled at the time even if the user later
-- renames their saved address). `saved_addresses` is the editable rolodex.
-- When the user picks a saved address for a booking we COPY its values into
-- a fresh `addresses` row.

create table if not exists saved_addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Short user-chosen label like "Home" or "Mom's place". Required because
  -- a chip with no label is useless and we don't want to derive one.
  label text not null check (length(label) between 1 and 40),
  formatted text not null check (length(formatted) between 3 and 300),
  -- Coords are nullable until Mapbox geocoding lands — same posture as the
  -- main addresses table.
  lat double precision,
  lng double precision,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists sa_user_idx on saved_addresses(user_id, created_at desc);

-- Each user can have at most one default address. Enforced with a partial
-- unique index rather than a trigger so it can't be raced.
create unique index if not exists sa_one_default_per_user
  on saved_addresses(user_id) where is_default = true;

-- =========================================================================
-- RLS — owner-only CRUD
-- =========================================================================
alter table saved_addresses enable row level security;

do $$ begin
  create policy "sa_owner_read" on saved_addresses
    for select using (user_id = auth.uid());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "sa_owner_insert" on saved_addresses
    for insert with check (user_id = auth.uid());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "sa_owner_update" on saved_addresses
    for update using (user_id = auth.uid()) with check (user_id = auth.uid());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "sa_owner_delete" on saved_addresses
    for delete using (user_id = auth.uid());
exception when duplicate_object then null; end $$;

grant select, insert, update, delete on saved_addresses to authenticated, service_role;
