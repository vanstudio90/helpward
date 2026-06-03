-- push_subscriptions — OneSignal player_id registry, one row per device per
-- user. We delegate the actual push delivery to OneSignal so this table
-- doesnt need to hold endpoint/p256dh/auth keys like raw Web Push would;
-- player_id is enough for OneSignal's REST POST /notifications call.
--
-- Multi-row-per-user because a real customer signs in from phone + laptop
-- + tablet and we want push to fan out to all of them. Unique on
-- (user_id, player_id) so re-registering from the same device doesnt
-- create duplicates.

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  player_id text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create unique index if not exists push_sub_unique
  on push_subscriptions(user_id, player_id);
create index if not exists push_sub_user_idx
  on push_subscriptions(user_id);

-- =========================================================================
-- RLS — owner-only
-- =========================================================================
alter table push_subscriptions enable row level security;

do $$ begin
  create policy "ps_owner_read" on push_subscriptions
    for select using (user_id = auth.uid());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "ps_owner_insert" on push_subscriptions
    for insert with check (user_id = auth.uid());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "ps_owner_update" on push_subscriptions
    for update using (user_id = auth.uid()) with check (user_id = auth.uid());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "ps_owner_delete" on push_subscriptions
    for delete using (user_id = auth.uid());
exception when duplicate_object then null; end $$;

grant select, insert, update, delete on push_subscriptions to authenticated, service_role;
