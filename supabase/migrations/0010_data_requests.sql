-- CCPA / PIPEDA / GDPR compliance: queueing tables for data export + account
-- deletion requests. User clicks the button → row lands here → a background
-- job (added in a follow-up round, or run manually by admin) picks it up,
-- assembles the export archive or executes the deletion, and updates status.

-- =========================================================================
-- Data export requests
-- =========================================================================
create table if not exists data_export_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade not null,
  status text not null default 'pending'
    check (status in ('pending','processing','ready','delivered','failed','expired')),
  archive_url text,
  archive_size_bytes bigint,
  requested_at timestamptz default now(),
  completed_at timestamptz,
  expires_at timestamptz,
  failure_reason text,
  ip text,
  user_agent text
);
create index if not exists data_export_user_idx on data_export_requests(user_id);
create index if not exists data_export_status_idx on data_export_requests(status, requested_at);

alter table data_export_requests enable row level security;

do $$ begin
  create policy "der_read_own" on data_export_requests for select using (user_id = auth.uid());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "der_read_admin" on data_export_requests for select
    using (coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin');
exception when duplicate_object then null; end $$;

-- =========================================================================
-- Account deletion requests — with 30-day grace period
-- =========================================================================
create table if not exists account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade not null,
  status text not null default 'pending'
    check (status in ('pending','cancelled','executing','executed','failed')),
  reason text,
  requested_at timestamptz default now(),
  grace_until timestamptz not null default (now() + interval '30 days'),
  executed_at timestamptz,
  cancelled_at timestamptz,
  failure_reason text,
  ip text,
  user_agent text
);
create index if not exists adr_user_idx on account_deletion_requests(user_id);
create index if not exists adr_status_idx on account_deletion_requests(status, grace_until);
create unique index if not exists adr_one_pending_per_user
  on account_deletion_requests(user_id) where status = 'pending';

alter table account_deletion_requests enable row level security;

do $$ begin
  create policy "adr_read_own" on account_deletion_requests for select using (user_id = auth.uid());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "adr_read_admin" on account_deletion_requests for select
    using (coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "adr_cancel_own" on account_deletion_requests for update
    using (user_id = auth.uid() and status = 'pending')
    with check (user_id = auth.uid() and status in ('pending','cancelled'));
exception when duplicate_object then null; end $$;

grant select, insert, update on data_export_requests to service_role;
grant select, insert, update on account_deletion_requests to service_role;
