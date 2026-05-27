-- Helpward initial schema
-- Phase 0: profiles, customer/provider profiles, service catalog, addresses,
-- requests, bookings, conversations, messages, locations, payments, reviews,
-- notifications, favorites, disputes, audit log.

-- =========================================================================
-- Extensions
-- =========================================================================
create extension if not exists "pgcrypto";    -- gen_random_uuid()
create extension if not exists "postgis";     -- geography type for matching

-- =========================================================================
-- Enums
-- =========================================================================
do $$ begin create type user_role as enum ('customer', 'provider', 'admin'); exception when duplicate_object then null; end $$;
do $$ begin create type country as enum ('US', 'CA'); exception when duplicate_object then null; end $$;
do $$ begin create type request_status as enum ('draft', 'matching', 'matched', 'cancelled', 'expired'); exception when duplicate_object then null; end $$;
do $$ begin create type booking_status as enum ('scheduled', 'in_progress', 'completed', 'cancelled', 'disputed'); exception when duplicate_object then null; end $$;
do $$ begin create type provider_status as enum ('pending', 'approved', 'suspended', 'banned'); exception when duplicate_object then null; end $$;
do $$ begin create type payment_status as enum ('pending', 'authorized', 'captured', 'refunded', 'partial_refund', 'failed'); exception when duplicate_object then null; end $$;

-- =========================================================================
-- Profiles (extends auth.users)
-- =========================================================================
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role user_role not null default 'customer',
  full_name text not null default '',
  phone text,
  phone_verified boolean default false,
  avatar_url text,
  country country not null default 'US',
  default_locale text not null default 'en',
  default_currency text not null default 'USD',
  default_timezone text not null default 'America/Los_Angeles',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists profiles_role_idx on profiles(role);

create table if not exists customer_profiles (
  user_id uuid primary key references profiles(id) on delete cascade,
  stripe_customer_id text unique,
  default_address_id uuid,
  wallet_balance_cents int not null default 0,
  referral_code text unique
);

create table if not exists provider_profiles (
  user_id uuid primary key references profiles(id) on delete cascade,
  status provider_status not null default 'pending',
  bio text,
  languages text[] default array[]::text[],
  service_radius_km int default 20 check (service_radius_km > 0 and service_radius_km <= 200),
  base_location geography(Point, 4326),
  current_location geography(Point, 4326),
  is_online boolean default false,
  rating_avg numeric(3,2),
  rating_count int default 0,
  tasks_completed int default 0,
  response_time_sec int,
  stripe_connect_account_id text unique,
  stripe_identity_verification_id text,
  background_check_id text,
  background_check_status text,
  id_verified_at timestamptz,
  background_verified_at timestamptz,
  approved_at timestamptz,
  approved_by uuid references profiles(id),
  insurance_active_until date,
  rejection_reason text,
  created_at timestamptz default now()
);
create index if not exists provider_profiles_status_idx on provider_profiles(status);
create index if not exists provider_profiles_online_idx on provider_profiles(is_online) where is_online = true;
create index if not exists provider_profiles_location_gix on provider_profiles using gist(current_location);

-- =========================================================================
-- Service catalog
-- =========================================================================
create table if not exists service_categories (
  id text primary key,
  label text not null,
  icon text not null,
  sort_order int default 0,
  active boolean default true
);

create table if not exists services (
  id text primary key,
  category_id text references service_categories(id) on delete restrict not null,
  title text not null,
  blurb text not null,
  base_price_cents int not null check (base_price_cents >= 0),
  eta_label text,
  countries country[] not null default array['US','CA']::country[],
  popular boolean default false,
  image_url text,
  active boolean default true,
  created_at timestamptz default now()
);
create index if not exists services_category_idx on services(category_id);
create index if not exists services_active_idx on services(active) where active = true;

create table if not exists provider_services (
  provider_id uuid references provider_profiles(user_id) on delete cascade,
  service_id text references services(id) on delete cascade,
  custom_price_cents int,
  primary key (provider_id, service_id)
);

