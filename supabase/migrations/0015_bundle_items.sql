-- Multi-task bundles — a single request can carry N sub-tasks ("groceries
-- + dry cleaning + package pickup") that the helper handles in one trip.
--
-- Model:
--   * The existing `requests` row is the parent. It gets is_bundle=true and
--     a service_id that doubles as the "primary" service (used for matching
--     + categorisation). The parent's estimated_price_cents is the SUM of
--     all items.
--   * One `request_bundle_items` row per stop, with its own service_id +
--     notes + per-item price snapshot. Position is 1..N for stable ordering.
--   * The matching engine doesn't change — bundle is routed as one request.
--     Helpers see the full item list when they review the offer.

-- =========================================================================
-- requests gets two new columns
-- =========================================================================
alter table requests
  add column if not exists is_bundle boolean not null default false,
  -- Total item count cached on the parent for cheap badges in lists. Updated
  -- by the application layer when items are inserted; we don't bother with
  -- a trigger since bundles are insert-once (no in-place editing in v1).
  add column if not exists bundle_item_count smallint;

create index if not exists requests_bundle_idx on requests(is_bundle) where is_bundle = true;

-- =========================================================================
-- request_bundle_items — N items per parent request
-- =========================================================================
create table if not exists request_bundle_items (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references requests(id) on delete cascade not null,
  position smallint not null,
  service_id text references services(id) on delete restrict not null,
  -- Per-stop instructions ("Whole Foods on 4th — ask for Sue at the
  -- pickup window"). Notes on the parent request are the bundle-wide
  -- instructions; these are per-stop overrides.
  notes text,
  -- Price snapshot at creation time — catalogue price changes don't
  -- retroactively reprice an existing bundle.
  item_price_cents int not null,
  -- Per-stop status — the helper can mark each one done as they go,
  -- so the customer sees real-time progress through the bundle.
  status text not null default 'pending'
    check (status in ('pending', 'in_progress', 'completed', 'skipped')),
  completed_at timestamptz,
  created_at timestamptz default now()
);
create index if not exists rbi_request_idx on request_bundle_items(request_id, position);
-- One position per request — keeps ordering stable.
create unique index if not exists rbi_position_unique
  on request_bundle_items(request_id, position);

alter table request_bundle_items enable row level security;

-- Customer who owns the parent request can read + manage their items.
-- We can't compare via auth.uid() directly without joining, so the policy
-- subselects on requests.customer_id.
do $$ begin
  create policy "rbi_read_own" on request_bundle_items for select
    using (exists (
      select 1 from requests r
      where r.id = request_bundle_items.request_id
        and r.customer_id = auth.uid()
    ));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "rbi_write_own" on request_bundle_items for all
    using (exists (
      select 1 from requests r
      where r.id = request_bundle_items.request_id
        and r.customer_id = auth.uid()
    ))
    with check (exists (
      select 1 from requests r
      where r.id = request_bundle_items.request_id
        and r.customer_id = auth.uid()
    ));
exception when duplicate_object then null; end $$;

-- Helper assigned to the resulting booking needs to read items so they can
-- see what to do at each stop. Bookings reference requests via request_id,
-- so we walk that join.
do $$ begin
  create policy "rbi_read_assigned_helper" on request_bundle_items for select
    using (exists (
      select 1 from bookings b
      where b.request_id = request_bundle_items.request_id
        and b.provider_id = auth.uid()
    ));
exception when duplicate_object then null; end $$;

-- Helper assigned to the booking can mark item status as they progress.
do $$ begin
  create policy "rbi_update_assigned_helper" on request_bundle_items for update
    using (exists (
      select 1 from bookings b
      where b.request_id = request_bundle_items.request_id
        and b.provider_id = auth.uid()
    ))
    with check (exists (
      select 1 from bookings b
      where b.request_id = request_bundle_items.request_id
        and b.provider_id = auth.uid()
    ));
exception when duplicate_object then null; end $$;

-- Admin can read all for support workflows.
do $$ begin
  create policy "rbi_read_admin" on request_bundle_items for select
    using (coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin');
exception when duplicate_object then null; end $$;

grant select, insert, update, delete on request_bundle_items to authenticated, service_role;