-- =========================================================================
-- Addresses
-- =========================================================================
create table if not exists addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  label text,
  formatted text not null,
  location geography(Point, 4326) not null,
  city text,
  region text,
  country country,
  postal_code text,
  created_at timestamptz default now()
);
create index if not exists addresses_user_idx on addresses(user_id);
create index if not exists addresses_location_gix on addresses using gist(location);

-- =========================================================================
-- Requests
-- =========================================================================
create table if not exists requests (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references profiles(id) on delete cascade not null,
  service_id text references services(id) on delete restrict not null,
  pickup_address_id uuid references addresses(id),
  dropoff_address_id uuid references addresses(id),
  scheduled_for timestamptz,
  notes text,
  estimated_price_cents int,
  estimated_duration_min int,
  status request_status not null default 'draft',
  created_at timestamptz default now()
);
create index if not exists requests_customer_idx on requests(customer_id);
create index if not exists requests_status_idx on requests(status);

-- =========================================================================
-- Bookings
-- =========================================================================
create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references requests(id) unique,
  customer_id uuid references profiles(id) on delete restrict not null,
  provider_id uuid references provider_profiles(user_id) on delete restrict not null,
  service_id text references services(id) on delete restrict not null,
  status booking_status not null default 'scheduled',
  scheduled_for timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  base_price_cents int not null,
  distance_cents int default 0,
  service_fee_cents int default 0,
  tip_cents int default 0,
  total_cents int not null,
  platform_fee_cents int not null,
  payout_cents int not null,
  currency text not null,
  stripe_payment_intent_id text,
  payment_status payment_status not null default 'pending',
  created_at timestamptz default now()
);
create index if not exists bookings_customer_idx on bookings(customer_id);
create index if not exists bookings_provider_idx on bookings(provider_id);
create index if not exists bookings_status_idx on bookings(status);

-- Matching log
create table if not exists match_attempts (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references requests(id) on delete cascade not null,
  provider_id uuid references provider_profiles(user_id) on delete cascade not null,
  notified_at timestamptz default now(),
  responded_at timestamptz,
  response text,
  distance_km numeric,
  rank_score numeric
);
create index if not exists match_attempts_request_idx on match_attempts(request_id);

-- =========================================================================
-- Messaging
-- =========================================================================
create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references bookings(id) on delete cascade unique,
  customer_id uuid references profiles(id) on delete restrict not null,
  provider_id uuid references provider_profiles(user_id) on delete restrict not null,
  last_message_at timestamptz default now(),
  created_at timestamptz default now()
);
create index if not exists conversations_customer_idx on conversations(customer_id);
create index if not exists conversations_provider_idx on conversations(provider_id);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id) on delete cascade not null,
  sender_id uuid references profiles(id) on delete restrict not null,
  body text,
  attachment_url text,
  read_by_recipient_at timestamptz,
  created_at timestamptz default now()
);
create index if not exists messages_conversation_created_idx on messages(conversation_id, created_at desc);

-- =========================================================================
-- Locations
-- =========================================================================
create table if not exists provider_locations (
  provider_id uuid primary key references provider_profiles(user_id) on delete cascade,
  location geography(Point, 4326) not null,
  heading numeric,
  speed_kph numeric,
  updated_at timestamptz default now()
);
create index if not exists provider_locations_gix on provider_locations using gist(location);

create table if not exists booking_location_pings (
  id bigserial primary key,
  booking_id uuid references bookings(id) on delete cascade not null,
  location geography(Point, 4326) not null,
  recorded_at timestamptz default now()
);
create index if not exists booking_location_pings_booking_idx on booking_location_pings(booking_id, recorded_at desc);

-- =========================================================================
-- Payments
-- =========================================================================
create table if not exists payment_methods (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references profiles(id) on delete cascade not null,
  stripe_payment_method_id text not null,
  type text not null,
  brand text,
  last4 text,
  exp_month int,
  exp_year int,
  is_default boolean default false,
  created_at timestamptz default now()
);
create index if not exists payment_methods_customer_idx on payment_methods(customer_id);

create table if not exists payouts (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid references provider_profiles(user_id) on delete restrict not null,
  stripe_transfer_id text unique,
  amount_cents int not null,
  currency text not null,
  status text not null,
  arrival_date date,
  booking_ids uuid[],
  created_at timestamptz default now()
);
create index if not exists payouts_provider_idx on payouts(provider_id);

create table if not exists refunds (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references bookings(id) on delete restrict not null,
  amount_cents int not null,
  reason text,
  initiated_by uuid references profiles(id),
  stripe_refund_id text,
  status text not null,
  created_at timestamptz default now()
);

-- =========================================================================
-- Reviews
-- =========================================================================
create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references bookings(id) on delete restrict unique,
  customer_id uuid references profiles(id) on delete restrict not null,
  provider_id uuid references provider_profiles(user_id) on delete restrict not null,
  rating int not null check (rating between 1 and 5),
  comment text,
  customer_visible boolean default true,
  created_at timestamptz default now()
);
create index if not exists reviews_provider_idx on reviews(provider_id);

-- =========================================================================
-- Notifications
-- =========================================================================
create table if not exists notification_prefs (
  user_id uuid primary key references profiles(id) on delete cascade,
  push_booking boolean default true,
  push_messages boolean default true,
  email_receipts boolean default true,
  email_digest boolean default false,
  sms_critical boolean default true
);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade not null,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz default now()
);
create index if not exists notifications_user_unread_idx on notifications(user_id, created_at desc) where read_at is null;

-- =========================================================================
-- Favorites
-- =========================================================================
create table if not exists favorites (
  user_id uuid references profiles(id) on delete cascade,
  kind text not null check (kind in ('provider','service','address')),
  target_id text not null,
  pinned boolean default false,
  notes text,
  created_at timestamptz default now(),
  primary key (user_id, kind, target_id)
);

-- =========================================================================
-- Disputes
-- =========================================================================
create table if not exists disputes (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references bookings(id) on delete restrict not null,
  opened_by uuid references profiles(id) on delete restrict not null,
  category text not null check (category in ('no_show','quality','damage','billing','safety','other')),
  description text not null,
  status text not null default 'open' check (status in ('open','investigating','resolved','escalated')),
  resolution text,
  resolved_by uuid references profiles(id),
  resolved_at timestamptz,
  created_at timestamptz default now()
);
create index if not exists disputes_status_idx on disputes(status);

-- =========================================================================
-- Audit log
-- =========================================================================
create table if not exists audit_log (
  id bigserial primary key,
  actor_id uuid references profiles(id) on delete set null,
  action text not null,
  target_table text,
  target_id text,
  payload jsonb default '{}'::jsonb,
  ip text,
  user_agent text,
  created_at timestamptz default now()
);
create index if not exists audit_log_created_idx on audit_log(created_at desc);
create index if not exists audit_log_actor_idx on audit_log(actor_id);

-- =========================================================================
-- Auto-create profile on signup
-- =========================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  meta_role text;
begin
  meta_role := coalesce(new.raw_user_meta_data->>'role', 'customer');

  insert into public.profiles (id, role, full_name, avatar_url)
  values (
    new.id,
    meta_role::user_role,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  );

  if meta_role = 'provider' then
    insert into public.provider_profiles (user_id) values (new.id);
  else
    insert into public.customer_profiles (user_id) values (new.id);
  end if;

  insert into public.notification_prefs (user_id) values (new.id);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =========================================================================
-- Mirror role into JWT custom claim so RLS can read it without extra query
-- =========================================================================
create or replace function public.sync_role_to_jwt()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update auth.users
  set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
                          || jsonb_build_object('role', new.role::text)
  where id = new.id;
  return new;
end;
$$;

drop trigger if exists sync_role on profiles;
create trigger sync_role
  after insert or update of role on profiles
  for each row execute function public.sync_role_to_jwt();

-- =========================================================================
-- Service role grants (raw-SQL CREATE TABLE skips Supabase auto-grants)
-- =========================================================================
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

alter default privileges in schema public
  grant all on tables to service_role;
alter default privileges in schema public
  grant all on sequences to service_role;
alter default privileges in schema public
  grant execute on functions to service_role;
